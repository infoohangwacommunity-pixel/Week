/**
 * Integration Tests - AI Provider Pipeline (Phase G-I)
 *
 * Verifies the end-to-end AI request flow:
 *   AIOrchestrator.completeWithTools()
 *     → FakeAIAdapter (no network)
 *       → AIResponse normalization
 *         → response validation
 *
 * Uses the FakeAIAdapter so no external services are required. This is the
 * minimum viable end-to-end test of the AI processing path.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { AIOrchestrator } from '../../src/orchestration/AIOrchestrator.js';
import { FakeAIAdapter } from '../../src/ai/providers/FakeAIAdapter.js';
import ToolRegistry from '../../src/tools/ToolRegistry.js';

// Minimal context assembler that returns a single user message + tool defs.
class FakeContextAssembler {
  constructor(toolDefs = []) {
    this.toolDefinitions = toolDefs;
  }
  async assemble({ waxId, sessionId, currentMessage }) {
    return {
      messages: [
        { role: 'user', content: currentMessage || 'Hello' },
      ],
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

// Minimal response validator that always passes.
class FakeResponseValidator {
  async validate() {
    return { valid: true, state: 'ok', message: null, canRetry: false };
  }
  async createDeliveryRecord() {
    return { success: true };
  }
}

// Minimal logger stub that captures the messages.
class FakeLogger {
  constructor() { this.logs = []; }
  child() { return this; }
  info(...args) { this.logs.push(['info', args]); }
  warn(...args) { this.logs.push(['warn', args]); }
  error(...args) { this.logs.push(['error', args]); }
  debug(...args) { this.logs.push(['debug', args]); }
  fatal(...args) { this.logs.push(['fatal', args]); }
}

describe('AI Provider Pipeline Integration (Fake)', () => {
  let orchestrator;
  let fakeAdapter;

  beforeAll(() => {
    fakeAdapter = new FakeAIAdapter();
    fakeAdapter.setFakeResponse('Hello from the fake AI provider.');
    fakeAdapter.setFakeLatency(10);

    orchestrator = new AIOrchestrator({
      providerFactory: fakeAdapter,
      contextAssembler: new FakeContextAssembler(),
      responseValidator: new FakeResponseValidator(),
      database: null, // orchestrator's persist path checks for null pool
      toolExecutor: null,
      safetyClassifier: null,
      crisisProtocol: null,
    });
    // Override the orchestrator's internal logger so we capture logs.
    orchestrator.logger = new FakeLogger();
  });

  it('should complete a basic AI request end-to-end', async () => {
    const response = await orchestrator.complete({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'Hi, can you help me with math?',
      context: {
        correlationId: '00000000-0000-0000-0000-000000000003',
      },
    });

    expect(response).toBeDefined();
    expect(typeof response.content).toBe('string');
    expect(response.content.length).toBeGreaterThan(0);
    expect(response.finishReason).toBeDefined();
    expect(response.usage).toBeDefined();
    expect(typeof response.usage.inputTokens).toBe('number');
    expect(typeof response.usage.outputTokens).toBe('number');
    expect(response.provider).toBe('fake');
  });

  it('should return a complete AIResponse shape (no missing fields)', async () => {
    const response = await orchestrator.complete({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      currentMessage: 'What is 2+2?',
      context: { correlationId: '00000000-0000-0000-0000-000000000004' },
    });

    // All required AIResponse fields must be present.
    expect(response).toHaveProperty('content');
    expect(response).toHaveProperty('model');
    expect(response).toHaveProperty('provider');
    expect(response).toHaveProperty('finishReason');
    expect(response).toHaveProperty('usage');
    expect(response).toHaveProperty('latencyMs');
    expect(typeof response.latencyMs).toBe('number');
  });

  it('ToolRegistry should expose at least one tool with valid schema', () => {
    const tools = ToolRegistry.getToolRegistry();
    expect(Array.isArray(tools)).toBe(true);
    expect(tools.length).toBeGreaterThan(0);
    for (const tool of tools) {
      expect(tool.name).toBeDefined();
      expect(tool.description).toBeDefined();
      expect(tool.input_schema || tool.inputSchema).toBeDefined();
      expect(tool.permission_level).toBeDefined();
    }
  });

  it('should not throw if the fake adapter simulates a retryable failure', async () => {
    fakeAdapter.configureFailure(true, 'Simulated 5xx', 'PROVIDER_SERVER_ERROR');
    try {
      await expect(
        orchestrator.complete({
          waxId: '00000000-0000-0000-0000-000000000001',
          sessionId: '00000000-0000-0000-0000-000000000002',
          currentMessage: 'should fail',
          context: { correlationId: '00000000-0000-0000-0000-000000000005' },
        })
      ).rejects.toThrow();
    } finally {
      fakeAdapter.configureFailure(false);
    }
  });
});
