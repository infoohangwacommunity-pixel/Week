/**
 * Record Evidence Tool - Phase G Stage 39
 *
 * Records a learning observation for a concept.
 * Integrates with Phase F learning intelligence evidence collection.
 *
 * Per migration 007's design doc: "learning_observations are immutable.
 * If an observation is erroneous, soft-delete it and recompute states."
 * This tool NEVER overwrites an existing observation on conflict — it
 * silently ignores the duplicate (idempotent insert).
 */

import { MasteryEngine } from '../../learning/mastery/MasteryEngine.js';
import { EVIDENCE_TYPES } from '../../learning/evidence/EvidenceTaxonomy.js';

const VALID_TYPES = Object.values(EVIDENCE_TYPES);

/**
 * Execute evidence recording.
 *
 * @param {Object} ctx - Handler context.
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool.
 * @param {string} ctx.waxId - Student identifier.
 * @param {string} ctx.sessionId - Session identifier.
 * @param {string} ctx.concept_tag - Concept tag (e.g. 'algebra:linear-equations').
 * @param {string} ctx.evidence_type - One of VALID_TYPES.
 * @param {number|null} [ctx.correctness=null] - 0..1 correctness score.
 * @param {number} [ctx.hint_level=0] - 0..10 hint level used.
 * @param {string} [ctx.notes=null] - Optional notes.
 */
export async function executeRecordEvidence({
  db,
  waxId,
  sessionId,
  concept_tag,
  evidence_type,
  correctness = null,
  hint_level = 0,
  notes = null,
}) {
  if (!db) {
    throw new Error('executeRecordEvidence: db pool is required');
  }
  if (!waxId) {
    throw new Error('executeRecordEvidence: waxId is required');
  }
  if (!concept_tag) {
    return { success: false, errors: ['concept_tag is required'] };
  }

  if (!VALID_TYPES.includes(evidence_type)) {
    return {
      success: false,
      evidence_id: null,
      errors: [`Invalid evidence_type: ${evidence_type}. Valid: ${VALID_TYPES.join(', ')}`],
    };
  }

  // Validate correctness if provided (must be a number in [0,1]).
  if (correctness !== null && correctness !== undefined) {
    if (typeof correctness !== 'number' || Number.isNaN(correctness) ||
        correctness < 0 || correctness > 1) {
      return { success: false, evidence_id: null, errors: ['correctness must be a number between 0 and 1'] };
    }
  }

  if (typeof hint_level !== 'number' || hint_level < 0 || hint_level > 10) {
    return { success: false, evidence_id: null, errors: ['hint_level must be a number between 0 and 10'] };
  }

  try {
    // Ensure concept exists in registry (idempotent).
    await ensureConceptExists(db, concept_tag);

    // Find the most recent inbound message in this session (for FK linkage).
    const messageId = sessionId ? await getCurrentMessageId(db, sessionId) : null;

    // Insert the observation. On conflict (wax_id, message_id, concept_tag,
    // evidence_type) DO NOTHING — observations are immutable per the schema
    // design. (The previous implementation's `DO UPDATE SET updated_at = NOW()`
    // was wrong: learning_observations has no `updated_at` column, and the
    // design says never mutate.)
    const result = await db.query(
      `INSERT INTO learning_observations (
        wax_id, session_id, message_id, concept_tag, evidence_type,
        correctness, correctness_confidence, hint_level,
        extraction_method, extraction_confidence, notes, observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (wax_id, message_id, concept_tag, evidence_type) WHERE message_id IS NOT NULL
      DO NOTHING
      RETURNING id`,
      [
        waxId,
        sessionId,
        messageId,
        concept_tag,
        evidence_type,
        correctness,
        0.8, // correctness_confidence (default — extracted from AI tool call)
        hint_level,
        'ai_inline',
        0.8, // extraction_confidence
        notes,
      ],
    );

    // If the INSERT was a no-op (conflict), result.rows will be empty.
    // We still want to recompute the mastery state in case evidence was
    // previously recorded but the state is stale.
    if (result.rows.length > 0) {
      // Recompute knowledge states via MasteryEngine (RWEA) for high-quality
      // evidence. This is the proper Phase F integration.
      try {
        const masteryEngine = new MasteryEngine(db);
        await masteryEngine.updateState(waxId, concept_tag);
      } catch (masteryErr) {
        // Mastery recomputation is best-effort; the observation itself is
        // already persisted. Don't fail the whole call.
        console.warn(`recordEvidenceTool: mastery recomputation failed for ${concept_tag}:`, masteryErr.message);
      }
    }

    return {
      success: true,
      evidence_id: result.rows[0]?.id || null,
      concept_tag,
      evidence_type,
      newly_inserted: result.rows.length > 0,
    };
  } catch (error) {
    return {
      success: false,
      evidence_id: null,
      errors: [`Database error: ${error.message}`],
    };
  }
}

async function ensureConceptExists(db, conceptTag) {
  const result = await db.query(
    'SELECT id FROM concepts WHERE canonical_tag = $1',
    [conceptTag],
  );
  if (result.rows.length === 0) {
    await db.query(
      `INSERT INTO concepts (canonical_tag, display_name, created_by)
       VALUES ($1, $2, 'system')
       ON CONFLICT (canonical_tag) DO NOTHING`,
      [conceptTag, conceptTag.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())],
    );
  }
}

async function getCurrentMessageId(db, sessionId) {
  const result = await db.query(
    `SELECT id FROM messages
     WHERE session_id = $1 AND direction = 'inbound'
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId],
  );
  return result.rows[0]?.id || null;
}

export default { executeRecordEvidence };
