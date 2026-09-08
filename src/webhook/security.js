#!/usr/bin/env node
/**
 * WaxPrep - Webhook Security
 * 
 * Implements complete webhook security:
 * - HMAC-SHA256 signature verification
 * - Timing-safe comparison
 * - Replay attack mitigation
 * - Request validation
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomBytes } from 'node:crypto';
import { logger } from '../observability/index.js';
import { LRUCache } from 'lru-cache';

/**
 * Cache for replay protection (message IDs seen in last 5 minutes)
 */
const seenMessageIds = new LRUCache({
  max: 10000,
  ttl: 300000, // 5 minutes
});

/**
 * Verify WhatsApp webhook signature
 * 
 * @param {string} rawBody - Raw request body bytes
 * @param {string} signatureHeader - X-Hub-Signature-256 header value
 * @param {string} appSecret - Meta app secret
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  const log = logger.child({ func: 'verifyWebhookSignature' });
  
  log.info({
    'rawBody.type': typeof rawBody,
    'rawBody.isBuffer': Buffer.isBuffer(rawBody),
    'rawBody.constructor': rawBody?.constructor?.name,
    'signatureHeader.exists': !!signatureHeader,
    'signatureHeader.startsWith': signatureHeader?.startsWith?.('sha256='),
    'appSecret.length': appSecret?.length,
  }, 'Signature verification - input types');
  
  if (!signatureHeader?.startsWith('sha256=')) {
    log.warn('Signature header missing or invalid format');
    return false;
  }

  const expectedSignature = signatureHeader.slice('sha256='.length);
  
  // Compute HMAC-SHA256 on raw body bytes
  const hmac = createHmac('sha256', appSecret);
  hmac.update(rawBody);
  const computedSignature = hmac.digest('hex');

  // Timing-safe comparison to prevent timing attacks
  const computedBuffer = Buffer.from(computedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  const result = timingSafeEqual(computedBuffer, expectedBuffer);
  
  log.info({ result }, 'Signature verification - result');
  return result;
}

/**
 * Check if message ID has been seen (replay protection)
 * 
 * @param {string} messageId - WhatsApp message ID
 * @returns {boolean} - true if duplicate (replay detected)
 */
export function isDuplicateMessage(messageId) {
  if (seenMessageIds.has(messageId)) {
    return true;
  }
  seenMessageIds.set(messageId, true);
  return false;
}

/**
 * Validate webhook payload structure
 * 
 * @param {object} payload - Parsed webhook payload
 * @returns {{valid: boolean, error?: string}}
 */
export function validateWebhookPayload(payload) {
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

/**
 * Check for rate limiting (basic implementation)
 * Track requests per IP in production
 * 
 * @param {string} ip - Client IP address
 * @param {object} rateLimiter - Rate limit configuration
 * @returns {boolean} - true if rate limited
 */
export function checkRateLimit(ip, rateLimiter) {
  // Placeholder for production rate limiting
  // In production, use Redis or similar for distributed rate limiting
  return false;
}

/**
 * Generate a random nonce for replay protection
 * 
 * @returns {string}
 */
export function generateNonce() {
  return randomBytes(16).toString('hex');
}
