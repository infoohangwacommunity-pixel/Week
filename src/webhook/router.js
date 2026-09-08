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
  
  // DEBUG: Log raw body state
  const log = logger.child({ stage: 'middleware' });
  log.info({
    'req.body.type': typeof req.body,
    'req.body.constructor': req.body?.constructor?.name,
    'req.body.isBuffer': Buffer.isBuffer(req.body),
    'req.body.keys': req.body && typeof req.body === 'object' ? Object.keys(req.body).slice(0, 5) : null,
    'req.body.length': req.body?.length,
  }, 'POST handler - raw body state after middleware');
  
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
        
        log = log.child({ messageId, from, messageType });
        
        // Check for duplicate/replay
        if (isDuplicateMessage(messageId)) {
          log.debug({ messageId }, 'Duplicate message - already processed');
          continue;
        }

        // Only process supported message types
        if (!['text', 'image', 'audio'].includes(messageType)) {
          log.warn({ messageType }, 'Unsupported message type - acknowledging but not processing');
          continue;
        }

        // Enqueue for processing
        await enqueueStudentMessage(from, messageId, message, config.DATABASE_URL, config.REDIS_URL, config.QUEUE_DEBOUNCE_WINDOW_MS, logger);
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
