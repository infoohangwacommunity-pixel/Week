/**
 * WaxPrep - Misconception Tracker
 * 
 * Handles identification, tracking, and lifecycle management of student misconceptions.
 * Part of Stage 30 implementation.
 * 
 * Architecture:
 * - Layer 1: Inline flagging (AI flags possible misconceptions during tutoring)
 * - Layer 2: Pattern detection (session-end job analyzes patterns)
 * - Layer 3: Confirmation (after 3+ sessions with same pattern)
 * - Layer 4: Resolution detection (student demonstrates correct understanding)
 * 
 * Key principle: Misconceptions are never confirmed from a single observation.
 * Evidence must accumulate over multiple sessions before marking as confirmed.
 */

/**
 * Misconception Tracker
 */
export class MisconceptionTracker {
  /**
   * Create a MisconceptionTracker
   * @param {import('../db/index.js').Pool} pool - Database connection pool
   */
  constructor(pool) {
    this.pool = pool;
  }

  /**
   * Record a possible misconception from an observation
   * 
   * This is called when an observation has possible_misconception = true.
   * It doesn't immediately create a misconception record - it just notes
   * the possibility for later pattern analysis.
   * 
   * @param {Object} data - Misconception data
   * @param {string} data.wax_id - Student's WaxID
   * @param {string} data.concept_tag - Concept tag
   * @param {string} data.observation_id - The observation ID that flagged it
   * @param {string} data.misconception_tag - AI-suggested misconception tag
   * @param {string} data.description - Description of the suspected misconception
   * 
   * @returns {Promise<void>}
   */
  async recordPossibleMisconception(data) {
    const { wax_id, concept_tag, observation_id, misconception_tag, description } = data;

    // Check if there's an existing suspected misconception for this student/concept
    const existing = await this._getActiveMisconception(wax_id, concept_tag);

    if (existing) {
      // Add this observation to the existing misconception's evidence
      await this._addEvidence(existing.id, observation_id);
      
      // Update confidence based on evidence count
      await this._updateConfidence(existing.id);
    } else {
      // Create new suspected misconception
      await this._createMisconception({
        wax_id,
        concept_tag,
        description,
        observation_ids: [observation_id],
        confidence: 0.5,
        detected_by: 'llm_inline',
      });
    }
  }

  /**
   * Consolidate misconceptions after a session ends
   * 
   * Analyzes all observations from a session to identify patterns
   * and create/update misconception records.
   * 
   * @param {string} wax_id - Student's WaxID
   * @param {string} session_id - Session ID
   * 
   * @returns {Promise<Array>} Misconception updates
   */
  async consolidateMisconceptions(wax_id, session_id) {
    // Get all observations from this session with possible_misconception flags
    const observations = await this.pool.query(
      `SELECT id, concept_tag, misconception_tag, description
       FROM learning_observations
       WHERE wax_id = $1 AND session_id = $2 
       AND possible_misconception = TRUE AND deleted_at IS NULL`,
      [wax_id, session_id]
    );

    if (observations.rows.length === 0) {
      return [];
    }

    const updates = [];

    // Group by concept
    const byConcept = {};
    for (const obs of observations.rows) {
      if (!byConcept[obs.concept_tag]) {
        byConcept[obs.concept_tag] = [];
      }
      byConcept[obs.concept_tag].push(obs);
    }

    // Process each concept
    for (const [concept_tag, conceptObs] of Object.entries(byConcept)) {
      // Check for existing misconception
      const existing = await this._getActiveMisconception(wax_id, concept_tag);

      if (existing) {
        // Add observations to existing misconception
        const obsIds = conceptObs.map(o => o.id);
        await this._addEvidence(existing.id, obsIds);
        
        // Check if should be confirmed
        const updated = await this._updateConfidence(existing.id);
        if (updated.status === 'confirmed') {
          updates.push({ type: 'confirmed', misconception: updated });
        }
      } else {
        // Create new misconception with combined description
        const description = this._synthesizeDescription(conceptObs);
        await this._createMisconception({
          wax_id,
          concept_tag,
          description,
          observation_ids: conceptObs.map(o => o.id),
          confidence: Math.min(0.7, 0.5 + conceptObs.length * 0.1),
          detected_by: 'session_summarizer',
        });
        updates.push({ type: 'created', concept_tag, count: conceptObs.length });
      }
    }

    return updates;
  }

  /**
   * Check if a misconception should be resolved based on new evidence
   * 
   * @param {string} wax_id - Student's WaxID
   * @param {string} concept_tag - Concept tag
   * @param {string} observation_id - The observation showing correct understanding
   * 
   * @returns {Promise<Object|null>} Resolved misconception or null
   */
  async resolveIfDemonstrated(wax_id, concept_tag, observation_id) {
    // Get confirmed misconceptions for this concept
    const misconceptions = await this.pool.query(
      `SELECT * FROM misconceptions 
       WHERE wax_id = $1 AND concept_tag = $2 
       AND status = 'confirmed' AND deleted_at IS NULL`,
      [wax_id, concept_tag]
    );

    let resolved = null;

    for (const misconception of misconceptions.rows) {
      // Check if this observation demonstrates resolution
      const observation = await this._getObservation(observation_id);
      
      if (this._observationDemonstratesResolution(observation, misconception)) {
        resolved = await this._markResolved(misconception.id, observation_id);
      }
    }

    return resolved;
  }

