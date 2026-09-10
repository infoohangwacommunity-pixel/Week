/**
 * WaxPrep - Memory System Tests
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { StudentMemoryAccess } from '../../src/memory/StudentMemoryAccess.js';
import { MemoryWriter } from '../../src/memory/MemoryWriter.js';
import { MemoryRetriever } from '../../src/memory/MemoryRetriever.js';
import { FACT_CATEGORIES, CONFIDENCE_BOUNDS, PROVENANCE } from '../../src/memory/MemoryTaxonomy.js';
import { applyConfidenceTransition, getInitialConfidence } from '../../src/memory/ConfidenceEngine.js';

describe('Memory System - Stages 22-26', () => {
  describe('Confidence Engine', () => {
    it('should initialize confidence based on provenance', () => {
      expect(getInitialConfidence(PROVENANCE.STUDENT_STATED_DIRECT.value)).toBe(0.80);
      expect(getInitialConfidence(PROVENANCE.AI_INFERRED_FROM_BEHAVIOR.value)).toBe(0.45);
    });

    it('should apply confidence transitions correctly', () => {
      let newConf = applyConfidenceTransition(0.5, PROVENANCE.STUDENT_STATED_DIRECT.value, 'REINFORCE');
      expect(newConf).toBe(0.60);
      newConf = applyConfidenceTransition(0.90, PROVENANCE.STUDENT_STATED_DIRECT.value, 'REINFORCE');
      expect(newConf).toBe(0.95);
    });
  });

  describe('StudentMemoryAccess', () => {
    let memoryAccess;

    beforeEach(() => {
      memoryAccess = new StudentMemoryAccess('test-wax-id-123');
    });

    it('should require valid waxId', () => {
      expect(() => new StudentMemoryAccess()).toThrow('waxId is required');
    });

    it('should enforce WaxID isolation', () => {
      const access1 = new StudentMemoryAccess('wax-id-1');
      const access2 = new StudentMemoryAccess('wax-id-2');
      expect(access1.waxId).toBe('wax-id-1');
      expect(access2.waxId).toBe('wax-id-2');
    });
  });

  describe('MemoryWriter', () => {
    let writer;

    beforeEach(() => {
      writer = new MemoryWriter('test-wax-id-123');
    });

    it('should validate fact category', async () => {
      await expect(writer.writeFact({
        factKey: 'test_key',
        factCategory: 'invalid_category',
        factValue: {},
        displayText: 'Test',
        provenance: PROVENANCE.STUDENT_STATED_DIRECT.value,
      })).rejects.toThrow('Invalid fact category');
    });
  });

  describe('MemoryRetriever', () => {
    let retriever;

    beforeEach(() => {
      retriever = new MemoryRetriever('test-wax-id-123');
    });

    it('should format facts for context', () => {
      const facts = [
        { display_text: 'Student is preparing for WAEC', confidence: 0.85 },
        { display_text: 'Student is in SS2', confidence: 0.70 },
      ];
      const formatted = retriever.formatFactsForContext(facts);
      expect(formatted).toContain('Student Profile Memory');
      expect(formatted).toContain('WAEC');
    });
  });
});
