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
 * 
 * Extended to support:
 * - Tool calling (Phase G)
 * - Safety classification (Phase I)
 * - Crisis detection (Phase I)
 */
export class AIOrchestrator {
  constructor({ 
    providerFactory, 
    contextAssembler, 
    responseValidator, 
    database,
    toolExecutor = null,
    safetyClassifier = null,
    crisisProtocol = null,
  }) {
    this.providerFactory = providerFactory;
    this.contextAssembler = contextAssembler;
    this.responseValidator = responseValidator;
    this.db = database;
    
    // Phase G-I dependencies (optional for backward compatibility)
    this.toolExecutor = toolExecutor;
    this.safetyClassifier = safetyClassifier;
    this.crisisProtocol = crisisProtocol;
    
    this.logger = logger.child({ service: 'AIOrchestrator' });
  }

  /**
   * Complete an AI request with full orchestration and tool calling support
   * 
   * This is the main entry point for all tutoring AI requests.
   * It orchestrates the entire flow from context assembly to response delivery.
   * Supports Phase G tool calling loops and Phase I safety checks.
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
    });

    // Phase G-I: Tool calling loop support
    if (this.toolExecutor) {
      return await this.completeWithTools({
        waxId,
        sessionId,
        currentMessage,
        context: { ...context, correlationId },
        startTime,
        requestLog,
      });
    }

    // Legacy path without tool calling
    return await this.completeLegacy({
      waxId,
      sessionId,
      currentMessage,
      context: { ...context, correlationId },
      startTime,
      requestLog,
    });
  }

  /**
   * Complete with tool calling loop (Phase G)
   */
  async completeWithTools({ waxId, sessionId, currentMessage, context, startTime, requestLog }) {
    const maxTurns = 5;
    let turn = 0;
    let accumulatedToolCalls = 0;

    while (turn < maxTurns) {
      turn++;
      requestLog = requestLog.child({ turn, accumulatedToolCalls });
      
      try {
        // Phase I: Safety classification before AI call
        const safetyResult = await this.safetyClassifier?.classify({
          waxId,
          sessionId,
          aiRequestId: context.aiRequestId,
          content: currentMessage || (context.messages?.[context.messages.length - 1]?.content || ''),
        });

        // Phase I: Check for crisis
        if (safetyResult && safetyResult.level === 3) {
          requestLog.warn('Crisis detected at Level 3');
          const crisisResponse = await this.crisisProtocol?.handleCrisis({
            waxId,
            sessionId,
            aiRequestId: context.aiRequestId,
            level: 3,
          });

          if (crisisResponse) {
            return {
              ...crisisResponse,
              safetyEvent: safetyResult,
              isCrisis: true,
            };
          }
        }

        // Assemble context with tool definitions
        requestLog.info('Assembling context with tool definitions');
        const contextResult = await this.contextAssembler.assemble({
          waxId,
          sessionId,
          currentMessage,
          trace: { correlationId: context.correlationId },
        });

        // Inject tool definitions into context if available
        if (contextResult.toolDefinitions) {
          contextResult.messages.push({
            role: 'system',
            content: 'You have access to the following tools. Use them when appropriate:\n' + 
                     JSON.stringify(contextResult.toolDefinitions, null, 2),
          });
        }

        // Build AI request
        const request = createAIRequest({
          systemPrompt: contextResult.systemPrompt || await this.buildSystemPrompt({ waxId, sessionId, context }),
          messages: contextResult.messages,
          model: config.AI_PRIMARY_MODEL,
          maxOutputTokens: config.AI_MAX_TOKENS,
          temperature: config.AI_TEMPERATURE,
          waxId,
          sessionId,
          correlationId: context.correlationId,
          promptVersion: 'phase-g-tools',
        });

        // Call AI provider
        requestLog.info('Calling AI provider');
        const providerResponse = await this.callProviderWithFallback(request, {
          waxId,
          sessionId,
          correlationId: context.correlationId,
          contextResult,
        });

        // Check for tool calls
        if (providerResponse.finishReason === 'tool_call' && providerResponse.toolCalls) {
          requestLog.info({ toolCalls: providerResponse.toolCalls.length }, 'AI requested tool calls');

          // Check rate limit
          if (accumulatedToolCalls + providerResponse.toolCalls.length > config.TOOL_MAX_CALLS_PER_SESSION) {
            requestLog.warn('Tool call limit would be exceeded');
            return {
              ...providerResponse,
              content: 'I\'ve reached my limit for this conversation. Please start a new topic.',
              finishReason: 'tool_limit_reached',
            };
          }

          // Execute tool calls
          const toolResults = await this.executeToolCalls({
            waxId,
            sessionId,
            toolCalls: providerResponse.toolCalls,
            aiRequestId: context.aiRequestId,
          });

          // Build tool result message
          const toolResultMessage = this.buildToolResultMessage(toolResults);

          // Continue loop with tool results
          currentMessage = null;
          context.messages = [...(context.messages || []), toolResultMessage];
          accumulatedToolCalls += providerResponse.toolCalls.length;
          
          continue;
        }

        // No tool calls, return response
        return providerResponse;

      } catch (error) {
        requestLog.error({ error: error.message }, 'Tool calling turn failed');
        throw error;
      }
    }

    // Max turns reached
    return {
      content: 'I\'m having trouble completing this request. Could you please rephrase?',
      finishReason: 'max_turns_reached',
    };
  }

