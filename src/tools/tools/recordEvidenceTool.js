/**
 * Record Evidence Tool - Phase G Stage 39
 * 
 * Records a learning observation/evidence for a concept.
 * Integrates with Phase F learning intelligence evidence collection.
 */

import config from '../../config/index.js';

/**
 * Execute evidence recording
 */
export async function executeRecordEvidence({
  waxId,
  sessionId,
  concept_tag,
  evidence_type,
  correctness = null,
  hint_level = 0,
  notes = null,
}) {
  // Validate evidence type
  const validTypes = [
    'direct_response',
    'explanation_attempt',
    'correction_response',
    'hint_request',
    'self_reported',
    'error_commission',
    'concept_mention',
    'self_explanation',
  ];

  if (!validTypes.includes(evidence_type)) {
    return {
      success: false,
      evidence_id: null,
      errors: [`Invalid evidence_type: ${evidence_type}`],
    };
  }

  // Validate correctness if provided
  if (correctness !== null && (correctness < 0 || correctness > 1)) {
    return {
      success: false,
      evidence_id: null,
      errors: ['correctness must be between 0 and 1'],
    };
  }

  // Validate hint level
  if (hint_level < 0 || hint_level > 10) {
    return {
      success: false,
      evidence_id: null,
      errors: ['hint_level must be between 0 and 10'],
    };
  }

  try {
    // Ensure concept exists in registry
    await ensureConceptExists(concept_tag);

    // Get current message ID if available
    const messageId = sessionId ? await getCurrentMessageId(sessionId) : null;

    // Insert learning observation
    const result = await db.query(
      `INSERT INTO learning_observations (
        wax_id, session_id, message_id, concept_tag, evidence_type,
        correctness, correctness_confidence, hint_level,
        extraction_method, extraction_confidence, observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
      ON CONFLICT (wax_id, message_id, concept_tag, evidence_type)
      DO UPDATE SET
        correctness = EXCLUDED.correctness,
        hint_level = LEAST(learning_observations.hint_level, EXCLUDED.hint_level),
        updated_at = NOW()
      RETURNING id`,
      [
        waxId,
        sessionId,
        messageId,
        concept_tag,
        evidence_type,
        correctness,
        0.8, // Default extraction confidence
        hint_level,
        'ai_inline',
        0.8,
      ]
    );

    // Recompute knowledge states if this is high-quality evidence
    if (evidence_type === 'direct_response' || evidence_type === 'error_commission') {
      await recomputeKnowledgeState(waxId, concept_tag);
    }

    return {
      success: true,
      evidence_id: result.rows[0]?.id || null,
      concept_tag,
      evidence_type,
    };
  } catch (error) {
    console.error('Evidence recording failed:', error);
    return {
      success: false,
      evidence_id: null,
      errors: [`Database error: ${error.message}`],
    };
  }
}

/**
 * Ensure concept exists in registry
 */
async function ensureConceptExists(conceptTag) {
  const result = await db.query(
    `SELECT id FROM concepts WHERE canonical_tag = $1`,
    [conceptTag]
  );

  if (result.rows.length === 0) {
    // Create concept entry
    await db.query(
      `INSERT INTO concepts (canonical_tag, display_name, created_by)
       VALUES ($1, $2, 'system')
       ON CONFLICT (canonical_tag) DO NOTHING`,
      [conceptTag, conceptTag.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())]
    );
  }
}

/**
 * Get current message ID
 */
async function getCurrentMessageId(sessionId) {
  const result = await db.query(
    `SELECT id FROM messages
     WHERE session_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [sessionId]
  );
  return result.rows[0]?.id || null;
}

/**
 * Recompute knowledge state for concept
 */
async function recomputeKnowledgeState(waxId, conceptTag) {
  // This would trigger the mastery recomputation logic
  // For now, mark that it needs recomputation
  await db.query(
    `UPDATE knowledge_states
     SET last_computed_at = NOW(),
         state_version = state_version + 1
     WHERE wax_id = $1 AND concept_tag = $2`,
    [waxId, conceptTag]
  );
}

export default {
  executeRecordEvidence,
};
