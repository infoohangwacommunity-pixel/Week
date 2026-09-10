/**
 * WaxPrep - RWEA Mastery Engine
 * 
 * Implements the Recency-Weighted Evidence Accumulator (RWEA) for
 * mastery estimation (Stage 29).
 * 
 * This is the computational heart of the student model. It transforms
 * raw learning observations into calibrated mastery estimates for each
 * (student, concept) pair.
 * 
 * The RWEA model:
 * - Tracks weighted successes and failures separately
 * - Applies temporal decay (Ebbinghaus-inspired forgetting)
 * - Penalizes hint-dependent responses
 * - Produces a mastery estimate in [0.05, 0.95] range
 * 
 * Configuration is loaded from environment variables.
 */

import config from '../../config/index.js';

/**
 * Default configuration values for RWEA computation
 */
const DEFAULT_CONFIG = {
  // Recency half-life in days (how quickly recent evidence matters more)
  MASTERY_RECENCY_HALFLIFE_DAYS: 30,
  
  // Hint penalty coefficient (higher = stronger penalty for hint use)
  HINT_PENALTY_COEFFICIENT: 0.3,
  
  // Sensitivity parameter for tanh transform (controls how sharply mastery responds)
  SENSITIVITY: 2.0,
  
  // Mastery baseline (everyone starts with some base exposure)
  MASTERY_BASELINE: 0.10,
  
  // Decay lambda for time-since-last-evidence (Ebbinghaus-inspired)
  // 0.015 gives ~46 day half-life
  DECAY_LAMBDA: 0.015,
  
  // Minimum confidence to include observation in computation
  MIN_EXTRACTION_CONFIDENCE: 0.30,
};

/**
 * RWEA Mastery Engine
 */
export class MasteryEngine {
  /**
   * Create a MasteryEngine
   * @param {import('../db/index.js').Pool} pool - Database connection pool
   */
  constructor(pool) {
    this.pool = pool;
    this.config = {
      ...DEFAULT_CONFIG,
      MASTERY_RECENCY_HALFLIFE_DAYS: config.MASTERY_RECENCY_HALFLIFE_DAYS || DEFAULT_CONFIG.MASTERY_RECENCY_HALFLIFE_DAYS,
      HINT_PENALTY_COEFFICIENT: config.HINT_PENALTY_COEFFICIENT || DEFAULT_CONFIG.HINT_PENALTY_COEFFICIENT,
      SENSITIVITY: config.SENSITIVITY || DEFAULT_CONFIG.SENSITIVITY,
      MASTERY_BASELINE: config.MASTERY_BASELINE || DEFAULT_CONFIG.MASTERY_BASELINE,
      DECAY_LAMBDA: config.DECAY_LAMBDA || DEFAULT_CONFIG.DECAY_LAMBDA,
    };
  }

  /**
   * Compute knowledge state for a (wax_id, concept_tag) pair
   * 
   * This is the core RWEA computation algorithm.
   * 
   * @param {string} wax_id - Student's WaxID
   * @param {string} concept_tag - Concept tag
   * 
   * @returns {Promise<Object>} Computed knowledge state
   */
  async computeState(wax_id, concept_tag) {
    // Get all valid observations for this student and concept
    const observations = await this._getObservations(wax_id, concept_tag);

    if (observations.length === 0) {
      return this._getDefaultState(concept_tag);
    }

    // Compute RWEA
    const result = this._computeRWEA(observations);

    // Add observation metadata
    const mostRecentObs = observations.reduce((latest, obs) => 
      new Date(obs.observed_at) > new Date(latest.observed_at) ? obs : latest
    );

    return {
      ...result,
      wax_id,
      concept_tag,
      evidence_count: observations.length,
      last_evidence_at: mostRecentObs.observed_at,
      first_evidence_at: observations.reduce((earliest, obs) => 
        new Date(obs.observed_at) < new Date(earliest.observed_at) ? obs : earliest
      ).observed_at,
    };
  }