  /**
   * Get active misconceptions for a student
   * @param {string} wax_id - Student's WaxID
   * @returns {Promise<Array>}
   */
  async getActiveMisconceptions(wax_id) {
    const result = await this.pool.query(
      `SELECT m.*, c.display_name
       FROM misconceptions m
       LEFT JOIN concepts c ON m.concept_tag = c.canonical_tag
       WHERE m.wax_id = $1 
       AND m.status IN ('suspected', 'confirmed')
       AND m.deleted_at IS NULL
       ORDER BY 
         CASE WHEN m.status = 'confirmed' THEN 0 ELSE 1 END,
         m.confidence DESC,
         m.first_detected_at DESC`,
      [wax_id]
    );
    return result.rows;
  }

  /**
   * Create a new misconception record
   * @private
   */
  async _createMisconception(data) {
    const {
      wax_id,
      concept_tag,
      description,
      observation_ids,
      confidence,
      detected_by,
    } = data;

    const query = `
      INSERT INTO misconceptions (
        wax_id,
        concept_tag,
        description,
        observation_ids,
        evidence_count,
        confidence,
        status,
        detected_by,
        first_detected_at
      ) VALUES ($1, $2, $3, $4, $5, $6, 'suspected', $7, NOW())
      RETURNING *
    `;

    const result = await this.pool.query(query, [
      wax_id,
      concept_tag,
      description,
      observation_ids,
      observation_ids.length,
      confidence,
      detected_by,
    ]);

    return result.rows[0];
  }

  /**
   * Get an active misconception for a student/concept
   * @private
   */
  async _getActiveMisconception(wax_id, concept_tag) {
    const result = await this.pool.query(
      `SELECT * FROM misconceptions 
       WHERE wax_id = $1 AND concept_tag = $2 
       AND status IN ('suspected', 'confirmed')
       AND deleted_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`,
      [wax_id, concept_tag]
    );
    return result.rows[0] || null;
  }

  /**
   * Add evidence to a misconception
   * @private
   */
  async _addEvidence(misconception_id, observation_ids) {
    const obsIds = Array.isArray(observation_ids) ? observation_ids : [observation_ids];
    
    const query = `
      UPDATE misconceptions 
      SET 
        observation_ids = observation_ids || $1,
        evidence_count = evidence_count + $2,
        updated_at = NOW()
      WHERE id = $3
      RETURNING *
    `;

    await this.pool.query(query, [obsIds, obsIds.length, misconception_id]);
  }

  /**
   * Update confidence and check for status change
   * @private
   */
  async _updateConfidence(misconception_id) {
    // Get updated misconception
    const misconception = await this.pool.query(
      'SELECT * FROM misconceptions WHERE id = $1',
      [misconception_id]
    );

    const mc = misconception.rows[0];

    // Calculate new confidence based on evidence count and consistency
    let newConfidence = mc.confidence;
    let newStatus = mc.status;

    // Confidence increases with more evidence
    if (mc.evidence_count >= 5) {
      newConfidence = Math.min(0.95, newConfidence + 0.15);
    } else if (mc.evidence_count >= 3) {
      newConfidence = Math.min(0.95, newConfidence + 0.10);
    } else if (mc.evidence_count >= 2) {
      newConfidence = Math.min(0.95, newConfidence + 0.05);
    }

    // Promote to confirmed after 3+ observations
    if (mc.evidence_count >= 3 && mc.status === 'suspected') {
      newStatus = 'confirmed';
    }

    if (newConfidence !== mc.confidence || newStatus !== mc.status) {
      const query = `
        UPDATE misconceptions 
        SET confidence = $1, status = $2, last_confirmed_at = NOW()
        WHERE id = $3
        RETURNING *
      `;

      const result = await this.pool.query(query, [newConfidence, newStatus, misconception_id]);
      return result.rows[0];
    }

    return mc;
  }

  /**
   * Mark a misconception as resolved
   * @private
   */
  async _markResolved(misconception_id, resolution_evidence_id) {
    const query = `
      UPDATE misconceptions 
      SET 
        status = 'resolved',
        resolved_at = NOW(),
        resolution_evidence_id = $1
      WHERE id = $2
      RETURNING *
    `;

    const result = await this.pool.query(query, [resolution_evidence_id, misconception_id]);
    return result.rows[0];
  }

  /**
   * Get an observation by ID
   * @private
   */
  async _getObservation(observation_id) {
    const result = await this.pool.query(
      'SELECT * FROM learning_observations WHERE id = $1',
      [observation_id]
    );
    return result.rows[0] || null;
  }

  /**
   * Synthesize a description from multiple observations
   * @private
   */
  _synthesizeDescription(observations) {
    // Combine misconception tags and create a summary description
    const tags = [...new Set(observations.map(o => o.misconception_tag).filter(Boolean))];
    const count = observations.length;
    
    return `Student has shown ${count} instance(s) of ${tags.join(', ')} ${count > 1 ? 'across multiple observations' : ''}.`;
  }

  /**
   * Check if an observation demonstrates resolution of a misconception
   * @private
   */
  _observationDemonstratesResolution(observation, misconception) {
    // A resolution observation should be:
    // 1. Assessable (has correctness)
    // 2. High correctness (>= 0.90)
    // 3. No hints (hint_level = 0)
    // 4. High extraction confidence
    
    if (!observation.correctness) return false;
    if (observation.correctness < 0.90) return false;
    if (observation.hint_level > 0) return false;
    if (observation.extraction_confidence && observation.extraction_confidence < 0.80) return false;
    
    return true;
  }
}

export default MisconceptionTracker;
