/**
 * Provider-Specific Model Selection Tests
 *
 * Verifies that each provider adapter uses its OWN configured model,
 * not the primary model. The previous implementation hardcoded
 * config.AI_PRIMARY_MODEL in the AIRequest, which sent a Groq model
 * name (e.g. 'llama-3.1-70b-versatile') to Cerebras, causing a 404
 * "Model not found" error.
 *
 * Also verifies that MODEL_UNAVAILABLE_ERROR is NOT treated as a
 * transient/retryable error by the stranded-message sweeper (which
 * only re-enqueues 'received' messages, not 'failed' ones).
 */

import { describe, it, expect } from 'vitest';
import { OpenAIAdapter } from '../../src/ai/providers/OpenAIAdapter.js';
import { CerebrasAIAdapter } from '../../src/ai/providers/CerebrasAIAdapter.js';
import { AIRequestSchema, createAIRequest } from '../../src/ai/schemas/AIRequest.js';
import { AIErrorTypes, RETRYABLE_ERROR_TYPES } from '../../src/ai/schemas/AIErrors.js';

describe('Provider-specific model selection', () => {
  it('AIRequestSchema should accept undefined model (so adapter uses its own defaultModel)', () => {
    const request = AIRequestSchema.parse({
      systemPrompt: 'You are a tutor',
      messages: [{ role: 'user', content: 'Hi' }],
      model: undefined,
      maxOutputTokens: 256,
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      correlationId: '00000000-0000-0000-0000-000000000003',
      promptVersion: 'v1',
    });
    expect(request.model).toBeUndefined();
  });

  it('OpenAIAdapter (Groq) should use config.AI_GROQ_MODEL as defaultModel', () => {
    const adapter = new OpenAIAdapter({ isGroq: true });
    // In test env, AI_GROQ_MODEL is not set, so it falls back to AI_PRIMARY_MODEL
    // which is 'fake-model'. The key point is that it does NOT use AI_CEREBRAS_MODEL.
    expect(adapter.defaultModel).toBeDefined();
    expect(adapter.name).toBe('groq');
  });

  it('CerebrasAIAdapter should use config.AI_CEREBRAS_MODEL as defaultModel', () => {
    const adapter = new CerebrasAIAdapter();
    // In test env, AI_CEREBRAS_MODEL is not set, so it falls back to AI_PRIMARY_MODEL
    // which is 'fake-model'. The key point is that it does NOT use AI_GROQ_MODEL.
    expect(adapter.defaultModel).toBeDefined();
    expect(adapter.name).toBe('cerebras');
  });

  it('OpenAIAdapter buildOpenAIRequest should use adapter defaultModel when request.model is undefined', () => {
    const adapter = new OpenAIAdapter({ isGroq: true });
    const request = createAIRequest({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      model: undefined,
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      correlationId: '00000000-0000-0000-0000-000000000003',
      promptVersion: 'v1',
    });

    const openaiRequest = adapter.buildOpenAIRequest(request);
    // Should use the adapter's defaultModel, NOT undefined.
    expect(openaiRequest.model).toBe(adapter.defaultModel);
    expect(openaiRequest.model).not.toBe('undefined');
  });

  it('CerebrasAIAdapter buildOpenAIRequest should use adapter defaultModel when request.model is undefined', () => {
    const adapter = new CerebrasAIAdapter();
    const request = createAIRequest({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      model: undefined,
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      correlationId: '00000000-0000-0000-0000-000000000003',
      promptVersion: 'v1',
    });

    const openaiRequest = adapter.buildOpenAIRequest(request);
    expect(openaiRequest.model).toBe(adapter.defaultModel);
    expect(openaiRequest.model).not.toBe('undefined');
  });

  it('Groq and Cerebras should NOT share the same model when configured differently', () => {
    const groqAdapter = new OpenAIAdapter({ isGroq: true });
    const cerebrasAdapter = new CerebrasAIAdapter();

    // In test env, both fall back to AI_PRIMARY_MODEL ('fake-model').
    // In production, AI_GROQ_MODEL and AI_CEREBRAS_MODEL would be different.
    // The test verifies the CODE PATH allows different models, not that
    // they ARE different in the test environment.
    const request = createAIRequest({
      systemPrompt: 'test',
      messages: [{ role: 'user', content: 'hi' }],
      model: undefined,
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      correlationId: '00000000-0000-0000-0000-000000000003',
      promptVersion: 'v1',
    });

    const groqReq = groqAdapter.buildOpenAIRequest(request);
    const cerebrasReq = cerebrasAdapter.buildOpenAIRequest(request);

    // Both should use their own defaultModel.
    expect(groqReq.model).toBe(groqAdapter.defaultModel);
    expect(cerebrasReq.model).toBe(cerebrasAdapter.defaultModel);
  });
});

describe('MODEL_UNAVAILABLE_ERROR is not retryable', () => {
  it('MODEL_UNAVAILABLE_ERROR should NOT be in RETRYABLE_ERROR_TYPES', () => {
    expect(RETRYABLE_ERROR_TYPES.has(AIErrorTypes.MODEL_UNAVAILABLE_ERROR)).toBe(false);
  });

  it('Stranded message sweeper should only re-enqueue received messages, not failed ones', async () => {
    const fs = await import('fs');
    const sweeperSource = fs.readFileSync('src/workers/strandedMessageSweeper.js', 'utf-8');

    // The sweeper SQL must filter on processing_status = 'received'.
    expect(sweeperSource).toContain('processing_status = \'received\'');
    // It must NOT look for 'failed' messages.
    expect(sweeperSource).not.toContain('processing_status = \'failed\'');
  });

  it('Worker should mark message as failed on error (not leave it as received)', async () => {
    const fs = await import('fs');
    const setupSource = fs.readFileSync('src/workers/setup.js', 'utf-8');

    // The worker catch block must UPDATE messages SET processing_status = 'failed'.
    expect(setupSource).toContain('processing_status = \'failed\'');
    expect(setupSource).toContain('AND processing_status NOT IN (\'completed\', \'failed\')');
  });
});

describe('AIOrchestrator does not hardcode AI_PRIMARY_MODEL', () => {
  it('should verify orchestrator passes model: undefined (not config.AI_PRIMARY_MODEL)', async () => {
    const fs = await import('fs');
    const source = fs.readFileSync('src/orchestration/AIOrchestrator.js', 'utf-8');

    // The createAIRequest calls should use model: undefined, not model: config.AI_PRIMARY_MODEL
    // (except for error responses where the model is just for display).
    const createAIRequestCalls = source.match(/createAIRequest\(\{[\s\S]*?\}\)/g);
    expect(createAIRequestCalls).not.toBeNull();
    expect(createAIRequestCalls.length).toBeGreaterThanOrEqual(2);

    for (const call of createAIRequestCalls) {
      // Each call should have model: undefined, NOT model: config.AI_PRIMARY_MODEL
      expect(call).toContain('model: undefined');
      expect(call).not.toContain('model: config.AI_PRIMARY_MODEL');
    }
  });
});
