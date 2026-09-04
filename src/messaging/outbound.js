#!/usr/bin/env node
/**
 * WaxPrep - Outbound Messaging System
 * 
 * Handles sending messages to students via WhatsApp:
 * - Sequential chunk delivery
 * - Typing indicators
 * - Retry logic
 * - Delivery status tracking
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { verifyWebhookSignature } from '../webhook/security.js';

/**
 * Send a response to a student
 * 
 * @param {string} phoneNumber - Student's phone number
 * @param {string} content - Message content
 * @param {object} trace - Trace context
 * @returns {Promise<string[]>} - Array of sent message IDs
 */
export async function sendResponse(phoneNumber, content, trace) {
  const log = logger.child({ phoneNumber, ...trace });
  
  log.info({ contentLength: content.length }, 'Sending response to student');

  // Send typing indicator
  if (config.RESPONSE_TYPING_INDICATOR_ENABLED) {
    await sendTypingIndicator(phoneNumber, trace.messageId);
  }

  // Split into chunks
  const chunks = splitResponseIntoChunks(content);
  log.info({ chunkCount: chunks.length }, 'Response split into chunks');

  // Send chunks sequentially
  const sentMessageIds = [];
  for (const [index, chunk] of chunks.entries()) {
    log.debug({ chunkIndex: index, chunkLength: chunk.length }, 'Sending chunk');
    
    try {
      const messageId = await sendWhatsAppChunk(phoneNumber, chunk);
      sentMessageIds.push(messageId);
      
      // Add delay between chunks if configured
      if (index < chunks.length - 1) {
        await delay(config.RESPONSE_CHUNK_DELAY_MS || 500);
      }
    } catch (err) {
      log.error({ err, chunkIndex: index }, 'Failed to send chunk');
      // Retry the chunk
      const retryCount = await retryChunk(phoneNumber, chunk, trace, logger);
      if (retryCount > 0) {
        sentMessageIds.push(retryCount);
      }
      throw err;
    }
  }

  log.info({ sentCount: sentMessageIds.length }, 'Response sent successfully');
  return sentMessageIds;
}

/**
 * Split response into chunks that fit within WhatsApp's limits
 */
export function splitResponseIntoChunks(content) {
  const maxChars = config.RESPONSE_MAX_CHUNK_CHARS || 1000;
  const chunks = [];
  
  // Split on paragraph boundaries first
  const paragraphs = content.split(/\n\s*\n/);
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    // If a single paragraph exceeds the limit, split on sentences
    if (paragraph.length > maxChars) {
      if (currentChunk) {
        chunks.push(currentChunk);
        currentChunk = '';
      }
      
      const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
      
      for (const sentence of sentences) {
        if ((currentChunk + sentence).length <= maxChars) {
          currentChunk += (currentChunk ? '\n\n' : '') + sentence;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = sentence;
        }
      }
    } else {
      // Paragraph fits within limit
      if ((currentChunk + paragraph).length <= maxChars) {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      } else {
        if (currentChunk) {
          chunks.push(currentChunk);
        }
        currentChunk = paragraph;
      }
    }
  }
  
  if (currentChunk) {
    chunks.push(currentChunk);
  }
  
  return chunks.length > 0 ? chunks : [content];
}

/**
 * Send a single WhatsApp message chunk
 */
async function sendWhatsAppChunk(phoneNumber, content) {
  const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      type: 'text',
      text: { body: content },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    const error = new Error(`WhatsApp API error: ${response.status} ${errorText}`);
    error.status = response.status;
    error.body = errorText;
    throw error;
  }

  const data = await response.json();
  return data.messages?.[0]?.id;
}

/**
 * Send typing indicator
 */
async function sendTypingIndicator(phoneNumber, messageId) {
  const url = `${config.WHATSAPP_API_BASE_URL}/${config.WHATSAPP_API_VERSION}/${config.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${config.WHATSAPP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to: phoneNumber,
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    }),
  });
}

/**
 * Retry sending a failed chunk
 */
async function retryChunk(phoneNumber, content, trace, logger, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.info({ attempt, ...trace }, 'Retrying chunk');
      const messageId = await sendWhatsAppChunk(phoneNumber, content);
      return messageId;
    } catch (err) {
      lastError = err;
      logger.warn({ attempt, error: err.message, ...trace }, `Retry attempt ${attempt} failed`);
      
      if (attempt < maxRetries) {
        // Exponential backoff
        await delay(1000 * Math.pow(2, attempt - 1));
      }
    }
  }
  
  logger.error({ ...trace }, 'All retries exhausted');
  throw lastError;
}

/**
 * Delay for specified milliseconds
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
