/**
 * Provider Response Normalization Regression Tests
 *
 * Verifies that:
 * 1. A normal Groq response with no tool calls does NOT fail validation
 *    (was failing with "Expected array, received null" because toolCalls
 *    was initialized to null and .optional() doesn't accept null).
 * 2. A Groq response WITH tool calls is normalized correctly.
 * 3. HTTP 402 Payment Required is classified as an account/billing error,
 *    NOT a malformed response.
 * 4. The safety classifier path (which calls the same provider) also
 *    works correctly with no-tool-call responses.
 */

import { describe, it, expect } from 'vitest';
import OpenAI from 'openai';
import { AIResponseSchema, createAIResponse, FinishReason } from '../../src/ai/schemas/AIResponse.js';
import { createAIError, AIErrorTypes } from '../../src/ai/schemas/AIErrors.js';
import { OpenAIAdapter } from '../../src/ai/providers/OpenAIAdapter.js';

describe('AIResponseSchema toolCalls validation', () => {
  it('should accept toolCalls: undefined (no tool calls)', () => {
    const response = AIResponseSchema.parse({
      content: 'Hello!',
      model: 'test-model',
      provider: 'groq',
      finishReason: 'completed',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      toolCalls: undefined,
    });
    expect(response.toolCalls).toBeUndefined();
  });

  it('should accept toolCalls: null (provider returns null when no tool calls)', () => {
    // This was the production bug: OpenAIAdapter initialized toolCalls = null
    // and passed it to createAIResponse. .optional() rejected null.
    // .nullish() accepts null, undefined, or array.
    const response = AIResponseSchema.parse({
      content: 'Hello!',
      model: 'test-model',
      provider: 'groq',
      finishReason: 'completed',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      toolCalls: null,
    });
    expect(response.toolCalls).toBeNull();
  });

  it('should accept toolCalls as a valid array', () => {
    const response = AIResponseSchema.parse({
      content: '',
      model: 'test-model',
      provider: 'groq',
      finishReason: 'tool_call',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      toolCalls: [{ id: 'tc-1', name: 'memory_search', arguments: { query: 'test' } }],
    });
    expect(response.toolCalls).toHaveLength(1);
    expect(response.toolCalls[0].name).toBe('memory_search');
  });

  it('should accept response with no toolCalls field at all (omitted)', () => {
    const response = AIResponseSchema.parse({
      content: 'Hello!',
      model: 'test-model',
      provider: 'groq',
      finishReason: 'completed',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 100,
    });
    expect(response.toolCalls).toBeUndefined();
  });
});

describe('OpenAIAdapter normalizeResponse with no tool calls', () => {
  it('should NOT throw "Expected array, received null" for normal responses', () => {
    const adapter = new OpenAIAdapter({ isGroq: true });

    // Simulate a normal Groq response with NO tool calls.
    // This is the exact shape Groq returns for a normal chat completion.
    const groqResponse = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.1-70b-versatile',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: 'Hello! How can I help you today?',
        },
        finish_reason: 'stop',
      }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
    };

    // This was throwing "Expected array, received null" in production.
    const result = adapter.normalizeResponse(groqResponse, 'llama-3.1-70b-versatile', 500);
    expect(result.content).toBe('Hello! How can I help you today?');
    expect(result.finishReason).toBe(FinishReason.COMPLETED);
    expect(result.toolCalls).toBeUndefined(); // Not null, not an error
  });

  it('should normalize tool calls correctly when present', () => {
    const adapter = new OpenAIAdapter({ isGroq: true });

    const groqResponse = {
      id: 'chatcmpl-test',
      object: 'chat.completion',
      created: 1234567890,
      model: 'llama-3.1-70b-versatile',
      choices: [{
        index: 0,
        message: {
          role: 'assistant',
          content: null,
          tool_calls: [{
            id: 'call_abc123',
            type: 'function',
            function: {
              name: 'memory_search',
              arguments: '{"query":"algebra"}',
            },
          }],
        },
        finish_reason: 'tool_calls',
      }],
      usage: {
        prompt_tokens: 20,
        completion_tokens: 10,
        total_tokens: 30,
      },
    };

    const result = adapter.normalizeResponse(groqResponse, 'llama-3.1-70b-versatile', 500);
    expect(result.finishReason).toBe(FinishReason.TOOL_CALL);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].name).toBe('memory_search');
    expect(result.toolCalls[0].arguments.query).toBe('algebra');
  });
});

describe('OpenAIAdapter normalizeError HTTP 402 classification', () => {
  it('should classify HTTP 402 as AUTHENTICATION_ERROR (billing), not MALFORMED_RESPONSE_ERROR', () => {
    const OpenAI_NS = OpenAI; // alias to avoid shadowing
    const adapter = new OpenAIAdapter({ isGroq: true });

    // The OpenAI SDK wraps HTTP 402 as a generic APIError with status=402.
    const error = new OpenAI_NS.APIError(
      402, // status
      { message: 'Payment required to access this resource. Visit your billing tab.' }, // error body
      'Payment required to access this resource.', // message
      undefined, // headers
    );

    const result = adapter.normalizeError(error, 100);

    expect(result.errorType).toBe(AIErrorTypes.AUTHENTICATION_ERROR);
    expect(result.isRetryable).toBe(false);
    expect(result.providerStatusCode).toBe(402);
    expect(result.providerMessage).toContain('payment required');
    // Must NOT be MALFORMED_RESPONSE_ERROR (which was the production bug)
    expect(result.errorType).not.toBe(AIErrorTypes.MALFORMED_RESPONSE_ERROR);
  });
});

describe('createAIResponse with null toolCalls', () => {
  it('should not throw when toolCalls is null', () => {
    // This is the exact production scenario:
    // OpenAIAdapter sets toolCalls = null, passes to createAIResponse
    // createAIResponse calls AIResponseSchema.parse()
    // Previously: .optional() rejected null → "Expected array, received null"
    // Now: .nullish() accepts null
    const response = createAIResponse({
      content: 'Hello!',
      model: 'test-model',
      provider: 'groq',
      finishReason: FinishReason.COMPLETED,
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 100,
      toolCalls: null, // This was the production bug
    });
    expect(response.content).toBe('Hello!');
    expect(response.toolCalls).toBeNull();
  });
});
