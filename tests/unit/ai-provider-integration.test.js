/**
 * WaxPrep - AI Provider Integration Tests
 * 
 * Tests for Stage 15-17: AI Provider Abstraction, Basic AI Communication,
 * and AI Identity & System Prompts.
 * Tests Cerebras and Gemini providers.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CerebrasAIAdapter } from '../../src/ai/providers/CerebrasAIAdapter.js';
import { GeminiEmbeddingAdapter } from '../../src/embeddings/GeminiEmbeddingAdapter.js';
import { createAIRequest } from '../../src/ai/schemas/AIRequest.js';
import { FinishReason } from '../../src/ai/schemas/AIResponse.js';

describe('AI Provider Integrations (Cerebras & Gemini)', () => {
  describe('CerebrasAIAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new CerebrasAIAdapter();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should implement the AIProviderInterface', () => {
      expect(adapter).toHaveProperty('name');
      expect(adapter).toHaveProperty('capabilities');
      expect(adapter).toHaveProperty('complete');
      expect(adapter.name).toBe('cerebras');
      expect(adapter.capabilities.supportsText).toBe(true);
      expect(adapter.capabilities.supportsToolCalling).toBe(true);
    });

    it('should have correct default model', () => {
      expect(adapter.defaultModel).toBeTruthy();
    });

    it('should have correct capabilities', () => {
      expect(adapter.capabilities).toEqual({
        supportsText: true,
        supportsImageInput: false,
        supportsAudioInput: false,
        supportsToolCalling: true,
        supportsStructuredOutput: false,
        supportsStreaming: true,
        supportsPromptCaching: false,
        maxContextTokens: 256000,
        maxOutputTokens: 4096,
      });
    });

    it('should build correct request format', () => {
      const request = createAIRequest({
        systemPrompt: 'You are a tutor',
        messages: [{ role: 'user', content: 'Hello' }],
        model: 'test-model',
        waxId: '123e4567-e89b-12d3-a456-426614174000',
        sessionId: '123e4567-e89b-12d3-a456-426614174001',
        correlationId: '123e4567-e89b-12d3-a456-426614174002',
        promptVersion: 'v1',
      });

      const cerebrasRequest = adapter.buildCerebrasRequest(request);

      expect(cerebrasRequest).toHaveProperty('model');
      expect(cerebrasRequest).toHaveProperty('messages');
      expect(cerebrasRequest.messages).toHaveLength(2);
      expect(cerebrasRequest.messages[0].role).toBe('system');
      expect(cerebrasRequest.messages[1].role).toBe('user');
    });

    it('should normalize finish reasons correctly', () => {
      expect(adapter.normalizeFinishReason('stop')).toBe(FinishReason.COMPLETED);
      expect(adapter.normalizeFinishReason('done')).toBe(FinishReason.COMPLETED);
      expect(adapter.normalizeFinishReason('length')).toBe(FinishReason.LENGTH_LIMIT);
      expect(adapter.normalizeFinishReason('tool_calls')).toBe(FinishReason.TOOL_CALL);
      expect(adapter.normalizeFinishReason('unknown')).toBe(FinishReason.UNKNOWN);
    });
  });

  describe('GeminiEmbeddingAdapter', () => {
    let adapter;

    beforeEach(() => {
      adapter = new GeminiEmbeddingAdapter();
    });

    afterEach(() => {
      vi.clearAllMocks();
    });

    it('should have correct name', () => {
      expect(adapter.name).toBe('gemini');
    });

    it('should have default model', () => {
      expect(adapter.defaultModel).toBe('gemini-embedding-2');
    });

    it('should have default dimensions of 1536', () => {
      expect(adapter.dimensions).toBe(1536);
    });

    it('should throw error when API key is not configured', async () => {
      await expect(adapter.generate('test text')).rejects.toThrow('EMBEDDING_API_KEY is not configured for Gemini');
    });

    it('should handle dimensionality truncation', async () => {
      // Mock fetch to return embedding with more dimensions than configured
      const mockEmbedding = new Array(2048).fill(0.1);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: { values: mockEmbedding },
        }),
      });

      adapter.dimensions = 1536;

      const result = await adapter.generate('test text');

      expect(result).toHaveLength(1536);
    });

    it('should handle dimensionality padding', async () => {
      // Mock fetch to return embedding with fewer dimensions than configured
      const mockEmbedding = new Array(768).fill(0.1);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: { values: mockEmbedding },
        }),
      });

      adapter.dimensions = 1536;

      const result = await adapter.generate('test text');

      expect(result).toHaveLength(1536);
      // Check that padding zeros were added
      expect(result[768]).toBe(0);
    });

    it('should handle API errors gracefully', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({
          error: { message: 'Invalid API key' },
        }),
      });

      await expect(adapter.generate('test text')).rejects.toThrow('Gemini API error: 401 Unauthorized');
    });

    it('should handle timeout errors', async () => {
      vi.spyOn(globalThis, 'fetch').mockImplementation(() =>
        new Promise(() => {}) // Never resolve
      );

      await expect(adapter.generate('test text')).rejects.toThrow('Gemini embedding request timed out');
    });
  });

  describe('Gemini Embedding Dimensionality', () => {
    it('should maintain 1536 dimensions for pgvector compatibility', async () => {
      const adapter = new GeminiEmbeddingAdapter();

      // Mock fetch
      const mockEmbedding = new Array(1536).fill(0.5);

      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          embedding: { values: mockEmbedding },
        }),
      });

      const result = await adapter.generate('test text for embedding');

      expect(result).toHaveLength(1536);
      expect(Array.isArray(result)).toBe(true);
      expect(result.every(val => typeof val === 'number')).toBe(true);
    });
  });
});
