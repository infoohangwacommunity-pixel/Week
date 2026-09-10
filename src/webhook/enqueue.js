#!/usr/bin/env node
/**
 * WaxPrep - Message Enqueueing
 *
 * Enqueues student messages for processing with:
 * - Rate limiting (per-student)
 * - WaxID resolution (with safe ON CONFLICT on phone_hash)
 * - Session management
 * - Message persistence (idempotent via external_id unique index)
 * - Debounced processing via BullMQ
 *
 * The webhook server passes a shared pg.Pool via opts.pool so we don't leak
 * a new pool on every webhook. If no pool is supplied, we fall back to the
 * global default pool from src/db/index.js.
 */

import { resolveWaxID } from '../identity/waxId.js';
import { getOrCreateSession } from '../session/manager.js';
import { randomUUID } from 'crypto';
import { logger } from '../observability/index.js';
import { getRateLimiter } from './rateLimiter.js';
import config from '../config/index.js';
import { getDefaultPool } from '../db/index.js';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

// Module-level queue instance (created once, shared across requests).
let queue = null;

/**
 * Get or initialize the BullMQ queue.
 * Configures BullMQ retry policy from config so transient provider failures
 * (5xx, 429, timeouts) get retried automatically with exponential backoff.
 */
async function getQueue() {
  if (queue) return queue;

  try {
    const redis = new Redis(config.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
    });
    await redis.ping();

    queue = new Queue('ai-processing', {
      connection: redis,
      defaultJobOptions: {
        removeOnComplete: { age: 86400, count: 1000 },
        removeOnFail: { age: 86400 * 7, count: 5000 },
        attempts: Math.max(1, config.QUEUE_MAX_RETRIES),
        backoff: {
          type: 'exponential',
          delay: config.QUEUE_RETRY_DELAY_BASE_MS,
        },
      },
    });

    logger.info(
      {
        attempts: config.QUEUE_MAX_RETRIES,
        backoff: 'exponential',
        baseDelay: config.QUEUE_RETRY_DELAY_BASE_MS,
      },
      'AI processing queue initialized with retry policy'
    );
    return queue;
  } catch (err) {
    logger.error({ err: { name: err.name, message: err.message, code: err.code } }, 'Failed to initialize queue');
    throw err;
  }
}

/**
 * Enqueue a student message for AI processing.
 *
 * @param {string} from - Student's phone number (international format)
 * @param {string} messageId - WhatsApp message ID (for idempotency)
 * @param {object} message - Normalized WhatsApp message object
 * @param {string} [_databaseUrl] - unused (kept for backwards compat)
 * @param {string} [_redisUrl] - unused (kept for backwards compat)
 * @param {number} [debounceWindowMs] - override QUEUE_DEBOUNCE_WINDOW_MS
 * @param {object} [log] - pino child logger
 * @param {object} [opts] - { pool?, correlationId? }
 * @returns {Promise<{success: boolean, waxId?: string, sessionId?: string, reason?: string}>}
 */
export async function enqueueStudentMessage(from, messageId, message, _databaseUrl, _redisUrl, debounceWindowMs, log, opts = {}) {
  const logSafe = log || logger;
  const correlationId = opts.correlationId || randomUUID();
  const debounceDelay = debounceWindowMs ?? config.QUEUE_DEBOUNCE_WINDOW_MS;

  // Use the shared pool from the server, or fall back to the default singleton.
  let pool = opts.pool;
  let shouldClosePool = false;
  if (!pool) {
    pool = await getDefaultPool(config);
    shouldClosePool = false; // never close the singleton
  }

  try {
    const queueInstance = await getQueue();

    // Per-student rate limiting (in-memory; safe for single-instance deployments).
    const rateLimiter = getRateLimiter({
      messagesPerMinute: config.RATE_LIMIT_MESSAGES_PER_MINUTE || 10,
      messagesPerDay: config.RATE_LIMIT_MESSAGES_PER_DAY || 200,
      burstAllowance: config.RATE_LIMIT_BURST_ALLOWANCE || 3,
    });

    // Resolve WaxID BEFORE rate-limiting so the limit is per-student, not per-phone.
    const waxId = await resolveWaxID(pool, from);
    const rateLimitResult = rateLimiter.checkLimit(waxId);

    if (!rateLimitResult.allowed) {
      logSafe.warn(
        { waxId, reason: rateLimitResult.reason, retryAfter: rateLimitResult.retryAfter },
        'Rate limit exceeded in enqueue (safety check)'
      );
      return { success: false, reason: rateLimitResult.reason, retryAfter: rateLimitResult.retryAfter };
    }

    // Get or create session.
    const session = await getOrCreateSession(pool, waxId);
    const sessionLog = logSafe.child({ sessionId: session.id, correlationId });

    // Extract message content.
    const messageContent = message.text?.body || message.text?.value || JSON.stringify(message);
    const messageType = message.type || 'text';

    // Generate UUID for internal message ID.
    const messageUuid = randomUUID();

    // Persist message idempotently. The unique partial index on external_id
    // (migration 015) ensures duplicate webhooks don't create duplicate rows.
    // This INSERT happens BEFORE the BullMQ enqueue so the message is
    // durably persisted in Postgres even if Redis is down.
    await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, external_id, direction, content, message_type, processing_status, created_at)
       VALUES ($1, $2, $3, $4, 'inbound', $5, $6, 'received', NOW())
       ON CONFLICT (external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL DO NOTHING`,
      [messageUuid, waxId, session.id, messageId, messageContent, messageType]
    );

    // Debounce: cancel any pending job for this student and create a new one.
    const debounceJobId = `debounce:student:${waxId}`;

    try {
      const existingJob = await queueInstance.getJob(debounceJobId);
      if (existingJob) {
        await existingJob.remove();
        sessionLog.debug({ debounceJobId }, 'Cancelled pending debounce job');
      }
    } catch (err) {
      sessionLog.warn({ err: err.message }, 'Failed to cancel pending debounce job (non-fatal)');
    }

    // Add to queue with debounce delay.
    // If this fails (Redis down), the message is already persisted in Postgres
    // with processing_status='received'. A recovery sweeper (setup in workers)
    // will find 'received' messages older than 5 minutes and re-enqueue them.
    await queueInstance.add(
      'process-student-messages',
      {
        waxId,
        phoneNumber: from,
        messageId,
        sessionId: session.id,
        currentMessage: messageContent,
        _trace: {
          correlationId,
          waxId,
          messageId,
          sessionId: session.id,
          phoneNumber: from,
          currentMessage: messageContent,
        },
      },
      { jobId: debounceJobId, delay: debounceDelay }
    );

    sessionLog.info({ waxId, messageId, sessionId: session.id }, 'Message enqueued for processing');
    return { success: true, waxId, sessionId: session.id };
  } catch (err) {
    logSafe.error(
      {
        err: { name: err.name, message: err.message, code: err.code },
        from,
        messageId,
      },
      'Failed to enqueue message'
    );

    // If the message was already persisted but the queue.add failed,
    // mark the message as 'received' (it already is) so the recovery
    // sweeper can find it. The message is NOT lost — it's in Postgres.
    // The sweeper runs periodically and re-enqueues 'received' messages
    // that are older than 5 minutes.
    // (No compensating UPDATE needed here because the INSERT already set
    // processing_status='received', which is exactly what the sweeper
    // looks for.)

    throw err;
  } finally {
    // Only close pools we created. The webhook server's shared pool stays open.
    if (shouldClosePool && pool && typeof pool.end === 'function') {
      try { await pool.end(); } catch { /* ignore */ }
    }
  }
}

export default { enqueueStudentMessage };
