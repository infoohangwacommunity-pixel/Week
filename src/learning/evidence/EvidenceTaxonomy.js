/**
 * WaxPrep - Evidence Taxonomy
 * 
 * Defines the complete evidence type taxonomy for learning observations.
 * This is the foundation of the evidence collection pipeline (Stage 28).
 * 
 * Each evidence type has:
 * - A clear definition of when to use it
 * - Whether it produces assessable correctness data
 * - The quality tier it belongs to (for RWEA weighting)
 * 
 * Evidence types are listed in priority order (highest quality first).
 */

/**
 * Evidence type definitions
 */
export const EVIDENCE_TYPES = {
  /**
   * Student directly responded to a question or prompt.
   * Highest quality evidence. The AI evaluated the response for 
   * correctness and concept relevance.
   * 
   * Quality: Tier 1 (Highest)
   * Assessable: Yes
   * Use when: The AI explicitly asked the student to solve a problem 
   *            or answer a question, and the student responded.
   */
  DIRECT_RESPONSE: 'direct_response',
  
  /**
   * Student tried to explain a concept in their own words.
   * High quality for assessing conceptual understanding (not just 
   * procedural recall).
   * 
   * Quality: Tier 2 (High)
   * Assessable: Yes
   * Use when: The AI asked the student to explain something, and the
   *            student provided an explanation.
   */
  EXPLANATION_ATTEMPT: 'explanation_attempt',
  
  /**
   * Student responded to being told they were wrong. Did they 
   * demonstrate understanding of the correction?
   * 
   * Quality: Tier 3 (Moderate)
   * Assessable: Yes
   * Use when: The AI corrected the student, and the student then
   *            demonstrated understanding of the correction.
   */
  CORRECTION_RESPONSE: 'correction_response',
  
  /**
   * Student asked for a hint or additional help.
   * Not assessable, but important behavioral evidence.
   * 
   * Quality: N/A (behavioral signal)
   * Assessable: No
   * Use when: The student explicitly requests help or a hint.
   */
  HINT_REQUEST: 'hint_request',
  
  /**
   * Student stated how confident they feel.
   * Metacognitive evidence — correlates with actual performance but 
   * is often miscalibrated (Dunning-Kruger effects are real).
   * 
   * Quality: N/A (metacognitive signal)
   * Assessable: No
   * Use when: The student expresses their own confidence level.
   */
  SELF_REPORTED: 'self_reported',
  
  /**
   * Student made an identifiable error that was captured even 
   * without being formally assessed.
   * 
   * Quality: Tier 4 (Lower)
   * Assessable: Yes (correctness = 0)
   * Use when: The student makes a spontaneous mistake without being
   *            formally assessed on it.
   */
  ERROR_COMMISSION: 'error_commission',
  
  /**
   * Student mentioned a concept in a non-assessable way.
   * Engagement evidence.
   * 
   * Quality: Tier 5 (Lowest)
   * Assessable: No
   * Use when: The student mentions a concept without being assessed.
   */
  CONCEPT_MENTION: 'concept_mention',
  
  /**
   * Student spontaneously explained a concept or their reasoning 
   * without being asked.
   * 
   * Quality: Tier 2 (High)
   * Assessable: Yes
   * Use when: The student provides an explanation without being prompted.
   */
  SELF_EXPLANATION: 'self_explanation',
};

/**
 * Evidence type metadata for validation and documentation
 */
export const EVIDENCE_TYPE_METADATA = {
  [EVIDENCE_TYPES.DIRECT_RESPONSE]: {
    assessable: true,
    requiresCorrectness: true,
    qualityTier: 1,
    rweaWeightMultiplier: 1.0,
  },
  [EVIDENCE_TYPES.EXPLANATION_ATTEMPT]: {
    assessable: true,
    requiresCorrectness: true,
    qualityTier: 2,
    rweaWeightMultiplier: 0.9,
  },
  [EVIDENCE_TYPES.CORRECTION_RESPONSE]: {
    assessable: true,
    requiresCorrectness: true,
    qualityTier: 3,
    rweaWeightMultiplier: 0.7,
  },
  [EVIDENCE_TYPES.HINT_REQUEST]: {
    assessable: false,
    requiresCorrectness: false,
    qualityTier: null,
    rweaWeightMultiplier: 0.0, // Not used in RWEA calculation
  },
  [EVIDENCE_TYPES.SELF_REPORTED]: {
    assessable: false,
    requiresCorrectness: false,
    qualityTier: null,
    rweaWeightMultiplier: 0.0, // Not used in RWEA calculation
  },
  [EVIDENCE_TYPES.ERROR_COMMISSION]: {
    assessable: true,
    requiresCorrectness: true, // Always 0
    qualityTier: 4,
    rweaWeightMultiplier: 0.6,
  },
  [EVIDENCE_TYPES.CONCEPT_MENTION]: {
    assessable: false,
    requiresCorrectness: false,
    qualityTier: 5,
    rweaWeightMultiplier: 0.0, // Not used in RWEA calculation
  },
  [EVIDENCE_TYPES.SELF_EXPLANATION]: {
    assessable: true,
    requiresCorrectness: true,
    qualityTier: 2,
    rweaWeightMultiplier: 0.9,
  },
};

/**
 * Validates if an evidence type is valid
 * @param {string} type - The evidence type to validate
 * @returns {boolean}
 */
export function isValidEvidenceType(type) {
  return Object.values(EVIDENCE_TYPES).includes(type);
}

/**
 * Validates if an evidence type requires correctness data
 * @param {string} type - The evidence type
 * @returns {boolean}
 */
export function requiresCorrectness(type) {
  return EVIDENCE_TYPE_METADATA[type]?.assessable ?? false;
}

/**
 * Gets the quality tier for an evidence type
 * @param {string} type - The evidence type
 * @returns {number|null}
 */
export function getQualityTier(type) {
  return EVIDENCE_TYPE_METADATA[type]?.qualityTier ?? null;
}

/**
 * Gets the RWEA weight multiplier for an evidence type
 * @param {string} type - The evidence type
 * @returns {number}
 */
export function getRWEAWeightMultiplier(type) {
  return EVIDENCE_TYPE_METADATA[type]?.rweaWeightMultiplier ?? 0.0;
}

/**
 * Returns all assessable evidence types
 * @returns {string[]}
 */
export function getAssessableTypes() {
  return Object.entries(EVIDENCE_TYPE_METADATA)
    .filter(([, metadata]) => metadata.assessable)
    .map(([type]) => type);
}

/**
 * Returns all non-assessable evidence types
 * @returns {string[]}
 */
export function getNonAssessableTypes() {
  return Object.entries(EVIDENCE_TYPE_METADATA)
    .filter(([, metadata]) => !metadata.assessable)
    .map(([type]) => type);
}

export default {
  EVIDENCE_TYPES,
  EVIDENCE_TYPE_METADATA,
  isValidEvidenceType,
  requiresCorrectness,
  getQualityTier,
  getRWEAWeightMultiplier,
  getAssessableTypes,
  getNonAssessableTypes,
};
