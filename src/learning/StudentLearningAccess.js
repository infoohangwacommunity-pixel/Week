/**
 * WaxPrep - Student Learning Access Layer
 * 
 * Provides the primary API for accessing and manipulating student learning data.
 * This is the interface between the learning infrastructure and the rest of the system.
 * 
 * Responsibilities:
 * - Knowledge state access and updates
 * - Evidence writing
 * - Misconception tracking
 * - Learning signals
 * - Student model snapshots
 * 
 * All operations enforce student isolation (wax_id scoping).
 */

import { EvidenceWriter } from './evidence/EvidenceWriter.js';
import { MasteryEngine } from './mastery/MasteryEngine.js';
import { v4 as uuidv4 } from 'uuid';

/**
 * Student Learning Access Layer
 */
export class StudentLearningAccess {
  /**
   * Create a StudentLearningAccess instance
   * @param {import('../db/index.js').Pool} pool - Database connection pool
   * @param {EvidenceWriter} evidenceWriter - Evidence writer instance
   * @param {MasteryEngine} masteryEngine - Mastery engine instance
   * @param {Object} evidenceTaxonomy - Evidence taxonomy module
   */
  constructor(pool, evidenceWriter, masteryEngine, evidenceTaxonomy) {
    this.pool = pool;
    this.evidenceWriter = evidenceWriter;
    this.masteryEngine = masteryEngine;
    this.evidenceTaxonomy = evidenceTaxonomy;
  }

  // ============================================================
  // KNOWLEDGE STATE ACCESS
  // ============================================================

