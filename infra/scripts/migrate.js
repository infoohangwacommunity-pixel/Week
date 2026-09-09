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
 * Uses session-level lock with retry logic
 */
async function acquireMigrationLock(pool) {
  const lockId = 99999999;
  
  console.log('Attempting to acquire migration lock...');
  
  // Try to acquire lock with extended retry logic
  const maxRetries = 30; // Try for up to ~15 seconds
  const retryDelay = 500; // ms
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Try to acquire lock
      const result = await pool.query(
        'SELECT pg_advisory_lock($1) AS acquired',
        [lockId]
      );
      
      if (result.rows[0].acquired) {
        console.log(`✓ Acquired migration lock (attempt ${attempt + 1})`);
        return true;
      }
      
      // Lock not available, check if another process completed migrations
      const applied = await getAppliedMigrations(pool);
      const files = await getMigrationFiles();
      const stillPending = files.filter((f) => {
        const version = f.replace('.sql', '');
        return !applied.includes(version);
      });
      
      if (stillPending.length === 0) {
        console.log('All migrations completed by another process - skipping');
        return false; // Signal that we should skip
      }
      
      // Log progress
      if (attempt % 5 === 0) {
        console.log(`Waiting for migration lock... (attempt ${attempt + 1}/${maxRetries})`);
      }
      
      // Wait before retrying
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    } catch (err) {
      console.log(`Lock attempt ${attempt + 1}/${maxRetries} failed: ${err.message}`);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }
  
  console.error('Failed to acquire migration lock after all attempts');
  return false;
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
    console.log('Note: Could not release migration lock (may already be released)');
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
      await pool.end();
      return;
    }
    
    console.log(`Found ${pending.length} pending migration(s): ${pending.join(', ')}`);
    
    // Acquire migration lock with retry
    const locked = await acquireMigrationLock(pool);
    
    // If lock acquisition returned false, it means migrations completed by another process
    if (locked === false) {
      console.log('Migrations already completed, exiting');
      await pool.end();
      return;
    }
    
    if (!locked) {
      throw new Error('Could not acquire migration lock after multiple attempts');
    }

    console.log('Starting migration execution...');
    
    // Apply migrations in order
    for (const file of pending) {
      await runMigration(pool, file);
    }

    console.log('Migrations complete');
  } catch (err) {
    console.error('Migration failed:', err);
    throw err;
  } finally {
    // Release lock if we acquired it
    try {
      await releaseMigrationLock(pool);
    } catch (err) {
      // Lock might already be released, ignore
    }
    console.log('Closing database connection');
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigrations().catch((err) => {
    console.error('Migration process failed:', err);
    process.exit(1);
  });
}

export default runMigrations;
