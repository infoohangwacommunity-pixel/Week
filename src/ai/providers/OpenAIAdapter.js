/**
 * WaxPrep - OpenAI Provider Adapter
 * 
 * Implements the AIProviderInterface for OpenAI models.
 * Also supports Groq (OpenAI-compatible API).
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
import config from '../../config/index.js';

export class OpenAIAdapter extends AIProviderInterface {
  constructor(openaiConfig) {
    super();
    this.name = openaiConfig?.isGroq ? 'groq' : 'openai';
    
    const baseURL = openaiConfig?.isGroq 
      ? 'https://api.groq.com/openai/v1'
      : openaiConfig?.baseURL || config.AI_OPENAI_BASE_URL || 'https://api.openai.com/v1';

    const apiKey = openaiConfig?.isGroq 
      ? config.AI_GROQ_API_KEY || config.AI_PRIMARY_API_KEY
      : openaiConfig?.apiKey || config.AI_OPENAI_API_KEY || config.AI_PRIMARY_API_KEY;

    this.client = new OpenAI({
      apiKey,
      baseURL,
    });

    this.isGroq = openaiConfig?.isGroq || false;

    this.capabilities = {
      supportsText: true,
      supportsImageInput: true,
      supportsAudioInput: false,
      supportsToolCalling: true,
      supportsStructuredOutput: false,
      supportsStreaming: true,
      supportsPromptCaching: false,
      maxContextTokens: 128000,
      maxOutputTokens: 4096,
    };

    this.defaultModel = openaiConfig?.isGroq
      ? config.AI_GROQ_MODEL || config.AI_PRIMARY_MODEL
      : config.AI_OPENAI_MODEL || config.AI_PRIMARY_MODEL;
  }

  /**
   * Complete a request through OpenAI's Chat Completions API
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Promise<import('../schemas/AIResponse.js').AIResponse>} - Normalized response
   * @throws {import('../schemas/AIErrors.js').AIProviderError} - Normalized error
   */
  async complete(request) {
    const startTime = Date.now();

    try {
      // Build OpenAI-specific request
      const openaiRequest = this.buildOpenAIRequest(request);

      // Make the API call with timeout
      const response = await this.callWithTimeout(
        () => this.client.chat.completions.create(openaiRequest),
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
   * Build OpenAI-specific request from normalized request
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Object} - OpenAI API request
   */
  buildOpenAIRequest(request) {
    // OpenAI puts system message inside messages array
    const messages = [
      {
        role: 'system',
        content: request.systemPrompt,
      },
      ...this.buildMessages(request.messages),
    ];

    const openaiRequest = {
      model: request.model || this.defaultModel,
      messages,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.7,
    };

    // Add stop sequences if provided
    if (request.stopSequences && request.stopSequences.length > 0) {
      openaiRequest.stop = request.stopSequences;
    }

    return openaiRequest;
  }

  /**
   * Build messages array from normalized messages
   * 
   * @param {Array} messages - Normalized messages
   * @returns {Array} - OpenAI messages format
   */
  buildMessages(messages) {
    return messages.map(msg => ({
      role: msg.role,
      content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
    }));
  }

  /**
   * Normalize OpenAI response to standard format
   * 
   * @param {Object} response - OpenAI API response
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
   * Normalize OpenAI finish reason
   * 
   * @param {string} finishReason - OpenAI finish reason
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
   * @param {Error} error - OpenAI error
   * @param {number} latencyMs - Request latency
   * @returns {import('../schemas/AIErrors.js').AIProviderError} - Normalized error
   */
  normalizeError(error, latencyMs) {
    // Handle timeout
    if (error.name === 'AbortError' || error.message.includes('timeout')) {
      return createTimeoutError(`${this.name} API request timed out`);
    }

    // Handle OpenAI-specific errors
    if (error instanceof OpenAI.OpenAIError) {
      const statusCode = error.status;

      switch (statusCode) {
        case 401:
          return createAuthenticationError(`Invalid ${this.name} API key`);
        case 404:
          return createAIError({
            errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
            providerMessage: `Model not found: ${error.message}`,
            providerStatusCode: statusCode,
          });
        case 429:
          const retryAfter = error.headers?.['retry-after'];
          return createRateLimitError(
            `${this.name} rate limit exceeded`,
            retryAfter ? parseInt(retryAfter, 10) : undefined
          );
        case 400:
          if (error.message.includes('max_tokens')) {
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
          return createProviderServerError(`${this.name} server error`, statusCode);
        default:
          if (statusCode >= 500) {
            return createProviderServerError(`${this.name} server error: ${statusCode}`, statusCode);
          }
          return createMalformedResponseError(`Unexpected ${this.name} error: ${error.message}`);
      }
    }

    // Handle unknown errors
    return createUnknownError(`${this.name} API error: ${error.message}`);
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

export default OpenAIAdapter;
