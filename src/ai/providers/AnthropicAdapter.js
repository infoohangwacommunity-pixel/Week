/**
 * WaxPrep - Anthropic Provider Adapter
 * 
 * Implements the AIProviderInterface for Anthropic's Claude models.
 * Uses Anthropic's native SDK (not the OpenAI-compatible endpoint).
 */

import Anthropic from '@anthropic-ai/sdk';
import { AIProviderInterface } from './AIProviderInterface.js';
import { createAIResponse, FinishReason, AIUsageSchema } from '../schemas/AIResponse.js';
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

export class AnthropicAdapter extends AIProviderInterface {
  constructor(anthropicConfig) {
    super();
    this.name = 'anthropic';
    
    const apiKey = anthropicConfig?.apiKey || config.AI_ANTHROPIC_API_KEY || config.AI_PRIMARY_API_KEY;
    const baseURL = anthropicConfig?.baseURL || config.AI_ANTHROPIC_BASE_URL || process.env.AI_ANTHROPIC_BASE_URL;
    
    this.client = new Anthropic({
      apiKey,
      baseURL,
    });

    this.capabilities = {
      supportsText: true,
      supportsImageInput: true,
      supportsAudioInput: false,
      supportsToolCalling: true,
      supportsStructuredOutput: false,
      supportsStreaming: true,
      supportsPromptCaching: true,
      maxContextTokens: 200000,
      maxOutputTokens: 4096,
    };

    this.defaultModel = anthropicConfig?.model || config.AI_ANTHROPIC_MODEL || config.AI_PRIMARY_MODEL;
  }

  /**
   * Complete a request through Anthropic's Messages API
   */
  async complete(request) {
    const startTime = Date.now();

    try {
      const anthropicRequest = this.buildAnthropicRequest(request);

      // Pass AbortSignal directly to the Anthropic SDK via the options arg.
      const response = await this.callWithTimeout(
        (signal) => this.client.messages.create(anthropicRequest, { signal }),
        config.AI_TIMEOUT_MS
      );

      const latencyMs = Date.now() - startTime;
      return this.normalizeResponse(response, request.model, latencyMs);
    } catch (error) {
      const latencyMs = Date.now() - startTime;
      throw this.normalizeError(error, latencyMs);
    }
  }

  /**
   * Build Anthropic-specific request from normalized request.
   * Includes tools when provided.
   */
  buildAnthropicRequest(request) {
    // Anthropic requires max_tokens (not maxOutputTokens)
    const anthropicRequest = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxOutputTokens,
      temperature: request.temperature ?? 0.7,
      system: this.buildSystemPrompt(request.systemPrompt),
      messages: this.buildMessages(request.messages),
    };

    // Add stop sequences if provided
    if (request.stopSequences && request.stopSequences.length > 0) {
      anthropicRequest.stop_sequences = request.stopSequences;
    }

