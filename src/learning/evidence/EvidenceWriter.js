/**
 * WaxPrep - Evidence Writer
 * 
 * Handles writing learning observations to the database.
 * Part of the Evidence Collection Pipeline (Stage 28).
 * 
 * Responsibilities:
 * - Write individual observations
 * - Batch write observations
 * - Auto-create concept registry entries when needed
 * - Mark knowledge states as stale when observations are written
 * - Enforce idempotency (prevent duplicate evidence)
 * 
 * This module is called by:
 * - AI response processing (inline evidence)
 * - Session summarizer (session-end evidence extraction)
 * - Dedicated evaluation jobs
 */

import config from '../config/index.js';

/**
 * EvidenceWriter handles writing learning observations to the database.
 */
export class EvidenceWriter {
  /**
   * Create an EvidenceWriter
   * @param {import('../db/index.js').Pool} pool - Database connection pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Write a single learning observation
   * 
   * @param {Object} observation - The observation to write
   * @param {string} observation.wax_id - Student's WaxID (foreign key to students)
   * @param {string} observation.session_id - Session ID (foreign key to sessions)
   * @param {string} observation.concept_tag - Concept tag (may not exist yet)
   * @param {string} observation.evidence_type - One of EVIDENCE_TYPES
   * @param {number|null} observation.correctness - 0.0-1.0 for assessable types, null otherwise
   * @param {number} [observation.hint_level=0] - Number of hints received
   * @param {number|null} [observation.extraction_confidence] - Confidence in extraction
   * @param {string} observation.extraction_method - 'llm_evaluation', 'ai_inline', 'self_report'
   * @param {string|null} [observation.message_id] - Reference to messages table
   * @param {string|null} [observation.ai_request_id] - Reference to ai_requests table
   * @param {string|null} [observation.evaluator_model] - Which AI model evaluated
   * @param {string|null} [observation.evaluator_prompt_version] - Prompt version used
   * @param {boolean} [observation.possible_misconception=false] - Whether this suggests a misconception
   * @param {string|null} [observation.misconception_tag] - Misconception category
   * @param {number|null} [observation.response_time_ms] - Time to respond in ms
   * 
   * @returns {Promise<{id: string, conceptCreated: boolean}>}
   */
  async write(observation) {
    const {
      wax_id,
      session_id,
      concept_tag,
      evidence_type,
      correctness,
      hint_level = 0,
      extraction_confidence,
      extraction_method,
      message_id = null,
      ai_request_id = null,
      evaluator_model = null,
      evaluator_prompt_version = null,
      possible_misconception = false,
      misconception_tag = null,
      response_time_ms = null,
    } = observation;

    // Validate required fields
    if (!wax_id || !session_id || !concept_tag || !evidence_type || !extraction_method) {
      throw new Error('Missing required observation fields: wax_id, session_id, concept_tag, evidence_type, extraction_method');
    }

    // Validate evidence type
    const { isValidEvidenceType } = await import('./EvidenceTaxonomy.js');
    if (!isValidEvidenceType(evidence_type)) {
      throw new Error(`Invalid evidence type: ${evidence_type}`);
    }

    // Validate correctness if required
    const { requiresCorrectness } = await import('./EvidenceTaxonomy.js');
    if (requiresCorrectness(evidence_type) && (correctness === null || correctness === undefined)) {
      throw new Error(`Evidence type ${evidence_type} requires correctness value`);
    }

    // If assessable, ensure correctness is in valid range
    if (requiresCorrectness(evidence_type)) {
      if (correctness < 0 || correctness > 1) {
        throw new Error(`Correctness must be between 0 and 1, got: ${correctness}`);
      }
    }

    // Check if concept exists, create if not
    let conceptCreated = false;
    const conceptExists = await this._conceptExists(concept_tag);
    
    if (!conceptExists) {
      await this._createConcept(concept_tag);
      conceptCreated = true;
    }

    // Write the observation
    const query = `
      INSERT INTO learning_observations (
        wax_id,
        session_id,
        concept_tag,
        evidence_type,
        correctness,
        correctness_confidence,
        hint_level,
        response_time_ms,
        extraction_method,
        extraction_confidence,
        evaluator_model,
        evaluator_prompt_version,
        message_id,
        ai_request_id,
        possible_misconception,
        misconception_tag,
        observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, NOW())
      ON CONFLICT (wax_id, message_id, concept_tag, evidence_type) DO NOTHING
      RETURNING id
    `;

    const params = [
      wax_id,
      session_id,
      concept_tag,
      evidence_type,
      correctness,
      correctness === null ? null : 0.70, // Default confidence if not provided
      hint_level,
      response_time_ms,
      extraction_method,
      extraction_confidence || 0.70,
      evaluator_model,
      evaluator_prompt_version,
      message_id,
      ai_request_id,
      possible_misconception,
      misconception_tag,
    ];

    const result = await this.pool.query(query, params);

    if (result.rows.length === 0) {
      // Duplicate or invalid - could be idempotency key collision
      return { id: null, conceptCreated, duplicate: true };
    }

    // Mark knowledge state as stale
    await this._markKnowledgeStateStale(wax_id, concept_tag);

    return { id: result.rows[0].id, conceptCreated, duplicate: false };
  }

  /**
   * Batch write multiple observations
   * 
   * @param {Array} observations - Array of observations to write
   * 
   * @returns {Promise<Array<{id: string|null, conceptCreated: boolean, duplicate: boolean}>>}
   */
  async batchWrite(observations) {
    if (!Array.isArray(observations) || observations.length === 0) {
      return [];
    }

    const results = [];
    for (const obs of observations) {
      try {
        const result = await this.write(obs);
        results.push(result);
      } catch (error) {
        console.error('Error writing observation:', error);
        results.push({ id: null, conceptCreated: false, duplicate: false, error: error.message });
      }
    }
    return results;
  }

  /**
   * Check if a concept exists in the registry
   * @private
   */
  async _conceptExists(concept_tag) {
    const result = await this.pool.query(
      'SELECT id FROM concepts WHERE canonical_tag = $1 AND archived_at IS NULL',
      [concept_tag]
    );
    return result.rows.length > 0;
  }

  /**
   * Create a new concept registry entry
   * @private
   */
  async _createConcept(concept_tag) {
    // Extract display name from tag (convert snake_case to Title Case)
    const displayName = concept_tag
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    const query = `
      INSERT INTO concepts (canonical_tag, display_name, created_by)
      VALUES ($1, $2, 'ai_extraction')
      RETURNING id
    `;

    await this.pool.query(query, [concept_tag, displayName]);
  }

  /**
   * Mark a knowledge state as stale when new evidence arrives
   * @private
   */
  async _markKnowledgeStateStale(wax_id, concept_tag) {
    // This is a placeholder - the actual implementation may use a different mechanism
    // For now, we could update last_computed_at or set a flag
    // The knowledge state will be recomputed on next access
    await this.pool.query(
      'UPDATE knowledge_states SET last_computed_at = NOW() WHERE wax_id = $1 AND concept_tag = $2',
      [wax_id, concept_tag]
    );
  }
}

export default EvidenceWriter;
