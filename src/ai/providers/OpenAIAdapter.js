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

      // Make the API call with timeout. We pass the AbortSignal directly to
      // the OpenAI SDK via the second-argument options object — the SDK respects
      // it and aborts the underlying fetch on timeout.
      const response = await this.callWithTimeout(
        (signal) => this.client.chat.completions.create(openaiRequest, { signal }),
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
   * Build OpenAI-specific request from normalized request.
   * Includes tools when the request provides them.
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

    // Pass tools when provided so the model can emit structured tool_calls.
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      openaiRequest.tools = request.tools.map((t) => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.inputSchema,
        },
      }));
      // Translate tool choice
      if (request.toolChoice) {
        if (request.toolChoice === 'auto' || request.toolChoice === 'none' || request.toolChoice === 'required') {
          openaiRequest.tool_choice = request.toolChoice;
        } else if (typeof request.toolChoice === 'object' && request.toolChoice.name) {
          openaiRequest.tool_choice = {
            type: 'function',
            function: { name: request.toolChoice.name },
          };
        }
      }
    }

    return openaiRequest;
  }

  /**
   * Build messages array from normalized messages.
   * Handles 'user', 'assistant' (with optional tool_calls), and 'tool' roles.
   */
  buildMessages(messages) {
    const result = [];
    for (const msg of messages) {
      if (msg.role === 'tool') {
        // Tool-result message: OpenAI expects role='tool' + tool_call_id + content
        result.push({
          role: 'tool',
          tool_call_id: msg.toolCallId,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        // Assistant message that requested tool calls: must include tool_calls
        result.push({
          role: 'assistant',
          content: typeof msg.content === 'string' ? msg.content : (msg.content || null),
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function',
            function: {
              name: tc.name,
              arguments: typeof tc.arguments === 'string' ? tc.arguments : JSON.stringify(tc.arguments),
            },
          })),
        });
      } else {
        result.push({
          role: msg.role,
          content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
        });
      }
    }
    return result;
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

    // Extract tool calls if present.
    // Initialize to undefined (NOT null) so that createAIResponse passes
    // undefined to the schema. The schema uses .nullish() which accepts
    // null, undefined, or array — but undefined is the cleanest signal
    // that "no tool calls were present in this response".
    let toolCalls;
    if (finishReason === FinishReason.TOOL_CALL && choice.message.tool_calls) {
      toolCalls = choice.message.tool_calls.map((tc) => {
        const name = tc.function?.name || tc.name;
        let args = {};
        const rawArgs = tc.function?.arguments;
        if (typeof rawArgs === 'object' && rawArgs !== null) {
          args = rawArgs;
        } else if (typeof rawArgs === 'string') {
          try {
            args = rawArgs.trim() ? JSON.parse(rawArgs) : {};
          } catch {
            // Malformed JSON arguments: surface as a structured error instead of
            // crashing the whole request. Provider adapters should never throw
            // from inside response parsing.
            args = { _malformed_arguments: rawArgs };
          }
        }
        return {
          id: tc.id,
          name,
          arguments: args,
        };
      });
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
    // Handle timeout / abort first. The OpenAI SDK throws APIUserAbortError when
    // an AbortController fires, which subclasses OpenAIError but has no HTTP
    // status code, so we must check it before the status-code switch below.
    if (
      error?.name === 'AbortError' ||
      error?.name === 'APIUserAbortError' ||
      error instanceof OpenAI.APIUserAbortError ||
      (typeof error?.message === 'string' && error.message.toLowerCase().includes('timeout'))
    ) {
      return createTimeoutError(`${this.name} API request timed out`);
    }

    // Handle OpenAI-specific errors
    if (error instanceof OpenAI.OpenAIError) {
      const statusCode = error.status;

      switch (statusCode) {
        case 401:
          return createAuthenticationError(`Invalid ${this.name} API key`);
        case 402:
          // HTTP 402 Payment Required — the account has insufficient credits
          // or billing is not set up. This is a permanent (non-retryable)
          // account-level failure, NOT a malformed response.
          return createAIError({
            errorType: AIErrorTypes.AUTHENTICATION_ERROR,
            providerMessage: `${this.name} payment required: ${error.message}`,
            providerStatusCode: statusCode,
          });
        case 404:
          return createAIError({
            errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
            providerMessage: `Model not found: ${error.message}`,
            providerStatusCode: statusCode,
          });
        case 429: {
          const retryAfterRaw = error.headers?.['retry-after'] ?? error.headers?.['Retry-After'];
          const retryAfterNum = Number(retryAfterRaw);
          const retryAfter = Number.isFinite(retryAfterNum) && retryAfterNum > 0 ? retryAfterNum : undefined;
          return createRateLimitError(
            `${this.name} rate limit exceeded`,
            retryAfter
          );
        }
        case 400:
          if (error.message.includes('max_tokens') || error.message.includes('context length')) {
            return createContextLengthError('Request exceeds maximum context length');
          }
          return createAIError({
            errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
            providerMessage: error.message,
            providerStatusCode: statusCode,
          });
        case 422:
          if (error.message.includes('content policy') || error.message.includes('safety')) {
            return createContentSafetyError('Content was refused by safety filters');
          }
          return createAIError({
            errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
            providerMessage: error.message,
            providerStatusCode: statusCode,
          });
        case 500:
        case 502:
        case 503:
        case 504:
          return createProviderServerError(`${this.name} server error`, statusCode);
        default:
          if (statusCode >= 500) {
            return createProviderServerError(`${this.name} server error: ${statusCode}`, statusCode);
          }
          return createMalformedResponseError(`Unexpected ${this.name} error: ${error.message}`);
      }
    }

    // Network / connection errors not wrapped by the SDK
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
      return createProviderServerError(`${this.name} network error: ${error.code}`, 503);
    }

    // Handle unknown errors
    return createUnknownError(`${this.name} API error: ${error?.message || String(error)}`);
  }

  /**
   * Call API with timeout.
   * `fn` MUST accept an AbortSignal as its single argument so the underlying
   * SDK can be notified when the timeout fires.
   */
  async callWithTimeout(fn, timeoutMs) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      return await fn(controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }
  }
}

export default OpenAIAdapter;
