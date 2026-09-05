/**
 * WaxPrep - AI Response Schema
 * 
 * Defines the normalized response schema that all provider adapters return.
 * This is the contract between provider adapters and AIService.
 */

import { z } from 'zod';

// Normalized finish reason
const AIFinishReasonSchema = z.enum([
  'completed',        // Natural end of response (end_turn, stop)
  'length_limit',     // Hit max_tokens / length
  'safety_refusal',   // Content policy refusal
  'tool_call',        // Model wants to use a tool (future)
  'error',            // Processing error
  'unknown',          // Unrecognized finish reason
]);

// Normalized token usage
export const AIUsageSchema = z.object({
  inputTokens: z.number().int().min(0),
  outputTokens: z.number().int().min(0),
  totalTokens: z.number().int().min(0),
  cachedInputTokens: z.number().int().min(0).optional(),      // Anthropic: cache_read_input_tokens
  cacheWriteTokens: z.number().int().min(0).optional(),       // Anthropic: cache_creation_input_tokens
});

// Normalized AI response
export const AIResponseSchema = z.object({
  // Content
  content: z.string(),
  
  // Metadata
  model: z.string(),
  provider: z.string(),
  finishReason: AIFinishReasonSchema,
  
  // Usage (always persist this)
  usage: AIUsageSchema,
  
  // Tracing
  providerRequestId: z.string().optional(),
  latencyMs: z.number().int().min(0),
  
  // Prompt caching (if applicable)
  cacheHit: z.boolean().optional(),
  
  // Raw provider response (internal only, never logged)
  _providerMeta: z.record(z.unknown()).optional(),
});

// Type exports
export const FinishReason = {
  COMPLETED: 'completed',
  LENGTH_LIMIT: 'length_limit',
  SAFETY_REFUSAL: 'safety_refusal',
  TOOL_CALL: 'tool_call',
  ERROR: 'error',
  UNKNOWN: 'unknown',
};

/**
 * Creates a validated AI response
 */
export function createAIResponse(options) {
  const normalized = AIResponseSchema.parse({
    content: options.content,
    model: options.model,
    provider: options.provider,
    finishReason: options.finishReason,
    usage: options.usage,
    providerRequestId: options.providerRequestId,
    latencyMs: options.latencyMs,
    cacheHit: options.cacheHit,
    _providerMeta: options._providerMeta,
  });

  return normalized;
}

/**
 * Creates a successful AI response
 */
export function createSuccessResponse(options) {
  return createAIResponse({
    content: options.content,
    model: options.model,
    provider: options.provider,
    finishReason: FinishReason.COMPLETED,
    usage: options.usage,
    providerRequestId: options.providerRequestId,
    latencyMs: options.latencyMs,
    cacheHit: options.cacheHit,
    _providerMeta: options._providerMeta,
  });
}

/**
 * Creates a failed AI response
 */
export function createErrorResponse(options) {
  return createAIResponse({
    content: 'The AI encountered an error while processing your request.',
    model: options.model || 'unknown',
    provider: options.provider || 'unknown',
    finishReason: FinishReason.ERROR,
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
    },
    latencyMs: options.latencyMs || 0,
    _providerMeta: options._providerMeta,
  });
}

export default {
  AIResponseSchema,
  AIUsageSchema,
  AIFinishReasonSchema,
  FinishReason,
  createAIResponse,
  createSuccessResponse,
  createErrorResponse,
};
