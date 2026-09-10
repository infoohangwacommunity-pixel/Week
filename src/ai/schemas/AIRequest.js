/**
 * WaxPrep - AI Request Schema
 * 
 * Defines the normalized request schema that all provider adapters accept.
 * This is the contract between AIService and provider adapters.
 */

import { z } from 'zod';

// Normalized message role. The 'tool' role is used for tool-result messages
// returned to the model after a tool_call. 'system' is intentionally NOT here —
// system prompts are a separate top-level field on AIRequest, never an entry in
// the messages array (consistent across both OpenAI and Anthropic).
const AIMessageRoleSchema = z.enum(['user', 'assistant', 'tool']);

// Tool call request emitted by the model (provider-side shape after normalization).
const ToolCallSchema = z.object({
  id: z.string(),
  name: z.string(),
  arguments: z.record(z.unknown()),
});

// Tool result returned to the model. For OpenAI/Cerebras adapters this becomes
// a `role: 'tool'` message; for Anthropic it becomes a `tool_result` content
// block on a `role: 'user'` message.
const ToolResultSchema = z.object({
  toolCallId: z.string(),
  toolName: z.string(),
  content: z.union([
    z.string(),
    z.record(z.unknown()),
    z.array(z.unknown()),
  ]),
  isError: z.boolean().optional(),
});

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
  // When role === 'tool', the tool result payload
  toolCallId: z.string().optional(),
  toolName: z.string().optional(),
  // When role === 'assistant' and the assistant emitted tool calls
  toolCalls: z.array(ToolCallSchema).optional(),
});

// Tool definition (provider-agnostic). Adapters translate this to provider-native shape.
const ToolDefinitionSchema = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  // JSON Schema describing the tool's input parameters
  inputSchema: z.record(z.unknown()),
  // Optional: hint to the model about when to call this tool
  category: z.string().optional(),
});

// Tool-choice directive
const ToolChoiceSchema = z.union([
  z.literal('auto'),
  z.literal('none'),
  z.literal('required'),
  z.object({
    type: z.literal('function'),
    name: z.string(),
  }),
]).optional();

// Normalized AI request
export const AIRequestSchema = z.object({
  // Content
  systemPrompt: z.string().min(1, 'systemPrompt is required'),
  messages: z.array(AIMessageSchema).min(1, 'At least one message is required'),

  // Model configuration.
  // Model is optional in the request schema: when omitted, each provider
  // adapter uses its own defaultModel (e.g. AI_GROQ_MODEL for Groq,
  // AI_CEREBRAS_MODEL for Cerebras). This prevents a Groq model name
  // from being sent to Cerebras (which would cause a 404).
  model: z.string().min(1).optional(),
  maxOutputTokens: z.coerce.number().int().min(100).default(1024),
  temperature: z.coerce.number().min(0).max(2).optional().default(0.7),

  // Optional provider features
  promptCacheBreakpoints: z.array(z.number()).optional(),
  stopSequences: z.array(z.string()).optional(),

  // Tool-calling (provider-agnostic). Adapters translate to provider-native shapes.
  tools: z.array(ToolDefinitionSchema).optional(),
  toolChoice: ToolChoiceSchema,

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
  TOOL: 'tool',
};

export const ContentType = {
  TEXT: 'text',
  IMAGE: 'image',
  AUDIO: 'audio',
};

export const ToolDefinition = ToolDefinitionSchema;
export const ToolResult = ToolResultSchema;
export const ToolCall = ToolCallSchema;

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
    tools: options.tools,
    toolChoice: options.toolChoice,
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