    // Pass tools when provided so the model can emit tool_use blocks.
    if (Array.isArray(request.tools) && request.tools.length > 0) {
      anthropicRequest.tools = request.tools.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      }));
      // Translate tool choice
      if (request.toolChoice) {
        if (request.toolChoice === 'auto' || request.toolChoice === 'none') {
          anthropicRequest.tool_choice = { type: request.toolChoice };
        } else if (request.toolChoice === 'required') {
          anthropicRequest.tool_choice = { type: 'any' };
        } else if (typeof request.toolChoice === 'object' && request.toolChoice.name) {
          anthropicRequest.tool_choice = { type: 'tool', name: request.toolChoice.name };
        }
      }
    }

    return anthropicRequest;
  }

  /**
   * Build system prompt with optional caching
   * 
   * @param {string} systemPrompt - The system prompt text
   * @returns {Array} - Anthropic system prompt format
   */
  buildSystemPrompt(systemPrompt) {
    // Anthropic's system can be a string or array of content blocks
    // For caching support, use array format with cache_control
    
    if (this.capabilities.supportsPromptCaching) {
      return [
        {
          type: 'text',
          text: systemPrompt,
          cache_control: { type: 'ephemeral' },
        },
      ];
    }

    return systemPrompt;
  }

  /**
   * Build messages array from normalized messages.
   * Maps normalized roles to Anthropic roles:
   *   user → user
   *   assistant → assistant (with tool_calls rendered as tool_use blocks)
   *   tool → user with tool_result content block (Anthropic has no 'tool' role)
   */
  buildMessages(messages) {
    const out = [];
    for (const msg of messages) {
      if (msg.role === 'tool') {
        // Anthropic represents tool results as user messages containing tool_result blocks
        out.push({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: msg.toolCallId,
              content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
              is_error: msg.isError === true,
            },
          ],
        });
      } else if (msg.role === 'assistant' && Array.isArray(msg.toolCalls) && msg.toolCalls.length > 0) {
        // Assistant turn that requested tool calls. Anthropic expects an assistant message
        // containing tool_use content blocks.
        const content = [];
        if (typeof msg.content === 'string' && msg.content.length > 0) {
          content.push({ type: 'text', text: msg.content });
        }
        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use',
            id: tc.id,
            name: tc.name,
            input: tc.arguments || {},
          });
        }
        out.push({ role: 'assistant', content });
      } else {
        out.push({
          role: msg.role === 'user' ? 'user' : 'assistant',
          content: this.buildContent(msg.content),
        });
      }
    }
    return out;
  }

  /**
   * Build content from normalized content
   * 
   * @param {string|Array} content - Normalized content
   * @returns {string|Array} - Anthropic content format
   */
  buildContent(content) {
    if (typeof content === 'string') {
      return content;
    }

    // If array, convert to Anthropic content blocks
    return content.map(block => {
      if (block.type === 'text') {
        return {
          type: 'text',
          text: block.text,
        };
      }
      // Future: image and audio blocks
      return block;
    });
  }

  /**
   * Normalize Anthropic response to standard format
   * 
   * @param {Object} response - Anthropic API response
   * @param {string} model - Model name
   * @param {number} latencyMs - Request latency
   * @returns {import('../schemas/AIResponse.js').AIResponse} - Normalized response
   */
  normalizeResponse(response, model, latencyMs) {
    // Extract text content from content blocks
    const content = this.extractTextContent(response.content);

    // Normalize finish reason
    const finishReason = this.normalizeFinishReason(response.stop_reason);

    // Extract usage
    const usage = {
      inputTokens: response.usage.input_tokens || 0,
      outputTokens: response.usage.output_tokens || 0,
      totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      cachedInputTokens: response.usage.cache_read_input_tokens || 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens || 0,
    };

    // Extract tool calls if present (Anthropic uses tool_use blocks)
    let toolCalls = null;
    if (finishReason === FinishReason.TOOL_CALL) {
      const toolUseBlocks = response.content.filter(
        block => block.type === 'tool_use'
      );
      if (toolUseBlocks.length > 0) {
        toolCalls = toolUseBlocks.map(block => ({
          id: block.id,
          name: block.name,
          arguments: block.input || {},
        }));
      }
    }

    return createAIResponse({
      content,
      model: response.model || model,
      provider: this.name,
      finishReason,
      usage,
      toolCalls,
      providerRequestId: response.id,
      latencyMs,
      cacheHit: usage.cachedInputTokens > 0,
      _providerMeta: {
        stopReason: response.stop_reason,
        usage: response.usage,
      },
    });
  }

  /**
   * Extract text from content blocks
   * 
   * @param {Array} content - Anthropic content blocks
   * @returns {string} - Combined text
   */
  extractTextContent(content) {
    return content
      .filter(block => block.type === 'text')
      .map(block => block.text)
      .join('\n\n');
  }

  /**
   * Normalize Anthropic finish reason
   * 
   * @param {string} stopReason - Anthropic stop reason
   * @returns {string} - Normalized finish reason
   */
  normalizeFinishReason(stopReason) {
    switch (stopReason) {
      case 'end_turn':
      case 'stop_sequence':
        return FinishReason.COMPLETED;
      case 'max_tokens':
        return FinishReason.LENGTH_LIMIT;
      case 'refusal':
        return FinishReason.SAFETY_REFUSAL;
      case 'tool_use':
        return FinishReason.TOOL_CALL;
      default:
        return FinishReason.UNKNOWN;
    }
  }

  /**
   * Normalize error to standard format
   * 
   * @param {Error} error - Anthropic error
   * @param {number} latencyMs - Request latency
   * @returns {import('../schemas/AIErrors.js').AIProviderError} - Normalized error
   */
  normalizeError(error, latencyMs) {
    // Handle timeout / abort first.
    if (
      error?.name === 'AbortError' ||
      error?.name === 'APIUserAbortError' ||
      (typeof Anthropic?.APIUserAbortError === 'function' && error instanceof Anthropic.APIUserAbortError) ||
      (typeof error?.message === 'string' && error.message.toLowerCase().includes('timeout'))
    ) {
      return createTimeoutError('Anthropic API request timed out');
    }

    // Handle Anthropic-specific errors
    if (error instanceof Anthropic.AnthropicError) {
      const statusCode = error.status;

      switch (statusCode) {
        case 401:
          return createAuthenticationError('Invalid Anthropic API key');
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
          return createRateLimitError('Anthropic rate limit exceeded', retryAfter);
        }
        case 400:
          if (error.message.includes('maximum context length') || error.message.includes('context length')) {
            return createContextLengthError('Request exceeds maximum context length');
          }
          return createAIError({
            errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
            providerMessage: error.message,
            providerStatusCode: statusCode,
          });
        case 422:
          if (error.message.includes('safety')) {
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
          return createProviderServerError('Anthropic server error', statusCode);
        default:
          if (statusCode >= 500) {
            return createProviderServerError(`Anthropic server error: ${statusCode}`, statusCode);
          }
          return createMalformedResponseError(`Unexpected Anthropic error: ${error.message}`);
      }
    }

    // Network / connection errors
    if (error?.code === 'ECONNREFUSED' || error?.code === 'ENOTFOUND' || error?.code === 'EAI_AGAIN') {
      return createProviderServerError(`Anthropic network error: ${error.code}`, 503);
    }

    return createUnknownError(`Anthropic API error: ${error?.message || String(error)}`);
  }

  /**
   * Call API with timeout. `fn` MUST accept an AbortSignal.
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

export default AnthropicAdapter;
