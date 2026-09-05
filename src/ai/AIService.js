/**
 * WaxPrep - AI Service
 * 
 * The AI service is the orchestration layer for all AI requests.
 * It validates requests, estimates token usage, applies timeouts,
 * calls the provider, normalizes responses, persists metadata,
 * and handles failures.
 * 
 * Business logic never calls providers directly.
 */

import { createAIRequest, estimateTokenUsage } from './schemas/AIRequest.js';
import { createAIResponse, FinishReason } from './schemas/AIResponse.js';
import { createAIError, AIErrorTypes } from './schemas/AIErrors.js';
import config from '../config/index.js';

/**
 * AIService - AI orchestration layer
 */
export class AIService {
  /**
   * Create an AI service instance
   * 
   * @param {Object} options - Service options
   * @param {Object} options.providerFactory - Provider factory instance
   * @param {Object} options.promptBuilder - System prompt builder instance
   * @param {Object} options.database - Database pool instance
   */
  constructor({ providerFactory, promptBuilder, database }) {
    this.providerFactory = providerFactory;
    this.promptBuilder = promptBuilder;
    this.db = database;
  }

  /**
   * Complete an AI request
   * 
   * This is the main entry point for all AI requests.
   * It orchestrates the entire flow from request validation to response.
   * 
   * @param {Object} options - Request options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {Array} options.messages - Conversation messages
   * @param {Object} options.context - Additional context (optional)
   * @returns {Promise<Object>} - AI response
   * @throws {Error} - If request fails
   */
  async complete({ waxId, sessionId, messages, context = {} }) {
    const startTime = Date.now();

    try {
      // Validate input
      this.validateInput({ waxId, sessionId, messages });

      // Build system prompt (Stage 17)
      const { systemPrompt, promptVersion } = await this.buildSystemPrompt({
        waxId,
        sessionId,
        context,
      });

      // Estimate token usage
      const request = createAIRequest({
        systemPrompt,
        messages,
        model: config.AI_PRIMARY_MODEL,
        maxOutputTokens: config.AI_MAX_TOKENS,
        temperature: config.AI_TEMPERATURE,
        waxId,
        sessionId,
        correlationId: context.correlationId || crypto.randomUUID(),
        promptVersion,
      });

      const tokenEstimate = estimateTokenUsage(request);

      // Log token estimation (debug)
      if (config.LOG_LEVEL === 'debug') {
        console.log(`[AI Service] Token estimate: ${JSON.stringify(tokenEstimate)}`);
      }

      // Get provider and complete request
      const response = await this.callProvider(request);

      // Persist metadata (don't store full prompt/response)
      await this.persistMetadata({
        waxId,
        sessionId,
        request,
        response,
        tokenEstimate,
        startTime,
      });

      return response;
    } catch (error) {
      // Handle AIProviderError
      if (error.errorType) {
        // Log error (never log API keys or full prompts)
        console.error(`[AI Service] ${error.errorType}: ${error.providerMessage}`);

        // Persist failure metadata
        await this.persistFailure({
          waxId,
          sessionId,
          error,
          tokenEstimate: null,
          startTime,
        });

        // Re-throw for BullMQ to handle retries
        throw error;
      }

      // Handle unknown errors
      console.error('[AI Service] Unknown error:', error);
      throw createAIError({
        errorType: AIErrorTypes.UNKNOWN_ERROR,
        providerMessage: error.message,
      });
    }
  }

  /**
   * Validate input parameters
   * 
   * @param {Object} options - Input options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {Array} options.messages - Conversation messages
   * @throws {Error} - If validation fails
   */
  validateInput({ waxId, sessionId, messages }) {
    if (!waxId || typeof waxId !== 'string') {
      throw createAIError({
        errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
        providerMessage: 'Invalid waxId',
      });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      throw createAIError({
        errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
        providerMessage: 'Invalid sessionId',
      });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw createAIError({
        errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
        providerMessage: 'At least one message is required',
      });
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
    const { SystemPromptBuilder } = await import('./prompt/SystemPromptBuilder.js');
    
    const builder = new SystemPromptBuilder(this.db);
    
    return await builder.build({
      waxId,
      sessionId,
      context,
    });
  }

  /**
   * Call the provider through the factory
   * 
   * @param {import('./schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Promise<import('./schemas/AIResponse.js').AIResponse>} - Normalized response
   */
  async callProvider(request) {
    const ProviderFactory = await import('./providers/ProviderFactory.js').then(m => m.default);
    
    // Get the configured provider
    const provider = this.providerFactory || await ProviderFactory.getProvider(config.AI_PRIMARY_PROVIDER);

    // Call the provider
    const response = await provider.complete(request);

    return response;
  }

  /**
   * Persist request metadata to database
   * 
   * @param {Object} options - Metadata options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {Object} options.request - AI request
   * @param {Object} options.response - AI response
   * @param {Object} options.tokenEstimate - Token estimate
   * @param {number} options.startTime - Request start time
   */
  async persistMetadata({ waxId, sessionId, request, response, tokenEstimate, startTime }) {
    const { createPool } = await import('../db/index.js');
    
    const pool = await createPool(config);
    
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
          provider_request_id
        ) VALUES (
          $1, $2, $3, $4, $5, $6, 'success', $7, 0,
          $8, $9, $10, $11, $12, $13, $14, $15, $16
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
          provider_request_id = EXCLUDED.provider_request_id
      `, [
        waxId,
        sessionId,
        request.correlationId,
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
      ]);
    } catch (error) {
      console.error('[AI Service] Failed to persist metadata:', error);
      // Don't fail the request if metadata persistence fails
    }
  }

  /**
   * Persist failure metadata to database
   * 
   * @param {Object} options - Metadata options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {Error} options.error - Error object
   * @param {Object} options.tokenEstimate - Token estimate
   * @param {number} options.startTime - Request start time
   */
  async persistFailure({ waxId, sessionId, error, tokenEstimate, startTime }) {
    const { createPool } = await import('../db/index.js');
    
    const pool = await createPool(config);
    
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
        tokenEstimate?.correlationId || crypto.randomUUID(),
        config.AI_PRIMARY_PROVIDER,
        config.AI_PRIMARY_MODEL,
        'v1', // Default prompt version
        error.errorType,
        tokenEstimate?.estimatedInputTokens || 0,
        0,
        0,
        new Date(startTime),
        new Date(completedAt),
        latencyMs,
      ]);
    } catch (error) {
      console.error('[AI Service] Failed to persist failure metadata:', error);
      // Don't fail the request if metadata persistence fails
    }
  }
}

export default AIService;
