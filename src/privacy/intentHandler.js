/**
 * WaxPrep - AI Intent Handler
 *
 * AI-FIRST DESIGN:
 * - AI understands student's natural language and determines intent
 * - Infrastructure provides context and executes validated actions
 * - NO keyword matching, NO scripted flows, NO rigid conversational logic
 *
 * Architecture:
 *   AI understands → structured intent → schema validation → policy/authorization
 *   → infrastructure executes → result returned to AI
 */

import { z } from 'zod';

// Intent schemas - validated by AI, executed by infrastructure
const IntentSchema = z.object({
  type: z.enum([
    'consent_given',
    'consent_withdrawn',
    'data_deletion_requested',
    'data_export_requested',
    'rate_limit_query',
  ]),
  waxId: z.string().uuid(),
  confidence: z.number().min(0).max(1),
  context: z.string().optional(),
  aiReasoning: z.string(),
  timestamp: z.string().datetime(),
});

// Structured action output for infrastructure
const ActionSchema = z.object({
  action: z.enum([
    'record_consent',
    'execute_deletion',
    'execute_export',
    'check_rate_limit',
  ]),
  params: z.record(z.unknown()),
  validationToken: z.string(),
});

const WAX_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Build a privacy context block for the AI.
 *
 * Per AGENTS.md §5, the AI conducts onboarding and consent conversations
 * naturally. The infrastructure exposes STATE — not scripted responses.
 * The AI decides how to phrase things.
 */
export function buildPrivacyContext(config) {
  const parts = [];

  if (config.isNewStudent && !config.hasConsent) {
    parts.push(`privacy_state=new_student_no_consent
The student is contacting WaxPrep for the first time. No personal data has been collected yet and no consent has been recorded.
Available actions: record_consent (waxId, status: 'given'|'withdrawn').
The AI decides how to explain data practices and when to ask for consent.`);
  }

  if (config.rateLimitExceeded) {
    parts.push(`privacy_state=rate_limit_exceeded
limits_per_minute=${config.limitsPerMinute ?? 'unknown'}
limits_per_day=${config.limitsPerDay ?? 'unknown'}
current_count=${config.currentCount ?? 'unknown'}
The AI decides how to acknowledge the rate-limit naturally without scripting.`);
  }

  if (config.deletionRequestReceived) {
    parts.push(`privacy_state=deletion_requested
A data-deletion request has been received. Available action: execute_deletion (waxId, requesterId).
The AI decides how to acknowledge the request and confirm understanding before executing.`);
  }

  if (config.exportRequestReceived) {
    parts.push(`privacy_state=export_requested
A data-export request has been received. Available action: execute_export (waxId, format: 'json').
The AI decides how to acknowledge the request and summarize the export.`);
  }

  return parts.join('\n\n');
}

export function validateIntent(determination) {
  try {
    return IntentSchema.parse(determination);
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Invalid intent determination: ${err.errors.map((e) => e.message).join(', ')}`);
    }
    throw err;
  }
}

export function validateAction(action, waxId) {
  try {
    const validated = ActionSchema.parse(action);

    if (validated.params.waxId && validated.params.waxId !== waxId) {
      throw new Error('Action waxId does not match student WaxID');
    }

    return validated;
  } catch (err) {
    if (err instanceof z.ZodError) {
      throw new Error(`Invalid action: ${err.errors.map((e) => e.message).join(', ')}`);
    }
    throw err;
  }
}

function assertWaxId(waxId) {
  if (!waxId || typeof waxId !== 'string' || !WAX_ID_RE.test(waxId)) {
    throw new Error('Invalid WaxID format');
  }
}

/**
 * Execute a consent action via the record_consent_event PL/pgSQL function.
 *
 * Accepts either positional args (legacy callers) or a single options object
 * ({ waxId, status, context, aiReasoning, pool }).
 */
export async function executeConsentAction(poolOrOpts, p2, p3, p4, p5) {
  let pool, waxId, status, context, aiReasoning;
  if (typeof poolOrOpts === 'object' && poolOrOpts !== null && typeof poolOrOpts.query === 'function') {
    // Legacy positional call: executeConsentAction(pool, waxId, status, context, aiReasoning)
    pool = poolOrOpts;
    waxId = p2;
    status = p3;
    context = p4;
    aiReasoning = p5;
  } else {
    // Options-object call: executeConsentAction({ pool, waxId, status, context, aiReasoning })
    pool = poolOrOpts.pool;
    waxId = poolOrOpts.waxId;
    status = poolOrOpts.status;
    context = poolOrOpts.context;
    aiReasoning = poolOrOpts.aiReasoning;
  }

  assertWaxId(waxId);

  const result = await pool.query(
    'SELECT record_consent_event($1, $2, $3, $4, $5, $6)',
    [waxId, 'general', status, '1.0', JSON.stringify({ context, aiReasoning }), 'whatsapp'],
  );

  return {
    success: true,
    consentId: result.rows[0].record_consent_event,
    waxId,
    status,
  };
}

/**
 * Execute a data-deletion request via the queue_data_deletion PL/pgSQL function.
 *
 * Accepts either positional args (pool, waxId, requesterId) or a single options
 * object ({ pool, waxId, requesterId }).
 */
export async function executeDeletionAction(poolOrOpts, waxIdOrReq, requesterId) {
  let pool, waxId, requester;
  if (typeof poolOrOpts === 'object' && poolOrOpts !== null && typeof poolOrOpts.query === 'function') {
    pool = poolOrOpts;
    waxId = waxIdOrReq;
    requester = requesterId;
  } else {
    pool = poolOrOpts.pool;
    waxId = poolOrOpts.waxId;
    requester = poolOrOpts.requesterId;
  }

  assertWaxId(waxId);

  const result = await pool.query(
    'SELECT * FROM queue_data_deletion($1, $2)',
    [waxId, requester || 'student'],
  );

  // queue_data_deletion RETURNS UUID — the column name matches the function name.
  return {
    success: true,
    auditLogId: result.rows[0]?.queue_data_deletion,
    waxId,
  };
}

/**
 * Execute a data-export request via the export_student_data PL/pgSQL function.
 *
 * Accepts either positional args (pool, waxId, format) or a single options
 * object ({ pool, waxId, format }).
 *
 * NOTE: export_student_data is declared RETURNS TABLE (export_id UUID,
 * data_size_bytes BIGINT, ...). When called as `SELECT * FROM export_student_data(...)`,
 * the result columns are FLAT (export_id, data_size_bytes, etc.), NOT nested
 * under an `export_student_data` key. This was a long-standing bug that caused
 * `result.rows[0].export_student_data.export_id` to throw.
 */
export async function executeExportAction(poolOrOpts, waxIdOrFmt, format) {
  let pool, waxId, fmt;
  if (typeof poolOrOpts === 'object' && poolOrOpts !== null && typeof poolOrOpts.query === 'function') {
    pool = poolOrOpts;
    waxId = waxIdOrFmt;
    fmt = format || 'json';
  } else {
    pool = poolOrOpts.pool;
    waxId = poolOrOpts.waxId;
    fmt = poolOrOpts.format || 'json';
  }

  assertWaxId(waxId);

  const result = await pool.query(
    'SELECT * FROM export_student_data($1, $2)',
    [waxId, fmt],
  );

  const row = result.rows[0] || {};
  return {
    success: true,
    exportId: row.export_id,
    waxId,
    dataSizeBytes: Number(row.data_size_bytes ?? 0),
  };
}

export default {
  buildPrivacyContext,
  validateIntent,
  validateAction,
  executeConsentAction,
  executeDeletionAction,
  executeExportAction,
};
