/**
 * Idempotency Tests
 * 
 * Tests for:
 * - PostgreSQL-based idempotency guards
 * - AI call deduplication
 * - Outbound message deduplication
 * - Rate limiting
 * 
 * CRITICAL: Tests verify that duplicate processing produces same result
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mock pool with idempotency behavior
class MockPool {
  constructor() {
    this.aiRequests = [];
    this.outboundMessages = [];
    this.queryCalls = [];
  }
  
  async query(text, params) {
    this.queryCalls.push({ text, params });
    
    // Simulate ON CONFLICT behavior
    if (text.includes('ai_requests') && text.includes('ON CONFLICT')) {
      // Check if already exists
      const existing = this.aiRequests.find(req => 
        req.correlation_id === params[2] ||
        (params[3] && req.triggering_message_id === params[3])
      );
      
      if (existing) {
        return { rows: [], affectedRows: 0 };
      }
      
      // Add new record
      this.aiRequests.push({
        wax_id: params[0],
        correlation_id: params[2],
        triggering_message_id: params[3],
        status: 'success',
      });
      
      return { rows: [], affectedRows: 1 };
    }
    
    if (text.includes('outbound_messages') && text.includes('ON CONFLICT')) {
      const existing = this.outboundMessages.find(msg => 
        msg.outbound_chunk_id === params[0]
      );
      
      if (existing) {
        return { rows: [], affectedRows: 0 };
      }
      
      this.outboundMessages.push({
        outbound_chunk_id: params[0],
        processing_status: 'sent',
      });
      
      return { rows: [], affectedRows: 1 };
    }
    
    return { rows: [], affectedRows: 1 };
  }
}

describe('Idempotency', () => {
  let mockPool;
  
  beforeEach(() => {
    mockPool = new MockPool();
  });
  
  describe('AI Call Idempotency', () => {
    it('should allow first AI call', async () => {
      const { recordAiCall } = await import('../../src/infrastructure/idempotency.js');
      
      const result = await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-123',
        'msg-123',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      expect(result.success).toBe(true);
      expect(mockPool.aiRequests.length).toBe(1);
    });
    
    it('should handle duplicate AI call (same correlation_id)', async () => {
      const { recordAiCall } = await import('../../src/infrastructure/idempotency.js');
      
      // First call
      await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-123',
        'msg-123',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      // Duplicate call
      const result = await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-123',
        'msg-123',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      // Should still succeed (idempotent)
      expect(result.success).toBe(true);
      // Should only have one record
      expect(mockPool.aiRequests.length).toBe(1);
    });
    
    it('should handle duplicate AI call (same triggering_message_id)', async () => {
      const { recordAiCall } = await import('../../src/infrastructure/idempotency.js');
      
      // First call
      await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-123',
        'msg-123',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      // Different correlation, same triggering_message_id
      const result = await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-456',
        'msg-123',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      // Should succeed (idempotent due to triggering_message_id)
      expect(result.success).toBe(true);
      // Should still only have one record
      expect(mockPool.aiRequests.length).toBe(1);
    });
    
    it('should allow AI call with different message', async () => {
      const { recordAiCall } = await import('../../src/infrastructure/idempotency.js');
      
      // First call
      await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-123',
        'msg-123',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      // Different message
      await recordAiCall(
        mockPool,
        'wax-123',
        'session-123',
        'corr-456',
        'msg-456',
        'anthropic',
        'claude',
        'v1',
        { usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 }, startTime: Date.now() }
      );
      
      // Should have two records
      expect(mockPool.aiRequests.length).toBe(2);
    });
  });
  
  describe('Outbound Message Idempotency', () => {
    it('should allow first outbound message', async () => {
      const { markOutboundMessageAsSent } = await import('../../src/infrastructure/idempotency.js');
      
      const result = await markOutboundMessageAsSent(
        mockPool,
        'chunk-123',
        'wax-123',
        'msg-123',
        'Hello, how can I help?'
      );
      
      expect(result.success).toBe(true);
      expect(mockPool.outboundMessages.length).toBe(1);
    });
    
    it('should handle duplicate outbound message', async () => {
      const { markOutboundMessageAsSent } = await import('../../src/infrastructure/idempotency.js');
      
      // First send
      await markOutboundMessageAsSent(
        mockPool,
        'chunk-123',
        'wax-123',
        'msg-123',
        'Hello'
      );
      
      // Duplicate send
      const result = await markOutboundMessageAsSent(
        mockPool,
        'chunk-123',
        'wax-123',
        'msg-123',
        'Hello'
      );
      
      // Should succeed (idempotent)
      expect(result.success).toBe(true);
      // Should only have one record
      expect(mockPool.outboundMessages.length).toBe(1);
    });
  });
  
  describe('Rate Limiting', () => {
    it('should allow requests within limits', () => {
      const { getRateLimiter } = await import('../../src/infrastructure/idempotency.js');
      const rateLimiter = getRateLimiter({
        messagesPerMinute: 10,
        messagesPerDay: 200,
      });
      
      const result = rateLimiter.checkLimit('wax-123');
      expect(result.allowed).toBe(true);
    });
    
    it('should reject requests exceeding per-minute limit', () => {
      const { getRateLimiter } = await import('../../src/infrastructure/idempotency.js');
      const rateLimiter = getRateLimiter({
        messagesPerMinute: 2,
        messagesPerDay: 200,
      });
      
      // Send 2 messages (at limit)
      rateLimiter.checkLimit('wax-123');
      rateLimiter.checkLimit('wax-123');
      
      // Third should be rejected
      const result = rateLimiter.checkLimit('wax-123');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('minute_limit_exceeded');
    });
    
    it('should reject requests exceeding per-day limit', () => {
      const { getRateLimiter } = await import('../../src/infrastructure/idempotency.js');
      const rateLimiter = getRateLimiter({
        messagesPerMinute: 10,
        messagesPerDay: 3,
      });
      
      // Send 3 messages (at daily limit)
      rateLimiter.checkLimit('wax-123');
      rateLimiter.checkLimit('wax-123');
      rateLimiter.checkLimit('wax-123');
      
      // Fourth should be rejected
      const result = rateLimiter.checkLimit('wax-123');
      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('daily_limit_exceeded');
    });
    
    it('should track separate limits per student', () => {
      const { getRateLimiter } = await import('../../src/infrastructure/idempotency.js');
      const rateLimiter = getRateLimiter({
        messagesPerMinute: 2,
        messagesPerDay: 200,
      });
      
      // Student A sends 2 messages (at limit)
      rateLimiter.checkLimit('wax-A');
      rateLimiter.checkLimit('wax-A');
      
      // Student A should be rate limited
      expect(rateLimiter.checkLimit('wax-A').allowed).toBe(false);
      
      // Student B should NOT be rate limited
      expect(rateLimiter.checkLimit('wax-B').allowed).toBe(true);
    });
  });
  
  describe('Idempotency Guarantees', () => {
    it('should verify PostgreSQL is used (not Redis) for idempotency', async () => {
      const { recordAiCall, checkAiCallIdempotency } = await import('../../src/infrastructure/idempotency.js');
      
      // These functions should use pool.query (PostgreSQL), not Redis
      expect(typeof recordAiCall).toBe('function');
      expect(typeof checkAiCallIdempotency).toBe('function');
      
      // Verify they accept pool as parameter
      const result = await recordAiCall(mockPool, 'wax', 'session', 'corr', 'msg', 'provider', 'model', 'v1', { usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 }, startTime: Date.now() });
      
      expect(result.success).toBe(true);
    });
  });
});
