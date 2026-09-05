/**
 * WaxPrep - AI Orchestrator
 * 
 * Stage 20: AI Orchestration & Routing
 * 
 * Central orchestration layer for all AI requests:
 * - Provider routing
 * - Provider fallback
 * - Structured output support
 * - Response metadata capture
 * - AI invocation logging
 * - Request idempotency
 * - Provider capability awareness
 * - Complete observability
 * 
 * Business logic never calls providers directly.
 * All AI requests flow through the orchestrator.
 * 
 * The AI is the intelligence. This provides the infrastructure for orchestration.
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { createAIRequest, estimateTokenUsage } from '../ai/schemas/AIRequest.js';
import { createAIResponse, FinishReason } from '../ai/schemas/AIResponse.js';
import { createAIError, AIErrorTypes } from '../ai/schemas/AIErrors.js';

/**
 * Retryable error types that should trigger fallback
 */
const RETRYABLE_ERRORS = [
  'PROVIDER_RATE_LIMITED',
  'PROVIDER_SERVER_ERROR',
  'PROVIDER_OVERLOADED',
  'PROVIDER_TIMEOUT',
  'NETWORK_ERROR',
];

/**
 * Provider capability registry (research recommendation)
 */
const PROVIDER_CAPABILITIES = {
  anthropic: {
    supportsText: true,
    supportsImageInput: true,
    supportsToolCalling: true,
    supportsPromptCaching: true,
    supportsStructuredOutput: true,
    maxContextTokens: 1000000,
    maxOutputTokens: 8192,
  },
  openai: {
    supportsText: true,
    supportsImageInput: true,
    supportsToolCalling: true,
    supportsPromptCaching: false,
    supportsStructuredOutput: true,
    maxContextTokens: 128000,
    maxOutputTokens: 4096,
  },
  groq: {
    supportsText: true,
    supportsImageInput: false,
    supportsToolCalling: false,
    supportsPromptCaching: false,
    supportsStructuredOutput: false,
    maxContextTokens: 131072,
    maxOutputTokens: 8192,
  },
  fake: {
    supportsText: true,
    supportsImageInput: false,
    supportsToolCalling: false,
    supportsPromptCaching: false,
    supportsStructuredOutput: false,
    maxContextTokens: 100000,
    maxOutputTokens: 4096,
  },
};

/**
 * AIOrchestrator - Central AI orchestration layer
 */
export class AIOrchestrator {
  constructor({ providerFactory, contextAssembler, responseValidator, database }) {
    this.providerFactory = providerFactory;
    this.contextAssembler = contextAssembler;
    this.responseValidator = responseValidator;
    this.db = database;
    
    this.logger = logger.child({ service: 'AIOrchestrator' });
  }

