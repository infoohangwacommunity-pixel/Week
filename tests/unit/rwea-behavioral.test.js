/**
 * WaxPrep - RWEA Mastery Engine Behavioral Tests
 * 
 * These tests verify the RWEA algorithm computes correctly with known inputs.
 * They are behavioral tests, not just file existence checks.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MasteryEngine } from '../../src/learning/mastery/MasteryEngine.js';

// Mock database pool with configurable responses
class MockPool {
  constructor() {
    this.queries = [];
  }

  async query(text, params) {
    this.queries.push({ text, params });
    
    // Return mock observations based on query
    if (text.includes('learning_observations')) {
      // Return mock observations for RWEA computation
      return {
        rows: [
          {
            id: 'obs-1',
            wax_id: 'test-wax-id',
            concept_tag: 'test-concept',
            evidence_type: 'direct_response',
            correctness: 1.0,
            hint_level: 0,
            extraction_confidence: 0.9,
            observed_at: new Date().toISOString(),
          },
        ],
      };
    }
    
    return { rows: [] };
  }
}

describe('RWEA Mastery Engine - Behavioral Tests', () => {
  let pool;
  let engine;

  beforeEach(() => {
    pool = new MockPool();
    engine = new MasteryEngine(pool);
  });

  it('should compute mastery from consistent correct responses', async () => {
    const state = await engine.computeState('test-wax-id', 'test-concept');
    
    // With one correct response, mastery should be above baseline
    expect(state.mastery_estimate).toBeGreaterThan(0.100);
    expect(state.evidence_count).toBe(1);
    expect(state.success_signal).toBeGreaterThan(0);
    expect(state.failure_signal).toBe(0);
  });

  it('should clamp mastery_estimate to [0.05, 0.95]', async () => {
    // Mock many consistent correct responses
    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);
    
    // Override query to return many correct responses
    mockPool.query = async () => ({
      rows: Array(50).fill(null).map((_, i) => ({
        id: `obs-${i}`,
        wax_id: 'test-wax-id',
        concept_tag: 'test-concept',
        evidence_type: 'direct_response',
        correctness: 1.0,
        hint_level: 0,
        extraction_confidence: 0.95,
        observed_at: new Date(Date.now() - (49 - i) * 86400000).toISOString(),
      })),
    });
    
    const state = await mockEngine.computeState('test-wax-id', 'test-concept');
    
    // Mastery should be clamped to max 0.95
    expect(state.mastery_estimate).toBeLessThanOrEqual(0.95);
    expect(state.mastery_estimate).toBeGreaterThanOrEqual(0.05);
  });

  it('should reduce mastery over time with no new evidence', async () => {
    const oldDate = new Date(Date.now() - 60 * 86400000).toISOString(); // 60 days ago
    
    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);
    
    mockPool.query = async () => ({
      rows: [
        {
          id: 'obs-1',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 1.0,
          hint_level: 0,
          extraction_confidence: 0.9,
          observed_at: oldDate,
        },
      ],
    });
    
    const state = await mockEngine.computeState('test-wax-id', 'test-concept');
    
    // With 60-day decay, mastery should be significantly reduced
    expect(state.decay_factor_applied).toBeLessThan(0.5);
    // Mastery should be pulled down toward baseline
    expect(state.mastery_estimate).toBeLessThan(0.5);
  });

  it('should penalize hint-dependent responses', async () => {
    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);
    
    mockPool.query = async () => ({
      rows: [
        {
          id: 'obs-1',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 1.0,
          hint_level: 0, // No hints
          extraction_confidence: 0.9,
          observed_at: new Date().toISOString(),
        },
        {
          id: 'obs-2',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 1.0,
          hint_level: 3, // High hint dependency
          extraction_confidence: 0.9,
          observed_at: new Date().toISOString(),
        },
      ],
    });
    
    const state = await mockEngine.computeState('test-wax-id', 'test-concept');
    
    // Hint dependency should be calculated
    expect(state.hint_dependency).toBeGreaterThan(0);
    expect(state.hint_dependency).toBeLessThan(1.0);
  });

  it('should detect improving trend (requires 5+ observations for trend window)', async () => {
    const now = new Date();

    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);

    mockPool.query = async () => ({
      rows: [
        // Older observations with lower correctness (previous3 window)
        {
          id: 'obs-0',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.3,
          hint_level: 0,
          extraction_confidence: 0.8,
          observed_at: new Date(now.getTime() - 6 * 86400000).toISOString(),
        },
        {
          id: 'obs-1',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.4,
          hint_level: 0,
          extraction_confidence: 0.8,
          observed_at: new Date(now.getTime() - 5 * 86400000).toISOString(),
        },
        {
          id: 'obs-2',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.5,
          hint_level: 0,
          extraction_confidence: 0.8,
          observed_at: new Date(now.getTime() - 4 * 86400000).toISOString(),
        },
        // Recent observations with higher correctness (recent3 window)
        {
          id: 'obs-3',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.8,
          hint_level: 0,
          extraction_confidence: 0.9,
          observed_at: new Date(now.getTime() - 3 * 86400000).toISOString(),
        },
        {
          id: 'obs-4',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.9,
          hint_level: 0,
          extraction_confidence: 0.9,
          observed_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
        },
        {
          id: 'obs-5',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 1.0,
          hint_level: 0,
          extraction_confidence: 0.95,
          observed_at: new Date(now.getTime() - 1 * 86400000).toISOString(),
        },
      ],
    });

    const state = await mockEngine.computeState('test-wax-id', 'test-concept');

    expect(state.recent_trend).toBe('improving');
  });

  it('should detect declining trend (requires 5+ observations for trend window)', async () => {
    const now = new Date();

    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);

    mockPool.query = async () => ({
      rows: [
        // Older observations with high correctness (previous3 window)
        {
          id: 'obs-0',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 1.0,
          hint_level: 0,
          extraction_confidence: 0.9,
          observed_at: new Date(now.getTime() - 6 * 86400000).toISOString(),
        },
        {
          id: 'obs-1',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.9,
          hint_level: 0,
          extraction_confidence: 0.9,
          observed_at: new Date(now.getTime() - 5 * 86400000).toISOString(),
        },
        {
          id: 'obs-2',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.9,
          hint_level: 0,
          extraction_confidence: 0.85,
          observed_at: new Date(now.getTime() - 4 * 86400000).toISOString(),
        },
        // Recent observations with low correctness (recent3 window)
        {
          id: 'obs-3',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.4,
          hint_level: 0,
          extraction_confidence: 0.7,
          observed_at: new Date(now.getTime() - 3 * 86400000).toISOString(),
        },
        {
          id: 'obs-4',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.3,
          hint_level: 0,
          extraction_confidence: 0.7,
          observed_at: new Date(now.getTime() - 2 * 86400000).toISOString(),
        },
        {
          id: 'obs-5',
          wax_id: 'test-wax-id',
          concept_tag: 'test-concept',
          evidence_type: 'direct_response',
          correctness: 0.3,
          hint_level: 0,
          extraction_confidence: 0.7,
          observed_at: new Date(now.getTime() - 1 * 86400000).toISOString(),
        },
      ],
    });

    const state = await mockEngine.computeState('test-wax-id', 'test-concept');

    expect(state.recent_trend).toBe('declining');
  });

  it('should be deterministic - same inputs produce same outputs (modulo decay clock)', async () => {
    // Build observations with FIXED timestamps (not relative to Date.now())
    // so two computeState calls see identical decay math.
    const fixedNow = new Date('2025-01-15T12:00:00Z').getTime();
    const observations = Array(10).fill(null).map((_, i) => ({
      id: `obs-${i}`,
      wax_id: 'test-wax-id',
      concept_tag: 'test-concept',
      evidence_type: 'direct_response',
      correctness: i % 3 === 0 ? 0.8 : (i % 3 === 1 ? 1.0 : 0.6),
      hint_level: i % 4,
      extraction_confidence: 0.85,
      observed_at: new Date(fixedNow - (9 - i) * 86400000).toISOString(),
    }));

    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);

    // Stub Date.now in MasteryEngine's temporalDecayFactor calc by stubbing
    // the global Date constructor for the duration of this test.
    const realDateNow = Date.now;
    Date.now = () => fixedNow + 86400000; // "now" = day after last observation

    try {
      mockPool.query = async () => ({ rows: observations });
      const state1 = await mockEngine.computeState('test-wax-id', 'test-concept');
      mockPool.query = async () => ({ rows: observations });
      const state2 = await mockEngine.computeState('test-wax-id', 'test-concept');

      expect(state1.mastery_estimate).toBe(state2.mastery_estimate);
      expect(state1.success_signal).toBe(state2.success_signal);
      expect(state1.failure_signal).toBe(state2.failure_signal);
      expect(state1.recent_trend).toBe(state2.recent_trend);
    } finally {
      Date.now = realDateNow;
    }
  });

  it('should return default state when no observations exist', async () => {
    const mockPool = new MockPool();
    const mockEngine = new MasteryEngine(mockPool);
    
    // Override to return empty observations
    mockPool.query = async () => ({ rows: [] });
    
    const state = await mockEngine.computeState('test-wax-id', 'test-concept');
    
    expect(state.mastery_estimate).toBe(0.100); // Baseline
    expect(state.evidence_count).toBe(0);
    expect(state.recent_trend).toBe('insufficient_data');
  });
});
