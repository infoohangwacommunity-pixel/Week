#!/usr/bin/env node
/**
 * WaxPrep - Message Normalization
 * 
 * Converts incoming WhatsApp messages into a canonical internal format.
 * Handles all message types (text, image, audio, video, document, location).
 * Preserves original metadata for provenance.
 */

/**
 * Normalize an incoming WhatsApp message to internal format
 * 
 * @param {object} message - Raw WhatsApp message from webhook
 * @param {string} phoneNumber - Student's phone number
 * @param {string} messageId - WhatsApp message ID
 * @returns {object} Normalized message
 */
export function normalizeMessage(message, phoneNumber, messageId) {
  const normalized = {
    whatsappMessageId: messageId,
    from: phoneNumber,
    timestamp: message.timestamp,
    type: message.type,
    direction: 'inbound',
  };

  // Extract type-specific content
  switch (message.type) {
    case 'text':
      normalized.content = message.text?.body || null;
      normalized.metadata = {
        language: null, // TODO: detect from content
      };
      break;

    case 'image':
      normalized.content = {
        type: 'image',
        id: message.image?.id,
        mimeType: message.image?.mime_type,
        caption: message.image?.caption || null,
      };
      normalized.metadata = {
        sha256: message.image?.sha256,
      };
      break;

    case 'audio':
      normalized.content = {
        type: 'audio',
        id: message.audio?.id,
        mimeType: message.audio?.mime_type,
        duration: message.audio?.duration,
      };
      break;

    case 'video':
      normalized.content = {
        type: 'video',
        id: message.video?.id,
        mimeType: message.video?.mime_type,
        caption: message.video?.caption || null,
      };
      normalized.metadata = {
        sha256: message.video?.sha256,
      };
      break;

    case 'document':
      normalized.content = {
        type: 'document',
        id: message.document?.id,
        filename: message.document?.filename,
        mimeType: message.document?.mime_type,
      };
      normalized.metadata = {
        sha256: message.document?.sha256,
      };
      break;

    case 'location':
      normalized.content = {
        type: 'location',
        latitude: message.location?.latitude,
        longitude: message.location?.longitude,
        name: message.location?.name || null,
        address: message.location?.address || null,
      };
      normalized.metadata = {
        accuracy: message.location?.accuracy,
        altitude: message.location?.altitude,
      };
      break;

    case 'interactive':
      normalized.content = {
        type: 'interactive',
        interactiveType: message.interactive?.type,
        id: message.interactive?.id,
        title: message.interactive?.title,
        description: message.interactive?.description,
      };
      break;

    case 'reaction':
      normalized.content = {
        type: 'reaction',
        emoji: message.reaction?.emoji,
        messageId: message.reaction?.message_id,
      };
      break;

    default:
      // Unknown message type - preserve all data
      normalized.content = message;
      normalized.metadata = {
        unknown: true,
      };
  }

  return normalized;
}

/**
 * Check if a message type is supported for AI processing
 * 
 * @param {string} messageType - Message type
 * @returns {boolean}
 */
export function isSupportedForProcessing(messageType) {
  // Core supported types that should trigger AI processing
  const supportedTypes = ['text', 'image', 'audio'];
  
  // Extended types that are acknowledged but may not trigger AI yet
  const extendedTypes = ['video', 'document', 'location', 'interactive'];
  
  // Metadata-only types (reactions, etc.)
  const metadataTypes = ['reaction'];
  
  if (supportedTypes.includes(messageType)) {
    return true;
  }
  
  if (extendedTypes.includes(messageType)) {
    // Log that we're receiving extended types but not processing yet
    return false;
  }
  
  return false;
}

/**
 * Get a human-readable summary of the message for logging
 * 
 * @param {object} message - Normalized message
 * @returns {string}
 */
export function getMessageSummary(message) {
  const type = message.type;
  
  switch (type) {
    case 'text':
      const textPreview = message.content?.substring(0, 50) || '(empty)';
      return `text: "${textPreview}..."`;
      
    case 'image':
      return `image (${message.content?.mimeType || 'unknown'})`;
      
    case 'audio':
      return `audio (${message.content?.duration || 'unknown'}s)`;
      
    case 'video':
      return `video (${message.content?.mimeType || 'unknown'})`;
      
    case 'document':
      return `document: ${message.content?.filename || 'unknown'}`;
      
    case 'location':
      return `location (${message.content?.latitude}, ${message.content?.longitude})`;
      
    case 'reaction':
      return `reaction: ${message.content?.emoji || 'unknown'}`;
      
    default:
      return `unknown: ${type}`;
  }
}
