#!/usr/bin/env node
/**
 * WaxPrep - Webhook Router
 * 
 * Handles incoming WhatsApp webhooks:
 * - GET: challenge verification
 * - POST: message processing
 * 
 * Raw body is captured for signature verification (Stage 9).
 * Messages are normalized (Stage 10) and enqueued (Stage 6).
 */

import express from 'express';
import { randomUUID } from 'crypto';
import config from '../config/index.js';
import { logger, runWithContext } from '../observability/index.js';
import { enqueueStudentMessage } from './enqueue.js';
import { verifyWebhookSignature, isDuplicateMessage, validateWebhookPayload } from './security.js';

const router = express.Router();

/**
 * GET handler - challenge verification
 * Meta sends a GET request with challenge parameter
 */
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Webhook verified successfully');
    res.send(challenge);
  } else {
    logger.warn('Webhook verification failed');
    res.status(403).send('Forbidden');
  }
});

/**
 * POST handler - incoming messages
 * Returns 200 OK immediately after enqueuing
 */
router.post('/', async (req, res) => {
  const start = Date.now();

  const log = logger.child({ stage: 'middleware' });

  const rawBody = req.body instanceof Buffer ? req.body : req.body;
  
  let correlationId;
  try {
    correlationId = req.headers['x-correlation-id'] ?? randomUUID();
    
    await runWithContext({ correlationId, service: 'webhook' }, async () => {
      let log = logger.child({ correlationId, method: 'POST', path: '/webhook/whatsapp' });
      
      log.info({ bodyLength: rawBody.length }, 'Webhook POST received');

      // Verify signature
      const signatureHeader = req.headers['x-hub-signature-256'];
      if (!verifyWebhookSignature(rawBody, signatureHeader, config.WHATSAPP_APP_SECRET)) {
        log.warn('Signature verification failed');
        return res.status(401).json({ error: 'Invalid signature' });
      }

      // Parse payload
      let payload;
      try {
        payload = JSON.parse(rawBody.toString('utf-8'));
      } catch (err) {
        log.error({ err }, 'Invalid JSON in webhook payload');
        return res.status(400).json({ error: 'Invalid JSON' });
      }

      // Validate payload structure
      const validation = validateWebhookPayload(payload);
      if (!validation.valid) {
        log.warn({ error: validation.error }, 'Payload validation failed');
        return res.status(400).json({ error: validation.error });
      }

      // Check if this is a status update (not a message)
      if (payload.entry?.[0]?.changes?.[0]?.value?.statuses) {
        log.debug('Status event - not processing as message');
        return res.status(200).json({ status: 'success' });
      }

      // Extract message data
      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0];
      const messages = changes?.value?.messages;
      
      if (!messages || messages.length === 0) {
        log.warn('No messages in payload');
        return res.status(200).json({ status: 'success' });
      }

      // Process each message (typically just one)
      for (const message of messages) {
        const messageId = message.id;
        const from = message.from;
        const messageType = message.type;

        log = log.child({ messageId, from: from?.slice(0, 6) + '****', messageType });

        // Check for duplicate/replay (in-memory only; DB-level idempotency
        // is the durable guard via the external_id unique index).
        if (isDuplicateMessage(messageId)) {
          log.debug({ messageId }, 'Duplicate message - already processed');
          continue;
        }

        // Only process supported message types
        if (!['text', 'image', 'audio'].includes(messageType)) {
          log.warn({ messageType }, 'Unsupported message type - acknowledging but not processing');
          continue;
        }

        // Enqueue for processing. Pass correlationId + shared pool via opts
        // so the trace context is preserved end-to-end and no new pool is
        // created per webhook.
        try {
          const result = await enqueueStudentMessage(
            from, messageId, message,
            config.DATABASE_URL, config.REDIS_URL,
            config.QUEUE_DEBOUNCE_WINDOW_MS,
            log,
            { correlationId, pool: req.app.get('dbPool') }
          );

          if (!result.success) {
            // The message was NOT enqueued (rate-limited, or some other
            // soft failure). Log it clearly so the operator has visibility.
            // Return 200 to Meta so it doesn't retry — rate-limited messages
            // should not be retried. But the message IS persisted in the DB
            // (enqueue persists BEFORE checking queue success), so a recovery
            // sweeper can re-enqueue later if appropriate.
            log.warn(
              { reason: result.reason, retryAfter: result.retryAfter, messageId },
              'Message not enqueued for AI processing'
            );
          }
        } catch (enqueueErr) {
          // enqueue threw — the message may or may not be persisted.
          // Re-throw to the outer catch which returns 500 so Meta retries.
          log.error(
            { err: enqueueErr.message, code: enqueueErr.code, messageId },
            'enqueueStudentMessage threw'
          );
          throw enqueueErr;
        }
      }

      const duration = Date.now() - start;
      log.info({ duration: `${duration}ms` }, 'Webhook POST processed successfully');
      
      res.status(200).json({ status: 'success' });
    });
  } catch (err) {
    const log = logger.child({ correlationId, stage: 'catch' });
    
    // Primitive-only error logging (no complex objects)
    log.error(
      'ERROR: ' + (err.name || 'Error') + ' - ' + (err.message || 'Unknown error'),
      'Webhook POST handler error - simple'
    );
    
    // Also log execution state
    log.error({
      stage: 'error-handling',
      errorName: err.name || 'unknown',
      errorMessage: err.message ? err.message.substring(0, 100) : 'unknown',
      errorStackFirstLine: err.stack ? err.stack.split('\n')[0] : 'unknown',
    }, 'Webhook POST handler - error details');
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
