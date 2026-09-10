/**
 * WaxPrep - Queue Module
 *
 * BullMQ queue infrastructure built on Redis.
 * Handles message debouncing, per-student serialization, and job processing.
 *
 * NOTE: `QueueScheduler` was removed in BullMQ v5.0 (its functionality was
 * merged into `Worker`). The previous export `createQueueScheduler` would
 * throw `TypeError: QueueScheduler is not a constructor` if called. The
 * function and import have been removed.
 *
 * Only `createRedisClient` is currently consumed (by `workers/aiWorker.js`).
 * The other helpers are kept for future use but should be reviewed before
 * being wired into the production path.
 */

import { randomUUID } from 'crypto';
import { Redis } from 'ioredis';
import { Queue, Worker } from 'bullmq';

/**
 * Create a Redis client for BullMQ.
 *
 * @param {Object} config - App config (must include REDIS_URL).
 * @returns {Promise<Redis>} Connected Redis client.
 */
export async function createRedisClient(config) {
  const redis = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: null, // Important for BullMQ
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 100, 3000);
    },
  });

  await redis.ping();
  return redis;
}

/**
 * Create a BullMQ queue.
 */
export function createQueue(name, redis, defaultJobOptions = {}) {
  return new Queue(name, {
    connection: redis,
    defaultJobOptions: {
      removeOnComplete: { age: 86400, count: 1000 },
      removeOnFail: { age: 86400 * 7, count: 5000 },
      ...defaultJobOptions,
    },
  });
}

/**
 * Create a BullMQ worker.
 */
export function createWorker(queueName, jobHandler, redis, concurrency = 1, opts = {}) {
  return new Worker(
    queueName,
    async (job) => jobHandler(job),
    {
      connection: redis,
      concurrency,
      lockDuration: opts.lockDuration || 30000,
      lockRenewalTime: opts.lockRenewalTime || 15000,
    }
  );
}

/**
 * Debounce job IDs for a given waxId.
 */
export function getDebounceJobId(waxId) {
  return `debounce:student:${waxId}`;
}

/**
 * Acquire a distributed lock for a student. Uses atomic SET NX EX (not
 * GET-then-SET) to avoid the TOCTOU race the previous implementation had.
 *
 * @returns {Promise<{key, value, release}|null>} Lock handle, or null if already held.
 */
export async function acquireStudentLock(redis, waxId, config) {
  const duration = config.QUEUE_LOCK_DURATION_MS || 30000;
  const lockKey = `lock:student:${waxId}`;
  const lockValue = randomUUID();

  // Atomic acquire: SET key value NX EX seconds
  const result = await redis.set(lockKey, lockValue, 'EX', Math.ceil(duration / 1000), 'NX');
  if (result !== 'OK') {
    return null; // Lock already held by another worker
  }

  return {
    key: lockKey,
    value: lockValue,
    release: () => releaseStudentLock(redis, lockKey, lockValue),
  };
}

/**
 * Release a student lock. Uses a Lua script for atomic check-and-delete to
 * avoid releasing a lock we no longer own (e.g., if it expired and another
 * worker re-acquired it).
 */
export async function releaseStudentLock(redis, lockKey, lockValue) {
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
 * Cancel a pending debounce job for a student.
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
  getDebounceJobId,
  acquireStudentLock,
  releaseStudentLock,
  cancelPendingDebounceJob,
};
