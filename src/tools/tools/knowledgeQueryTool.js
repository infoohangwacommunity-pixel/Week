/**
 * Knowledge Query Tool - Phase G Stage 40
 *
 * Queries the student model for mastery estimates, misconceptions, and
 * learning signals. Returns EVIDENCE, NOT pedagogical decisions.
 *
 * Integrates with Phase F learning intelligence infrastructure.
 */

import { StudentLearningAccess } from '../../learning/StudentLearningAccess.js';
import * as EvidenceTaxonomy from '../../learning/evidence/EvidenceTaxonomy.js';

/**
 * Execute knowledge query.
 *
 * @param {Object} ctx - Handler context.
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool.
 * @param {string} ctx.waxId - Student identifier.
 * @param {string} ctx.concept_tag - Concept to query.
 * @param {boolean} [ctx.include_misconceptions=true] - Include misconceptions.
 * @param {boolean} [ctx.include_learning_signals=true] - Include signals.
 */
export async function executeKnowledgeQuery({
  db,
  waxId,
  sessionId,
  concept_tag,
  include_misconceptions = true,
  include_learning_signals = true,
}) {
  if (!db) {
    throw new Error('executeKnowledgeQuery: db pool is required');
  }
  if (!waxId) {
    throw new Error('executeKnowledgeQuery: waxId is required');
  }
  if (!concept_tag) {
    return { success: false, error: 'concept_tag is required' };
  }

  try {
    // Construct StudentLearningAccess with the correct positional args:
    // (pool, evidenceWriter, masteryEngine, evidenceTaxonomy).
    // For a read-only query, evidenceWriter and masteryEngine can be null.
    const learningAccess = new StudentLearningAccess(db, null, null, EvidenceTaxonomy);

    const knowledgeState = await learningAccess.getKnowledgeState(waxId, concept_tag);

    const result = {
      success: true,
      concept_tag,
      mastery_estimate: knowledgeState?.mastery_estimate ?? 0.1,
      evidence_count: knowledgeState?.evidence_count ?? 0,
      direct_response_count: knowledgeState?.direct_response_count ?? 0,
      hint_dependency: knowledgeState?.hint_dependency ?? null,
      recent_trend: knowledgeState?.recent_trend ?? 'insufficient_data',
    };

    if (include_misconceptions) {
      // getActiveMisconceptions returns ALL active misconceptions for the student
      // (no per-concept filter). Filter in JS to honor the concept_tag.
      const allMisconceptions = await learningAccess.getActiveMisconceptions(waxId);
      const misconceptions = (allMisconceptions || []).filter(
        (m) => !m.concept_tag || m.concept_tag === concept_tag,
      );

      result.misconceptions = misconceptions.map((m) => ({
        description: m.description,
        confidence: parseFloat(m.confidence),
        status: m.status,
        evidence_count: m.evidence_count,
      }));
    }

    if (include_learning_signals) {
      const signals = await learningAccess.getLearningSignals(waxId, {
        signal_type: null,
      });
      // Filter to concept_tag if signal record has one.
      const filtered = (signals || []).filter(
        (s) => !s.concept_tag || s.concept_tag === concept_tag,
      );

      result.learning_signals = filtered.map((s) => ({
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        signal_text: s.signal_text,
        confidence: parseFloat(s.signal_confidence),
        observed_at: s.observed_at,
      }));
    }

    return result;
  } catch (error) {
    return {
      success: false,
      error: `Knowledge query failed: ${error.message}`,
    };
  }
}

export default { executeKnowledgeQuery };
