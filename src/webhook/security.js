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
 * Verify WhatsApp webhook signature.
 *
 * Uses HMAC-SHA256 over the raw request body bytes and a timing-safe
 * comparison so signature length mismatches (which would otherwise throw
 * RangeError out of `timingSafeEqual`) are rejected cleanly.
 *
 * @param {Buffer|string} rawBody - Raw request body bytes
 * @param {string} signatureHeader - X-Hub-Signature-256 header value (`sha256=...`)
 * @param {string} appSecret - Meta app secret
 * @returns {boolean}
 */
export function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  const log = logger.child({ func: 'verifyWebhookSignature' });

  if (!signatureHeader || typeof signatureHeader !== 'string' || !signatureHeader.startsWith('sha256=')) {
    log.warn('Signature header missing or invalid format');
    return false;
  }

  if (!appSecret || typeof appSecret !== 'string' || appSecret.length < 8) {
    log.error('App secret missing or too short');
    return false;
  }

  if (!rawBody) {
    log.warn('Empty raw body');
    return false;
  }

  const bodyBuffer = Buffer.isBuffer(rawBody)
    ? rawBody
    : Buffer.from(String(rawBody), 'utf-8');

  const expectedSignature = signatureHeader.slice('sha256='.length);

  // Compute HMAC-SHA256 over raw body bytes.
  const hmac = createHmac('sha256', appSecret);
  hmac.update(bodyBuffer);
  const computedSignature = hmac.digest('hex');

  // Timing-safe comparison. timingSafeEqual throws RangeError if buffers
  // differ in length — we must guard against that explicitly so a malformed
  // signature header doesn't crash the webhook.
  const computedBuffer = Buffer.from(computedSignature, 'hex');
  const expectedBuffer = Buffer.from(expectedSignature, 'hex');

  if (computedBuffer.length !== expectedBuffer.length) {
    log.warn(
      { computedLen: computedBuffer.length, expectedLen: expectedBuffer.length },
      'Signature length mismatch (expected 32 bytes for SHA-256)'
    );
    return false;
  }

  const result = timingSafeEqual(computedBuffer, expectedBuffer);

  if (!result) {
    log.warn('Signature mismatch');
  }
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

// NOTE: `checkRateLimit` was deleted in audit3. It was a dead stub that
// always returned false. Per-student rate limiting is handled by
// `webhook/rateLimiter.js` (invoked from `enqueue.js`).

/**
 * Generate a random nonce for replay protection
 * 
 * @returns {string}
 */
export function generateNonce() {
  return randomBytes(16).toString('hex');
}
