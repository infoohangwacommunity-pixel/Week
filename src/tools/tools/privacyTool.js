/**
 * Privacy Tools — consent recording, data export, and data deletion.
 *
 * Closes the "hallucinated capability" gap: students asking WaxPrep to delete
 * their data used to get invented answers (fake support emails, false claims).
 * The infrastructure always had real deletion/export/consent functions
 * (src/privacy/intentHandler.js + PL/pgSQL in migrations 009-024) — this file
 * exposes them to the AI as first-class tools.
 *
 * SECURITY MODEL (AGENTS.md §8, §20):
 * - waxId ALWAYS comes from the server-side execution context, never from
 *   model-supplied arguments. The model cannot act on another student's data.
 * - request_data_deletion requires an exact confirmation phrase — a
 *   deterministic guard against accidental or injected deletions.
 * - All actions are logged: tool_invocations (ToolExecutor) + audit_log and
 *   consents tables (PL/pgSQL functions).
 * - Per-tool session rate limits are enforced by ToolExecutor.
 *
 * Handler signature: executePrivacyAction({ db, waxId, sessionId, ...args })
 */

import {
  executeConsentAction,
  executeDeletionAction,
  executeExportAction,
} from '../../privacy/intentHandler.js';

/** Exact phrase the model must pass to execute a deletion. */
export const DELETION_CONFIRMATION_PHRASE = 'DELETE MY DATA';

/**
 * Record the student's consent status.
 *
 * @param {Object} ctx
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool
 * @param {string} ctx.waxId - Student identifier (server-side, trusted)
 * @param {string} [ctx.status] - 'granted' | 'withdrawn' | 'pending'
 * @param {string} [ctx.context] - Optional free-text context from the AI
 */
export async function executeRecordConsent(ctx) {
  const { db, waxId, status, context } = ctx;

  if (!db) throw new Error('executeRecordConsent: db pool is required');
  if (!waxId) throw new Error('executeRecordConsent: waxId is required');

  const consentStatus = status || 'granted';
  if (!['granted', 'withdrawn', 'pending'].includes(consentStatus)) {
    return { success: false, validation_errors: [`Invalid consent status: ${consentStatus}`] };
  }

  try {
    const result = await executeConsentAction({
      pool: db,
      waxId,
      status: consentStatus,
      context: context || null,
      aiReasoning: 'recorded via record_consent tool during natural conversation',
    });

    return {
      success: true,
      action: 'consent_recorded',
      consent_id: result.consentId,
      status: consentStatus,
    };
  } catch (error) {
    return { success: false, validation_errors: [`Consent recording failed: ${error.message}`] };
  }
}

/**
 * Export the student's data (NDPA 2023 §27 — data portability).
 *
 * @param {Object} ctx
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool
 * @param {string} ctx.waxId - Student identifier (server-side, trusted)
 * @param {string} [ctx.format] - 'json' (only supported format today)
 */
export async function executeRequestDataExport(ctx) {
  const { db, waxId, format } = ctx;

  if (!db) throw new Error('executeRequestDataExport: db pool is required');
  if (!waxId) throw new Error('executeRequestDataExport: waxId is required');

  const exportFormat = format || 'json';
  if (exportFormat !== 'json') {
    return { success: false, validation_errors: [`Unsupported export format: ${exportFormat}. Only 'json' is supported.`] };
  }

  try {
    const result = await executeExportAction({ pool: db, waxId, format: exportFormat });

    return {
      success: true,
      action: 'data_export_executed',
      export_id: result.exportId,
      data_size_bytes: result.dataSizeBytes,
      format: exportFormat,
      // The export is a structured bundle; the AI summarizes it for the
      // student rather than attaching raw data in chat.
      note: 'Export bundle generated and recorded. Summarize for the student; do not paste raw contents.',
    };
  } catch (error) {
    return { success: false, validation_errors: [`Data export failed: ${error.message}`] };
  }
}

/**
 * Delete the student's data (NDPA 2023 §26 — right to erasure).
 *
 * This executes REAL, irreversible deletion of the requesting student's own
 * data via queue_data_deletion(waxId, 'student'). Guards:
 * 1. `confirmation` must exactly match DELETION_CONFIRMATION_PHRASE.
 * 2. waxId is server-side only.
 * 3. ToolExecutor enforces max 1 call per session.
 *
 * @param {Object} ctx
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool
 * @param {string} ctx.waxId - Student identifier (server-side, trusted)
 * @param {string} [ctx.confirmation] - Must equal DELETION_CONFIRMATION_PHRASE
 */
export async function executeRequestDataDeletion(ctx) {
  const { db, waxId, confirmation } = ctx;

  if (!db) throw new Error('executeRequestDataDeletion: db pool is required');
  if (!waxId) throw new Error('executeRequestDataDeletion: waxId is required');

  if (confirmation !== DELETION_CONFIRMATION_PHRASE) {
    return {
      success: false,
      validation_errors: [
        `Deletion requires the exact confirmation phrase '${DELETION_CONFIRMATION_PHRASE}'. Confirm with the student first, then call the tool again with the phrase.`,
      ],
    };
  }

  try {
    const result = await executeDeletionAction({ pool: db, waxId, requesterId: 'student' });

    return {
      success: true,
      action: 'data_deleted',
      audit_log_id: result.auditLogId,
      wax_id_deleted: waxId,
      note: 'Deletion executed. The student\'s conversation data is gone — keep the closing message brief and human.',
    };
  } catch (error) {
    return { success: false, validation_errors: [`Data deletion failed: ${error.message}`] };
  }
}

export default {
  executeRecordConsent,
  executeRequestDataExport,
  executeRequestDataDeletion,
};
