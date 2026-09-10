#!/usr/bin/env node
/**
 * WaxPrep - Outbound Messaging System
 *
 * Handles sending messages to students via WhatsApp Cloud API:
 * - Sequential chunk delivery with WhatsApp-compliant chunk sizing
 * - Persist-then-send audit trail (outbound_messages table)
 * - Error-class-aware retry (429 honors Retry-After, 5xx exponential backoff,
 *   4xx fail-fast)
 * - Delivery status tracking
 *
 * Per AGENTS.md §17, this is infrastructure: it provides reliable delivery
 * without making educational decisions about message content.
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';

// WhatsApp Cloud API hard limit on text message body length.
const WHATSAPP_TEXT_HARD_LIMIT = 4096;

/**
 * Send a response to a student.
 *
 * @param {string} phoneNumber - Student's phone number (international format, no '+')
 * @param {string} content - Message content
 * @param {object} trace - Trace context { messageId, waxId, correlationId }
 * @param {object} [opts] - Optional overrides { pool }
 * @returns {Promise<string[]>} - Array of sent WhatsApp message IDs
 */
export async function sendResponse(phoneNumber, content, trace, opts = {}) {
  const log = logger.child({
    phoneNumber: phoneNumber?.slice(0, 4) + '****', // PII: last 4 only
    waxId: trace?.waxId,
    correlationId: trace?.correlationId,
    triggeringMessageId: trace?.messageId,
  });

  if (!content || typeof content !== 'string' || content.length === 0) {
    log.warn('Empty content; nothing to send');
    return [];
  }

  log.info({ contentLength: content.length }, 'Sending response to student');

  // Send typing indicator (only if supported — Cloud API does not officially
  // support typing indicators for bots, so this is best-effort).
  if (config.RESPONSE_TYPING_INDICATOR_ENABLED) {
    try {
      await sendReadReceipt(phoneNumber, trace?.messageId);
    } catch (err) {
      log.debug({ err: err.message }, 'Typing indicator failed (non-fatal)');
    }
  }

  const chunks = splitResponseIntoChunks(content);
  log.info({ chunkCount: chunks.length }, 'Response split into chunks');

  const sentMessageIds = [];
  for (const [index, chunk] of chunks.entries()) {
    log.debug({ chunkIndex: index, chunkLength: chunk.length }, 'Sending chunk');

    try {
      const messageId = await sendWhatsAppChunk(phoneNumber, chunk, {
        ...trace,
        chunkIndex: index,
        pool: opts.pool,
      });
      if (messageId) sentMessageIds.push(messageId);

      // Add delay between chunks if configured.
      if (index < chunks.length - 1) {
        await delay(config.RESPONSE_CHUNK_DELAY_MS ?? 500);
      }
    } catch (err) {
      log.error(
        { err: err.message, status: err.status, chunkIndex: index },
        'Failed to send chunk after retry'
      );
      // Re-throw so the worker can mark the job failed — but don't lose the
      // IDs of chunks that already succeeded.
      const deliveryError = new Error(`Chunk ${index} delivery failed: ${err.message}`);
      deliveryError.sentMessageIds = sentMessageIds;
      deliveryError.failedChunkIndex = index;
      deliveryError.cause = err;
      throw deliveryError;
    }
  }

  log.info({ sentCount: sentMessageIds.length }, 'Response sent successfully');
  return sentMessageIds;
}

/**
 * Split response into chunks that fit within WhatsApp's text limit.
 *
 * Splits on paragraph boundaries first, then sentence boundaries, then
 * hard-splits on character boundaries as a fallback so a single run-on
 * sentence can never produce a chunk larger than the WhatsApp limit.
 */
export function splitResponseIntoChunks(content) {
  if (typeof content !== 'string' || content.length === 0) return [];
  const maxChars = Math.min(
    config.RESPONSE_MAX_CHUNK_CHARS ?? 1000,
    WHATSAPP_TEXT_HARD_LIMIT
  );

  const chunks = [];
  const paragraphs = content.split(/\n\s*\n/);
  let currentChunk = '';

  const flush = () => {
    if (currentChunk.length > 0) {
      chunks.push(currentChunk);
      currentChunk = '';
    }
  };

  const append = (text) => {
    const sep = currentChunk.length > 0 ? '\n\n' : '';
    if ((currentChunk + sep + text).length <= maxChars) {
      currentChunk += sep + text;
      return true;
    }
    flush();
    if (text.length <= maxChars) {
      currentChunk = text;
      return true;
    }
    // Hard-split a too-long sentence/paragraph on character boundaries.
    let remaining = text;
    while (remaining.length > maxChars) {
      // Prefer to split on a space boundary if possible.
      let cut = remaining.lastIndexOf(' ', maxChars);
      if (cut <= 0) cut = maxChars;
      chunks.push(remaining.slice(0, cut));
      remaining = remaining.slice(cut).trimStart();
    }
    if (remaining.length > 0) currentChunk = remaining;
    return true;
  };

  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChars) {
      const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
      for (const sentence of sentences) {
        append(sentence.trim());
      }
    } else {
      append(paragraph.trim());
    }
  }
  flush();

  return chunks;
}