  /**
   * Complete an AI request with full orchestration
   * 
   * This is the main entry point for all tutoring AI requests.
   * It orchestrates the entire flow from context assembly to response delivery.
   * 
   * @param {Object} options - Request options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {string} options.currentMessage - Current user message
   * @param {Object} options.context - Additional context (optional)
   * @returns {Promise<Object>} - AI response
   * @throws {Error} - If request fails after all retries
   */
  async complete({ waxId, sessionId, currentMessage, context = {} }) {
    const startTime = Date.now();
    const correlationId = context.correlationId || crypto.randomUUID();
    
    const requestLog = this.logger.child({ 
      waxId, 
      sessionId, 
      correlationId,
      attempt: 1,
    });

    try {
      // Step 1: Assemble context (Stage 18)
      requestLog.info('Assembling conversation context');
      const contextResult = await this.contextAssembler.assemble({
        waxId,
        sessionId,
        currentMessage,
        trace: { correlationId },
      });

      // Step 2: Build system prompt (Stage 17 - existing)
      requestLog.info('Building system prompt');
      const { systemPrompt, promptVersion } = await this.buildSystemPrompt({
        waxId,
        sessionId,
        context: { ...context, correlationId },
      });

      // Step 3: Create AI request
      const request = createAIRequest({
        systemPrompt,
        messages: contextResult.messages,
        model: config.AI_PRIMARY_MODEL,
        maxOutputTokens: config.AI_MAX_TOKENS,
        temperature: config.AI_TEMPERATURE,
        waxId,
        sessionId,
        correlationId,
        promptVersion,
        responseSchema: null, // Stage 20: default to free text
      });

      const tokenEstimate = estimateTokenUsage(request);
      
      requestLog.info({
        messageCount: contextResult.messages.length,
        historyTurnCount: contextResult.historyTurnCount,
        estimatedTokens: contextResult.estimatedTokens,
        tokenBudget: contextResult.tokenBudget,
      }, 'Context assembled, preparing AI request');

      // Step 4: Call provider with fallback (Stage 20)
      requestLog.info('Calling AI provider');
      const providerResponse = await this.callProviderWithFallback(request, {
        waxId,
        sessionId,
        correlationId,
        contextResult,
      });

      // Step 5: Validate response (Stage 19)
      requestLog.info('Validating response');
      const validation = await this.responseValidator.validate({
        response: providerResponse.content,
        finishReason: providerResponse.finishReason,
        trace: { correlationId },
      });

      if (!validation.valid) {
        requestLog.warn({
          state: validation.state,
          message: validation.message,
        }, 'Response validation failed');

        // If validation failed but can retry, retry with different approach
        if (validation.canRetry && context.retryCount < 2) {
          requestLog.info('Retrying with validation failure');
          return await this.complete({
            waxId,
            sessionId,
            currentMessage,
            context: {
              ...context,
              retryCount: (context.retryCount || 0) + 1,
              previousResponse: providerResponse.content,
              correlationId,
            },
          });
        }

        // Return graceful fallback message
        return {
          ...providerResponse,
          content: config.AI_FAILURE_STUDENT_MESSAGE || 
            'Sorry, I\'m having a bit of trouble right now. Could you send your message again in a moment?',
          validationFailed: true,
          validationState: validation.state,
        };
      }

      // Step 6: Log success
      const latencyMs = Date.now() - startTime;
      requestLog.info({
        provider: providerResponse.provider,
        model: providerResponse.model,
        latencyMs,
        tokens: providerResponse.usage,
        historyTurnCount: contextResult.historyTurnCount,
        contextWasTruncated: contextResult.truncationOccurred,
        fallbackUsed: providerResponse.fallbackUsed || false,
      }, 'AI request completed successfully');

      // Step 7: Persist metadata
      await this.persistMetadata({
        waxId,
        sessionId,
        correlationId,
        request,
        response: providerResponse,
        tokenEstimate,
        startTime,
        validation,
        contextResult,
      });

      // Step 8: Update delivery state to queued
      await this.responseValidator.createDeliveryRecord({
        waxId,
        sessionId,
        correlationId,
        state: 'queued',
      });

      return providerResponse;
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      this.logger.error({
        error: error.message,
        errorType: error.errorType,
        latencyMs,
      }, 'AI request failed');

      // Persist failure
      await this.persistFailure({
        waxId,
        sessionId,
        correlationId,
        request: null,
        error,
        tokenEstimate: null,
        startTime,
      });

      // Update delivery state to failed
      await this.responseValidator.updateDeliveryState({
        correlationId,
        state: 'failed',
      });

      throw error;
    }
  }

  /**
   * Build system prompt
   * 
   * @param {Object} options - Prompt options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {Object} options.context - Additional context
   * @returns {Promise<Object>} - { systemPrompt, promptVersion }
   */
  async buildSystemPrompt({ waxId, sessionId, context }) {
    const { SystemPromptBuilder } = await import('../ai/prompt/SystemPromptBuilder.js');
    
    const builder = new SystemPromptBuilder(this.db);
    
    return await builder.build({
      waxId,
      sessionId,
      context,
    });
  }

