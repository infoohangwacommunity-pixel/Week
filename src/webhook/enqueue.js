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
import { createQueue } from '../queue/index.js';
import { resolveWaxID } from '../identity/waxId.js';
import { getOrCreateSession } from '../session/manager.js';
import { randomUUID } from 'crypto';
import { logger } from '../observability/index.js';
import { getRateLimiter } from './rateLimiter.js';
import config from '../config/index.js';

export async function enqueueStudentMessage(from, messageId, message, databaseUrl, redisUrl, debounceWindowMs, log) {
  // Ensure we have a logger
  const logSafe = log || logger;
  
  try {
    // Initialize queue if not already done
    if (!queue) {
      await initializeQueue();
    }
    
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
    
    // Persist message to database
    await pool.query(
      `INSERT INTO messages (id, wax_id, session_id, direction, content, message_type, created_at)
       VALUES ($1, $2, $3, 'inbound', $4, $5, NOW())
       ON CONFLICT (id) DO NOTHING`,
      [messageId, waxId, session.id, messageContent, messageType]
    );
    
    // Create debounce job ID
    const debounceJobId = `debounce:student:${waxId}`;
    
    try {
      const existingJob = await queue.getJob(debounceJobId);
      if (existingJob) {
        await existingJob.remove();
        sessionLog.debug({ debounceJobId }, 'Cancelled pending debounce job');
      }
    } catch (err) {
      sessionLog.warn({ err }, 'Failed to cancel pending debounce job');
    }
    
    // Add to queue with debounce delay
    await queue.add('process-student-messages', {
      waxId,
      messageId,
      sessionId: session.id,
      _trace: { correlationId: randomUUID(), waxId, messageId, sessionId: session.id },
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

// Module-level queue instance (created once)
let queue = null;

// Initialize queue
async function initializeQueue() {
  if (queue) return queue;
  
  try {
    const redis = await createRedisClient(config);
    const bullmq = await import('bullmq');
    
    queue = new bullmq.Queue('student-messages', { 
      connection: redis,
      defaultJobOptions: { 
        removeOnComplete: 100,
        removeOnFail: 100
      } 
    });
    
    return queue;
  } catch (err) {
    console.error('Failed to initialize queue:', {
      name: err.name,
      message: err.message,
      code: err.code,
    });
    throw err;
  }
}

async function createRedisClient(cfg) {
  const { Redis } = await import('ioredis');
  const redis = new Redis(cfg.REDIS_URL, { maxRetriesPerRequest: null });
  await redis.ping();
  return redis;
}

export default { enqueueStudentMessage, initializeQueue };