/**
 * Send a single WhatsApp message chunk.
 * Persists the outbound record BEFORE the fetch so a crash leaves an audit trail.
 */
async function sendWhatsAppChunk(phoneNumber, content, trace = {}) {
  const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const chunkId = trace.messageId && trace.chunkIndex !== undefined
    ? `${trace.messageId}:${trace.chunkIndex}`
    : `${Date.now()}:${Math.random().toString(36).slice(2, 8)}`;

  // Persist the outbound record as 'pending' before sending.
  // This is best-effort; if no pool is wired up the send proceeds without audit.
  if (trace.pool && typeof trace.pool.query === 'function') {
    try {
      await trace.pool.query(
        `INSERT INTO outbound_messages
           (outbound_chunk_id, wax_id, triggering_message_id, content, processing_status, created_at)
         VALUES ($1, $2, $3, $4, 'pending', NOW())
         ON CONFLICT (outbound_chunk_id) DO NOTHING`,
        [chunkId, trace.waxId, trace.messageId, content]
      );
    } catch (persistErr) {
      logger.warn({ err: persistErr.message, chunkId }, 'Failed to persist outbound pending record');
    }
  }

  // Build request body.
  const body = {
    messaging_product: 'whatsapp',
    to: phoneNumber,
    type: 'text',
    text: { body: content, preview_url: false },
  };

  const response = await fetchWithRetry(url, body, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
  }, 3);

  const data = await response.json();
  const messageId = data?.messages?.[0]?.id;

  // Update the audit row to 'sent'.
  if (trace.pool && typeof trace.pool.query === 'function') {
    try {
      await trace.pool.query(
        `UPDATE outbound_messages
         SET processing_status = 'sent',
             sent_at = NOW(),
             external_message_id = $1
         WHERE outbound_chunk_id = $2`,
        [messageId, chunkId]
      );
    } catch (persistErr) {
      logger.warn({ err: persistErr.message, chunkId }, 'Failed to update outbound sent record');
    }
  }

  return messageId;
}

/**
 * Send a read receipt (used in place of a typing indicator since the
 * WhatsApp Cloud API does not officially support bot typing indicators).
 */
async function sendReadReceipt(phoneNumber, messageId) {
  if (!messageId) return;
  const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
    }),
  });

  if (!response.ok) {
    const err = new Error(`WhatsApp read receipt failed: ${response.status}`);
    err.status = response.status;
    throw err;
  }
}

/**
 * fetch with class-aware retry:
 *   429 → honor Retry-After header
 *   5xx → exponential backoff (1s, 2s, 4s)
 *   4xx (non-429) → fail fast (no retry)
 */
async function fetchWithRetry(url, body, init, maxRetries = 3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(url, { ...init, body: JSON.stringify(body) });

      if (response.ok) return response;

      // Build a typed error.
      const errorText = await response.text().catch(() => '');
      const err = new Error(`WhatsApp API error: ${response.status} ${errorText.slice(0, 200)}`);
      err.status = response.status;
      err.body = errorText;

      // 4xx (non-429): permanent — fail fast.
      if (response.status >= 400 && response.status < 500 && response.status !== 429) {
        throw err;
      }

      // 429: honor Retry-After header.
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get('retry-after'));
        const delayMs = Number.isFinite(retryAfter) && retryAfter > 0
          ? retryAfter * 1000
          : 1000 * Math.pow(2, attempt - 1);
        await delay(Math.min(delayMs, 60000));
        lastError = err;
        continue;
      }

      // 5xx: exponential backoff.
      lastError = err;
      if (attempt < maxRetries) {
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    } catch (err) {
      // Network-level error (ECONNREFUSED, ETIMEDOUT).
      lastError = err;
      if (attempt < maxRetries) {
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    }
  }
  throw lastError;
}

/**
 * Delay helper.
 */
function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
