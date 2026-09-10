/**
 * WaxPrep - Stranded Message Recovery Sweeper
 *
 * Periodically scans the messages table for inbound messages with
 * processing_status='received' that are older than a configurable threshold
 * (default: 5 minutes). These messages were persisted by the webhook but
 * never made it into the BullMQ queue (typically because Redis was
 * temporarily unavailable when the webhook arrived).
 *
 * The sweeper re-enqueues them with their original trace context so the
 * AI worker can pick them up. It runs on an interval (default: 60 seconds)
 * and is designed to be safe to run concurrently — the unique debounce
 * jobId (`debounce:student:${waxId}`) ensures only one job per student
 * exists in the queue at a time.
 *
 * This is the DURABILITY GUARANTEE: even if Redis is down for an extended
 * period, no student message is permanently stranded. When Redis recovers,
 * the sweeper will find and re-enqueue every 'received' message.
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';

const SWEEP_INTERVAL_MS = 60_000; // Run every 60 seconds
const STRANDED_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes old
const SWEEP_BATCH_SIZE = 50;

let sweepTimer = null;
let sweepQueue = null;

/**
 * Start the stranded message recovery sweeper.
 *
 * @param {Object} params
 * @param {import('pg').Pool} params.pool - Shared Postgres pool.
 * @param {Redis} [params.redis] - Optional shared Redis connection. If not
 *   provided, a new one is created from config.REDIS_URL.
 */
export async function startStrandedMessageSweeper({ pool, redis }) {
  if (sweepTimer) {
    logger.warn('Stranded message sweeper already running');
    return;
  }

  // Create a queue instance for re-enqueueing.
  const redisConn = redis || new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
  });

  try {
    await redisConn.ping();
  } catch (err) {
    logger.warn({ err: err.message }, 'Sweeper: Redis not available at startup — sweeper will retry on first tick');
  }

  sweepQueue = new Queue('ai-processing', {
    connection: redisConn,
    defaultJobOptions: {
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 86400 * 7, count: 5000 },
      attempts: Math.max(1, config.QUEUE_MAX_RETRIES),
      backoff: { type: 'exponential', delay: config.QUEUE_RETRY_DELAY_BASE_MS },
    },
  });

  logger.info(
    { sweepIntervalMs: SWEEP_INTERVAL_MS, strandedThresholdMs: STRANDED_THRESHOLD_MS },
    'Stranded message recovery sweeper started'
  );

  // Run immediately, then on interval.
  await sweepOnce(pool);
  sweepTimer = setInterval(() => {
    sweepOnce(pool).catch((err) => {
      logger.error({ err: err.message }, 'Sweeper: unexpected error during sweep');
    });
  }, SWEEP_INTERVAL_MS);

  // Don't keep the process alive just for the sweeper.
  if (sweepTimer.unref) sweepTimer.unref();
}

/**
 * Run one sweep cycle. Finds stranded 'received' messages and re-enqueues them.
 */
async function sweepOnce(pool) {
  const cutoff = new Date(Date.now() - STRANDED_THRESHOLD_MS);

  let result;
  try {
    result = await pool.query(
      `SELECT id, wax_id, session_id, external_id, content, message_type, created_at
       FROM messages
       WHERE direction = 'inbound'
         AND processing_status = 'received'
         AND deleted_at IS NULL
         AND created_at < $1
       ORDER BY created_at ASC
       LIMIT $2`,
      [cutoff, SWEEP_BATCH_SIZE]
    );
  } catch (err) {
    logger.warn({ err: err.message }, 'Sweeper: DB query failed');
    return;
  }

  if (result.rows.length === 0) {
    return; // No stranded messages
  }

  logger.info(
    { strandedCount: result.rows.length, cutoff: cutoff.toISOString() },
    'Sweeper: found stranded messages — re-enqueueing'
  );

  for (const msg of result.rows) {
    try {
      const debounceJobId = `debounce:student:${msg.wax_id}`;

      await sweepQueue.add(
        'process-student-messages',
        {
          waxId: msg.wax_id,
          // We don't have the original phone number in the DB (only the hash).
          // The worker will check if trace.phoneNumber is null and skip
          // outbound delivery. The student will need to re-send if they
          // want a response — but at least the message is processed for
          // memory/evidence/tool purposes, and the AI response is persisted.
          phoneNumber: null,
          messageId: msg.external_id,
          sessionId: msg.session_id,
          currentMessage: msg.content,
          _trace: {
            correlationId: `sweeper:${msg.external_id}`,
            waxId: msg.wax_id,
            messageId: msg.external_id,
            sessionId: msg.session_id,
            phoneNumber: null,
            currentMessage: msg.content,
            recoveredBySweeper: true,
          },
        },
        { jobId: debounceJobId, delay: 0 }
      );

      logger.info(
        { messageId: msg.external_id, waxId: msg.wax_id, createdAt: msg.created_at },
        'Sweeper: re-enqueued stranded message'
      );
    } catch (err) {
      logger.error(
        { err: err.message, messageId: msg.external_id },
        'Sweeper: failed to re-enqueue stranded message'
      );
    }
  }
}

/**
 * Stop the sweeper. Called on graceful shutdown.
 */
export async function stopStrandedMessageSweeper() {
  if (sweepTimer) {
    clearInterval(sweepTimer);
    sweepTimer = null;
  }
  if (sweepQueue) {
    try {
      const redis = sweepQueue.opts?.connection;
      await sweepQueue.close();
      if (redis && typeof redis.disconnect === 'function') {
        redis.disconnect();
      }
    } catch {
      // ignore
    }
    sweepQueue = null;
  }
  logger.info('Stranded message sweeper stopped');
}

export default { startStrandedMessageSweeper, stopStrandedMessageSweeper };
