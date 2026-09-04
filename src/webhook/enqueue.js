#!/usr/bin/env node
/**
 * WaxPrep - Message Enqueueing
 * 
 * Handles enqueuing student messages for AI processing.
 * Implements debouncing, per-student locking, and message persistence.
 */

import { createPool } from '../db/index.js';
import { createQueue, getDebounceJobId, cancelPendingDebounceJob } from '../queue/index.js';
import { randomUUID } from 'crypto';

/**
 * Enqueue a student message for AI processing
 * 
 * Implements debouncing:
 * - If a pending job exists for this student, remove it
 * - Create a new delayed job with the debounce window
 * - Persist the message to the database
 */
export async function enqueueStudentMessage(phoneNumber, messageId, message, databaseUrl, redisUrl, debounceWindowMs, logger) {
  const pool = await createPool({ DATABASE_URL: databaseUrl });
  const redis = await createRedisClient({ REDIS_URL: redisUrl });
  const queue = createQueue('student-messages', redis);
  
  try {
    // Persist message to database
    await pool.query(
      `INSERT INTO messages (id, wax_id, direction, content, message_type, created_at)
       VALUES ($1, NULL, 'inbound', $2, $3, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [messageId, JSON.stringify(message), message.type]
    );

    // Get or create WaxID for this phone number
    // (WaxID resolution is implemented in Stage 12)
    const waxId = await resolveWaxID(pool, phoneNumber);

    // Cancel any pending debounce job for this student
    await cancelPendingDebounceJob(queue, waxId);

    // Add new debounce job
    await queue.add('process-student-messages', {
      waxId,
      messageId,
      _trace: {
        correlationId: randomUUID(),
        waxId,
        messageId,
      },
    }, {
      jobId: getDebounceJobId(waxId),
      delay: debounceWindowMs,
    });

    logger.info({ waxId, messageId }, 'Message enqueued for processing');
  } finally {
    await pool.end();
    await redis.disconnect();
  }
}

/**
 * Resolve WaxID for a phone number
 * Creates a new WaxID if the phone number is not known
 */
async function resolveWaxID(pool, phoneNumber) {
  // Stage 12: Full WaxID resolution with hashing and profile storage
  // For now, create a simple mapping
  const result = await pool.query(
    `INSERT INTO students (id, created_at)
     SELECT gen_random_uuid(), NOW()
     WHERE NOT EXISTS (
       SELECT 1 FROM students WHERE deleted_at IS NULL
       LIMIT 1
     )
     RETURNING id`,
    []
  );
  
  return result.rows[0].id;
}

/**
 * Create Redis client for BullMQ
 */
async function createRedisClient(config) {
  const { Redis } = await import('ioredis');
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null,
  });
  await redis.ping();
  return redis;
}

/**
 * Create BullMQ queue
 */
function createQueue(name, redis) {
  const { Queue } = await import('bullmq');
  const { IORedis } = await import('bullmq');
  
  return new Queue(name, {
    connection: new IORedis(redis),
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}
