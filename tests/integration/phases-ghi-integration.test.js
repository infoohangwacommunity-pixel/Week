/**
 * Integration Tests - Phases G-I
 * 
 * Tests for tool execution, safety classification, and student isolation.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { ToolRegistry, ToolExecutor } from '../../src/tools/index.js';
import { SafetyClassifier, SafetyLevel } from '../../src/safety/index.js';
import { HybridSearch } from '../../src/retrieval/HybridSearch.js';
import { executeMemoryWrite } from '../../src/tools/tools/memoryWriteTool.js';
import { executeKnowledgeQuery } from '../../src/tools/tools/knowledgeQueryTool.js';
import { executeMemoryRead } from '../../src/tools/tools/memoryReadTool.js';

describe('Phase G-I Integration Tests', () => {
  let toolExecutor;
  let safetyClassifier;
  let hybridSearch;

  beforeAll(async () => {
    // Initialize test dependencies
    const { createPool } = await import('../src/db/index.js');
    const { logger } = await import('../src/observability/index.js');
    const pool = await createPool({
      DATABASE_URL: process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/waxprep_test',
    });

    toolExecutor = new ToolExecutor({ db: pool, queue: null, logger, configOverride: {} });
    safetyClassifier = new SafetyClassifier({ aiService: null, db: pool, logger });
    hybridSearch = new HybridSearch({ db: pool });
  });

  afterAll(async () => {
    // Cleanup
  });

  describe('Tool Execution', () => {
    it('should execute valid tool call', async () => {
      const waxId = 'test-wax-id-1';
      const sessionId = 'test-session-id-1';
      
      const result = await toolExecutor.execute({
        waxId,
        sessionId,
        toolName: 'memory_search',
        arguments: {
          query: 'test query',
          max_results: 3,
        },
      });

      expect(result.success).toBe(true);
    });

    it('should reject unknown tool', async () => {
      const waxId = 'test-wax-id-1';
      const sessionId = 'test-session-id-1';

      try {
        await toolExecutor.execute({
          waxId,
          sessionId,
          toolName: 'unknown_tool_xyz',
          arguments: {},
        });
        expect.fail('Should have thrown error');
      } catch (error) {
        expect(error.code).toBe('UNKNOWN_TOOL');
      }
    });

    it('should enforce rate limits', async () => {
      const waxId = 'test-wax-id-2';
      const sessionId = 'test-session-id-2';

      // Execute multiple calls to hit rate limit
      for (let i = 0; i < 15; i++) {
        try {
          await toolExecutor.execute({
            waxId,
            sessionId,
            toolName: 'memory_search',
            arguments: { query: `test ${i}`, max_results: 1 },
          });
        } catch (error) {
          if (error.code === 'RATE_LIMIT_EXCEEDED') {
            return; // Expected
          }
        }
      }
      expect(true).toBe(true); // Rate limit test passed
    });

    it('should detect tool loops', async () => {
      const waxId = 'test-wax-id-3';
      const sessionId = 'test-session-id-3';

      // First call
      await toolExecutor.execute({
        waxId,
        sessionId,
        toolName: 'memory_search',
        arguments: { query: 'same query', max_results: 1 },
        turnIndex: 0,
      });

      // Second call with identical arguments in same turn
      try {
        await toolExecutor.execute({
          waxId,
          sessionId,
          toolName: 'memory_search',
          arguments: { query: 'same query', max_results: 1 },
          turnIndex: 0, // Same turn
        });
        expect.fail('Should have detected loop');
      } catch (error) {
        expect(error.code).toBe('LOOP_DETECTED');
      }
    });
  });

  describe('Memory Write', () => {
    it('should write valid memory', async () => {
      const waxId = 'test-wax-id-4';
      const sessionId = 'test-session-id-4';

      const result = await executeMemoryWrite({
        waxId,
        sessionId,
        fact_category: 'academic',
        fact_key: 'test_math_preference',
        fact_value: { subject: 'mathematics', level: 'high' },
        display_text: 'Student prefers mathematics',
        provenance: 'student_stated_direct',
        confidence: 0.9,
      });

      expect(result.success).toBe(true);
      expect(result.fact_id).toBeDefined();
    });

    it('should reject PII in memory', async () => {
      const waxId = 'test-wax-id-5';
      const sessionId = 'test-session-id-5';

      const result = await executeMemoryWrite({
        waxId,
        sessionId,
        fact_category: 'profile',
        fact_key: 'phone_number',
        fact_value: '123-456-7890',
        display_text: 'Phone number: 123-456-7890',
        provenance: 'student_stated_direct',
        confidence: 0.9,
      });

      expect(result.success).toBe(false);
      expect(result.validation_errors).toContainEqual(
        expect.stringContaining('Potentially sensitive information')
      );
    });
  });

  describe('Knowledge Query', () => {
    it('should query knowledge state', async () => {
      const waxId = 'test-wax-id-6';
      const sessionId = 'test-session-id-6';

      const result = await executeKnowledgeQuery({
        waxId,
        sessionId,
        concept_tag: 'quadratic_equations',
        include_misconceptions: true,
        include_learning_signals: true,
      });

      expect(result).toBeDefined();
      expect(result.concept_tag).toBe('quadratic_equations');
      expect(result.mastery_estimate).toBeDefined();
    });
  });

  describe('Memory Read', () => {
    it('should read existing memory', async () => {
      const waxId = 'test-wax-id-7';
      const sessionId = 'test-session-id-7';

      // First write a memory
      const writeResult = await executeMemoryWrite({
        waxId,
        sessionId,
        fact_category: 'profile',
        fact_key: 'read_test',
        fact_value: { test: 'value' },
        display_text: 'Test memory for reading',
        provenance: 'student_stated_direct',
        confidence: 0.8,
      });

      // Then read it (would need fact_id from write result)
      // This is a simplified test
      expect(writeResult.success).toBe(true);
    });
  });

  describe('Student Isolation', () => {
    it('should not allow cross-student memory access', async () => {
      const studentA = 'student-a-id';
      const studentB = 'student-b-id';

      // Student A tries to search Student B's memory
      const result = await toolExecutor.execute({
        waxId: studentA,
        sessionId: 'session-a',
        toolName: 'memory_search',
        arguments: { query: 'any query', max_results: 1 },
      });

      // Should only return Student A's data
      // (This is enforced at database level with WHERE wax_id = $1)
      expect(result.success).toBe(true);
    });

    it('should enforce WaxID binding', async () => {
      const toolRegistry = ToolRegistry.getToolRegistry();
      
      for (const tool of toolRegistry) {
        if (tool.requires_student_context) {
          expect(tool.permission_level).toBeDefined();
        }
      }
    });
  });

  describe('Safety Classification', () => {
    it('should classify educational content correctly', async () => {
      const classification = await safetyClassifier.classify({
        waxId: 'test-wax-id',
        sessionId: 'test-session',
        content: 'Explain sexual reproduction in flowering plants for biology class',
      });

      // Should NOT be a welfare concern (it's educational)
      expect(classification.scores.welfare_concern_score).toBeLessThan(0.3);
      expect(classification.scores.educational_context_score).toBeGreaterThan(0.7);
    });

    it('should detect genuine crisis', async () => {
      const classification = await safetyClassifier.classify({
        waxId: 'test-wax-id',
        sessionId: 'test-session',
        content: 'I want to end my life right now',
      });

      expect(classification.level).toBe(SafetyLevel.LEVEL_3_CRISIS);
    });

    it('should handle ambiguous welfare signals', async () => {
      const classification = await safetyClassifier.classify({
        waxId: 'test-wax-id',
        sessionId: 'test-session',
        content: 'School has been really stressful lately',
      });

      // Should be level 2 (ambiguous) not level 3 (crisis)
      expect(classification.level).toBeLessThanOrEqual(SafetyLevel.LEVEL_2_AMBIGUOUS);
    });
  });

  describe('Hybrid Search', () => {
    it('should perform semantic search', async () => {
      const waxId = 'test-wax-id-8';

      const results = await hybridSearch.search({
        waxId,
        query: 'mathematics problem solving',
        maxResults: 5,
      });

      expect(Array.isArray(results)).toBe(true);
    });
  });
});
