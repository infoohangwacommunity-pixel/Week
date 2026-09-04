#!/usr/bin/env node
/**
 * WaxPrep - WhatsApp Client
 * 
 * Handles outbound WhatsApp messages via the Meta Cloud API.
 * Implements response chunking, sequential delivery, and retry logic.
 */

import config from '../config/index.js';

/**
 * Send a WhatsApp message to a student
 * 
 * @param {string} phoneNumber - Student's phone number
 * @param {string} content - Message content (will be chunked if needed)
 * @param {object} trace - Trace context for logging
 * @returns {Promise<string[]>} - Array of sent message IDs
 */
export async function sendWhatsAppMessage(phoneNumber, content, trace) {
  const chunks = splitResponseIntoChunks(content);
  const sentMessageIds = [];

  for (const chunk of chunks) {
    // Send the chunk
    const messageId = await sendChunk(phoneNumber, chunk);
    sentMessageIds.push(messageId);

    // Add delay between chunks if configured
    if (chunks.indexOf(chunk) < chunks.length - 1) {
      await delay(config.RESPONSE_CHUNK_DELAY_MS || 500);
    }
  }

  return sentMessageIds;
}

/**
 * Split a response into chunks that fit within WhatsApp's limits
 * 
 * Splits on paragraph boundaries first, then sentence boundaries
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
      
      const sentences = paragraph.match(
        /[^.!?]+[.!?]+|[^.!?]+$/g
      ) || [paragraph];
      
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
 * Send a single chunk via WhatsApp API
 */
async function sendChunk(phoneNumber, content) {
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
    const error = await response.text();
    throw new Error(`WhatsApp API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.messages?.[0]?.id;
}

/**
 * Send typing indicator
 */
export async function sendTypingIndicator(phoneNumber, messageId) {
  if (!config.RESPONSE_TYPING_INDICATOR_ENABLED) {
    return;
  }

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
 * Delay for specified milliseconds
 */
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
