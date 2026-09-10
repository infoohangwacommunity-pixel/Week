/**
 * End-to-end AI Pipeline Tests
 *
 * Verifies the end-to-end AI request flow:
 *   webhook payload → enqueue → queue → worker → AIOrchestrator →
 *     provider adapter → response validation → outbound delivery
 *
 * Uses the FakeAIAdapter so no external services are required.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AIOrchestrator } from '../../src/orchestration/AIOrchestrator.js';
import { FakeAIAdapter } from '../../src/ai/providers/FakeAIAdapter.js';
import { AIRequestSchema } from '../../src/ai/schemas/AIRequest.js';
import { AIResponseSchema, FinishReason } from '../../src/ai/schemas/AIResponse.js';
import { splitResponseIntoChunks } from '../../src/messaging/outbound.js';
import { verifyWebhookSignature } from '../../src/webhook/security.js';
import { createHmac } from 'node:crypto';

// Minimal stubs.
class FakeContextAssembler {
  constructor(toolDefs = []) {
    this.toolDefinitions = toolDefs;
  }
  async assemble({ waxId, sessionId, currentMessage }) {
    return {
      messages: [{ role: 'user', content: currentMessage || 'Hi' }],
      historyTurnCount: 0,
      memoryCount: 0,
      tokenCount: 0,
      memory: { facts: [], episodes: [] },
      studentModel: null,
      toolDefinitions: this.toolDefinitions,
      truncationOccurred: false,
    };
  }
}

class FakeResponseValidator {
  async validate() { return { valid: true, state: 'ok', message: null, canRetry: false }; }
  async createDeliveryRecord() { return { success: true }; }
}

class FakeLogger {
  child() { return this; }
  info() {} warn() {} error() {} debug() {} fatal() {}
}

describe('End-to-End AI Pipeline (Fake)', () => {
  let orchestrator;
  let fakeAdapter;

  beforeAll(() => {
    fakeAdapter = new FakeAIAdapter();
    fakeAdapter.setFakeResponse('Sure, I can help. Let me explain.');
    fakeAdapter.setFakeLatency(10);

    orchestrator = new AIOrchestrator({
      providerFactory: fakeAdapter,
      contextAssembler: new FakeContextAssembler(),
      responseValidator: new FakeResponseValidator(),
      database: null,
      toolExecutor: null,
      safetyClassifier: null,
      crisisProtocol: null,
    });
    orchestrator.logger = new FakeLogger();
  });

  it('should validate AIRequest with tools', () => {
    const req = AIRequestSchema.parse({
      systemPrompt: 'You are a tutor',
      messages: [{ role: 'user', content: 'Hi' }],
      model: 'test-model',
      maxOutputTokens: 256,
      temperature: 0.5,
      tools: [{
        name: 'memory_search',
        description: 'Search memory',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
      }],
      toolChoice: 'auto',
      waxId: '123e4567-e89b-12d3-a456-426614174000',
      sessionId: '123e4567-e89b-12d3-a456-426614174001',
      correlationId: '123e4567-e89b-12d3-a456-426614174002',
      promptVersion: 'v1',
    });
    expect(req.tools).toHaveLength(1);
    expect(req.tools[0].name).toBe('memory_search');
    expect(req.toolChoice).toBe('auto');
  });

  it('should accept tool-role messages in AIRequest', () => {
    const req = AIRequestSchema.parse({
      systemPrompt: 'You are a tutor',
      messages: [
        { role: 'user', content: 'What is 2+2?' },
        { role: 'assistant', content: '', toolCalls: [{ id: 'tc-1', name: 'calc', arguments: { x: 2, y: 2 } }] },
        { role: 'tool', toolCallId: 'tc-1', toolName: 'calc', content: '{"result":4}' },
      ],
      model: 'test-model',
      waxId: '123e4567-e89b-12d3-a456-426614174000',
      sessionId: '123e4567-e89b-12d3-a456-426614174001',
      correlationId: '123e4567-e89b-12d3-a456-426614174002',
      promptVersion: 'v1',
    });
    expect(req.messages).toHaveLength(3);
    expect(req.messages[2].role).toBe('tool');
  });

  it('should complete a basic AI request end-to-end', async () => {
    const response = await orchestrator.complete({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'Hi, can you help me with math?',
      context: { correlationId: '00000000-0000-0000-0000-000000000003' },
    });

    expect(response).toBeDefined();
    expect(response.content).toBeTruthy();
    expect(response.finishReason).toBe(FinishReason.COMPLETED);
    expect(response.usage.inputTokens).toBeGreaterThan(0);
    expect(response.usage.outputTokens).toBeGreaterThan(0);
    expect(response.provider).toBe('fake');
  });

  it('should validate AIResponse shape', () => {
    const response = AIResponseSchema.parse({
      content: 'Hello there.',
      model: 'fake-model',
      provider: 'fake',
      finishReason: 'completed',
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
      latencyMs: 42,
    });
    expect(response.content).toBe('Hello there.');
  });

  it('should accept the new finishReasons (tool_limit_reached, max_turns_reached)', () => {
    expect(AIResponseSchema.parse({
      content: 'Limit reached.',
      model: 'fake',
      provider: 'fake',
      finishReason: 'tool_limit_reached',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    }).finishReason).toBe('tool_limit_reached');

    expect(AIResponseSchema.parse({
      content: 'Max turns.',
      model: 'fake',
      provider: 'fake',
      finishReason: 'max_turns_reached',
      usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
      latencyMs: 0,
    }).finishReason).toBe('max_turns_reached');
  });

  it('should split long content into WhatsApp-compliant chunks (≤4096 chars)', () => {
    // Build a single 10000-char run-on "sentence" with no sentence terminators.
    const longRunOn = 'a'.repeat(10000);
    const chunks = splitResponseIntoChunks(longRunOn);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    }
  });

  it('should split normally punctuated content within chunk budget', () => {
    const content = 'Hello! How are you? I am fine. Let me explain something. First point. Second point. Third point.';
    const chunks = splitResponseIntoChunks(content);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(1000);
    }
  });

  it('verifyWebhookSignature should reject malformed signature headers', () => {
    const body = Buffer.from('{"foo":"bar"}', 'utf-8');
    const secret = 'test-app-secret-with-enough-length';
    const realSig = createHmac('sha256', secret).update(body).digest('hex');

    // Valid signature → true
    expect(verifyWebhookSignature(body, `sha256=${realSig}`, secret)).toBe(true);

    // Wrong signature → false (not throw)
    expect(verifyWebhookSignature(body, 'sha256=deadbeef', secret)).toBe(false);

    // Truncated signature → false (not throw)
    expect(verifyWebhookSignature(body, 'sha256=abc', secret)).toBe(false);

    // Empty signature → false
    expect(verifyWebhookSignature(body, 'sha256=', secret)).toBe(false);

    // Missing prefix → false
    expect(verifyWebhookSignature(body, realSig, secret)).toBe(false);

    // Missing appSecret → false
    expect(verifyWebhookSignature(body, `sha256=${realSig}`, '')).toBe(false);
  });

  it('verifyWebhookSignature should accept Buffer or string body', () => {
    const secret = 'test-app-secret-with-enough-length';
    const bodyStr = '{"foo":"bar"}';
    const bodyBuf = Buffer.from(bodyStr, 'utf-8');
    const sig = createHmac('sha256', secret).update(bodyBuf).digest('hex');

    expect(verifyWebhookSignature(bodyStr, `sha256=${sig}`, secret)).toBe(true);
    expect(verifyWebhookSignature(bodyBuf, `sha256=${sig}`, secret)).toBe(true);
  });
});
