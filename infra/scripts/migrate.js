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

// Track if pool was already closed to prevent double-close
let poolClosed = false;

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
 * Acquire migration lock using a try-lock pattern with timeout
 * Returns true if lock acquired, false if lock is held by another process
 * Throws error if migrations are already complete
 */
async function acquireMigrationLock(pool) {
  const lockId = 99999999;
  
  console.log('Attempting to acquire migration lock...');
  
  // First, check if migrations are already complete
  const applied = await getAppliedMigrations(pool);
  const files = await getMigrationFiles();
  const allApplied = files.every((f) => {
    const version = f.replace('.sql', '');
    return applied.includes(version);
  });
  
  if (allApplied) {
    console.log('All migrations already applied - skipping');
    return 'complete';
  }
  
  // Try to acquire lock with timeout
  const maxWaitMs = 30000; // 30 seconds max wait
  const checkIntervalMs = 1000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < maxWaitMs) {
    try {
      // Try to acquire lock (non-blocking check)
      const result = await pool.query(
        'SELECT pg_try_advisory_lock($1) AS acquired',
        [lockId]
      );
      
      if (result.rows[0].acquired) {
        console.log('✓ Acquired migration lock');
        return true;
      }
      
      // Lock not available, check again if migrations completed
      const stillApplied = await getAppliedMigrations(pool);
      const stillPending = files.filter((f) => {
        const version = f.replace('.sql', '');
        return !stillApplied.includes(version);
      });
      
      if (stillPending.length === 0) {
        console.log('Migrations completed by another process during wait - skipping');
        return 'complete';
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
      
      // Log progress every 5 seconds
      const elapsed = Math.floor((Date.now() - startTime) / 1000);
      if (elapsed % 5 === 0) {
        console.log(`Still waiting for migration lock... (${elapsed}s elapsed)`);
      }
    } catch (err) {
      console.error(`Lock check failed: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, checkIntervalMs));
    }
  }
  
  // Timeout - lock still held by another process
  console.error('ERROR: Could not acquire migration lock after 30 seconds');
  console.error('This indicates a previous migration process crashed and did not release the lock.');
  console.error('The lock will be released when that PostgreSQL session ends, or you can manually release it.');
  throw new Error('Migration lock timeout - another process may be running or a previous process crashed');
}

/**
 * Release advisory lock
 */
async function releaseMigrationLock(pool) {
  const lockId = 99999999;
  try {
    await pool.query('SELECT pg_advisory_unlock($1)', [lockId]);
    console.log('Released migration lock');
  } catch (err) {
    // Lock might not have been acquired, which is OK
    console.log('Note: Could not release migration lock (may not have been acquired)');
  }
}

/**
 * Safely close the database pool (prevents double-close)
 */
async function closePool(pool) {
  if (!poolClosed) {
    poolClosed = true;
    await pool.end();
    console.log('Database connection closed');
  }
}

/**
 * Main migration runner
 */
async function runMigrations() {
  console.log('Starting migrations...');
  
  // Create pool for migration
  const pool = await createPool(config);
  console.log('Database connection established for migrations');
  
  let lockAcquired = false;
  
  try {
    // Create schema_migrations table if it doesn't exist
    await pool.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log('schema_migrations table ready');

    // Check if all migrations are already applied (optimistic check)
    const applied = await getAppliedMigrations(pool);
    console.log(`Applied migrations: ${applied.join(', ') || 'none'}`);
    
    const files = await getMigrationFiles();
    console.log(`Available migrations: ${files.join(', ')}`);
    
    const pending = files.filter((f) => {
      const version = f.replace('.sql', '');
      return !applied.includes(version);
    });
    
    if (pending.length === 0) {
      console.log('No pending migrations - skipping');
      await closePool(pool);
      return;
    }
    
    console.log(`Found ${pending.length} pending migration(s): ${pending.join(', ')}`);
    
    // Acquire migration lock
    const lockResult = await acquireMigrationLock(pool);
    
    // If migrations are complete, skip
    if (lockResult === 'complete') {
      await closePool(pool);
      return;
    }
    
    // If we get here, lock was acquired (lockResult === true)
    lockAcquired = true;
    console.log('Starting migration execution...');
    
    // Apply migrations in order
    for (const file of pending) {
      await runMigration(pool, file);
    }

    console.log('Migrations complete');
  } catch (err) {
    console.error('Migration failed:', err.message);
    throw err;
  } finally {
    // Release lock if we acquired it
    if (lockAcquired) {
      try {
        await releaseMigrationLock(pool);
      } catch (err) {
        console.error('Error releasing lock:', err.message);
      }
    }
    
    // Always close the pool (prevents double-close)
    try {
      await closePool(pool);
    } catch (err) {
      console.error('Error closing pool:', err.message);
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('Migration process failed:', err.message);
    process.exit(1);
  });
}

export default runMigrations;
