#!/usr/bin/env node
/**
 * WaxPrep - Message Enqueueing
 */

import { createPool } from '../db/index.js';
import { createQueue } from '../queue/index.js';
import { resolveWaxID } from '../identity/waxId.js';
import { getOrCreateSession } from '../session/manager.js';
import { randomUUID } from 'crypto';
import { logger } from '../observability/index.js';
import { getRateLimiter } from './rateLimiter.js';

export async function enqueueStudentMessage(from, messageId, message, databaseUrl, redisUrl, debounceWindowMs, logger) {
  // Rate limiting is now enforced in router.js for earlier detection
  // This is a safety check in enqueue
  const rateLimiter = getRateLimiter({ messagesPerMinute: 10, messagesPerDay: 200, burstAllowance: 3 });
  const waxId = await resolveWaxIDFromPhone(from);
  
  const rateLimitResult = rateLimiter.checkLimit(waxId);
  if (!rateLimitResult.allowed) {
    logger.warn({ waxId, reason: rateLimitResult.reason, retryAfter: rateLimitResult.retryAfter }, 'Rate limit exceeded in enqueue (safety check)');
    return { success: false, reason: rateLimitResult.reason, retryAfter: rateLimitResult.retryAfter };
  }

    const session = await getOrCreateSession(pool, waxId);
    log = log.child({ sessionId: session.id });

    await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, direction, content, message_type, created_at)
       VALUES ($1, $2, $3, 'inbound', $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [messageId, waxId, session.id, messageContent, messageType]
    );

    const debounceJobId = `debounce:student:${waxId}`;
    try {
      const existingJob = await queue.getJob(debounceJobId);
      if (existingJob) {
        await existingJob.remove();
        log.debug({ debounceJobId }, 'Cancelled pending debounce job');
      }
    } catch (err) {
      log.warn({ err }, 'Failed to cancel pending debounce job');
    }

    await queue.add('process-student-messages', {
      waxId,
      messageId,
      sessionId: session.id,
      _trace: { correlationId: randomUUID(), waxId, messageId, sessionId: session.id },
    }, { jobId: debounceJobId, delay: debounceWindowMs });

    log.info({ waxId, messageId, sessionId: session.id }, 'Message enqueued for processing');
    return { rateLimited: false };
  } catch (err) {
    log.error({ err }, 'Failed to enqueue message');
    throw err;
  } finally {
    await pool.end();
    await redis.disconnect();
  }
}

async function createRedisClient(config) {
  const { Redis } = await import('ioredis');
  const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  await redis.ping();
  return redis;
}

function createQueue(name, redis) {
  const { Queue } = await import('bullmq');
  const { IORedis } = await import('bullmq');
  return new Queue(name, { connection: new IORedis(redis), defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 } });
}

export default { enqueueStudentMessage };
