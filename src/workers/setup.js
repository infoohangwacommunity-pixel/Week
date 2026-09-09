/**
 * WaxPrep - Worker Setup
 * 
 * Sets up BullMQ workers for processing queued jobs.
 * 
 * Stages 18-21 Integration:
 * - Stage 18: ContextAssembler for conversation context
 * - Stage 19: ResponseValidator for response validation
 * - Stage 20: AIOrchestrator for AI orchestration
 * - Stage 21: End-to-end prototype flow
 */

import { Worker } from 'bullmq';
import config from '../config/index.js';
import { logger, extractTraceContext, runWithContext } from '../observability/index.js';
import { sendResponse } from '../messaging/outbound.js';
import { getOrCreateSession } from '../session/manager.js';
import { setupDecayWorker } from './decayRecomputation.js';
import { setupEmbeddingWorker } from './embeddingWorker.js';

/**
 * Setup all workers
 */
export async function setupWorkers({ redis, pool }) {
  const workers = [];

  // Setup embedding generation worker (Stage 41)
  try {
    const embeddingWorker = await setupEmbeddingWorker({ redis, pool });
    workers.push(embeddingWorker);
  } catch (err) {
    logger.warn({ err }, 'Failed to setup embedding worker, skipping');
  }

  // Setup AI processing worker with full orchestration (Stages 18-21)
  let aiWorker;
  try {
    aiWorker = new Worker(
      'ai-processing',
      async (job) => {
        // Restore trace context from job payload
        const trace = extractTraceContext(job.data);
        
        return runWithContext(trace, async () => {
          const log = logger.child({
            jobId: job.id,
            waxId: trace.waxId,
            sessionId: trace.sessionId,
            messageId: trace.messageId,
          });

          log.info('Processing AI job with full orchestration (Stages 18-21)');

          // Debug: Log trace context
          log.debug({ trace, hasWaxId: !!trace.waxId, hasSessionId: !!trace.sessionId, hasMessageId: !!trace.messageId }, 'Trace context extracted');

          try {
            // Debug: Log before imports
            log.info('Starting imports...');
            
            // Import orchestration components
            const { AIOrchestrator } = await import('../orchestration/AIOrchestrator.js');
            log.info('AIOrchestrator imported');
            
            try {
              const { ContextAssembler } = await import('../context/ContextAssembler.js');
              log.info('ContextAssembler imported');
            } catch (importError) {
              log.error({ err: { name: importError.name, message: importError.message, stack: importError.stack?.split('\n').slice(0, 3).join('\n') } }, 'Failed to import ContextAssembler');
              throw importError;
            }
            
            try {
              const { ResponseValidator } = await import('../validation/ResponseValidator.js');
              log.info('ResponseValidator imported');
            } catch (importError) {
              log.error({ err: { name: importError.name, message: importError.message, stack: importError.stack?.split('\n').slice(0, 3).join('\n') } }, 'Failed to import ResponseValidator');
              throw importError;
            }
            
            try {
              const ProviderFactory = await import('../ai/providers/ProviderFactory.js').then(m => m.default);
              log.info('ProviderFactory imported');
            } catch (importError) {
              log.error({ err: { name: importError.name, message: importError.message, stack: importError.stack?.split('\n').slice(0, 3).join('\n') } }, 'Failed to import ProviderFactory');
              throw importError;
            }
            
            // Phase G-I: Import tool and safety components
            const { ToolExecutor } = await import('../tools/ToolExecutor.js');
            log.info('ToolExecutor imported');
            
            const { SafetyClassifier } = await import('../safety/SafetyClassifier.js');
            log.info('SafetyClassifier imported');
            
            const { CrisisProtocol } = await import('../safety/CrisisProtocol.js');
            log.info('CrisisProtocol imported');
            
            // Initialize providers
            log.info('Initializing providers...');
            const providerRegistry = await ProviderFactory.initializeProviders();
            log.info({ provider: providerRegistry.current }, 'AI providers initialized');
            
            // Initialize context assembler (Stage 18)
            const contextAssembler = new ContextAssembler(pool);
            
            // Initialize response validator (Stage 19)
            const responseValidator = new ResponseValidator(pool);
            
            // Phase G-I: Initialize tool executor
            let toolExecutor = null;
            if (config.TOOL_MAX_CALLS_PER_SESSION) {
              toolExecutor = new ToolExecutor({ db: pool, queue: null, logger, configOverride: {} });
              log.info('Tool executor initialized (Phase G)');
            }
            
            // Phase I: Initialize safety classifier
            let safetyClassifier = null;
            let crisisProtocol = null;
            if (config.SAFETY_CLASSIFIER_MODEL) {
              safetyClassifier = new SafetyClassifier({ aiService: providerRegistry.primary, db: pool, logger });
              crisisProtocol = new CrisisProtocol({ db: pool, logger, emailService: null, webhookService: null });
              log.info('Safety classifier and crisis protocol initialized (Phase I)');
            }
            
            // Create orchestrator with Phase G-I dependencies
            const orchestrator = new AIOrchestrator({
              providerFactory: providerRegistry.primary,
              contextAssembler,
              responseValidator,
              database: { createPool: () => Promise.resolve(pool) },
              toolExecutor,
              safetyClassifier,
              crisisProtocol,
            });
            
            // Validate trace context
            if (!trace.waxId) {
              throw new Error('Missing waxId in trace context');
            }
            if (!trace.sessionId) {
              throw new Error('Missing sessionId in trace context');
            }
            
            // Get current message from job data or build from messages array
            const currentMessage = trace.messages && trace.messages.length > 0
              ? trace.messages[trace.messages.length - 1]?.content || trace.currentMessage
              : trace.currentMessage;
            
            if (!currentMessage) {
              throw new Error('No current message provided in job data');
            }
            
            // Complete the AI request through orchestrator
            log.info({ waxId: trace.waxId, sessionId: trace.sessionId, hasMessage: !!currentMessage, correlationId: trace.correlationId }, 'Calling orchestrator.complete');
            const response = await orchestrator.complete({
              waxId: trace.waxId,
              sessionId: trace.sessionId,
              currentMessage,
              context: { correlationId: trace.correlationId },
            });
            
            // Log successful response
            log.info({
              provider: response.provider,
              model: response.model,
              finishReason: response.finishReason,
              tokens: `${response.usage.inputTokens}/${response.usage.outputTokens}`,
              fallbackUsed: response.fallbackUsed || false,
            }, 'AI request completed successfully');
            
            // Send response to student via WhatsApp
            if (response.content && trace.phoneNumber) {
              try {
                const messageIds = await sendResponse(trace.phoneNumber, response.content, {
                  correlationId: trace.correlationId,
                  messageId: trace.messageId,
                });
                log.info({ messageIds, contentLength: response.content.length }, 'Response sent successfully');
              } catch (err) {
                log.error({ err: { name: err.name, message: err.message } }, 'Failed to send response to student');
                // Don't rethrow - AI request succeeded, just delivery failed
              }
            } else {
              log.warn({ hasContent: !!response.content, hasPhoneNumber: !!trace.phoneNumber }, 'Skipping outbound delivery - missing content or phone number');
            }
          
          } catch (error) {
            // Log detailed error information
            const errorInfo = {
              jobId: job.id,
              // Try to extract normalized error properties
              errorType: error.errorType || 'UNKNOWN',
              message: error.providerMessage || error.message || 'Unknown error',
              isRetryable: error.isRetryable || false,
              // Always include raw error details for debugging
              rawError: {
                name: error.name,
                message: error.message,
                stack: error.stack?.split('\n').slice(0, 3).join('\n'),
              },
            };
            
            logger.error(errorInfo, 'AI request failed');
            
            // Re-throw to trigger BullMQ retry logic
            throw error;
          }
        });
      },
      {
        connection: redis,
        concurrency: config.QUEUE_WORKER_CONCURRENCY,
        lockDuration: config.QUEUE_LOCK_DURATION_MS,
        lockRenewalTime: config.QUEUE_LOCK_DURATION_MS / 2,
      },
    );
  } catch (err) {
    logger.fatal({ err: { name: err.name, message: err.message, stack: err.stack } }, 'Failed to create AI worker - crashing');
    throw err;
  }

  workers.push(aiWorker);

  // Listen to worker events
  aiWorker.on('completed', (job) => {
    logger.info({ jobId: job.id }, 'Job completed');
  });

  aiWorker.on('failed', (job, err) => {
    logger.error({ jobId: job?.id, err }, 'Job failed');
  });

  logger.info({ concurrency: config.QUEUE_WORKER_CONCURRENCY }, 'AI worker setup complete (Stages 18-21)');

  // Setup mastery decay recomputation worker (Stage 29)
  const decayWorker = await setupDecayWorker({ redis, pool });
  workers.push(decayWorker);

  return workers;
}

export default setupWorkers;

