/**
 * WaxPrep - Queue Module
 * 
 * BullMQ queue infrastructure built on Redis.
 * Handles message debouncing, per-student serialization, and job processing.
 */

import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import bullmq from 'bullmq';
const { Queue, Worker, QueueScheduler } = bullmq;

/**
 * Create a Redis client for BullMQ
 */
export async function createRedisClient(config) {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Important for BullMQ
    retryStrategy: (times) => {
      if (times > 3) {
        return null; // Stop retrying
      }
      return Math.min(times * 100, 3000);
    },
  });

  // Test connection
  await redis.ping();
  console.log('✓ Redis connection successful');

  return redis;
}

/**
 * Create a BullMQ queue
 */
export function createQueue(name, redis) {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: 100,
      removeOnFail: 100,
    },
  });
}

/**
 * Create a BullMQ worker
 */
export function createWorker(queueName, jobHandler, redis, concurrency) {
  return new Worker(
    queueName,
    async (job) => {
      return jobHandler(job);
    },
    {
      connection: redis,
      concurrency: concurrency,
      lockDuration: 30000, // 30 seconds
      lockRenewalTime: 15000, // Renew every 15 seconds
    },
  );
}

/**
 * Create a QueueScheduler for stalled job detection
 */
export function createQueueScheduler(queueName, redis) {
  return new QueueScheduler(queueName, {
    connection: redis,
    run: true,
  });
}

/**
 * Debounce job IDs for a given waxId
 */
export function getDebounceJobId(waxId) {
  return `debounce:student:${waxId}`;
}

/**
 * Acquire a distributed lock for a student using Redlock
 */
export async function acquireStudentLock(redis, waxId, config) {
  const duration = config.QUEUE_LOCK_DURATION_MS || 30000;
  const lockKey = `lock:student:${waxId}`;
  const lockValue = randomUUID();
  
  // Try to acquire lock
  const existing = await redis.get(lockKey);
  if (existing) {
    // Lock already held, return null
    return null;
  }

  // Set with expiration
  await redis.set(lockKey, lockValue, 'EX', Math.ceil(duration / 1000));
  
  return { key: lockKey, value: lockValue, release: () => releaseStudentLock(redis, lockKey, lockValue) };
}

/**
 * Release a student lock
 */
export async function releaseStudentLock(redis, lockKey, lockValue) {
  // Lua script for atomic check-and-delete
  const script = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  
  await redis.eval(script, 1, lockKey, lockValue);
}

/**
 * Cancel a pending debounce job for a student
 */
export async function cancelPendingDebounceJob(queue, waxId) {
  const jobId = getDebounceJobId(waxId);
  const job = await queue.getJob(jobId);
  
  if (job) {
    await job.remove();
  }
}

export default {
  createRedisClient,
  createQueue,
  createWorker,
  createQueueScheduler,
  getDebounceJobId,
  acquireStudentLock,
  releaseStudentLock,
  cancelPendingDebounceJob,
};
