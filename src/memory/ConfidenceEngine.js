import { CONFIDENCE_BOUNDS, CHANGE_REASONS } from './MemoryTaxonomy.js';
import { getInitialConfidence, getReinforceDelta, getContradictDelta } from './ProvenanceRegistry.js';
export function applyConfidenceTransition(currentConfidence, provenance, operation, decayRate = 0) {
  const bounds = CONFIDENCE_BOUNDS;
  switch (operation) {
    case CHANGE_REASONS.INITIALIZE: return getInitialConfidence(provenance);
    case CHANGE_REASONS.REINFORCE: return Math.min(bounds.MAX, currentConfidence + getReinforceDelta(provenance));
    case CHANGE_REASONS.CONTRADICT: return Math.max(bounds.MIN, currentConfidence + getContradictDelta(provenance));
    case CHANGE_REASONS.DECAY: return Math.max(bounds.MIN, currentConfidence - decayRate);
    default: return currentConfidence;
  }
}
export function calculateConfidenceChange(previousConfidence, provenance, operation, decayRate = 0) {
  const newConfidence = applyConfidenceTransition(previousConfidence, provenance, operation, decayRate);
  return { previous_confidence: previousConfidence, new_confidence: newConfidence, delta: parseFloat((newConfidence - previousConfidence).toFixed(3)), reason: operation };
}
export function isValidConfidence(confidence) { return confidence >= CONFIDENCE_BOUNDS.MIN && confidence <= CONFIDENCE_BOUNDS.MAX; }
export function isConfidenceValidForWrite(confidence) { return confidence >= CONFIDENCE_BOUNDS.MIN_FOR_WRITE; }
export function isConfidenceValidForRetrieval(confidence) { return confidence >= CONFIDENCE_BOUNDS.MIN_FOR_RETRIEVAL; }
export function shouldArchiveByConfidence(confidence) { return confidence <= CONFIDENCE_BOUNDS.ARCHIVE_THRESHOLD; }
export function createConfidenceHistoryRecord(params) {
  const { factId, waxId, previousConfidence, newConfidence, reason, evidence, triggeredBySessionId, triggeredByAiRequestId, triggeredByJob } = params;
  return { fact_id: factId, wax_id: waxId, previous_confidence: previousConfidence, new_confidence: newConfidence, delta: parseFloat((newConfidence - previousConfidence).toFixed(3)), change_reason: reason, change_evidence: evidence || null, triggered_by_session_id: triggeredBySessionId || null, triggered_by_ai_request_id: triggeredByAiRequestId || null, triggered_by_job: triggeredByJob || null };
}
export function applyDecay(currentConfidence, category, daysSinceLastEvidence) {
  const categoryDecayRates = { profile: 0, academic: 0.02, misconception: 0.05, preference: 0.02, progress: 0.03, behavioral: 0.02 };
  const baseRate = categoryDecayRates[category] || 0;
  if (baseRate === 0) return currentConfidence;
  return Math.max(CONFIDENCE_BOUNDS.MIN, currentConfidence - (baseRate * (daysSinceLastEvidence / 30)));
}
export function getDecayRate(category) { const r = { profile: 0, academic: 0.02, misconception: 0.05, preference: 0.02, progress: 0.03, behavioral: 0.02 }; return r[category] || 0; }
export function getConfidenceLevel(confidence) { if (confidence >= 0.85) return 'very_high'; if (confidence >= 0.70) return 'high'; if (confidence >= 0.50) return 'reasonable'; if (confidence >= 0.30) return 'moderate'; return 'weak'; }
export default { applyConfidenceTransition, calculateConfidenceChange, isValidConfidence, isConfidenceValidForWrite, isConfidenceValidForRetrieval, shouldArchiveByConfidence, createConfidenceHistoryRecord, applyDecay, getDecayRate, getConfidenceLevel };
