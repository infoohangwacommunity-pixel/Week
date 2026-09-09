#!/usr/bin/env node
/**
 * WaxPrep - Message Enqueueing
 * 
 * Enqueues student messages for processing with:
 * - Rate limiting
 * - WaxID resolution
 * - Session management
 * - Message persistence
 * - Debounced processing
 */

import { createPool } from '../db/index.js';
import { resolveWaxID } from '../identity/waxId.js';
import { getOrCreateSession } from '../session/manager.js';
import { randomUUID } from 'crypto';
import { logger } from '../observability/index.js';
import { getRateLimiter } from './rateLimiter.js';
import config from '../config/index.js';
import { Redis } from 'ioredis';
import { Queue } from 'bullmq';

// Module-level queue instance (created once, shared across requests)
let queue = null;

/**
 * Get or initialize the BullMQ queue
 */
async function getQueue() {
  if (queue) return queue;
  
  try {
    const redis = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
    await redis.ping();
    
    queue = new Queue('ai-processing', { 
      connection: redis,
      defaultJobOptions: { 
        removeOnComplete: 100,
        removeOnFail: 100
      } 
    });
    
    logger.info('AI processing queue initialized');
    return queue;
  } catch (err) {
    logger.error({ err: { name: err.name, message: err.message, code: err.code } }, 'Failed to initialize queue');
    throw err;
  }
}

export async function enqueueStudentMessage(from, messageId, message, databaseUrl, redisUrl, debounceWindowMs, log) {
  // Ensure we have a logger
  const logSafe = log || logger;
  
  try {
    // Get or initialize queue
    const queueInstance = await getQueue();
    
    // Create database pool
    const pool = await createPool(config);
    
    // Rate limiting check (safety check in enqueue)
    const rateLimiter = getRateLimiter({ 
      messagesPerMinute: 10, 
      messagesPerDay: 200, 
      burstAllowance: 3 
    });
    
    // Resolve WaxID
    const waxId = await resolveWaxID(pool, from);
    const rateLimitResult = rateLimiter.checkLimit(waxId);
    
    if (!rateLimitResult.allowed) {
      logSafe.warn({ waxId, reason: rateLimitResult.reason, retryAfter: rateLimitResult.retryAfter }, 'Rate limit exceeded in enqueue (safety check)');
      await pool.end();
      return { success: false, reason: rateLimitResult.reason, retryAfter: rateLimitResult.retryAfter };
    }
    
    // Get or create session
    const session = await getOrCreateSession(pool, waxId);
    const sessionLog = logSafe.child({ sessionId: session.id });
    
    // Extract message content and type
    const messageContent = message.text?.body || message.text?.value || JSON.stringify(message);
    const messageType = message.type || 'text';
    
    // Generate UUID for internal message ID
    const messageUuid = randomUUID();
    
    // Persist message to database
    await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, external_id, direction, content, message_type, created_at)
       VALUES ($1, $2, $3, $4, 'inbound', $5, $6, NOW())
       ON CONFLICT (external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL DO NOTHING`,
      [messageUuid, waxId, session.id, messageId, messageContent, messageType]
    );
    
    // Create debounce job ID
    const debounceJobId = `debounce:student:${waxId}`;
    
    try {
      const existingJob = await queueInstance.getJob(debounceJobId);
      if (existingJob) {
        await existingJob.remove();
        sessionLog.debug({ debounceJobId }, 'Cancelled pending debounce job');
      }
    } catch (err) {
      sessionLog.warn({ err }, 'Failed to cancel pending debounce job');
    }
    
    // Add to queue with debounce delay
    // Include phone number and message content in payload for outbound delivery
    await queueInstance.add('process-student-messages', {
      waxId,
      phoneNumber: from,
      messageId,
      sessionId: session.id,
      currentMessage: messageContent,
      _trace: { 
        correlationId: randomUUID(), 
        waxId, 
        messageId, 
        sessionId: session.id,
        phoneNumber: from,
        currentMessage: messageContent
      },
    }, { jobId: debounceJobId, delay: debounceWindowMs });
    
    sessionLog.info({ waxId, messageId, sessionId: session.id }, 'Message enqueued for processing');
    return { success: true, waxId, sessionId: session.id };
    
  } catch (err) {
    logSafe.error({
      err: {
        name: err.name,
        message: err.message,
        code: err.code,
        stack: err.stack,
      },
      from,
      messageId,
    }, 'Failed to enqueue message');
    throw err;
  }
}

export default { enqueueStudentMessage };
