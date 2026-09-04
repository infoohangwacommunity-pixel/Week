#!/usr/bin/env node
/**
 * WaxPrep - Migration Runner
 * 
 * Runs database migrations with advisory locking to prevent concurrent execution.
 * Migrations are applied in order and tracked in the schema_migrations table.
 */

import { createPool } from '../src/db/index.js';
import config from '../src/config/index.js';
import { readdir, readFile } from 'fs/promises';
import { join } from 'path';

const MIGRATIONS_DIR = join(import.meta.dirname, '..', 'infra', 'migrations');

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
 */
async function acquireMigrationLock(pool) {
  // Use a fixed lock ID for migrations
  const lockId = 99999999;
  const result = await pool.query(
    'SELECT pg_advisory_xact_lock($1) AS acquired',
    [lockId]
  );
  return result.rows[0].acquired;
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

    // Acquire migration lock
    const locked = await acquireMigrationLock(pool);
    if (!locked) {
      throw new Error('Could not acquire migration lock - another migration is running');
    }

    // Get applied migrations and migration files
    const applied = await getAppliedMigrations(pool);
    const files = await getMigrationFiles();
    
    // Find pending migrations
    const pending = files.filter((f) => {
      const version = f.replace('.sql', '');
      return !applied.includes(version);
    });

    if (pending.length === 0) {
      console.log('No pending migrations');
      return;
    }

    console.log(`Found ${pending.length} pending migration(s)`);

    // Apply migrations in order
    for (const file of pending) {
      await runMigration(pool, file);
    }

    console.log('Migrations complete');
  } finally {
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