  /**
   * Call provider with fallback support
   * 
   * @param {Object} request - AI request
   * @param {Object} options - Call options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {string} options.correlationId - Correlation ID
   * @param {Object} options.contextResult - Context assembly result
   * @returns {Promise<Object>} - AI response
   */
  async callProviderWithFallback(request, { waxId, sessionId, correlationId, contextResult }) {
    const primaryProvider = config.AI_PRIMARY_PROVIDER;
    const fallbackProvider = config.AI_FALLBACK_PROVIDER;
    
    let lastError;
    let fallbackAttempted = false;
    let fallbackProviderUsed = null;
    let fallbackModelUsed = null;

    // Try primary provider
    try {
      const provider = await this.getProvider(primaryProvider);
      const response = await provider.complete(request);
      
      return {
        ...response,
        fallbackUsed: false,
        fallbackAttempted: false,
      };
    } catch (error) {
      lastError = error;
      
      this.logger.warn({
        provider: primaryProvider,
        error: error.message,
      }, 'Primary provider failed');

      // Check if we should try fallback (only on availability errors)
      const shouldRetry = this.shouldUseFallback(error) && fallbackProvider;
      
      if (shouldRetry) {
        // Try fallback provider
        try {
          fallbackAttempted = true;
          this.logger.info({ fallbackProvider }, 'Attempting fallback provider');
          
          const provider = await this.getProvider(fallbackProvider);
          const response = await provider.complete(request);
          
          fallbackProviderUsed = fallbackProvider;
          fallbackModelUsed = config.AI_FALLBACK_MODEL || 'unknown';
          
          this.logger.info({
            primaryProvider,
            fallbackProvider,
            fallbackModel: fallbackModelUsed,
          }, 'Fallback provider succeeded');
          
          return {
            ...response,
            fallbackUsed: true,
            fallbackAttempted: true,
            originalProvider: primaryProvider,
            fallbackProvider: fallbackProviderUsed,
            fallbackModel: fallbackModelUsed,
          };
        } catch (fallbackError) {
          this.logger.error({
            fallbackProvider,
            error: fallbackError.message,
          }, 'Fallback provider also failed');
          
          lastError = fallbackError;
        }
      }
    }

    // Both providers failed
    throw lastError || createAIError({
      errorType: AIErrorTypes.PROVIDER_ERROR,
      providerMessage: 'All AI providers failed',
    });
  }

  /**
   * Determine if fallback should be used
   * 
   * Only fallback on availability errors, NOT on correctness errors
   * 
   * @param {Error} error - Error from primary provider
   * @returns {boolean} - Whether to use fallback
   */
  shouldUseFallback(error) {
    // Check error type
    if (error.errorType && RETRYABLE_ERRORS.includes(error.errorType)) {
      return true;
    }

    // Check for network errors
    if (error.code === 'ECONNREFUSED' || 
        error.code === 'ETIMEDOUT' ||
        error.code === 'ENOTFOUND') {
      return true;
    }

    // Check for HTTP error status codes that are retryable
    if (error.status && [429, 500, 502, 503, 504].includes(error.status)) {
      return true;
    }

    return false;
  }

  /**
   * Get provider instance
   * 
   * @param {string} providerName - Provider name
   * @returns {Promise<Object>} - Provider instance
   */
  async getProvider(providerName) {
    const ProviderFactory = await import('../ai/providers/ProviderFactory.js').then(m => m.default);
    
    const provider = await ProviderFactory.getProvider(providerName);
    
    if (!provider) {
      throw createAIError({
        errorType: AIErrorTypes.PROVIDER_NOT_FOUND,
        providerMessage: `Provider not found: ${providerName}`,
      });
    }

    return provider;
  }