  /**
   * Update knowledge state in the database
   * 
   * @param {string} wax_id - Student's WaxID
   * @param {string} concept_tag - Concept tag
   * 
   * @returns {Promise<Object>} Updated knowledge state
   */
  async updateState(wax_id, concept_tag) {
    const state = await this.computeState(wax_id, concept_tag);

    const query = `
      INSERT INTO knowledge_states (
        wax_id,
        concept_tag,
        mastery_estimate,
        success_signal,
        failure_signal,
        recent_trend,
        hint_dependency,
        hint_dependency_trend,
        evidence_count,
        direct_response_count,
        last_evidence_at,
        first_evidence_at,
        decay_factor_applied,
        state_version,
        last_computed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 
               COALESCE((SELECT state_version + 1 FROM knowledge_states WHERE wax_id = $1 AND concept_tag = $2), 1),
               NOW())
      ON CONFLICT (wax_id, concept_tag) 
      DO UPDATE SET
        mastery_estimate = EXCLUDED.mastery_estimate,
        success_signal = EXCLUDED.success_signal,
        failure_signal = EXCLUDED.failure_signal,
        recent_trend = EXCLUDED.recent_trend,
        hint_dependency = EXCLUDED.hint_dependency,
        hint_dependency_trend = EXCLUDED.hint_dependency_trend,
        evidence_count = EXCLUDED.evidence_count,
        direct_response_count = EXCLUDED.direct_response_count,
        last_evidence_at = EXCLUDED.last_evidence_at,
        first_evidence_at = EXCLUDED.first_evidence_at,
        decay_factor_applied = EXCLUDED.decay_factor_applied,
        state_version = knowledge_states.state_version + 1,
        last_computed_at = NOW()
      RETURNING *
    `;

    const params = [
      state.wax_id,
      state.concept_tag,
      state.mastery_estimate,
      state.success_signal,
      state.failure_signal,
      state.recent_trend,
      state.hint_dependency,
      state.hint_dependency_trend,
      state.evidence_count,
      state.direct_response_count || 0,
      state.last_evidence_at,
      state.first_evidence_at,
      state.decay_factor_applied,
    ];

    const result = await this.pool.query(query, params);
    return result.rows[0];
  }

  /**
   * Recompute all knowledge states for a student
   * Useful for applying time decay or after bulk observation changes
   * 
   * @param {string} wax_id - Student's WaxID
   */
  async recomputeAllStates(wax_id) {
    // Get all concept tags for this student
    const conceptsResult = await this.pool.query(
      'SELECT DISTINCT concept_tag FROM learning_observations WHERE wax_id = $1 AND deleted_at IS NULL',
      [wax_id]
    );

    const conceptTags = conceptsResult.rows.map(row => row.concept_tag);

    for (const concept_tag of conceptTags) {
      try {
        await this.updateState(wax_id, concept_tag);
      } catch (error) {
        console.error(`Error recomputing state for ${wax_id}:${concept_tag}:`, error);
      }
    }
  }

  /**
   * Get observations for a student and concept
   * @private
   */
  async _getObservations(wax_id, concept_tag) {
    const result = await this.pool.query(
      `SELECT * FROM learning_observations 
       WHERE wax_id = $1 AND concept_tag = $2 AND deleted_at IS NULL
       ORDER BY observed_at ASC`,
      [wax_id, concept_tag]
    );
    return result.rows;
  }

