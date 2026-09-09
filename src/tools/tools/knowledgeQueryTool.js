/**
 * Knowledge Query Tool - Phase G Stage 40
 * 
 * Queries the student model for mastery estimates, misconceptions, and learning signals.
 * Returns evidence, NOT pedagogical decisions.
 * 
 * Integrates with Phase F learning intelligence infrastructure.
 */

import config from '../config/index.js';
import { StudentLearningAccess } from '../../learning/StudentLearningAccess.js';

/**
 * Execute knowledge query
 */
export async function executeKnowledgeQuery({
  waxId,
  sessionId,
  concept_tag,
  include_misconceptions = true,
  include_learning_signals = true,
}) {
  try {
    const learningAccess = new StudentLearningAccess({ db });

    // Query knowledge state
    const knowledgeState = await learningAccess.getKnowledgeState({
      waxId,
      conceptTag: concept_tag,
    });

    const result = {
      concept_tag,
      mastery_estimate: knowledgeState?.mastery_estimate || 0.1,
      evidence_count: knowledgeState?.evidence_count || 0,
      direct_response_count: knowledgeState?.direct_response_count || 0,
      hint_dependency: knowledgeState?.hint_dependency,
      recent_trend: knowledgeState?.recent_trend || 'insufficient_data',
    };

    // Include misconceptions if requested
    if (include_misconceptions) {
      const misconceptions = await learningAccess.getMisconceptions({
        waxId,
        conceptTag: concept_tag,
      });

      result.misconceptions = misconceptions.map(m => ({
        description: m.description,
        confidence: parseFloat(m.confidence),
        status: m.status,
        evidence_count: m.evidence_count,
      }));
    }

    // Include learning signals if requested
    if (include_learning_signals) {
      const signals = await learningAccess.getLearningSignals({
        waxId,
        conceptTag: concept_tag,
      });

      result.learning_signals = signals.map(s => ({
        signal_type: s.signal_type,
        signal_value: s.signal_value,
        signal_text: s.signal_text,
        confidence: parseFloat(s.signal_confidence),
        observed_at: s.observed_at,
      }));
    }

    return result;
  } catch (error) {
    console.error('Knowledge query failed:', error);
    throw error;
  }
}

export default {
  executeKnowledgeQuery,
};