  /**
   * Get all knowledge states for a student
   * @param {string} wax_id - Student's WaxID
   * @param {Object} options - Query options
   * @param {string[]} [options.conceptTags] - Filter to specific concepts
   * @param {string[]} [options.trends] - Filter by trend (improving, stable, declining)
   * @param {number} [options.minMastery] - Minimum mastery estimate
   * @param {number} [options.maxMastery] - Maximum mastery estimate
   * @returns {Promise<Array>} Knowledge states
   */
  async getKnowledgeStates(wax_id, options = {}) {
    const { conceptTags, trends, minMastery, maxMastery } = options;
    
    let query = `
      SELECT ks.*, c.display_name, c.subject
      FROM knowledge_states ks
      LEFT JOIN concepts c ON ks.concept_tag = c.canonical_tag
      WHERE ks.wax_id = $1
    `;
    
    const params = [wax_id];
    let paramNum = 2;

    if (conceptTags && conceptTags.length > 0) {
      query += ` AND ks.concept_tag = ANY($${paramNum++})`;
      params.push(conceptTags);
    }

    if (trends && trends.length > 0) {
      query += ` AND ks.recent_trend = ANY($${paramNum++})`;
      params.push(trends);
    }

    if (minMastery !== undefined) {
      query += ` AND ks.mastery_estimate >= $${paramNum++}`;
      params.push(minMastery);
    }

    if (maxMastery !== undefined) {
      query += ` AND ks.mastery_estimate <= $${paramNum++}`;
      params.push(maxMastery);
    }

    query += ' ORDER BY ks.last_evidence_at DESC NULLS LAST';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Get knowledge state for a specific concept
   * @param {string} wax_id - Student's WaxID
   * @param {string} concept_tag - Concept tag
   * @returns {Promise<Object|null>} Knowledge state or null
   */
  async getKnowledgeState(wax_id, concept_tag) {
    const result = await this.pool.query(
      'SELECT ks.*, c.display_name, c.subject FROM knowledge_states ks ' +
      'LEFT JOIN concepts c ON ks.concept_tag = c.canonical_tag ' +
      'WHERE ks.wax_id = $1 AND ks.concept_tag = $2',
      [wax_id, concept_tag]
    );
    return result.rows[0] || null;
  }

  /**
   * Update knowledge state for a concept (triggers RWEA computation)
   * @param {string} wax_id - Student's WaxID
   * @param {string} concept_tag - Concept tag
   * @returns {Promise<Object>} Updated knowledge state
   */
  async updateKnowledgeState(wax_id, concept_tag) {
    return this.masteryEngine.updateState(wax_id, concept_tag);
  }

  // ============================================================
  // EVIDENCE COLLECTION
  // ============================================================

  /**
   * Write a learning observation
   * @param {Object} observation - The observation to write
   * @returns {Promise<{id: string|null, conceptCreated: boolean, duplicate: boolean}>}
   */
  async writeObservation(observation) {
    return this.evidenceWriter.write(observation);
  }

  /**
   * Batch write learning observations
   * @param {Array} observations - Array of observations
   * @returns {Promise<Array>} Write results
   */
  async batchWriteObservations(observations) {
    return this.evidenceWriter.batchWrite(observations);
  }

  /**
   * Get observations for a student
   * @param {string} wax_id - Student's WaxID
   * @param {Object} options - Query options
   * @param {string} [options.concept_tag] - Filter by concept
   * @param {string} [options.evidence_type] - Filter by evidence type
   * @param {Date} [options.since] - Only observations after this date
   * @param {number} [options.limit] - Maximum observations to return
   * @returns {Promise<Array>} Observations
   */
  async getObservations(wax_id, options = {}) {
    const { concept_tag, evidence_type, since, limit = 100 } = options;
    
    let query = `
      SELECT lo.*, c.display_name
      FROM learning_observations lo
      LEFT JOIN concepts c ON lo.concept_tag = c.canonical_tag
      WHERE lo.wax_id = $1 AND lo.deleted_at IS NULL
    `;
    
    const params = [wax_id];
    let paramNum = 2;

    if (concept_tag) {
      query += ` AND lo.concept_tag = $${paramNum++}`;
      params.push(concept_tag);
    }

    if (evidence_type) {
      query += ` AND lo.evidence_type = $${paramNum++}`;
      params.push(evidence_type);
    }

    if (since) {
      query += ` AND lo.observed_at >= $${paramNum++}`;
      params.push(since);
    }

    query += ` ORDER BY lo.observed_at DESC LIMIT ${paramNum}`;

    const result = await this.pool.query(query, params.slice(0, paramNum - 1));
    return result.rows;
  }

  // ============================================================
  // MISCONCEPTION TRACKING
  // ============================================================

  /**
   * Get active misconceptions for a student
   * @param {string} wax_id - Student's WaxID
   * @returns {Promise<Array>} Active misconceptions
   */
  async getActiveMisconceptions(wax_id) {
    const result = await this.pool.query(
      `SELECT m.*, c.display_name 
       FROM misconceptions m
       LEFT JOIN concepts c ON m.concept_tag = c.canonical_tag
       WHERE m.wax_id = $1 
       AND m.status IN ('suspected', 'confirmed')
       AND m.deleted_at IS NULL
       ORDER BY m.confidence DESC, m.first_detected_at DESC`,
      [wax_id]
    );
    return result.rows;
  }

  /**
   * Get a specific misconception
   * @param {string} misconception_id - Misconception ID
   * @returns {Promise<Object|null>}
   */
  async getMisconception(misconception_id) {
    const result = await this.pool.query(
      'SELECT * FROM misconceptions WHERE id = $1',
      [misconception_id]
    );
    return result.rows[0] || null;
  }

  /**
   * Record a possible misconception
   * @param {Object} data - Misconception data
   * @param {string} data.wax_id - Student's WaxID
   * @param {string} data.concept_tag - Concept tag
   * @param {string} data.description - Misconception description
   * @param {string[]} data.observation_ids - Supporting observation IDs
   * @param {number} [data.confidence=0.5] - Confidence level
   * @param {string} data.detected_by - Who detected it
   * @returns {Promise<Object>} Created misconception
   */
  async recordPossibleMisconception(data) {
    const {
      wax_id,
      concept_tag,
      description,
      observation_ids,
      confidence = 0.5,
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
   * Confirm a misconception (promote from suspected to confirmed)
   * @param {string} misconception_id - Misconception ID
   * @param {number} confidence - New confidence level
   * @returns {Promise<Object>} Updated misconception
   */
  async confirmMisconception(misconception_id, confidence = 0.75) {
    const query = `
      UPDATE misconceptions 
      SET status = 'confirmed',
          confidence = $2,
          last_confirmed_at = NOW()
      WHERE id = $1 AND status = 'suspected'
      RETURNING *
    `;

    const result = await this.pool.query(query, [misconception_id, confidence]);
    return result.rows[0] || null;
  }

  // ============================================================
  // LEARNING SIGNALS
  // ============================================================

  /**
   * Get learning signals for a student
   * @param {string} wax_id - Student's WaxID
   * @param {Object} options - Query options
   * @param {string} [options.session_id] - Filter by session
   * @param {string} [options.signal_type] - Filter by signal type
   * @returns {Promise<Array>} Learning signals
   */
  async getLearningSignals(wax_id, options = {}) {
    const { session_id, signal_type } = options;
    
    let query = `
      SELECT * FROM learning_signals
      WHERE wax_id = $1
    `;
    
    const params = [wax_id];
    let paramNum = 2;

    if (session_id) {
      query += ` AND session_id = $${paramNum++}`;
      params.push(session_id);
    }

    if (signal_type) {
      query += ` AND signal_type = $${paramNum++}`;
      params.push(signal_type);
    }

    query += ' ORDER BY observed_at DESC';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Write a learning signal
   * @param {Object} signal - The signal to write
   * @returns {Promise<Object>} Created signal
   */
  async writeSignal(signal) {
    const query = `
      INSERT INTO learning_signals (
        wax_id,
        session_id,
        concept_tag,
        signal_type,
        signal_value,
        signal_text,
        signal_metadata,
        signal_confidence,
        extracted_by,
        observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;

    const {
      wax_id,
      session_id,
      concept_tag,
      signal_type,
      signal_value,
      signal_text,
      signal_metadata,
      signal_confidence = 0.7,
      extracted_by,
    } = signal;

    const result = await this.pool.query(query, [
      wax_id,
      session_id,
      concept_tag,
      signal_type,
      signal_value,
      signal_text,
      signal_metadata,
      signal_confidence,
      extracted_by,
    ]);

    return result.rows[0];
  }

  // ============================================================
  // STUDENT MODEL SNAPSHOTS
  // ============================================================

  /**
   * Get the current student model snapshot
   * @param {string} wax_id - Student's WaxID
   * @returns {Promise<Object|null>}
   */
  async getStudentModelSnapshot(wax_id) {
    const result = await this.pool.query(
      `SELECT * FROM student_model_snapshots 
       WHERE wax_id = $1 AND is_stale = FALSE
       ORDER BY generated_at DESC
       LIMIT 1`,
      [wax_id]
    );
    return result.rows[0] || null;
  }

  /**
   * Create a new student model snapshot
   * @param {string} wax_id - Student's WaxID
   * @param {Object} data - Snapshot data
   * @param {string} data.snapshot_text - Formatted text for AI context
   * @param {Object} data.snapshot_json - Structured JSON data
   * @param {number} data.estimated_tokens - Estimated token count
   * @returns {Promise<Object>} Created snapshot
   */
  async createStudentModelSnapshot(wax_id, data) {
    const {
      snapshot_text,
      snapshot_json,
      estimated_tokens,
    } = data;

    const query = `
      INSERT INTO student_model_snapshots (
        wax_id,
        snapshot_text,
        snapshot_json,
        covers_through,
        estimated_tokens,
        knowledge_state_count,
        active_misconception_count,
        concept_count,
        generated_at
      ) SELECT 
        $1, $2, $3, MAX(observed_at), $4,
        (SELECT COUNT(*) FROM knowledge_states WHERE wax_id = $1),
        (SELECT COUNT(*) FROM misconceptions WHERE wax_id = $1 AND status IN ('suspected', 'confirmed')),
        (SELECT COUNT(DISTINCT concept_tag) FROM learning_observations WHERE wax_id = $1 AND deleted_at IS NULL),
        NOW()
      FROM learning_observations
      WHERE wax_id = $1
      RETURNING *
    `;

    const result = await this.pool.query(query, [wax_id, snapshot_text, snapshot_json, estimated_tokens]);
    return result.rows[0];
  }

  /**
   * Mark snapshot as stale
   * @param {string} wax_id - Student's WaxID
   */
  async markSnapshotStale(wax_id) {
    await this.pool.query(
      'UPDATE student_model_snapshots SET is_stale = TRUE WHERE wax_id = $1',
      [wax_id]
    );
  }

  // ============================================================
  // CONCEPT REGISTRY
  // ============================================================

  /**
   * Get concepts from the registry
   * @param {Object} options - Query options
   * @param {string} [options.subject] - Filter by subject
   * @param {string} [options.search] - Search in display_name or aliases
   * @returns {Promise<Array>} Concepts
   */
  async getConcepts(options = {}) {
    const { subject, search } = options;
    
    let query = 'SELECT * FROM concepts WHERE archived_at IS NULL';
    const params = [];
    let paramNum = 1;

    if (subject) {
      query += ` AND subject = $${paramNum++}`;
      params.push(subject);
    }

    if (search) {
      query += ` AND (display_name ILIKE $${paramNum} OR aliases @> ARRAY[$${paramNum}])`;
      params.push(`%${search}%`, search);
    }

    query += ' ORDER BY display_name';

    const result = await this.pool.query(query, params);
    return result.rows;
  }

  /**
   * Create a new concept
   * @param {Object} concept - Concept data
   * @param {string} concept.canonical_tag - Canonical tag
   * @param {string} concept.display_name - Display name
   * @param {string} [concept.subject] - Subject classification
   * @param {string} [concept.curriculum_notes] - Curriculum context
   * @returns {Promise<Object>} Created concept
   */
  async createConcept(concept) {
    const { canonical_tag, display_name, subject, curriculum_notes } = concept;

    const query = `
      INSERT INTO concepts (canonical_tag, display_name, subject, curriculum_notes, created_by)
      VALUES ($1, $2, $3, $4, 'admin')
      RETURNING *
    `;

    const result = await this.pool.query(query, [canonical_tag, display_name, subject, curriculum_notes]);
    return result.rows[0];
  }

  // ============================================================
  // RECONCILIATION AND INTEGRITY
  // ============================================================

  /**
   * Reconcile knowledge states with observations
   * Recomputes all states from scratch and alerts if there are discrepancies
   * @param {string} wax_id - Student's WaxID
   * @returns {Promise<Object>} Reconciliation results
   */
  async reconcileKnowledgeStates(wax_id) {
    // Get all concept tags for this student
    const conceptsResult = await this.pool.query(
      'SELECT DISTINCT concept_tag FROM learning_observations WHERE wax_id = $1 AND deleted_at IS NULL',
      [wax_id]
    );

    const results = {
      total_concepts: conceptsResult.rows.length,
      updated: 0,
      errors: [],
    };

    for (const row of conceptsResult.rows) {
      try {
        await this.masteryEngine.updateState(wax_id, row.concept_tag);
        results.updated++;
      } catch (error) {
        results.errors.push({
          concept_tag: row.concept_tag,
          error: error.message,
        });
      }
    }

    return results;
  }

  // ============================================================
  // UTILITY METHODS
  // ============================================================

  /**
   * Get evidence type metadata
   * @param {string} type - Evidence type
   * @returns {Object} Metadata
   */
  getEvidenceTypeMetadata(type) {
    return this.evidenceTaxonomy.EVIDENCE_TYPE_METADATA[type] || null;
  }

  /**
   * Get all evidence types
   * @returns {Object} Evidence types
   */
  getAllEvidenceTypes() {
    return this.evidenceTaxonomy.EVIDENCE_TYPES;
  }
}

export default StudentLearningAccess;
