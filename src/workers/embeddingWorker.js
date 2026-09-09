/**
 * Embedding Generation Worker - Phase H Stage 41
 * 
 * Processes embedding generation jobs from the queue.
 * Generates embeddings for student_facts and student_episodes records.
 */

import { Worker } from 'bullmq';
import { IORedis } from 'bullmq';
import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { EmbeddingService } from '../retrieval/EmbeddingService.js';

/**
 * Setup embedding generation worker
 */
export async function setupEmbeddingWorker({ redis, pool }) {
  const embeddingService = new EmbeddingService({ db: pool, queue: null, logger });
  
  const worker = new Worker(
    'generate-embedding',
    async (job) => {
      const { targetType, targetId, waxId, text } = job.data;
      
      const log = logger.child({
        jobId: job.id,
        targetType,
        targetId,
        waxId,
      });

      log.info('Processing embedding generation job');

      try {
        // Generate embedding
        const result = await embeddingService.processEmbeddingJob({
          targetType,
          targetId,
          waxId,
          text,
        });

        if (result.success) {
          log.info({ embeddingLength: result.embeddingLength }, 'Embedding generated successfully');
          return { success: true, embeddingLength: result.embeddingLength };
        } else {
          throw new Error(result.error);
        }
      } catch (error) {
        log.error({ error: error.message }, 'Embedding generation failed');
        throw error;
      }
    },
    {
      connection: new IORedis(redis),
      concurrency: 5,
      async processJob(job) {
        // Custom error handling for retry logic
        try {
          return await worker.processJob.call(worker, job);
        } catch (error) {
          // Handle specific error types
          if (error.message.includes('API key') || error.message.includes('Authentication')) {
            // Don't retry on auth errors
            await job.moveToFailed(error, 'API authentication failed');
          } else {
            // Retry on other errors
            throw error;
          }
        }
      },
    }
  );

  // Listen to worker events
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: 'embedding' }, 'Embedding job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Embedding job failed');
  });

  worker.on('error', (err) => {
    logger.error({ err }, 'Embedding worker error');
  });

  logger.info('Embedding worker setup complete');
  return worker;
}

export default { setupEmbeddingWorker };
