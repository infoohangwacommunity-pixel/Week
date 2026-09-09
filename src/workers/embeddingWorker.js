/**
 * Embedding Generation Worker - Phase H Stage 41
 * 
 * Processes embedding generation jobs from the queue.
 * Generates embeddings for student_facts and student_episodes records.
 */

import { Worker } from 'bullmq';
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
      connection: redis,
      concurrency: 5,
    }
  );

  // Listen to worker events
  worker.on('completed', (job) => {
    logger.info({ jobId: job.id, type: 'embedding' }, 'Embedding job completed');
  });

  worker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err: { name: err.name, message: err.message } }, 'Embedding job failed');
  });

  let errorCount = 0;
  worker.on('error', (err) => {
    errorCount++;
    // Don't spam errors - only log first error and then every 10th error
    if (errorCount === 1 || errorCount % 10 === 0) {
      logger.error({ err: { name: err.name, message: err.message, stack: err.stack?.split('\n').slice(0, 5).join('\n') }, errorCount }, 'Embedding worker error (Redis connection issue - worker will retry automatically)');
    }
  });

  logger.info('Embedding worker setup complete (will retry Redis connection automatically on failure)');
  return worker;
}

export default { setupEmbeddingWorker };
