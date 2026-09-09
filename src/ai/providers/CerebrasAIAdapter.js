/**
 * WaxPrep - Cerebras AI Provider Adapter
 * 
 * Implements the AIProviderInterface for Cerebras models.
 * Cerebras provides an OpenAI-compatible API.
 */

import OpenAI from 'openai';
import { AIProviderInterface } from './AIProviderInterface.js';
import { createAIResponse, FinishReason } from '../schemas/AIResponse.js';
import { 
  createAIError, 
  AIErrorTypes,
  createTimeoutError,
  createRateLimitError,
  createAuthenticationError,
  createContextLengthError,
  createContentSafetyError,
  createProviderServerError,
  createMalformedResponseError,
  createUnknownError,
} from '../schemas/AIErrors.js';
import config from '../config/index.js';

export class CerebrasAIAdapter extends AIProviderInterface {
  constructor() {
    super();
    this.name = 'cerebras';
    
    const apiKey = config.AI_CEREBRAS_API_KEY || config.AI_PRIMARY_API_KEY;
    const baseURL = 'https://api.cerebras.ai/v1';

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    this.defaultModel = config.AI_CEREBRAS_MODEL || config.AI_PRIMARY_MODEL || 'gpt-oss-120b';

    this.capabilities = {
      supportsText: true,
      supportsImageInput: false,
      supportsAudioInput: false,
      supportsToolCalling: true,
      supportsStructuredOutput: false,
      supportsStreaming: true,
      supportsPromptCaching: false,
      maxContextTokens: 256000,
      maxOutputTokens: 4096,
    };

    this.defaultModel = config.AI_CEREBRAS_MODEL || config.AI_PRIMARY_MODEL;
  }

  /**
   * Complete a request through Cerebras API
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Promise<import('../schemas/AIResponse.js').AIResponse>} - Normalized response
   * @throws {import('../schemas/AIErrors.js').AIProviderError} - Normalized error
   */
  async complete(request) {
    const startTime = Date.now();

    try {
      // Build Cerebras-specific request (OpenAI-compatible)
      const cerebrasRequest = this.buildCerebrasRequest(request);

      // Make the API call with timeout
      const response = await this.callWithTimeout(
        () => this.client.chat.completions.create(cerebrasRequest),
        config.AI_TIMEOUT_MS
      );

      const latencyMs = Date.now() - startTime;

      // Parse and normalize the response
      return this.normalizeResponse(response, request.model, latencyMs);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      throw this.normalizeError(error, latencyMs);
    }
  }

  /**
   * Build Cerebras-specific request from normalized request
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Object} - Cerebras API request
   */
  buildCerebrasRequest(request) {
    // Cerebras uses the same format as OpenAI
    const messages = [
      {
        role: 'system',
        content: request.systemPrompt,
      },
      ...this.buildMessages(request.messages),
    ];

    const cerebrasRequest = {
      model: request.model || this.defaultModel,
      messages,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.7,
    };

    // Add stop sequences if provided
    if (request.stopSequences && request.stopSequences.length > 0) {
      cerebrasRequest.stop = request.stopSequences;
    }

    return cerebrasRequest;
  }

  /**
   * Build messages array from normalized messages
   * 
   * @param {Array} messages - Normalized messages
   * @returns {Array} - Cerebras messages format
   */
  buildMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));
  }

  /**
   * Normalize Cerebras response to standard format
   * 
   * @param {Object} response - Cerebras API response
   * @param {string} model - Model name
   * @param {number} latencyMs - Request latency
   * @returns {import('../schemas/AIResponse.js').AIResponse} - Normalized response
   */
  normalizeResponse(response, model, latencyMs) {
    const choice = response.choices[0];
    
    // Extract content
    const content = choice.message.content || '';

    // Normalize finish reason
    const finishReason = this.normalizeFinishReason(choice.finish_reason);

    // Extract usage
    const usage = response.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    // Extract tool calls if present
    let toolCalls = null;
    if (finishReason === FinishReason.TOOL_CALL && choice.message.tool_calls) {
      toolCalls = choice.message.tool_calls.map(tc => ({
        id: tc.id,
        name: tc.function?.name || tc.name,
        arguments: typeof tc.function?.arguments === 'object' 
          ? tc.function.arguments 
          : JSON.parse(tc.function?.arguments || '{}'),
      }));
    }

    return createAIResponse({
      content,
      model: response.model || model,
      provider: this.name,
      finishReason,
      usage: {
        inputTokens: usage.prompt_tokens || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens: usage.total_tokens || 0,
      },
      providerRequestId: response.id,
      latencyMs,
      _providerMeta: {
        finishReason: choice.finish_reason,
        usage,
      },
      toolCalls,
    });
  }

  /**
   * Normalize Cerebras finish reason
   * 
   * @param {string} finishReason - Cerebras finish reason
   * @returns {string} - Normalized finish reason
   */
  normalizeFinishReason(finishReason) {
    switch (finishReason) {
      case 'stop':
      case 'done':
        return FinishReason.COMPLETED;
      case 'length':
        return FinishReason.LENGTH_LIMIT;
      case 'content_filter':
        return FinishReason.SAFETY_REFUSAL;
      case 'function_call':
      case 'tool_calls':
        return FinishReason.TOOL_CALL;
      default:
        return FinishReason.UNKNOWN;
    }
  }

  /**
   * Normalize error to standard format
   * 
   * @param {Error} error - Cerebras error
   * @param {number} latencyMs - Request latency
   * @returns {import('../schemas/AIErrors.js').AIProviderError} - Normalized error
   */
  normalizeError(error, latencyMs) {
    // Handle timeout
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return createTimeoutError('Cerebras API request timed out');
    }

    // Handle OpenAI/Cerebras-specific errors
    if (error instanceof OpenAI.OpenAIError) {
      const statusCode = error.status;

      switch (statusCode) {
        case 401:
          return createAuthenticationError('Invalid Cerebras API key');
        case 404:
          return createAIError({
            errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
            providerMessage: `Model not found: ${error.message}`,
            providerStatusCode: statusCode,
          });
        case 429:
          const retryAfter = error.headers?.['retry-after'];
          return createRateLimitError(
            'Cerebras rate limit exceeded',
            retryAfter ? parseInt(retryAfter, 10) : undefined
          );
        case 400:
          if (error.message.includes('max_tokens') || error.message.includes('context')) {
            return createContextLengthError('Request exceeds maximum context length');
          }
          return createAIError({
            errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
            providerMessage: error.message,
            providerStatusCode: statusCode,
          });
        case 422:
          if (error.message.includes('content policy')) {
            return createContentSafetyError('Content was refused by safety filters');
          }
          return createAIError({
            errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
            providerMessage: error.message,
            providerStatusCode: statusCode,
          });
        case 500:
        case 503:
          return createProviderServerError('Cerebras server error', statusCode);
        default:
          if (statusCode >= 500) {
            return createProviderServerError(`Cerebras server error: ${statusCode}`, statusCode);
          }
          return createMalformedResponseError(`Unexpected Cerebras error: ${error.message}`);
      }
    }

    // Handle unknown errors
    return createUnknownError(`Cerebras API error: ${error.message}`);
  }

  /**
   * Call API with timeout
   * 
   * @param {Function} fn - Async function to call
   * @param {number} timeoutMs - Timeout in milliseconds
   * @returns {Promise<any>} - Function result
   * @throws {Error} - Timeout error
   */
  async callWithTimeout(fn, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fn({ signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default CerebrasAIAdapter;
