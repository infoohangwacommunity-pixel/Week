/**
 * Privacy and Consent Tests
 *
 * Tests for:
 * - AI intent detection (schema validation)
 * - Consent recording via the PL/pgSQL record_consent_event function
 * - Data deletion via the queue_data_deletion function
 * - Data export via the export_student_data function
 * - Privacy context block produced for the AI
 *
 * The mock pool simulates the row shapes that the PL/pgSQL functions return.
 */

import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  buildPrivacyContext,
  executeConsentAction,
  executeDeletionAction,
  executeExportAction,
  validateIntent,
} from '../../src/privacy/intentHandler.js';

const VALID_WAX_ID = '550e8400-e29b-41d4-a716-446655440000';

// Mock pool: returns the row shape each PL/pgSQL function would return.
function buildMockPool() {
  return {
    async query(text) {
      if (text.includes('record_consent_event')) {
        return { rows: [{ record_consent_event: 'consent-123' }] };
      }
      if (text.includes('queue_data_deletion')) {
        return { rows: [{ queue_data_deletion: 'deletion-123' }] };
      }
      if (text.includes('export_student_data')) {
        // export_student_data is RETURNS TABLE — flat columns, not nested.
        return {
          rows: [{ export_id: 'export-123', data_size_bytes: 1024 }],
        };
      }
      return { rows: [] };
    },
  };
}

describe('Privacy and Consent', () => {
  describe('Intent Schema Validation', () => {
    it('should validate valid consent intent', () => {
      const validIntent = {
        type: 'consent_given',
        waxId: VALID_WAX_ID,
        confidence: 0.95,
        context: 'Student said "yes, I agree to data collection"',
        aiReasoning: 'Student explicitly agreed after explanation',
        timestamp: new Date().toISOString(),
      };

      const result = validateIntent(validIntent);
      expect(result.type).toBe('consent_given');
      expect(result.confidence).toBe(0.95);
    });

    it('should reject invalid WaxID format', () => {
      const invalidIntent = {
        type: 'consent_given',
        waxId: 'invalid-wax-id',
        confidence: 0.95,
        aiReasoning: 'Test',
        timestamp: new Date().toISOString(),
      };

      expect(() => validateIntent(invalidIntent)).toThrow();
    });

    it('should reject confidence outside 0-1 range', () => {
      const invalidIntent = {
        type: 'consent_given',
        waxId: VALID_WAX_ID,
        confidence: 1.5,
        aiReasoning: 'Test',
        timestamp: new Date().toISOString(),
      };

      expect(() => validateIntent(invalidIntent)).toThrow();
    });
  });

  describe('Privacy Context Building', () => {
    it('should include consent state for new students', () => {
      const context = buildPrivacyContext({
        isNewStudent: true,
        hasConsent: false,
      });

      expect(context).toContain('new_student_no_consent');
      expect(context).toContain('consent');
    });

    it('should NOT include scripted YES/NO questions', () => {
      const context = buildPrivacyContext({
        isNewStudent: true,
        hasConsent: false,
      });

      expect(context).not.toContain('Type YES');
      expect(context).not.toContain('Type NO');
      expect(context).not.toContain('keyword');
    });

    it('should include rate limit context when exceeded', () => {
      const context = buildPrivacyContext({
        rateLimitExceeded: true,
        limitsPerMinute: 10,
        limitsPerDay: 200,
      });

      expect(context).toContain('rate_limit_exceeded');
      expect(context).not.toContain('scripted abuse');
    });
  });

  describe('Consent Recording', () => {
    it('should record consent with validation', async () => {
      const result = await executeConsentAction({
        pool: buildMockPool(),
        waxId: VALID_WAX_ID,
        status: 'granted',
        context: 'Student agreed after explanation',
        aiReasoning: 'Natural language consent detected',
      });

      expect(result.success).toBe(true);
      expect(result.waxId).toBe(VALID_WAX_ID);
      expect(result.status).toBe('granted');
      expect(result.consentId).toBe('consent-123');
    });

    it('should reject invalid WaxID format', async () => {
      await expect(
        executeConsentAction({
          pool: buildMockPool(),
          waxId: 'invalid-wax-id',
          status: 'granted',
          context: '',
          aiReasoning: 'Test',
        }),
      ).rejects.toThrow('Invalid WaxID format');
    });

    it('should record consent withdrawal', async () => {
      const result = await executeConsentAction({
        pool: buildMockPool(),
        waxId: VALID_WAX_ID,
        status: 'withdrawn',
        context: 'Student said "I want to remove my data"',
        aiReasoning: 'Withdrawal intent detected',
      });

      expect(result.status).toBe('withdrawn');
    });
  });

  describe('Data Deletion', () => {
    it('should execute deletion request and return the audit log ID', async () => {
      const result = await executeDeletionAction({
        pool: buildMockPool(),
        waxId: VALID_WAX_ID,
        requesterId: 'student',
      });

      expect(result.success).toBe(true);
      expect(result.auditLogId).toBe('deletion-123');
    });

    it('should reject invalid WaxID', async () => {
      await expect(
        executeDeletionAction({
          pool: buildMockPool(),
          waxId: 'invalid',
          requesterId: 'student',
        }),
      ).rejects.toThrow('Invalid WaxID format');
    });
  });

  describe('Data Export', () => {
    it('should execute export request and return the exportId and size', async () => {
      const result = await executeExportAction({
        pool: buildMockPool(),
        waxId: VALID_WAX_ID,
        format: 'json',
      });

      expect(result.success).toBe(true);
      expect(result.exportId).toBe('export-123');
      expect(result.dataSizeBytes).toBe(1024);
    });

    it('should reject invalid WaxID', async () => {
      await expect(
        executeExportAction({
          pool: buildMockPool(),
          waxId: 'invalid',
          format: 'json',
        }),
      ).rejects.toThrow('Invalid WaxID format');
    });
  });
});