  /**
   * Persist request metadata to database
   * 
   * @param {Object} options - Metadata options
   */
  async persistMetadata({ waxId, sessionId, correlationId, request, response, tokenEstimate, startTime, validation, contextResult }) {
    const pool = await this.db.createPool(config);
    const completedAt = Date.now();
    const latencyMs = completedAt - startTime;

    try {
      await pool.query(`
        INSERT INTO ai_requests (
          wax_id,
          session_id,
          correlation_id,
          provider,
          model,
          prompt_version,
          status,
          finish_reason,
          retry_count,
          input_tokens,
          output_tokens,
          total_tokens,
          cached_input_tokens,
          cache_write_tokens,
          started_at,
          completed_at,
          latency_ms,
          provider_request_id,
          context_turn_count,
          context_was_truncated,
          validation_passed,
          chunk_count
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'success', $7, 0,
          $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20
        )
        ON CONFLICT (correlation_id) DO UPDATE SET
          status = EXCLUDED.status,
          finish_reason = EXCLUDED.finish_reason,
          completed_at = EXCLUDED.completed_at,
          latency_ms = EXCLUDED.latency_ms,
          input_tokens = EXCLUDED.input_tokens,
          output_tokens = EXCLUDED.output_tokens,
          total_tokens = EXCLUDED.total_tokens,
          cached_input_tokens = EXCLUDED.cached_input_tokens,
          cache_write_tokens = EXCLUDED.cache_write_tokens,
          provider_request_id = EXCLUDED.provider_request_id,
          context_turn_count = EXCLUDED.context_turn_count,
          context_was_truncated = EXCLUDED.context_was_truncated,
          validation_passed = EXCLUDED.validation_passed,
          chunk_count = EXCLUDED.chunk_count
      `, [
        waxId,
        sessionId,
        correlationId,
        response.provider,
        response.model,
        request.promptVersion,
        response.finishReason,
        response.usage.inputTokens,
        response.usage.outputTokens,
        response.usage.totalTokens,
        response.usage.cachedInputTokens || 0,
        response.usage.cacheWriteTokens || 0,
        new Date(startTime),
        new Date(completedAt),
        latencyMs,
        response.providerRequestId,
        contextResult.historyTurnCount || 0,
        contextResult.truncationOccurred || false,
        validation.valid,
        1, // chunk_count - will be updated after delivery
      ]);
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to persist metadata');
    }
  }

  /**
   * Persist failure metadata to database
   * 
   * @param {Object} options - Metadata options
   */
  async persistFailure({ waxId, sessionId, correlationId, request, error, tokenEstimate, startTime }) {
    const pool = await this.db.createPool(config);
    const completedAt = Date.now();
    const latencyMs = completedAt - startTime;

    try {
      await pool.query(`
        INSERT INTO ai_requests (
          wax_id,
          session_id,
          correlation_id,
          provider,
          model,
          prompt_version,
          status,
          error_type,
          retry_count,
          input_tokens,
          output_tokens,
          total_tokens,
          started_at,
          completed_at,
          latency_ms
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'failed', $7, 0,
          $8, $9, $10, $11, $12, $13
        )
        ON CONFLICT (correlation_id) DO UPDATE SET
          status = EXCLUDED.status,
          error_type = EXCLUDED.error_type,
          completed_at = EXCLUDED.completed_at,
          latency_ms = EXCLUDED.latency_ms
      `, [
        waxId,
        sessionId,
        correlationId,
        config.AI_PRIMARY_PROVIDER,
        config.AI_PRIMARY_MODEL,
        'v1',
        error.errorType || 'UNKNOWN_ERROR',
        tokenEstimate?.estimatedInputTokens || 0,
        0,
        0,
        new Date(startTime),
        new Date(completedAt),
        latencyMs,
      ]);
    } catch (error) {
      this.logger.error({ error: error.message }, 'Failed to persist failure metadata');
    }
  }
}

export default AIOrchestrator;
