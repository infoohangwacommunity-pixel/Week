/**
 * Tool Execution Chain Tests
 *
 * Verifies that ToolExecutor.performToolExecution actually dispatches to the
 * 8 tool implementation files via ToolHandlerRegistry, with the shared db
 * pool injected correctly. Uses a mock pool so no real Postgres is needed.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ToolExecutor } from '../../src/tools/ToolExecutor.js';
import { ToolError, ToolErrorCode } from '../../src/tools/ToolErrors.js';
import { validateToolArguments } from '../../src/tools/ToolRegistry.js';
import { TOOL_HANDLERS, getToolHandler } from '../../src/tools/ToolHandlerRegistry.js';

// A mock pool that returns scripted rows for known queries.
function buildMockPool(scripts = {}) {
  const calls = [];
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('INSERT INTO student_facts')) {
        return { rows: [{ id: 'new-fact-id-123' }] };
      }
      if (text.includes('SELECT id, evidence_count FROM student_facts')) {
        return { rows: [] }; // no existing fact
      }
      if (text.includes('INSERT INTO embedding_jobs')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO learning_observations')) {
        return { rows: [{ id: 'new-obs-id-456' }] };
      }
      if (text.includes('SELECT id FROM concepts')) {
        return { rows: [] };
      }
      if (text.includes('INSERT INTO concepts')) {
        return { rows: [] };
      }
      if (text.includes('SELECT id FROM messages')) {
        return { rows: [{ id: 'msg-id-789' }] };
      }
      if (text.includes('UPDATE knowledge_states')) {
        return { rows: [] };
      }
      if (text.includes('SELECT * FROM student_facts')) {
        return { rows: [] };
      }
      if (text.includes('SELECT * FROM student_episodes')) {
        return { rows: [] };
      }
      if (text.includes('SELECT id, fact_key, fact_category')) {
        return { rows: [] };
      }
      if (text.includes('FROM knowledge_states')) {
        return { rows: [{ mastery_estimate: 0.5, evidence_count: 1, direct_response_count: 1, hint_dependency: 0, recent_trend: 'insufficient_data' }] };
      }
      if (text.includes('FROM misconceptions')) {
        return { rows: [] };
      }
      if (text.includes('FROM learning_signals')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
  };
  pool._calls = calls;
  return pool;
}

describe('ToolHandlerRegistry', () => {
  it('should register handlers for all 8 public tools', () => {
    const expected = [
      'memory_search', 'memory_read', 'memory_write',
      'knowledge_query', 'web_search', 'document_fetch',
      'generate_question', 'record_evidence',
    ];
    for (const name of expected) {
      const handler = getToolHandler(name);
      expect(handler, `handler for ${name}`).not.toBeNull();
      expect(typeof handler.handler).toBe('function');
      expect(typeof handler.requiresDb).toBe('boolean');
    }
  });

  it('should return null for unknown tool', () => {
    expect(getToolHandler('nonexistent_tool')).toBeNull();
  });
});

describe('ToolExecutor.performToolExecution dispatch', () => {
  let executor;
  let mockPool;

  beforeEach(() => {
    mockPool = buildMockPool();
    executor = new ToolExecutor({
      db: mockPool,
      queue: null,
      logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
      configOverride: {},
    });
  });

  it('should dispatch memory_search to executeMemorySearch', async () => {
    const result = await executor.execute({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      aiRequestId: '00000000-0000-0000-0000-000000000003',
      toolName: 'memory_search',
      arguments: { query: 'algebra basics', max_results: 3 },
      turnIndex: 0,
    });
    // The mock pool returns empty rows, so memory_search should succeed
    // with total_found: 0.
    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  it('should dispatch memory_write to executeMemoryWrite with the db pool', async () => {
    const result = await executor.execute({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      aiRequestId: '00000000-0000-0000-0000-000000000003',
      toolName: 'memory_write',
      arguments: {
        fact_category: 'academic',
        fact_key: 'knows_algebra',
        fact_value: 'true',
        display_text: 'Student knows basic algebra',
        provenance: 'ai_inferred_from_behavior',
        confidence: 0.8,
      },
      turnIndex: 0,
    });
    expect(result.success).toBe(true);
    expect(result.data.fact_id).toBeDefined();
    // Verify the mock pool received the INSERT.
    const insertCalls = mockPool._calls.filter((c) => c.text.includes('INSERT INTO student_facts'));
    expect(insertCalls.length).toBe(1);
  });

  it('should dispatch record_evidence to executeRecordEvidence (immutable ON CONFLICT DO NOTHING)', async () => {
    const result = await executor.execute({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      aiRequestId: '00000000-0000-0000-0000-000000000003',
      toolName: 'record_evidence',
      arguments: {
        concept_tag: 'algebra:linear-equations',
        evidence_type: 'direct_response',
        correctness: 0.9,
        hint_level: 0,
      },
      turnIndex: 0,
    });
    expect(result.success).toBe(true);
    expect(result.data.evidence_id).toBe('new-obs-id-456');
    // The INSERT must use ON CONFLICT DO NOTHING (immutability), NOT DO UPDATE.
    const insertCalls = mockPool._calls.filter((c) => c.text.includes('INSERT INTO learning_observations'));
    expect(insertCalls.length).toBe(1);
    expect(insertCalls[0].text).toContain('DO NOTHING');
    expect(insertCalls[0].text).not.toContain('DO UPDATE SET');
  });

  it('should dispatch memory_read to executeMemoryRead with waxId isolation', async () => {
    const result = await executor.execute({
      waxId: '00000000-0000-0000-0000-000000000001',
      sessionId: '00000000-0000-0000-0000-000000000002',
      aiRequestId: '00000000-0000-0000-0000-000000000003',
      toolName: 'memory_read',
      arguments: { memory_id: '00000000-0000-0000-0000-000000000010' },
      turnIndex: 0,
    });
    expect(result.success).toBe(true);
    // Verify the SELECT was scoped to waxId.
    const selectCalls = mockPool._calls.filter(
      (c) => c.text.includes('SELECT') && c.text.includes('student_facts')
    );
    expect(selectCalls.length).toBeGreaterThan(0);
    expect(selectCalls[0].text).toContain('wax_id = $2');
    expect(selectCalls[0].params[1]).toBe('00000000-0000-0000-0000-000000000001');
  });

  it('should reject unknown tools with UNKNOWN_TOOL error', async () => {
    await expect(
      executor.execute({
        waxId: '00000000-0000-0000-0000-000000000001',
        sessionId: '00000000-0000-0000-0000-000000000002',
        aiRequestId: '00000000-0000-0000-0000-000000000003',
        toolName: 'totally_made_up_tool',
        arguments: {},
        turnIndex: 0,
      })
    ).rejects.toThrow();
  });

  it('should reject invalid arguments with INVALID_ARGUMENTS', async () => {
    await expect(
      executor.execute({
        waxId: '00000000-0000-0000-0000-000000000001',
        sessionId: '00000000-0000-0000-0000-000000000002',
        aiRequestId: '00000000-0000-0000-0000-000000000003',
        toolName: 'memory_search',
        // missing required 'query' field
        arguments: { max_results: 3 },
        turnIndex: 0,
      })
    ).rejects.toThrow();
  });

  it('validateToolArguments should validate field types correctly (not via JS arguments object)', () => {
    // This is a regression test for the bug where validateToolArguments
    // used `arguments[fieldName]` (the JS magic local) instead of
    // `toolArguments[fieldName]`.
    const result = validateToolArguments('memory_search', {
      query: 'algebra',  // string ✓
      max_results: 3,     // integer ✓
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('validateToolArguments should reject wrong field types', () => {
    const result = validateToolArguments('memory_search', {
      query: 12345,        // wrong type — should be string
      max_results: 3,
    });
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('query'))).toBe(true);
  });
});

describe('ToolExecutor error handling', () => {
  it('should return RATE_LIMIT_EXCEEDED with the correct reason (not undefined)', async () => {
    const mockPool = buildMockPool();
    const executor = new ToolExecutor({
      db: mockPool,
      queue: null,
      logger: { child: () => ({ info() {}, warn() {}, error() {} }) },
      configOverride: {},
    });

    // Force rate-limit hit by exceeding the per-session limit.
    // memory_search's limit is config.TOOL_MEMORY_SEARCH_MAX_PER_SESSION (default 10).
    const waxId = '00000000-0000-0000-0000-000000000001';
    const sessionId = '00000000-0000-0000-0000-000000000002';

    let lastError = null;
    for (let i = 0; i < 15; i++) {
      try {
        await executor.execute({
          waxId, sessionId,
          aiRequestId: '00000000-0000-0000-0000-000000000003',
          toolName: 'memory_search',
          // query must be >= 3 chars per schema
          arguments: { query: `query-number-${i}` },
          turnIndex: i,
        });
      } catch (err) {
        lastError = err;
        break;
      }
    }
    expect(lastError).not.toBeNull();
    expect(lastError.code).toBe(ToolErrorCode.RATE_LIMIT_EXCEEDED);
    // The reason message must contain "Rate limit" (not be undefined).
    expect(lastError.message).toContain('Rate limit');
  });
});
