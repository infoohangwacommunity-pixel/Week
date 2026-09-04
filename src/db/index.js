/**
 * WaxPrep - Database Module
 * 
 * PostgreSQL connection pool using node-postgres (pg).
 * Configured with Supavisor pooling via port 6543 for production.
 */

import { Pool } from 'pg';

/**
 * Create a PostgreSQL connection pool
 * @param {import('./index.js').Config} config - Application configuration
 * @returns {Promise<import('pg').Pool>}
 */
export async function createPool(config) {
  const pool = new Pool({
    connectionString: config.DATABASE_URL,
    max: config.DATABASE_POOL_MAX,
    idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS,
    statementTimeout: config.DATABASE_STATEMENT_TIMEOUT_MS,
    ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    // Disable prepared statements for transaction mode poolers (Supavisor/PgBouncer)
    prepare: false,
  });

  // Handle pool errors - critical to prevent unhandled rejection crashes
  pool.on('error', (err) => {
    console.error('Unexpected pool client error:', err);
  });

  // Test the connection
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✓ Database connection successful');
  } catch (err) {
    console.error('✗ Database connection failed:', err.message);
    throw err;
  }

  return pool;
}

/**
 * Execute a query with the pool
 * @param {string} text - SQL query text
 * @param {any[]} params - Query parameters
 * @param {import('pg').Pool} pool - Database pool
 * @returns {Promise<any>}
 */
export async function query(text, params, pool) {
  const start = Date.now();
  try {
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    console.log('Query executed in %dms', duration);
    return result;
  } catch (err) {
    console.error('Query error:', err.message);
    throw err;
  }
}

/**
 * Execute a transaction
 * @param {import('pg').Pool} pool - Database pool
 * @param {Function} callback - Transaction callback
 * @returns {Promise<any>}
 */
export async function transaction(pool, callback) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export default { createPool, query, transaction };
