/**
 * WaxPrep - AI Provider Abstraction Tests
 * 
 * Tests for Stage 15-17: AI Provider Abstraction, Basic AI Communication,
 * and AI Identity & System Prompts.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { FakeAIAdapter } from '../../src/ai/providers/FakeAIAdapter.js';
import { createAIRequest } from '../../src/ai/schemas/AIRequest.js';
import { FinishReason } from '../../src/ai/schemas/AIResponse.js';
import { AIErrorTypes } from '../../src/ai/schemas/AIErrors.js';
import { SystemPromptBuilder } from '../../src/ai/prompt/SystemPromptBuilder.js';
import { PromptVersioning } from '../../src/ai/prompt/SystemPromptBuilder.js';

describe('AI Provider Abstraction (Stage 15-17)', () => {
  describe('FakeAIAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new FakeAIAdapter();
      adapter.clearCallHistory();
    });

    afterEach(() => {
      adapter.clearCallHistory();
    });

    it('should implement the AIProviderInterface', () => {
      expect(adapter).toHaveProperty('name');
      expect(adapter).toHaveProperty('capabilities');
      expect(adapter).toHaveProperty('complete');
      expect(adapter.name).toBe('fake');
      expect(adapter.capabilities.supportsText).toBe(true);
    });

    it('should return a deterministic response', async () => {
      adapter.setFakeResponse('Test response');
      adapter.setFakeLatency(10);

      const request = createAIRequest({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        correlationId: '123e4567-e89b-12d3-a456-426614174002',
        promptVersion: 'v1',
      });

      const response = await adapter.complete(request);

      expect(response.content).toBe('Test response');
      expect(response.provider).toBe('fake');
      expect(response.finishReason).toBe(FinishReason.COMPLETED);
      expect(response.latencyMs).toBeGreaterThanOrEqual(10);
    });

    it('should record calls for testing', async () => {
      const request = createAIRequest({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        correlationId: '123e4567-e89b-12d3-a456-426614174002',
        promptVersion: 'v1',
      });

      await adapter.complete(request);
      await adapter.complete(request);

      const history = adapter.getCallHistory();
      expect(history).toHaveLength(2);
      expect(history[0].request.systemPrompt).toBe('You are a tutor');
    });

    it('should simulate failure when configured', async () => {
      adapter.configureFailure(true, 'Simulated error', AIErrorTypes.RATE_LIMIT_ERROR);

      const request = createAIRequest({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        correlationId: '123e4567-e89b-12d3-a456-426614174002',
        promptVersion: 'v1',
      });

      await expect(adapter.complete(request)).rejects.toThrow('Simulated error');
    });

    it('should estimate token usage reasonably', async () => {
      const longMessage = 'Hello '.repeat(100); // ~400 characters
      adapter.setFakeResponse('Response '.repeat(10)); // ~60 characters

      const request = createAIRequest({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: longMessage }],
        model: 'test-model',
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        correlationId: '123e4567-e89b-12d3-a456-426614174002',
        promptVersion: 'v1',
      });

      const response = await adapter.complete(request);

      // Rough estimate: 1 token ≈ 4 characters
      expect(response.usage.inputTokens).toBeGreaterThan(50);
      expect(response.usage.outputTokens).toBeGreaterThan(5);
    });
  });

  describe('SystemPromptBuilder', () => {
    let builder;

    beforeEach(() => {
      // Pass null for database (not needed for basic tests)
      builder = new SystemPromptBuilder(null);
    });

    it('should build a system prompt', async () => {
      const result = await builder.build({
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        context: {},
      });

      expect(result).toHaveProperty('systemPrompt');
      expect(result).toHaveProperty('promptVersion');
      expect(result.systemPrompt).toContain('WAXPREP');
      expect(result.systemPrompt).toContain('Nigerian');
      expect(result.promptVersion).toBe('v1');
    });

    it('should include current date in prompt', async () => {
      const result = await builder.build({
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        context: {},
      });

      const currentDate = new Date().toISOString().split('T')[0];
      expect(result.systemPrompt).toContain(currentDate);
    });

    it('should not include curriculum in prompt', async () => {
      const result = await builder.build({
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        context: {},
      });

      expect(result.systemPrompt).not.toContain('Lesson 1');
      expect(result.systemPrompt).not.toContain('Chapter 2');
      expect(result.systemPrompt).not.toContain('if mastery < 0.6');
    });
  });

  describe('PromptVersioning', () => {
    it('should calculate consistent version hash', () => {
      const template = 'Test template';
      const hash1 = PromptVersioning.getVersion(template);
      const hash2 = PromptVersioning.getVersion(template);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^v[0-9a-f]{8}$/);
    });

    it('should increment version correctly', () => {
      expect(PromptVersioning.incrementVersion('v1')).toBe('v2');
      expect(PromptVersioning.incrementVersion('v10')).toBe('v11');
      expect(PromptVersioning.incrementVersion('invalid')).toBe('v1');
    });
  });

  describe('AI Request Schema', () => {
    it('should validate a correct request', () => {
      const request = createAIRequest({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        correlationId: '123e4567-e89b-12d3-a456-426614174002',
        promptVersion: 'v1',
      });

      expect(request).toHaveProperty('systemPrompt');
      expect(request).toHaveProperty('messages');
      expect(request).toHaveProperty('model');
      expect(request).toHaveProperty('waxId');
    });

    it('should require at least one message', () => {
      expect(() => {
        createAIRequest({
          systemPrompt: 'You are a tutor',
          messages: [],
          model: 'test-model',
          waxId: '123e4567-e89b-12d3-a456-426614174000',
          sessionId: '123e4567-e89b-12d3-a456-426614174001',
          correlationId: '123e4567-e89b-12d3-a456-426614174002',
          promptVersion: 'v1',
        });
          }).toThrow('At least one message is required');
      });
  });

  describe('Provider Factory', () => {
    it('should return available providers', async () => {
      const { getAvailableProviders } = await import('../../src/ai/providers/ProviderFactory.js');
      const providers = getAvailableProviders();
      
      expect(providers).toContain('fake');
      expect(providers).toContain('anthropic');
      expect(providers).toContain('openai');
      expect(providers).toContain('groq');
      expect(providers).toContain('cerebras');
      // Gemini is intentionally NOT advertised — no Gemini chat adapter is
      // implemented. The Gemini EMBEDDING adapter exists, but it does not
      // satisfy the AIProviderInterface.
      expect(providers).not.toContain('gemini');
    });
  });
});