  /**
   * Execute tool calls
   */
  async executeToolCalls({ waxId, sessionId, toolCalls, aiRequestId }) {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        const result = await this.toolExecutor.execute({
          waxId,
          sessionId,
          aiRequestId,
          toolName: toolCall.name,
          arguments: toolCall.arguments,
          turnIndex: results.length,
        });

        results.push({
          toolName: toolCall.name,
          toolId: toolCall.id,
          success: result.success,
          data: result.data,
          error: result.error ? result.error.message : null,
        });
      } catch (error) {
        results.push({
          toolName: toolCall.name,
          toolId: toolCall.id,
          success: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  /**
   * Build tool result message
   */
  buildToolResultMessage(toolResults) {
    const parts = toolResults.map((result, index) => {
      if (result.success) {
        return `[Tool ${index + 1} Result: ${result.toolName}]\n${JSON.stringify(result.data, null, 2)}`;
      } else {
        return `[Tool ${index + 1} Error: ${result.toolName}]\nError: ${result.error}`;
      }
    });

    return {
      role: 'user',
      content: 'Tool Results:\n\n' + parts.join('\n\n'),
    };
  }

  /**
   * Legacy complete without tool calling
   */
  async completeLegacy({ waxId, sessionId, currentMessage, context, startTime, requestLog }) {
    try {
      // Step 1: Assemble context
      requestLog.info('Assembling conversation context');
      const contextResult = await this.contextAssembler.assemble({
        waxId,
        sessionId,
        currentMessage,
        trace: { correlationId: context.correlationId },
      });

      // Step 2: Build system prompt
      requestLog.info('Building system prompt');
      const { systemPrompt, promptVersion } = await this.buildSystemPrompt({
        waxId,
        sessionId,
        context,
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
        correlationId: context.correlationId,
        promptVersion,
      });

      const tokenEstimate = estimateTokenUsage(request);
      
      requestLog.info({
        messageCount: contextResult.messages.length,
        historyTurnCount: contextResult.historyTurnCount,
      }, 'Context assembled, preparing AI request');

      // Step 4: Call provider
      requestLog.info('Calling AI provider');
      const providerResponse = await this.callProviderWithFallback(request, {
        waxId,
        sessionId,
        correlationId: context.correlationId,
        contextResult,
      });

      // Step 5: Validate response
      requestLog.info('Validating response');
      const validation = await this.responseValidator.validate({
        response: providerResponse.content,
        finishReason: providerResponse.finishReason,
        trace: { correlationId: context.correlationId },
      });

      if (!validation.valid) {
        requestLog.warn({ state: validation.state, message: validation.message }, 'Response validation failed');

        if (validation.canRetry && context.retryCount < 2) {
          requestLog.info('Retrying with validation failure');
          return await this.completeLegacy({
            waxId,
            sessionId,
            currentMessage,
            context: {
              ...context,
              retryCount: (context.retryCount || 0) + 1,
              previousResponse: providerResponse.content,
            },
            startTime,
            requestLog,
          });
        }

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
      }, 'AI request completed successfully');

      // Step 7: Persist metadata
      await this.persistMetadata({
        waxId,
        sessionId,
        correlationId: context.correlationId,
        request,
        response: providerResponse,
        tokenEstimate,
        startTime,
        validation,
        contextResult,
      });

      // Step 8: Update delivery state
      await this.responseValidator.createDeliveryRecord({
        waxId,
        sessionId,
        correlationId: context.correlationId,
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