  /**
   * Compute RWEA from observations
   * @private
   */
  _computeRWEA(observations) {
    const now = new Date();
    const {
      MASTERY_RECENCY_HALFLIFE_DAYS,
      HINT_PENALTY_COEFFICIENT,
      SENSITIVITY,
      MASTERY_BASELINE,
      DECAY_LAMBDA,
    } = this.config;

    // Step 1: Compute observation weights
    const weightedObservations = observations.map(obs => {
      const ageDays = (now - new Date(obs.observed_at)) / (1000 * 86400);
      
      // Recency weight
      const recencyWeight = Math.exp(-Math.log(2) / MASTERY_RECENCY_HALFLIFE_DAYS * ageDays);
      
      // Hint penalty
      const hintPenalty = 1.0 / (1.0 + (obs.hint_level * HINT_PENALTY_COEFFICIENT));
      
      // Extraction confidence weight
      const confidenceWeight = obs.extraction_confidence || 0.70;
      
      const weight = recencyWeight * hintPenalty * confidenceWeight;
      
      return {
        ...obs,
        weight,
      };
    });

    // Step 2: Compute success and failure signals
    const assessableObs = weightedObservations.filter(obs => obs.correctness !== null);
    
    const successSignal = assessableObs.reduce((sum, obs) => 
      sum + obs.weight * obs.correctness, 0
    );
    
    const failureSignal = assessableObs.reduce((sum, obs) => 
      sum + obs.weight * (1 - obs.correctness), 0
    );

    // Step 3: Compute net mastery via tanh transform
    const netSignal = assessableObs.length > 0 
      ? (successSignal - failureSignal) / Math.max(assessableObs.length, 1)
      : 0;
    
    const rawMastery = (Math.tanh(netSignal * SENSITIVITY) + 1) / 2;

    // Step 4: Apply time-since-last-evidence decay
    const mostRecentObs = observations.reduce((latest, obs) => 
      new Date(obs.observed_at) > new Date(latest.observed_at) ? obs : latest
    );
    
    const daysSinceLastEvidence = (now - new Date(mostRecentObs.observed_at)) / (1000 * 86400);
    const temporalDecayFactor = Math.exp(-DECAY_LAMBDA * daysSinceLastEvidence);
    
    const decayedMastery = MASTERY_BASELINE + (rawMastery - MASTERY_BASELINE) * temporalDecayFactor;

    // Step 5: Clamp to [0.05, 0.95]
    const masteryEstimate = Math.max(0.05, Math.min(0.95, decayedMastery));

    // Step 6: Compute trend (compare recent 3 vs previous 3)
    const recent3 = assessableObs.slice(-3);
    const previous3 = assessableObs.slice(-6, -3);
    
    let recentTrend = 'insufficient_data';
    if (recent3.length >= 2 && previous3.length >= 2) {
      const recentAvg = recent3.reduce((sum, obs) => sum + obs.correctness, 0) / recent3.length;
      const previousAvg = previous3.reduce((sum, obs) => sum + obs.correctness, 0) / previous3.length;
      
      const diff = recentAvg - previousAvg;
      if (diff > 0.10) {
        recentTrend = 'improving';
      } else if (diff < -0.10) {
        recentTrend = 'declining';
      } else {
        recentTrend = 'stable';
      }
    }

    // Step 7: Compute hint dependency
    const assessableWithHints = assessableObs.filter(obs => obs.hint_level > 0);
    const hintDependency = assessableObs.length > 0 
      ? assessableWithHints.length / assessableObs.length 
      : null;

    // Step 8: Compute hint dependency trend
    const hintDependencyTrend = this._computeHintDependencyTrend(assessableObs);

    // Step 9: Count direct responses
    const directResponseCount = observations.filter(obs => obs.evidence_type === 'direct_response').length;

    return {
      mastery_estimate: masteryEstimate,
      success_signal: successSignal,
      failure_signal: failureSignal,
      recent_trend: recentTrend,
      hint_dependency: hintDependency,
      hint_dependency_trend: hintDependencyTrend,
      evidence_count: observations.length,
      direct_response_count: directResponseCount,
      decay_factor_applied: temporalDecayFactor,
    };
  }

  /**
   * Compute hint dependency trend
   * @private
   */
  _computeHintDependencyTrend(assessableObs) {
    if (assessableObs.length < 6) return null;
    
    const recent3 = assessableObs.slice(-3);
    const previous3 = assessableObs.slice(-6, -3);
    
    const recentHintRate = recent3.filter(o => o.hint_level > 0).length / recent3.length;
    const previousHintRate = previous3.filter(o => o.hint_level > 0).length / previous3.length;
    
    const diff = recentHintRate - previousHintRate;
    if (diff > 0.15) return 'increasing';
    if (diff < -0.15) return 'decreasing';
    return 'stable';
  }

  /**
   * Get default state for a concept with no evidence
   * @private
   */
  _getDefaultState(concept_tag) {
    return {
      wax_id: null,
      concept_tag,
      mastery_estimate: 0.100,
      success_signal: 0.000,
      failure_signal: 0.000,
      recent_trend: 'insufficient_data',
      hint_dependency: null,
      hint_dependency_trend: null,
      evidence_count: 0,
      direct_response_count: 0,
      last_evidence_at: null,
      first_evidence_at: null,
      decay_factor_applied: 1.0,
      state_version: 1,
      last_computed_at: new Date(),
    };
  }
}

export default MasteryEngine;
