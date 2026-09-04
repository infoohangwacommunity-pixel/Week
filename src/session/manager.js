#!/usr/bin/env node
/**
 * WaxPrep - Session & Conversation Management
 * 
 * Manages student sessions and conversation context:
 * - Session lifecycle
 * - Context assembly
 * - Conversation history retrieval
 * - Cross-student isolation
 */

import { createPool } from '../db/index.js';
import config from '../config/index.js';
import { logger } from '../observability/index.js';

/**
 * Get or create a session for a student
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} waxId - Student's WaxID
 * @returns {Promise<object>} - Session object
 */
export async function getOrCreateSession(pool, waxId) {
  // Check for active session (last 24 hours of inactivity)
  const inactiveThreshold = new Date(Date.now() - config.SESSION_INACTIVITY_TIMEOUT_MS);
  
  const existing = await pool.query(
    `SELECT id, wax_id, started_at, last_activity_at
     FROM sessions
     WHERE wax_id = $1 
       AND ended_at IS NULL
       AND last_activity_at > $2
     ORDER BY last_activity_at DESC
     LIMIT 1`,
    [waxId, inactiveThreshold],
  );

  if (existing.rows.length > 0) {
    logger.debug({ sessionId: existing.rows[0].id }, 'Found active session');
    return existing.rows[0];
  }

  // Create new session
  const result = await pool.query(
    `INSERT INTO sessions (id, wax_id, started_at, last_activity_at)
     VALUES (gen_random_uuid(), $1, NOW(), NOW())
     RETURNING id, wax_id, started_at, last_activity_at`,
    [waxId],
  );

  logger.info({ sessionId: result.rows[0].id, waxId }, 'Created new session');
  return result.rows[0];
}

/**
 * Update session last activity
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} sessionId - Session ID
 */
export async function updateSessionActivity(pool, sessionId) {
  await pool.query(
    `UPDATE sessions
     SET last_activity_at = NOW()
     WHERE id = $1
       AND ended_at IS NULL`,
    [sessionId],
  );
}

/**
 * End a session
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} sessionId - Session ID
 */
export async function endSession(pool, sessionId) {
  await pool.query(
    `UPDATE sessions
     SET ended_at = NOW()
     WHERE id = $1
       AND ended_at IS NULL`,
    [sessionId],
  );
}

/**
 * Get conversation history for context assembly
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} waxId - Student's WaxID
 * @param {number} limit - Maximum messages to retrieve
 * @param {string} sessionId - Optional session ID
 * @returns {Promise<Array>} - Conversation messages
 */
export async function getConversationHistory(pool, waxId, limit = 20, sessionId = null) {
  const query = sessionId
    ? `SELECT id, direction, content, message_type, created_at
       FROM messages
       WHERE wax_id = $1
         AND session_id = $2
         AND deleted_at IS NULL
       ORDER BY created_at ASC
       LIMIT $3`
    : `SELECT id, direction, content, message_type, created_at
       FROM messages
       WHERE wax_id = $1
         AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT $2`;

  const params = sessionId
    ? [waxId, sessionId, limit]
    : [waxId, limit];

  const result = await pool.query(query, params);
  
  // Sort ascending for context
  return result.rows.sort((a, b) => 
    new Date(a.created_at) - new Date(b.created_at),
  );
}

/**
 * Get unprocessed messages for a student (for debouncing)
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} waxId - Student's WaxID
 * @returns {Promise<Array>} - Unprocessed messages
 */
export async function getUnprocessedMessages(pool, waxId) {
  const result = await pool.query(
    `SELECT id, direction, content, message_type, created_at
     FROM messages
     WHERE wax_id = $1
       AND direction = 'inbound'
       AND deleted_at IS NULL
     ORDER BY created_at ASC`,
    [waxId],
  );

  return result.rows;
}

/**
 * Get last AI response timestamp for context
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} waxId - Student's WaxID
 * @param {string} sessionId - Session ID
 * @returns {Promise<Date|null>}
 */
export async function getLastResponseTimestamp(pool, waxId, sessionId) {
  const result = await pool.query(
    `SELECT created_at
     FROM messages
     WHERE wax_id = $1
       ${sessionId ? 'AND session_id = $2' : ''}
       AND direction = 'outbound'
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1`,
    sessionId ? [waxId, sessionId] : [waxId],
  );

  return result.rows.length > 0 ? new Date(result.rows[0].created_at) : null;
}

/**
 * Update message as processed
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} messageId - Message ID
 * @param {string} sessionId - Session ID
 */
export async function markMessageAsProcessed(pool, messageId, sessionId) {
  await pool.query(
    `UPDATE messages
     SET wax_id = (SELECT id FROM students WHERE id = $2),
         session_id = $2
     WHERE id = $1
       AND wax_id IS NULL`,
    [messageId, sessionId],
  );
}

/**
 * Get message by WhatsApp ID
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} whatsappMessageId - WhatsApp message ID
 * @returns {Promise<object|null>}
 */
export async function getMessageByWhatsAppId(pool, whatsappMessageId) {
  const result = await pool.query(
    `SELECT * FROM messages
     WHERE id = $1
       AND deleted_at IS NULL`,
    [whatsappMessageId],
  );

  return result.rows.length > 0 ? result.rows[0] : null;
}
