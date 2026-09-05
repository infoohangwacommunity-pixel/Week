/**
 * WaxPrep - AI Request Schema
 * 
 * Defines the normalized request schema that all provider adapters accept.
 * This is the contract between AIService and provider adapters.
 */

import { z } from 'zod';

// Normalized message role
const AIMessageRoleSchema = z.enum(['user', 'assistant']);

// Normalized content block (supports future multimodal)
const AIContentBlockSchema = z.object({
  type: z.enum(['text', 'image', 'audio']),
  text: z.string().optional(),
  imageData: z.object({
    mimeType: z.string(),
    base64: z.string(),
  }).or(z.object({
    url: z.string().url(),
  })).optional(),
  audioData: z.object({
    mimeType: z.string(),
    base64: z.string(),
  }).optional(),
});

// Normalized message
export const AIMessageSchema = z.object({
  role: AIMessageRoleSchema,
  content: z.string().or(z.array(AIContentBlockSchema)),
  timestamp: z.number().optional(),
  // Internal metadata, not sent to provider
  _source: z.enum(['student', 'ai', 'system']).optional(),
});

// Normalized AI request
export const AIRequestSchema = z.object({
  // Content
  systemPrompt: z.string().min(1, 'systemPrompt is required'),
  messages: z.array(AIMessageSchema).min(1, 'At least one message is required'),
  
  // Model configuration
  model: z.string().min(1, 'model is required'),
  maxOutputTokens: z.coerce.number().int().min(100).default(1024),
  temperature: z.coerce.number().min(0).max(2).optional().default(0.7),
  
  // Optional provider features
  promptCacheBreakpoints: z.array(z.number()).optional(),
  stopSequences: z.array(z.string()).optional(),
  
  // Metadata (internal only, not sent to provider)
  waxId: z.string().uuid(),
  sessionId: z.string().uuid(),
  correlationId: z.string().uuid(),
  promptVersion: z.string().min(1),
});

// Type exports
export const AIMessageRole = {
  USER: 'user',
  ASSISTANT: 'assistant',
};

export const ContentType = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
};

/**
 * Creates a validated AI request
 */
export function createAIRequest(options) {
  const normalized = AIRequestSchema.parse({
    systemPrompt: options.systemPrompt,
    messages: options.messages,
    model: options.model,
    maxOutputTokens: options.maxOutputTokens || 1024,
    temperature: options.temperature ?? 0.7,
    promptCacheBreakpoints: options.promptCacheBreakpoints,
    stopSequences: options.stopSequences,
    waxId: options.waxId,
    sessionId: options.sessionId,
    correlationId: options.correlationId,
    promptVersion: options.promptVersion,
  });

  return normalized;
}

/**
 * Estimates token usage for a request (character-based approximation)
 * 
 * Rough estimate: 1 token ≈ 4 characters
 */
export function estimateTokenUsage(request) {
  const systemPromptChars = request.systemPrompt.length;
  const messagesChars = request.messages.reduce((sum, msg) => {
    if (typeof msg.content === 'string') {
      return sum + msg.content.length;
    }
    return sum + JSON.stringify(msg.content).length;
  }, 0);

  const totalChars = systemPromptChars + messagesChars;
  const estimatedInputTokens = Math.ceil(totalChars / 4);
  const estimatedOutputTokens = request.maxOutputTokens;

  return {
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedTotalTokens: estimatedInputTokens + estimatedOutputTokens,
  };
}

export default {
  AIRequestSchema,
  AIMessageSchema,
  AIMessageRole,
  ContentType,
  createAIRequest,
  estimateTokenUsage,
};
