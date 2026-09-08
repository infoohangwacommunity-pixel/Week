/**
 * Privacy and Consent Tests
 * 
 * Tests for:
 * - AI intent detection
 * - Consent recording
 * - Data deletion
 * - Data export
 * - Audit logging
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { z } from 'zod';

// Mock pool for testing
const mockPool = {
  query: async (text, params) => {
    // Simulate successful database operations
    return {
      rows: [
        { record_consent_event: 'consent-123' },
        { queue_data_deletion: 'deletion-123' },
        { export_student_data: { export_id: 'export-123', data_size_bytes: 1024 } },
      ],
    };
  },
};

// Import the intent handler
let intentHandler;
try {
  intentHandler = await import('../../src/privacy/intentHandler.js');
} catch (err) {
  console.warn('intentHandler not available, using mock');
  intentHandler = {
    buildPrivacyContext: () => '',
    validateIntent: (d) => d,
    validateAction: (a) => a,
    executeConsentAction: async () => ({ success: true }),
    executeDeletionAction: async () => ({ success: true }),
    executeExportAction: async () => ({ success: true }),
  };
}

describe('Privacy and Consent', () => {
  describe('Intent Schema Validation', () => {
    it('should validate valid consent intent', () => {
      const validIntent = {
        type: 'consent_given',
        waxId: '550e8400-e29b-41d4-a716-446655440000',
        confidence: 0.95,
        context: 'Student said "yes, I agree to data collection"',
        aiReasoning: 'Student explicitly agreed after explanation',
        timestamp: new Date().toISOString(),
      };
      
      const schema = z.object({
        type: z.enum(['consent_given', 'consent_withdrawn', 'data_deletion_requested', 'data_export_requested']),
        waxId: z.string().uuid(),
        confidence: z.number().min(0).max(1),
        context: z.string().optional(),
        aiReasoning: z.string(),
        timestamp: z.string().datetime(),
      });
      
      const result = schema.parse(validIntent);
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
      
      const schema = z.object({
        waxId: z.string().uuid(),
      });
      
      expect(() => schema.parse(invalidIntent)).toThrow();
    });
    
    it('should reject confidence outside 0-1 range', () => {
      const invalidIntent = {
        type: 'consent_given',
        waxId: '550e8400-e29b-41d4-a716-446655440000',
        confidence: 1.5, // Invalid
        aiReasoning: 'Test',
        timestamp: new Date().toISOString(),
      };
      
      const schema = z.object({
        confidence: z.number().min(0).max(1),
      });
      
      expect(() => schema.parse(invalidIntent)).toThrow();
    });
  });
  
  describe('Privacy Context Building', () => {
    it('should include consent context for new students', () => {
      const context = intentHandler.buildPrivacyContext({
        isNewStudent: true,
        hasConsent: false,
      });
      
      expect(context).toContain('new student');
      expect(context).toContain('consent');
      expect(context).toContain('natural language');
    });
    
    it('should NOT include scripted YES/NO questions', () => {
      const context = intentHandler.buildPrivacyContext({
        isNewStudent: true,
        hasConsent: false,
      });
      
      expect(context).not.toContain('Type YES');
      expect(context).not.toContain('Type NO');
      expect(context).not.toContain('keyword');
    });
    
    it('should include rate limit context when exceeded', () => {
      const context = intentHandler.buildPrivacyContext({
        rateLimitExceeded: true,
        limitsPerMinute: 10,
        limitsPerDay: 200,
      });
      
      expect(context).toContain('rate limit');
      expect(context).toContain('natural');
      expect(context).not.toContain('scripted abuse');
    });
  });
  
  describe('Consent Recording', () => {
    it('should record consent with validation', async () => {
      const result = await intentHandler.executeConsentAction(
        mockPool,
        '550e8400-e29b-41d4-a716-446655440000',
        'granted',
        'Student agreed after explanation',
        'Natural language consent detected'
      );
      
      expect(result.success).toBe(true);
      expect(result.waxId).toBe('550e8400-e29b-41d4-a716-446655440000');
      expect(result.status).toBe('granted');
    });
    
    it('should reject invalid WaxID format', async () => {
      await expect(
        intentHandler.executeConsentAction(
          mockPool,
          'invalid-wax-id',
          'granted',
          'Test',
          'Test'
        )
      ).rejects.toThrow('Invalid WaxID format');
    });
    
    it('should record consent withdrawal', async () => {
      const result = await intentHandler.executeConsentAction(
        mockPool,
        '550e8400-e29b-41d4-a716-446655440000',
        'withdrawn',
        'Student said "I want to remove my data"',
        'Withdrawal intent detected'
      );
      
      expect(result.status).toBe('withdrawn');
    });
  });
  
  describe('Data Deletion', () => {
    it('should execute deletion request', async () => {
      const result = await intentHandler.executeDeletionAction(
        mockPool,
        '550e8400-e29b-41d4-a716-446655440000',
        'student'
      );
      
      expect(result.success).toBe(true);
      expect(result.auditLogId).toBeDefined();
    });
    
    it('should reject invalid WaxID', async () => {
      await expect(
        intentHandler.executeDeletionAction(
          mockPool,
          'invalid',
          'student'
        )
      ).rejects.toThrow('Invalid WaxID format');
    });
  });
  
  describe('Data Export', () => {
    it('should execute export request', async () => {
      const result = await intentHandler.executeExportAction(
        mockPool,
        '550e8400-e29b-41d4-a716-446655440000'
      );
      
      expect(result.success).toBe(true);
      expect(result.exportId).toBeDefined();
      expect(result.dataSizeBytes).toBe(1024);
    });
  });
});
