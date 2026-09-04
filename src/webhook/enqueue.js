#!/usr/bin/env node
/**
 * WaxPrep - Message Enqueueing
 * 
 * Handles enqueuing student messages for AI processing.
 * Implements debouncing, WaxID resolution, and message persistence.
 */

import { createPool } from '../db/index.js';
import { createQueue } from '../queue/index.js';
import { resolveWaxID } from '../identity/waxId.js';
import { getOrCreateSession, getUnprocessedMessages, getConversationHistory } from '../session/manager.js';
import { randomUUID } from 'crypto';
import { logger } from '../observability/index.js';

/**
 * Enqueue a student message for AI processing
 * 
 * Implements debouncing:
 * - If a pending job exists for this student, remove it
 * - Create a new delayed job with the debounce window
 * - Persist the message to the database
 * - Resolve WaxID and session
 */
export async function enqueueStudentMessage(phoneNumber, messageId, message, databaseUrl, redisUrl, debounceWindowMs, log) {
  const pool = await createPool({ DATABASE_URL: databaseUrl });
  const redis = await createRedisClient({ REDIS_URL: redisUrl });
  const queue = createQueue('student-messages', redis);
  
  try {
    // Parse message content if it's a buffer
    const messageContent = message.type === 'text' ? message.text?.body : null;
    const messageType = message.type;
    
    // Resolve WaxID for this phone number
    const waxId = await resolveWaxID(pool, phoneNumber);
    log = log.child({ waxId, messageId });

    // Get or create session
    const session = await getOrCreateSession(pool, waxId);
    log = log.child({ sessionId: session.id });

    // Persist message to database (with WaxID and session)
    await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, direction, content, message_type, created_at)
       VALUES ($1, $2, $3, 'inbound', $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [messageId, waxId, session.id, messageContent, messageType]
    );

    // Cancel any pending debounce job for this student
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

    // Add new debounce job
    await queue.add('process-student-messages', {
      waxId,
      messageId,
      sessionId: session.id,
      _trace: {
        correlationId: randomUUID(),
        waxId,
        messageId,
        sessionId: session.id,
      },
    }, {
      jobId: debounceJobId,
      delay: debounceWindowMs,
    });

    log.info({ waxId, messageId, sessionId: session.id }, 'Message enqueued for processing');
  } catch (err) {
    log.error({ err }, 'Failed to enqueue message');
    throw err;
  } finally {
    await pool.end();
    await redis.disconnect();
  }
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
