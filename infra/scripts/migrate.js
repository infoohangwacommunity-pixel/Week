#!/usr/bin/env node
/**
 * WaxPrep - Migration Runner
 * 
 * Runs database migrations with advisory locking to prevent concurrent execution.
 * Migrations are applied in order and tracked in the schema_migrations table.
 */

import { createPool } from '../../src/db/index.js';
import config from '../../src/config/index.js';
import { readdir, readFile } from 'fs/promises';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

/**
 * Get list of applied migrations from schema_migrations table
 */
async function getAppliedMigrations(pool) {
  const result = await pool.query(
    'SELECT version FROM schema_migrations ORDER BY version ASC'
  );
  return result.rows.map((row) => row.version);
}

/**
 * Get list of migration files from the migrations directory
 */
async function getMigrationFiles() {
  const files = await readdir(MIGRATIONS_DIR);
  return files
    .filter((f) => f.endsWith('.sql'))
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Run a single migration
 */
async function runMigration(pool, filename) {
  const version = filename.replace('.sql', '');
  const filePath = join(MIGRATIONS_DIR, filename);
  const sql = await readFile(filePath, 'utf-8');

  console.log(`Applying migration: ${filename}`);
  
  // Wrap in transaction for atomicity
  await pool.query('BEGIN');
  try {
    await pool.query(sql);
    await pool.query(
      'INSERT INTO schema_migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING',
      [version]
    );
    await pool.query('COMMIT');
    console.log(`✓ Applied: ${filename}`);
  } catch (err) {
    await pool.query('ROLLBACK');
    console.error(`✗ Failed: ${filename}`, err.message);
    throw err;
  }
}

/**
 * Acquire advisory lock to prevent concurrent migration runs
 * Uses session-level lock that persists across transactions
 */
async function acquireMigrationLock(pool) {
  // Use a fixed lock ID for migrations
  const lockId = 99999999;
  
  // Try to acquire lock with retry logic
  const maxRetries = 10;
  const retryDelay = 500; // ms
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // pg_advisory_lock is session-level, not transaction-level
      const result = await pool.query(
        'SELECT pg_advisory_lock($1) AS acquired',
        [lockId]
      );
      
      if (result.rows[0].acquired) {
        return true;
      }
      
      // Lock not available, wait and retry
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (err) {
      // Log but don't throw - will retry
      console.log(`Lock attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  return false;
}

/**
 * Release advisory lock
 */
async function releaseMigrationLock(pool) {
  const lockId = 99999999;
  await pool.query('SELECT pg_advisory_unlock($1)', [lockId]);
}

/**
 * Main migration runner
 */
async function runMigrations() {
  console.log('Starting migrations...');
  
  // Create pool for migration
  const pool = await createPool(config);
  
  try {
    // Create schema_migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Get applied migrations and migration files
    const applied = await getAppliedMigrations(pool);
    const files = await getMigrationFiles();
    
    // Find pending migrations
    const pending = files.filter((f) => {
      const version = f.replace('.sql', '');
      return !applied.includes(version);
    });
    
    if (pending.length === 0) {
      console.log('No pending migrations - skipping');
      return;
    }
    
    console.log(`Found ${pending.length} pending migration(s)`);

    // Acquire migration lock before running migrations
    const locked = await acquireMigrationLock(pool);
    if (!locked) {
      throw new Error('Could not acquire migration lock - another migration may be running');
    }

    // Apply migrations in order
    for (const file of pending) {
      await runMigration(pool, file);
    }

    console.log('Migrations complete');
  } finally {
    // Release lock if we acquired it
    try {
      await releaseMigrationLock(pool);
    } catch (err) {
      // Lock might already be released, ignore
    }
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  });
}

export default runMigrations;
