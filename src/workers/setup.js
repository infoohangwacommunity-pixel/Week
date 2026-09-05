/**
 * WaxPrep - Worker Setup
 * 
 * Sets up BullMQ workers for processing queued jobs.
 * Currently includes the AI processing worker.
 */

import { Worker } from 'bullmq';
import { IORedis } from 'bullmq';
import config from '../config/index.js';
import { logger, extractTraceContext } from '../observability/index.js';
import { runWithContext } from 'node:async_hooks';

/**
 * Setup all workers
 */
export async function setupWorkers({ redis, pool }) {
  const workers = [];

  // Setup AI processing worker
  const aiWorker = new Worker(
    'ai-processing',
    async (job) => {
      // Restore trace context from job payload
      const trace = extractTraceContext(job.data);
      
      return runWithContext(trace, async () => {
        const log = logger.child({
          jobId: job.id,
          waxId: trace.waxId,
          messageId: trace.messageId,
        });

        log.info('Processing AI job');

        try {
          // Import AI service (lazy to avoid circular dependencies)
          const { AIService } = await import('../ai/AIService.js');
          const ProviderFactory = await import('../ai/providers/ProviderFactory.js').then(m => m.default);
          
          // Initialize provider factory
          const providerRegistry = await ProviderFactory.initializeProviders();
          log.info({ provider: providerRegistry.current }, 'AI provider initialized');
          
          // Create AI service
          const aiService = new AIService({
            providerFactory: providerRegistry.primary,
            promptBuilder: null, // Will be initialized in AIService
            database: () => Promise.resolve(pool),
          });
          
          // Complete the AI request
          const response = await aiService.complete({
            waxId: trace.waxId,
            sessionId: trace.sessionId,
            messages: trace.messages || [],
            context: { correlationId: trace.correlationId },
          });
          
          // Log successful response
          log.info({
            provider: response.provider,
            model: response.model,
            finishReason: response.finishReason,
            tokens: `${response.usage.inputTokens}/${response.usage.outputTokens}`,
            latency: `${response.latencyMs}ms`,
          }, 'AI request completed');
          
          // TODO: Queue outbound message with response.content
          // This will be implemented in Stage 11+
          
        } catch (error) {
          // Error is already normalized by AIService
          log.error({
            errorType: error.errorType,
            message: error.providerMessage,
            isRetryable: error.isRetryable,
          }, 'AI request failed');
          
          // Re-throw to trigger BullMQ retry logic
          throw error;
        }
      });
    },
    {
      connection: new IORedis(redis),
      concurrency: config.QUEUE_WORKER_CONCURRENCY,
      lockDuration: 30000,
      lockRenewalTime: 15000,
    },
  );

  workers.push(aiWorker);

  // Listen to worker events
  aiWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  aiWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });

  logger.info({ concurrency: config.QUEUE_WORKER_CONCURRENCY }, 'AI worker setup complete');

  return workers;
}

export default setupWorkers;
