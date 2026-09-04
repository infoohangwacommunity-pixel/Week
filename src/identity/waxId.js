#!/usr/bin/env node
/**
 * WaxPrep - Student Identity (WaxID)
 * 
 * Implements student identity resolution and isolation:
 * - Phone number hashing with HMAC
 * - WaxID generation and lookup
 * - Profile storage
 * - Cross-student isolation
 */

import { createHmac } from 'crypto';
import { randomUUID } from 'crypto';
import { createPool } from '../db/index.js';
import config from '../config/index.js';
import { logger } from '../observability/index.js';

/**
 * Hash a phone number to create a WaxID-safe identifier
 * 
 * This is NOT a cryptographic hash - it's a keyed transformation
 * that preserves the same phone number -> same WaxID mapping
 * while preventing reverse engineering without the secret.
 * 
 * @param {string} phoneNumber - Raw phone number
 * @returns {string} Hashed identifier
 */
export function hashPhoneNumber(phoneNumber) {
  const hmac = createHmac('sha256', config.PHONE_HMAC_SECRET);
  hmac.update(phoneNumber.toLowerCase().trim());
  return hmac.digest('hex');
}

/**
 * Create or resolve a WaxID for a phone number
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} phoneNumber - Student's phone number
 * @returns {Promise<string>} - WaxID (UUID)
 */
export async function resolveWaxID(pool, phoneNumber) {
  const phoneHash = hashPhoneNumber(phoneNumber);
  
  // Try to find existing student with this phone hash
  const existing = await pool.query(
    `SELECT id, created_at 
     FROM students 
     WHERE phone_hash = $1 
       AND deleted_at IS NULL
     LIMIT 1`,
    [phoneHash]
  );

  if (existing.rows.length > 0) {
    logger.debug({ waxId: existing.rows[0].id }, 'Found existing WaxID');
    return existing.rows[0].id;
  }

  // Create new WaxID for this phone number
  const waxId = randomUUID();
  
  await pool.query(
    `INSERT INTO students (id, phone_hash, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (id) DO NOTHING`,
    [waxId, phoneHash]
  );

  logger.info({ waxId, phoneHash: phoneHash.substring(0, 8) + '...' }, 'Created new WaxID');
  return waxId;
}

/**
 * Get WaxID by phone number (for logging/verification)
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<string|null>} - WaxID or null
 */
export async function getWaxIDByPhone(pool, phoneNumber) {
  const phoneHash = hashPhoneNumber(phoneNumber);
  
  const result = await pool.query(
    `SELECT id FROM students 
     WHERE phone_hash = $1 
       AND deleted_at IS NULL
     LIMIT 1`,
    [phoneHash]
  );

  return result.rows.length > 0 ? result.rows[0].id : null;
}

/**
 * Check if a WaxID exists
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} waxId - WaxID to check
 * @returns {Promise<boolean>}
 */
export async function waxIDExists(pool, waxId) {
  const result = await pool.query(
    `SELECT 1 FROM students 
     WHERE id = $1 
       AND deleted_at IS NULL
     LIMIT 1`,
    [waxId]
  );

  return result.rows.length > 0;
}

/**
 * Soft-delete a WaxID (for student request to delete account)
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} waxId - WaxID to delete
 * @returns {Promise<boolean>} - true if deleted
 */
export async function deleteWaxID(pool, waxId) {
  const result = await pool.query(
    `UPDATE students 
     SET deleted_at = NOW()
     WHERE id = $1 
       AND deleted_at IS NULL
     RETURNING id`,
    [waxId]
  );

  return result.rows.length > 0;
}

/**
 * Get or create a WaxID with profile data
 * 
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} phoneNumber - Phone number
 * @returns {Promise<{waxId: string, profile: object}>}
 */
export async function getOrCreateWaxID(pool, phoneNumber) {
  const waxId = await resolveWaxID(pool, phoneNumber);
  
  // Get profile data (future stages will add profile fields)
  const result = await pool.query(
    `SELECT id, created_at 
     FROM students 
     WHERE id = $1 
       AND deleted_at IS NULL`,
    [waxId]
  );

  return {
    waxId: result.rows[0].id,
    profile: {
      createdAt: result.rows[0].created_at,
    },
  };
}
