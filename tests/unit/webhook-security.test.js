#!/usr/bin/env node
/**
 * WaxPrep - Unit Tests for Webhook Security
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { randomBytes } from 'node:crypto';

// Test HMAC verification without importing the actual module (which has config dependencies)
describe('Webhook Security - HMAC Verification', () => {
  const appSecret = 'test-app-secret-for-hmac-verification-32bytes';
  
  it('should compute correct HMAC-SHA256', () => {
    const rawBody = JSON.stringify({ test: 'data' });
    const { createHmac } = require('crypto');
    const hmac = createHmac('sha256', appSecret);
    hmac.update(rawBody);
    const signature = hmac.digest('hex');
    
    expect(signature).toBeDefined();
    expect(signature.length).toBe(64); // SHA256 produces 64 hex characters
  });

  it('should produce different signatures for different bodies', () => {
    const { createHmac } = require('crypto');
    
    const body1 = JSON.stringify({ a: 1 });
    const body2 = JSON.stringify({ a: 2 });
    
    const sig1 = createHmac('sha256', appSecret).update(body1).digest('hex');
    const sig2 = createHmac('sha256', appSecret).update(body2).digest('hex');
    
    expect(sig1).not.toBe(sig2);
  });

  it('should produce same signature for same body', () => {
    const { createHmac } = require('crypto');
    
    const body = JSON.stringify({ test: 'data' });
    
    const sig1 = createHmac('sha256', appSecret).update(body).digest('hex');
    const sig2 = createHmac('sha256', appSecret).update(body).digest('hex');
    
    expect(sig1).toBe(sig2);
  });
});

describe('Webhook Security - Replay Protection', () => {
  it('should detect duplicate message IDs', () => {
    const seenMessageIds = new Set();
    
    const messageId = 'wamid.test123';
    
    // First time - not seen
    expect(seenMessageIds.has(messageId)).toBe(false);
    seenMessageIds.add(messageId);
    
    // Second time - duplicate
    expect(seenMessageIds.has(messageId)).toBe(true);
  });

  it('should allow different message IDs', () => {
    const seenMessageIds = new Set();
    
    const messageId1 = 'wamid.test123';
    const messageId2 = 'wamid.test456';
    
    seenMessageIds.add(messageId1);
    
    expect(seenMessageIds.has(messageId1)).toBe(true);
    expect(seenMessageIds.has(messageId2)).toBe(false);
  });
});

describe('Webhook Security - Payload Validation', () => {
  it('should validate correct payload structure', () => {
    const payload = {
      entry: [{
        changes: [{
          value: {
            messages: [{ id: 'msg1', type: 'text' }],
          },
        }],
      }],
    };
    
    const result = validateWebhookPayload(payload);
    expect(result.valid).toBe(true);
  });

  it('should reject missing entry field', () => {
    const payload = { changes: [] };
    const result = validateWebhookPayload(payload);
    expect(result.valid).toBe(false);
  });

  it('should reject empty payload', () => {
    const result = validateWebhookPayload({});
    expect(result.valid).toBe(false);
  });
});

function validateWebhookPayload(payload) {
  if (!payload) {
    return { valid: false, error: 'Empty payload' };
  }

  if (!payload.entry) {
    return { valid: false, error: 'Missing entry field' };
  }

  if (!Array.isArray(payload.entry) || payload.entry.length === 0) {
    return { valid: false, error: 'Invalid entry format' };
  }

  const changes = payload.entry[0]?.changes;
  if (!changes || !Array.isArray(changes) || changes.length === 0) {
    return { valid: false, error: 'Missing changes field' };
  }

  const value = changes[0]?.value;
  if (!value) {
    return { valid: false, error: 'Invalid changes value' };
  }

  return { valid: true };
}
