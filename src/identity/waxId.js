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
 * Create or resolve a WaxID for a phone number.
 *
 * Race-safe: uses `ON CONFLICT (phone_hash) WHERE deleted_at IS NULL`
 * (matches the unique partial index from migration 013) so two concurrent
 * first-time webhooks from the same number both resolve to the same WaxID
 * instead of one of them failing with `duplicate key value`.
 *
 * @param {import('pg').Pool} pool - Database pool
 * @param {string} phoneNumber - Student's phone number
 * @returns {Promise<string>} - WaxID (UUID)
 */
export async function resolveWaxID(pool, phoneNumber) {
  const phoneHash = hashPhoneNumber(phoneNumber);

  // Atomic upsert on phone_hash. The unique partial index from migration 013
  // covers (phone_hash) WHERE deleted_at IS NULL. If the INSERT conflicts
  // we UPDATE updated_at and RETURN the existing id.
  const result = await pool.query(
    `INSERT INTO students (id, phone_hash, created_at)
     VALUES ($1, $2, NOW())
     ON CONFLICT (phone_hash) WHERE deleted_at IS NULL
     DO UPDATE SET updated_at = NOW()
     RETURNING id`,
    [randomUUID(), phoneHash],
  );

  const waxId = result.rows[0]?.id;
  if (!waxId) {
    // Should never happen, but be defensive.
    throw new Error(`Failed to resolve WaxID for phone hash ${phoneHash.slice(0, 8)}…`);
  }

  logger.debug({ waxId, phoneHash: phoneHash.slice(0, 8) + '…' }, 'Resolved WaxID');
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
    [phoneHash],
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
    [waxId],
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
    [waxId],
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
    [waxId],
  );

  return {
    waxId: result.rows[0].id,
    profile: {
      createdAt: result.rows[0].created_at,
    },
  };
}
