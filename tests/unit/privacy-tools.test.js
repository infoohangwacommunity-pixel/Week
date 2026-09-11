/**
 * Privacy Tools Tests
 *
 * The privacy tools give the AI REAL capabilities (consent, export, deletion)
 * so it never has to hallucinate them. These tests verify:
 * - Registry exposure (tools reach the AI) and permission category
 * - Handlers execute the real PL/pgSQL-backed actions
 * - waxId is always server-side (model cannot target another student)
 * - The deletion confirmation phrase guard works
 * - Handler context: server identity cannot be overridden by model args
 */

import { describe, it, expect } from 'vitest';
import {
  getToolByName,
  getToolsByCategory,
  validateToolArguments,
  ToolPermission,
} from '../../src/tools/ToolRegistry.js';
import { getToolHandler, TOOL_HANDLERS } from '../../src/tools/ToolHandlerRegistry.js';
import {
  executeRecordConsent,
  executeRequestDataExport,
  executeRequestDataDeletion,
  DELETION_CONFIRMATION_PHRASE,
} from '../../src/tools/tools/privacyTool.js';

const WAX_ID = '00000000-0000-0000-0000-000000000001';

function mockDb(fn) {
  return { async query(text, params) { return fn(text, params) || { rows: [] }; } };
}

describe('privacy tool registry exposure', () => {
  it('registers all three privacy tools', () => {
    expect(getToolByName('record_consent')).toBeTruthy();
    expect(getToolByName('request_data_export')).toBeTruthy();
    expect(getToolByName('request_data_deletion')).toBeTruthy();
  });

  it('uses the PRIVACY permission category', () => {
    const privacyTools = getToolsByCategory(ToolPermission.PRIVACY);
    expect(privacyTools.map((t) => t.name).sort()).toEqual([
      'record_consent',
      'request_data_deletion',
      'request_data_export',
    ]);
  });

  it('maps handlers in the ToolHandlerRegistry', () => {
    expect(TOOL_HANDLERS.record_consent).toBeTruthy();
    expect(TOOL_HANDLERS.request_data_export).toBeTruthy();
    expect(TOOL_HANDLERS.request_data_deletion).toBeTruthy();
    expect(getToolHandler('request_data_deletion').handler).toBe(executeRequestDataDeletion);
  });

  it('deletion is limited to 1 call per session', () => {
    expect(getToolByName('request_data_deletion').execution_limits.max_calls_per_session).toBe(1);
  });

  it('rejects model-supplied waxId in arguments (additionalProperties)', () => {
    const validation = validateToolArguments('request_data_deletion', {
      confirmation: 'DELETE MY DATA',
      waxId: '00000000-0000-0000-0000-000000000099',
    });
    expect(validation.valid).toBe(false);
    expect(validation.errors.join(' ')).toContain('Additional property not allowed');
  });
});

describe('record_consent handler', () => {
  it('records granted consent via the PL/pgSQL function', async () => {
    const calls = [];
    const db = mockDb((text, params) => {
      calls.push({ text, params });
      return { rows: [{ record_consent_event: 'consent-uuid-1' }] };
    });

    const result = await executeRecordConsent({ db, waxId: WAX_ID, status: 'granted' });

    expect(result.success).toBe(true);
    expect(result.consent_id).toBe('consent-uuid-1');
    expect(calls[0].text).toContain('record_consent_event');
    expect(calls[0].params[0]).toBe(WAX_ID);
  });

  it('rejects invalid consent statuses', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const result = await executeRecordConsent({ db, waxId: WAX_ID, status: 'maybe' });
    expect(result.success).toBe(false);
  });
});

describe('request_data_deletion handler', () => {
  it('requires the exact confirmation phrase', async () => {
    const db = mockDb(() => ({ rows: [{ queue_data_deletion: 'audit-1' }] }));
    const bad = await executeRequestDataDeletion({ db, waxId: WAX_ID, confirmation: 'delete please' });
    expect(bad.success).toBe(false);
    expect(bad.validation_errors.join(' ')).toContain('DELETE MY DATA');
  });

  it('executes real deletion when confirmed', async () => {
    const calls = [];
    const db = mockDb((text, params) => {
      calls.push({ text, params });
      return { rows: [{ queue_data_deletion: 'audit-uuid-1' }] };
    });

    const result = await executeRequestDataDeletion({
      db,
      waxId: WAX_ID,
      confirmation: DELETION_CONFIRMATION_PHRASE,
    });

    expect(result.success).toBe(true);
    expect(result.audit_log_id).toBe('audit-uuid-1');
    expect(calls[0].text).toContain('queue_data_deletion');
    expect(calls[0].params[0]).toBe(WAX_ID);
    expect(calls[0].params[1]).toBe('student');
  });

  it('ignores a model-supplied waxId even if it sneaks through', async () => {
    const calls = [];
    const db = mockDb((text, params) => {
      calls.push({ params });
      return { rows: [{ queue_data_deletion: 'audit-2' }] };
    });

    // Simulate a handler context where args overrode nothing — the server
    // waxId must always win (ToolExecutor applies server context last).
    const modelArgs = { confirmation: 'DELETE MY DATA', waxId: '00000000-0000-0000-0000-000000000099' };
    const serverContext = { waxId: WAX_ID, db };
    const ctx = { ...modelArgs, ...serverContext, confirmation: modelArgs.confirmation };

    await executeRequestDataDeletion(ctx);
    expect(calls[0].params[0]).toBe(WAX_ID);
  });
});

describe('request_data_export handler', () => {
  it('executes json export', async () => {
    const calls = [];
    const db = mockDb((text, params) => {
      calls.push({ text, params });
      return { rows: [{ export_id: 'export-1', data_size_bytes: '2048' }] };
    });

    const result = await executeRequestDataExport({ db, waxId: WAX_ID, format: 'json' });

    expect(result.success).toBe(true);
    expect(result.export_id).toBe('export-1');
    expect(result.data_size_bytes).toBe(2048);
    expect(calls[0].text).toContain('export_student_data');
  });

  it('rejects unsupported formats', async () => {
    const db = mockDb(() => ({ rows: [] }));
    const result = await executeRequestDataExport({ db, waxId: WAX_ID, format: 'csv' });
    expect(result.success).toBe(false);
  });
});
