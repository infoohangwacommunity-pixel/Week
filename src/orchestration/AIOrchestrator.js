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

import { randomUUID } from 'crypto';
import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { createAIRequest, estimateTokenUsage } from '../ai/schemas/AIRequest.js';
import { createAIResponse, createErrorResponse, FinishReason } from '../ai/schemas/AIResponse.js';
import { createAIError, AIErrorTypes, RETRYABLE_ERROR_TYPES } from '../ai/schemas/AIErrors.js';
import ProviderFactory from '../ai/providers/ProviderFactory.js';

/**
 * Error types that should trigger fallback to the secondary provider.
 * These match the AIErrorTypes enum exactly (lowercase underscore-separated).
 */
const FALLBACK_ERROR_TYPES = new Set([
  AIErrorTypes.RATE_LIMIT_ERROR,
  AIErrorTypes.PROVIDER_SERVER_ERROR,
  AIErrorTypes.TIMEOUT_ERROR,
  AIErrorTypes.UNKNOWN_ERROR, // unknown errors may be transient network issues
]);

/**
 * Provider capability registry.
 * Used by callers that want to inspect capabilities without instantiating the
 * adapter. The adapter's own `capabilities` field is the authoritative source.
 */
const PROVIDER_CAPABILITIES = {
  anthropic: { maxContextTokens: 200000, maxOutputTokens: 4096 },
  openai:    { maxContextTokens: 128000, maxOutputTokens: 4096 },
  groq:      { maxContextTokens: 131072, maxOutputTokens: 8192 },
  cerebras:  { maxContextTokens: 256000, maxOutputTokens: 4096 },
  fake:      { maxContextTokens: 100000, maxOutputTokens: 4096 },
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
   * Complete with tool calling loop (Phase G).
   *
   * Tool definitions are passed to the provider via `request.tools` (native
   * provider API) — never stuffed into the system prompt. The provider returns
   * a structured `tool_calls` field when the model wants to use a tool, which
   * we execute via ToolExecutor and feed back as proper tool-result messages
   * on the next iteration.
   */
  async completeWithTools({ waxId, sessionId, currentMessage, context, startTime, requestLog }) {
    const maxTurns = 5;
    let turn = 0;
    let accumulatedToolCalls = 0;
    // Working message list: seeded from the context assembler on turn 1, then
    // mutated in-place to append assistant tool-call turns and tool-result turns.
    // We bypass the DB-backed `assemble()` on subsequent turns so tool results
    // survive to the next provider call.
    let workingMessages = null;
    let workingToolDefinitions = null;
    let lastSystemPromptResult = null;

    while (turn < maxTurns) {
      turn++;
      const turnLog = requestLog.child({ turn, accumulatedToolCalls });

      try {
        // Phase I: Safety classification before AI call. Only classify student
        // inbound messages (skip when currentMessage is null — i.e. tool-result
        // continuation turns).
        if (currentMessage && this.safetyClassifier) {
          let safetyResult;
          try {
            safetyResult = await this.safetyClassifier.classify({
              waxId,
              sessionId,
              aiRequestId: context.aiRequestId,
              content: currentMessage,
            });
          } catch (safetyErr) {
            turnLog.warn({ err: safetyErr.message }, 'Safety classifier threw; continuing with default classification');
            safetyResult = null;
          }

          if (safetyResult && safetyResult.level === 3) {
            turnLog.warn('Crisis detected at Level 3');
            if (this.crisisProtocol) {
              try {
                const crisisResponse = await this.crisisProtocol.handleCrisis({
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
              } catch (crisisErr) {
                turnLog.error({ err: crisisErr.message }, 'Crisis protocol failed');
              }
            }
          }
        }

        // Assemble context (only on the first turn of the loop, or when the
        // orchestrator was called without working messages).
        if (!workingMessages) {
          turnLog.info('Assembling context with tool definitions');
          const contextResult = await this.contextAssembler.assemble({
            waxId,
            sessionId,
            currentMessage,
            trace: { correlationId: context.correlationId },
          });
          workingMessages = [...(contextResult.messages || [])];
          workingToolDefinitions = contextResult.toolDefinitions || null;
        }

        // Build system prompt (once per request — not per turn).
        if (!lastSystemPromptResult) {
          lastSystemPromptResult = await this.buildSystemPrompt({ waxId, sessionId, context });
        }
        const systemPrompt = lastSystemPromptResult.systemPrompt;

        // Build AI request. Tools are passed natively — NOT concatenated into
        // the system prompt. The provider adapter translates `tools` to its
        // API-specific shape.
        const request = createAIRequest({
          systemPrompt,
          messages: workingMessages,
          model: config.AI_PRIMARY_MODEL,
          maxOutputTokens: config.AI_MAX_TOKENS,
          temperature: config.AI_TEMPERATURE,
          tools: workingToolDefinitions || undefined,
          toolChoice: workingToolDefinitions ? 'auto' : undefined,
          waxId,
          sessionId,
          correlationId: context.correlationId,
          promptVersion: lastSystemPromptResult.promptVersion || 'phase-g-tools',
        });

        // Call AI provider.
        turnLog.info('Calling AI provider');
        const providerResponse = await this.callProviderWithFallback(request, {
          waxId,
          sessionId,
          correlationId: context.correlationId,
          contextResult: { messages: workingMessages, toolDefinitions: workingToolDefinitions },
        });

        // Check for tool calls. Compare against the lowercase enum value.
        if (providerResponse.finishReason === FinishReason.TOOL_CALL && Array.isArray(providerResponse.toolCalls) && providerResponse.toolCalls.length > 0) {
          turnLog.info({ toolCalls: providerResponse.toolCalls.length }, 'AI requested tool calls');

          // Check rate limit.
          if (accumulatedToolCalls + providerResponse.toolCalls.length > config.TOOL_MAX_CALLS_PER_SESSION) {
            turnLog.warn('Tool call limit would be exceeded');
            return createAIResponse({
              content: 'I\'ve reached my limit for this conversation. Please start a new topic.',
              model: providerResponse.model,
              provider: providerResponse.provider,
              finishReason: FinishReason.TOOL_LIMIT_REACHED,
              usage: providerResponse.usage,
              latencyMs: Date.now() - startTime,
            });
          }

          // Execute tool calls.
          const toolResults = await this.executeToolCalls({
            waxId,
            sessionId,
            toolCalls: providerResponse.toolCalls,
            aiRequestId: context.aiRequestId,
          });

          // Append the assistant turn (with tool_calls) and the tool-result
          // messages to the working list so the provider sees the full
          // conversation on the next iteration.
          workingMessages.push({
            role: 'assistant',
            content: providerResponse.content || '',
            toolCalls: providerResponse.toolCalls,
          });
          for (const tr of toolResults) {
            workingMessages.push({
              role: 'tool',
              toolCallId: tr.toolId,
              toolName: tr.toolName,
              content: tr.success ? tr.data : { error: tr.error },
              isError: !tr.success,
            });
          }

          accumulatedToolCalls += providerResponse.toolCalls.length;
          currentMessage = null;
          continue;
        }

        // No tool calls, return response.
        return providerResponse;
      } catch (error) {
        turnLog.error({ err: error.message, errorType: error.errorType }, 'Tool calling turn failed');
        // Persist the failure so we have an audit trail.
        try {
          await this.persistFailure({
            waxId,
            sessionId,
            correlationId: context.correlationId,
            request: { promptVersion: lastSystemPromptResult?.promptVersion || 'phase-g-tools' },
            error,
            tokenEstimate: null,
            startTime,
          });
        } catch (persistErr) {
          turnLog.error({ err: persistErr.message }, 'Failed to persist failure metadata');
        }
        throw error;
      }
    }

    // Max turns reached. Return a schema-valid response so the worker doesn't
    // crash trying to read usage fields.
    return createErrorResponse({
      model: config.AI_PRIMARY_MODEL,
      provider: config.AI_PRIMARY_PROVIDER,
      latencyMs: Date.now() - startTime,
    });
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
   * Build tool result message.
   * Returns a normalized message with role='tool' so the provider adapters can
   * translate to the appropriate provider-native shape.
   */
  buildToolResultMessage(toolResults) {
    // Return the first tool result as a 'tool' role message.
    // (Multiple tool results should be split into multiple 'tool' messages —
    // see completeWithTools which does this correctly.)
    const first = toolResults[0];
    if (!first) {
      return { role: 'tool', toolCallId: 'unknown', content: 'No tool result' };
    }
    return {
      role: 'tool',
      toolCallId: first.toolId,
      toolName: first.toolName,
      content: first.success ? first.data : { error: first.error },
      isError: !first.success,
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
      const systemPromptResult = await this.buildSystemPrompt({
        waxId,
        sessionId,
        context,
      });
      const systemPrompt = systemPromptResult.systemPrompt;

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
        promptVersion: systemPromptResult.promptVersion || 'v1',
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

        const retryCount = context.retryCount || 0;
        if (validation.canRetry && retryCount < 2) {
          requestLog.info({ retryCount: retryCount + 1 }, 'Retrying with validation failure');
          return await this.completeLegacy({
            waxId,
            sessionId,
            currentMessage,
            context: {
              ...context,
              retryCount: retryCount + 1,
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
        errorType: error.errorType || 'UNKNOWN',
        message: error.providerMessage || error.message || 'Unknown error',
        isRetryable: error.isRetryable || false,
        rawError: {
          name: error.name,
          message: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        },
        latencyMs,
      }, 'AI request failed');

      // Persist failure metadata so the operator has an audit trail.
      try {
        await this.persistFailure({
          waxId,
          sessionId,
          correlationId: context.correlationId,
          request: { promptVersion: 'v1' },
          error,
          tokenEstimate: null,
          startTime,
        });
      } catch (persistErr) {
        this.logger.error({ err: persistErr.message }, 'Failed to persist failure metadata');
      }

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
   * Call provider with fallback support.
   * Honors the constructor-injected `providerFactory` (a provider instance)
   * when available; otherwise resolves via ProviderFactory.getProvider().
   */
  async callProviderWithFallback(request, { waxId, sessionId, correlationId, contextResult }) {
    const primaryProvider = config.AI_PRIMARY_PROVIDER;
    const fallbackProvider = config.AI_FALLBACK_PROVIDER;

    let lastError;

    // Try primary provider.
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
        err: error.message,
        errorType: error.errorType || 'UNKNOWN',
      }, 'Primary provider failed');

      // Check if we should try fallback (only on availability errors).
      const shouldRetry = this.shouldUseFallback(error) && fallbackProvider;

      if (shouldRetry) {
        try {
          this.logger.info({ fallbackProvider }, 'Attempting fallback provider');

          const provider = await this.getProvider(fallbackProvider);
          const response = await provider.complete(request);

          const fallbackModelUsed = config.AI_FALLBACK_MODEL || response.model || 'unknown';

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
            fallbackProvider,
            fallbackModel: fallbackModelUsed,
          };
        } catch (fallbackError) {
          this.logger.error({
            fallbackProvider,
            err: fallbackError.message,
            errorType: fallbackError.errorType || 'UNKNOWN',
          }, 'Fallback provider also failed');

          lastError = fallbackError;
        }
      }
    }

    // Both providers failed (or no fallback configured).
    throw lastError || createAIError({
      errorType: AIErrorTypes.UNKNOWN_ERROR,
      providerMessage: 'All AI providers failed',
    });
  }

  /**
   * Determine if fallback should be used.
   *
   * Only fallback on availability/transient errors, NOT on correctness errors
   * (a 400/422 means the request is malformed — retrying it elsewhere won't help).
   */
  shouldUseFallback(error) {
    if (error?.errorType && FALLBACK_ERROR_TYPES.has(error.errorType)) {
      return true;
    }

    // Network-level errors (raw Error.code, not normalized by the SDK)
    if (error?.code === 'ECONNREFUSED' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'EAI_AGAIN') {
      return true;
    }

    // HTTP error status codes that are retryable.
    if (error?.providerStatusCode && [429, 500, 502, 503, 504].includes(error.providerStatusCode)) {
      return true;
    }

    return false;
  }

  /**
   * Get provider instance.
   * Honors constructor-injected provider (this.providerFactory) when set;
   * otherwise resolves via the cached ProviderFactory.
   */
  async getProvider(providerName) {
    // If the constructor was handed a provider instance directly (this is the
    // production wiring — see workers/setup.js), use it as long as the
    // requested name matches the configured primary. If a different name is
    // requested (fallback), fall through to ProviderFactory.
    if (this.providerFactory && typeof this.providerFactory.complete === 'function') {
      if (providerName?.toLowerCase() === (config.AI_PRIMARY_PROVIDER || '').toLowerCase()) {
        return this.providerFactory;
      }
    }

    const provider = await ProviderFactory.getProvider(providerName);

    if (!provider) {
      throw createAIError({
        errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
        providerMessage: `Provider not found: ${providerName}`,
      });
    }

    return provider;
  }

  /**
   * Persist request metadata to database.
   * Uses the shared pool (this.db) rather than creating a new pool per call.
   */
  async persistMetadata({ waxId, sessionId, correlationId, request, response, tokenEstimate, startTime, validation, contextResult }) {
    const pool = this.db?.pool || this.db;
    if (!pool || typeof pool.query !== 'function') {
      this.logger.warn('No pool available for persistMetadata');
      return;
    }
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
          chunk_count,
          response_json
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'success', $7, 0,
          $8, $9, $10, $11, $12, $13, $14, $15, $16,
          $17, $18, $19, $20, $21
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
          chunk_count = EXCLUDED.chunk_count,
          response_json = EXCLUDED.response_json
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
        JSON.stringify({ content: response.content, toolCalls: response.toolCalls || null }),
      ]);
    } catch (error) {
      this.logger.error({ err: error.message }, 'Failed to persist metadata');
    }
  }

  /**
   * Persist failure metadata to database.
   * Uses the shared pool (this.db) rather than creating a new pool per call.
   */
  async persistFailure({ waxId, sessionId, correlationId, request, error, tokenEstimate, startTime }) {
    const pool = this.db?.pool || this.db;
    if (!pool || typeof pool.query !== 'function') {
      this.logger.warn('No pool available for persistFailure');
      return;
    }
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
        request?.promptVersion || 'v1',
        error.errorType || AIErrorTypes.UNKNOWN_ERROR,
        tokenEstimate?.estimatedInputTokens || 0,
        0,
        0,
        new Date(startTime),
        new Date(completedAt),
        latencyMs,
      ]);
    } catch (persistErr) {
      this.logger.error({ err: persistErr.message }, 'Failed to persist failure metadata');
    }
  }
}

export default AIOrchestrator;
