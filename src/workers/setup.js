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
import { startStrandedMessageSweeper } from './strandedMessageSweeper.js';

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
            
            let ContextAssembler;
            try {
              const contextModule = await import('../context/ContextAssembler.js');
              ContextAssembler = contextModule.ContextAssembler;
              log.info('ContextAssembler imported');
            } catch (importError) {
              log.error({ err: { name: importError.name, message: importError.message, stack: importError.stack?.split('\n').slice(0, 3).join('\n') } }, 'Failed to import ContextAssembler');
              throw importError;
            }
            
            let ResponseValidator;
            try {
              const responseModule = await import('../validation/ResponseValidator.js');
              ResponseValidator = responseModule.ResponseValidator;
              log.info('ResponseValidator imported');
            } catch (importError) {
              log.error({ err: { name: importError.name, message: importError.message, stack: importError.stack?.split('\n').slice(0, 3).join('\n') } }, 'Failed to import ResponseValidator');
              throw importError;
            }
            
            let ProviderFactory;
            try {
              const providerModule = await import('../ai/providers/ProviderFactory.js');
              ProviderFactory = providerModule.default;
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
            let providerRegistry;
            try {
              providerRegistry = await ProviderFactory.initializeProviders();
              log.info({ provider: providerRegistry.current }, 'AI providers initialized');
            } catch (providerInitError) {
              log.error({
                err: {
                  name: providerInitError.name,
                  message: providerInitError.message,
                  stack: providerInitError.stack?.split('\n').slice(0, 5).join('\n'),
                  errorType: providerInitError.errorType,
                },
              }, 'Failed to initialize AI providers');
              throw providerInitError;
            }
            
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
            
            // Create orchestrator with Phase G-I dependencies.
            // database: pass the pool directly so persistMetadata/persistFailure
            // can use the shared connection instead of creating a new pool per call.
            const orchestrator = new AIOrchestrator({
              providerFactory: providerRegistry.primary,
              contextAssembler,
              responseValidator,
              database: pool,
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

            // Mark the message as 'processing' so the status column reflects reality.
            // The webhook inserted it as 'received'; we transition it here.
            try {
              await pool.query(
                `UPDATE messages SET processing_status = 'processing'
                 WHERE external_id = $1 AND wax_id = $2 AND processing_status = 'received'`,
                [trace.messageId, trace.waxId],
              );
            } catch (markErr) {
              log.warn({ err: markErr.message }, 'Failed to mark message as processing (non-fatal)');
            }

            // Complete the AI request through orchestrator.
            // Pass phoneNumber in the context so the CrisisProtocol can
            // actually deliver a crisis response via WhatsApp if needed.
            // The phone number is in process memory only — never persisted.
            log.info({ waxId: trace.waxId, sessionId: trace.sessionId, hasMessage: !!currentMessage, correlationId: trace.correlationId }, 'Calling orchestrator.complete');
            const response = await orchestrator.complete({
              waxId: trace.waxId,
              sessionId: trace.sessionId,
              currentMessage,
              context: {
                correlationId: trace.correlationId,
                phoneNumber: trace.phoneNumber || null,
                aiRequestId: trace.messageId,
              },
            });

            // Mark the message as 'completed'.
            try {
              await pool.query(
                'UPDATE messages SET processing_status = \'completed\' WHERE external_id = $1 AND wax_id = $2',
                [trace.messageId, trace.waxId],
              );
            } catch (markErr) {
              log.warn({ err: markErr.message }, 'Failed to mark message as completed (non-fatal)');
            }

            // Absorb burst predecessors: when the debounce window collapsed
            // several rapid student messages into this single job, the earlier
            // messages stayed 'received' (their jobs were replaced). Their
            // content was included in the AI context via history, and the
            // combined reply just went out — so they are handled. Without
            // this, they would stay 'received' forever and the stranded
            // sweeper would re-enqueue them, producing confusing delayed
            // duplicate replies minutes later.
            try {
              await pool.query(
                `UPDATE messages SET processing_status = 'completed'
                 WHERE wax_id = $1
                   AND session_id = $2
                   AND direction = 'inbound'
                   AND processing_status = 'received'
                   AND external_id <> $3
                   AND created_at <= (SELECT created_at FROM messages WHERE external_id = $3 AND wax_id = $1 LIMIT 1)`,
                [trace.waxId, trace.sessionId, trace.messageId],
              );
            } catch (absorbErr) {
              log.warn({ err: absorbErr.message }, 'Failed to absorb burst predecessors (non-fatal)');
            }

            // Log successful response
            log.info({
              provider: response.provider,
              model: response.model,
              finishReason: response.finishReason,
              tokens: `${response.usage.inputTokens}/${response.usage.outputTokens}`,
              fallbackUsed: response.fallbackUsed || false,
            }, 'AI request completed successfully');

            // Persist the outbound message BEFORE attempting delivery, so a
            // crash during fetch leaves an audit trail. The outbound.js helper
            // also writes its own 'pending' row, but only if a pool is passed.
            //
            // If the orchestrator returned a crisis response, the
            // CrisisProtocol has ALREADY delivered the message via WhatsApp
            // (with the in-memory phone number). Don't double-send.
            if (response.isCrisis) {
              log.info({ waxId: trace.waxId, deliveryMethod: response.deliveryMethod }, 'Crisis response already delivered; skipping normal outbound');
            } else if (response.content && trace.phoneNumber) {
              try {
                const messageIds = await sendResponse(trace.phoneNumber, response.content, {
                  correlationId: trace.correlationId,
                  messageId: trace.messageId,
                  waxId: trace.waxId,
                }, { pool });
                log.info({ messageIds, contentLength: response.content.length }, 'Response sent successfully');
              } catch (err) {
                // Outbound delivery failed. The AI response was generated and
                // paid for but the student didn't receive it.
                //
                // Mark the message as 'delivery_failed' (NOT 'completed') so
                // the audit trail reflects reality. Then re-throw so BullMQ
                // retries the job. On retry, the outbound helper will check
                // whether any chunks were already sent (via the outbound_chunk_id
                // unique index) and skip them, preventing duplicate delivery.
                log.error({ err: { name: err.name, message: err.message } }, 'Failed to send response to student');
                try {
                  await pool.query(
                    `UPDATE messages SET processing_status = 'failed'
                     WHERE external_id = $1 AND wax_id = $2
                     AND processing_status NOT IN ('completed', 'failed')`,
                    [trace.messageId, trace.waxId],
                  );
                } catch (markErr) {
                  log.warn({ err: markErr.message }, 'Failed to mark message as delivery_failed');
                }
                // Re-throw so BullMQ retries. The inbound message is safely
                // persisted in Postgres and will survive the retry cycle.
                throw err;
              }
            } else {
              log.warn({ hasContent: !!response.content, hasPhoneNumber: !!trace.phoneNumber }, 'Skipping outbound delivery - missing content or phone number');
            }
          
          } catch (error) {
            // Log detailed error information to both logger and console
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

            // Mark the message as 'failed' so the audit trail reflects reality.
            // Use the trace data from job.data if available.
            try {
              const failTrace = job?.data?._trace || {};
              if (failTrace.messageId && failTrace.waxId) {
                await pool.query(
                  `UPDATE messages SET processing_status = 'failed'
                   WHERE external_id = $1 AND wax_id = $2
                   AND processing_status NOT IN ('completed', 'failed')`,
                  [failTrace.messageId, failTrace.waxId],
                );
              }
            } catch (markErr) {
              logger.warn({ err: markErr.message }, 'Failed to mark message as failed');
            }

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

  // Start the stranded message recovery sweeper.
  // This runs in the background and re-enqueues any inbound messages that
  // were persisted to Postgres but never made it into the BullMQ queue
  // (typically because Redis was temporarily unavailable when the webhook
  // arrived). This is the DURABILITY GUARANTEE that no student message is
  // permanently stranded.
  try {
    await startStrandedMessageSweeper({ pool, redis });
    logger.info('Stranded message recovery sweeper started');
  } catch (err) {
    logger.warn({ err: err.message }, 'Failed to start stranded message sweeper (non-fatal — messages will be retried by Meta)');
  }

  return workers;
}

export default setupWorkers;

