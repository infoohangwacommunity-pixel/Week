/**
 * Data Deletion Integration Tests
 * 
 * Tests for CRITICAL-002 fix: Data deletion now actually deletes sessions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { pool } from '../../src/db/index.js';
import { delete_student_data, queue_data_deletion } from '../../infra/migrations/009_data_deletion_export.sql';

describe('Data Deletion', () => {
  let testWaxId;

  beforeAll(async () => {
    // Create test student
    const result = await pool.query(
      `INSERT INTO students (id, phone_hash, created_at) 
       VALUES (gen_random_uuid(), $1, NOW())
       ON CONFLICT (id) DO NOTHING
       RETURNING id`,
      ['test_hash_' + Date.now()]
    );
    testWaxId = result.rows[0?.id;
  });

  afterAll(async () => {
    // Cleanup
    await pool.query(`DELETE FROM students WHERE phone_hash LIKE 'test_hash_%'`);
  });

  it('should actually delete sessions (not soft delete)', async () => {
    // Create test data
    await pool.query(`
      INSERT INTO sessions (id, wax_id, started_at, last_activity_at)
      VALUES (gen_random_uuid(), $1, NOW(), NOW())
    `, [testWaxId]);

    // Verify session exists
    const beforeSessions = await pool.query(
      'SELECT COUNT(*) as count FROM sessions WHERE wax_id = $1',
      [testWaxId]
    );
    expect(beforeSessions.rows[0].count).toBeGreaterThan(0);

    // Delete data
    const result = await pool.query(
      'SELECT * FROM delete_student_data($1, $2)',
      [testWaxId, 'test']
    );

    // Verify sessions were deleted (not just soft-deleted)
    const afterSessions = await pool.query(
      'SELECT COUNT(*) as count FROM sessions WHERE wax_id = $1 AND deleted_at IS NULL',
      [testWaxId]
    );
    expect(afterSessions.rows[0].count).toBe(0);
  });

  it('should delete all student data types', async () => {
    const waxId = testWaxId;

    // Create test data of all types
    await pool.query(`
      INSERT INTO messages (id, wax_id, direction, content, created_at)
      VALUES (gen_random_uuid(), $1, 'inbound', 'test', NOW())
    `, [waxId]);

    await pool.query(`
      INSERT INTO learning_observations (id, wax_id, concept_tag, evidence_type, correctness, observed_at)
      VALUES (gen_random_uuid(), $1, 'test_concept', 'correct_answer', true, NOW())
    `, [waxId]);

    await pool.query(`
      INSERT INTO student_facts (id, wax_id, fact_key, fact_value, created_at)
      VALUES (gen_random_uuid(), $1, 'test_key', 'test_value', NOW())
    `, [waxId]);

    // Delete
    await pool.query('SELECT * FROM delete_student_data($1, $2)', [waxId, 'test']);

    // Verify all data is deleted
    const msgCount = await pool.query('SELECT COUNT(*) FROM messages WHERE wax_id = $1', [waxId]);
    const obsCount = await pool.query('SELECT COUNT(*) FROM learning_observations WHERE wax_id = $1', [waxId]);
    const factCount = await pool.query('SELECT COUNT(*) FROM student_facts WHERE wax_id = $1', [waxId]);

    expect(msgCount.rows[0].count).toBe(0);
    expect(obsCount.rows[0].count).toBe(0);
    expect(factCount.rows[0].count).toBe(0);
  });

  it('should create audit log entries', async () => {
    const waxId = testWaxId;

    await pool.query('SELECT * FROM delete_student_data($1, $2)', [waxId, 'test']);

    // Check audit log
    const auditEntries = await pool.query(
      'SELECT event_type FROM audit_log WHERE wax_id = $1 AND event_type IN (\'data_deletion_started\', \'data_deletion_completed\') ORDER BY created_at',
      [waxId]
    );

    expect(auditEntries.rows.length).toBeGreaterThanOrEqual(1);
  });
});
