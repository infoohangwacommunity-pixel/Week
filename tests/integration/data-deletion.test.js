/**
 * Data Deletion Integration Tests
 *
 * Verifies that the delete_student_data / queue_data_deletion PL/pgSQL
 * functions, and the intentHandler wrapper, work end-to-end. Uses a mock
 * pool because the test environment has no Postgres — but the test asserts
 * the correct SQL was issued and the correct return contract is honored.
 *
 * These tests do NOT replace a real DB integration test, which should be
 * run in CI with a provisioned Postgres instance.
 */

import { describe, it, expect } from 'vitest';
import { executeDeletionAction, executeExportAction } from '../../src/privacy/intentHandler.js';

// Build a mock pool that records every query and returns the scripted rows
// for known function calls.
function buildMockPool(scripts = {}) {
  const calls = [];
  const pool = {
    async query(text, params = []) {
      calls.push({ text, params });
      if (text.includes('queue_data_deletion')) {
        if (scripts.queueDataDeletion) return scripts.queueDataDeletion;
        return { rows: [{ queue_data_deletion: 'audit-log-123' }] };
      }
      if (text.includes('export_student_data')) {
        if (scripts.exportStudentData) return scripts.exportStudentData;
        return {
          rows: [
            {
              export_id: 'export-123',
              data_size_bytes: 1024,
              data_format: 'json',
              created_at: new Date(),
            },
          ],
        };
      }
      if (text.includes('delete_student_data')) {
        if (scripts.deleteStudentData) return scripts.deleteStudentData;
        return { rows: [{ delete_student_data: true }] };
      }
      return { rows: [] };
    },
  };
  return { pool, calls };
}

describe('Data Deletion Integration', () => {
  it('executeDeletionAction should queue a deletion and return the audit log ID', async () => {
    const { pool, calls } = buildMockPool();
    const result = await executeDeletionAction({
      waxId: '00000000-0000-0000-0000-000000000001',
      pool,
      requesterId: 'student',
    });
    expect(result.success).toBe(true);
    expect(result.auditLogId).toBeDefined();
    expect(calls.length).toBeGreaterThan(0);
    // The SQL should have invoked queue_data_deletion function
    expect(calls[0].text).toContain('queue_data_deletion');
  });

  it('executeDeletionAction should reject invalid waxId', async () => {
    const { pool } = buildMockPool();
    await expect(
      executeDeletionAction({ waxId: 'not-a-uuid', pool }),
    ).rejects.toThrow();
  });

  it('executeExportAction should return exportId and dataSizeBytes', async () => {
    const { pool, calls } = buildMockPool();
    const result = await executeExportAction({
      waxId: '00000000-0000-0000-0000-000000000002',
      pool,
      format: 'json',
    });
    expect(result.success).toBe(true);
    expect(result.exportId).toBeDefined();
    expect(result.dataSizeBytes).toBeGreaterThan(0);
    expect(calls[0].text).toContain('export_student_data');
  });

  it('executeExportAction should reject invalid waxId', async () => {
    const { pool } = buildMockPool();
    await expect(
      executeExportAction({ waxId: 'not-a-uuid', pool }),
    ).rejects.toThrow();
  });
});
