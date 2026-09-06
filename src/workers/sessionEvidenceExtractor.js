/**
 * WaxPrep - Session Evidence Extractor
 * 
 * Stage 28: Evidence Collection Pipeline
 * 
 * Extracts learning evidence from completed sessions.
 * This runs after the session summarizer has completed.
 * 
 * The extractor analyzes the session transcript to identify:
 * - Learning observations (correct/incorrect responses)
 * - Misconception indicators
 * - Learning signals (engagement, hint usage)
 * - Concept mentions
 * 
 * Evidence is written to the learning_observations table
 * and knowledge states are updated.
 */

import { MisconceptionTracker } from './misconceptions/MisconceptionTracker.js';
import { EVIDENCE_TYPES } from '../learning/evidence/EvidenceTaxonomy.js';

/**
 * Session Evidence Extractor
 */
export class SessionEvidenceExtractor {
  /**
   * Create a SessionEvidenceExtractor
   * @param {import('../db/index.js').Pool} pool - Database connection pool
   * @param {Object} aiService - AI service for evidence extraction
   */
  constructor(pool, aiService) {
    this.pool = pool;
    this.aiService = aiService;
    this.misconceptionTracker = new MisconceptionTracker(pool);
  }

  /**
   * Extract evidence from a completed session
   * 
   * @param {Object} sessionData - Session data
   * @param {string} sessionData.session_id - Session ID
   * @param {string} sessionData.wax_id - Student's WaxID
   * @param {Array} sessionData.messages - Session messages
   * @param {Array} sessionData.summarizedFacts - Facts extracted by summarizer
   * 
   * @returns {Promise<Object>} Extraction results
   */
  async extractEvidenceFromSession(sessionData) {
    const { session_id, wax_id, messages, summarizedFacts = [] } = sessionData;

    const results = {
      observationsWritten: 0,
      misconceptionsDetected: 0,
      errors: [],
    };

    try {
      // Extract evidence using AI
      const observations = await this._extractObservations(messages, wax_id, session_id);
      
      // Write observations
      for (const obs of observations) {
        try {
          const writeResult = await this._writeObservation(obs, wax_id, session_id);
          if (writeResult.id) {
            results.observationsWritten++;
            
            // Check if this observation suggests a misconception
            if (obs.possible_misconception) {
              await this.misconceptionTracker.recordPossibleMisconception({
                wax_id,
                concept_tag: obs.concept_tag,
                observation_id: writeResult.id,
                misconception_tag: obs.misconception_tag,
                description: `Student showed possible misconception: ${obs.note || 'See observation details'}`,
              });
              results.misconceptionsDetected++;
            }
          }
        } catch (error) {
          results.errors.push({ type: 'observation_write', concept: obs.concept_tag, error: error.message });
        }
      }

      // Consolidate misconceptions after session
      try {
        const misconUpdates = await this.misconceptionTracker.consolidateMisconceptions(wax_id, session_id);
        if (misconUpdates.length > 0) {
          results.misconceptionsDetected += misconUpdates.length;
        }
      } catch (error) {
        results.errors.push({ type: 'misconception_consolidation', error: error.message });
      }

      // Create learning signals for the session
      await this._createSessionSignals(wax_id, session_id, observations);

    } catch (error) {
      results.errors.push({ type: 'extraction', error: error.message });
    }

    return results;
  }

  /**
   * Extract observations from session messages
   * @private
   */
  async _extractObservations(messages, wax_id, session_id) {
    const conversation = messages.map(m => ({
      role: m.direction === 'inbound' ? 'user' : 'assistant',
      content: m.content,
      timestamp: m.created_at,
    })).map(m => `${m.role}: ${m.content}`).join('\n\n');

    const prompt = `
You are a learning evidence extractor for WaxPrep, an AI tutoring platform.
Your task is to identify learning observations from tutoring conversations.

GUIDELINES:
1. Identify moments where the student demonstrates understanding or misunderstanding
2. Extract the concept being learned at each moment
3. Score correctness from 0.0 (completely wrong) to 1.0 (completely correct)
4. Note whether hints were needed
5. Flag potential misconceptions (systematic errors, not one-time slips)
6. Only extract observations with high confidence

EVIDENCE TYPES TO LOOK FOR:
- direct_response: Student answered a question or solved a problem
- explanation_attempt: Student explained a concept in their own words
- self_explanation: Student spontaneously explained reasoning
- error_commission: Student made a clear error
- concept_mention: Student mentioned a concept without assessment
- hint_request: Student asked for help

OUTPUT FORMAT (JSON array):
[
  {
    "concept_tag": "newton_second_law",
    "evidence_type": "direct_response",
    "correctness": 0.85,
    "hint_level": 0,
    "extraction_confidence": 0.90,
    "evidence_quality": "high",
    "note": "Student correctly applied F=ma with minor unit error",
    "possible_misconception": false
  },
  {
    "concept_tag": "force_and_motion",
    "evidence_type": "explanation_attempt",
    "correctness": 0.40,
    "hint_level": 2,
    "extraction_confidence": 0.85,
    "evidence_quality": "moderate",
    "note": "Student believes heavier objects fall faster - Aristotelian misconception",
    "possible_misconception": true,
    "misconception_tag": "aristotelian_falling_bodies"
  }
]

SESSION CONVERSATION:
${conversation}

IMPORTANT: Return ONLY valid JSON, no markdown formatting.
`;

    try {
      const response = await this.aiService.complete({
        messages: [{ role: 'system', content: prompt }],
        systemPrompt: 'You are a learning evidence extractor. Return valid JSON.',
        maxTokens: 4096,
      });

      // Clean up response if it has markdown
      const cleaned = response.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      const observations = JSON.parse(cleaned);

      // Validate and normalize observations
      return observations.map(obs => this._normalizeObservation(obs, wax_id, session_id));

    } catch (error) {
      console.error('Error extracting evidence:', error);
      return [];
    }
  }

  /**
   * Normalize observation to standard format
   * @private
   */
  _normalizeObservation(obs, wax_id, session_id) {
    return {
      wax_id,
      session_id,
      concept_tag: obs.concept_tag || 'unknown',
      evidence_type: obs.evidence_type || 'concept_mention',
      correctness: obs.correctness ?? null,
      correctness_confidence: obs.extraction_confidence || 0.7,
      hint_level: obs.hint_level || 0,
      extraction_method: 'session_extractor',
      extraction_confidence: obs.extraction_confidence || 0.7,
      possible_misconception: obs.possible_misconception || false,
      misconception_tag: obs.misconception_tag || null,
      note: obs.note || null,
    };
  }

  /**
   * Write an observation to the database
   * @private
   */
  async _writeObservation(obs, wax_id, session_id) {
    const query = `
      INSERT INTO learning_observations (
        wax_id,
        session_id,
        concept_tag,
        evidence_type,
        correctness,
        correctness_confidence,
        hint_level,
        extraction_method,
        extraction_confidence,
        possible_misconception,
        misconception_tag,
        observed_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())
      ON CONFLICT (wax_id, session_id, concept_tag, evidence_type) DO NOTHING
      RETURNING id
    `;

    const params = [
      obs.wax_id,
      obs.session_id,
      obs.concept_tag,
      obs.evidence_type,
      obs.correctness,
      obs.correctness_confidence,
      obs.hint_level,
      obs.extraction_method,
      obs.extraction_confidence,
      obs.possible_misconception,
      obs.misconception_tag,
    ];

    const result = await this.pool.query(query, params);
    return result.rows[0] || { id: null };
  }

  /**
   * Create learning signals for the session
   * @private
   */
  async _createSessionSignals(wax_id, session_id, observations) {
    // Calculate hint dependency
    const assessableObs = observations.filter(o => o.correctness !== null);
    const obsWithHints = assessableObs.filter(o => o.hint_level > 0);
    const hintDependency = assessableObs.length > 0 
      ? obsWithHints.length / assessableObs.length 
      : 0;

    // Create hint dependency signal
    if (hintDependency > 0.3) {
      await this.pool.query(`
        INSERT INTO learning_signals (
          wax_id,
          session_id,
          signal_type,
          signal_value,
          signal_confidence,
          extracted_by,
          observed_at
        ) VALUES ($1, $2, 'hint_dependency_session', $3, 0.8, 'session_extractor', NOW())
        ON CONFLICT (wax_id, session_id, signal_type) DO NOTHING
      `, [wax_id, session_id, hintDependency]);
    }

    // Create engagement signal based on observation count
    const engagementLevel = assessableObs.length > 5 ? 'high' : assessableObs.length > 2 ? 'moderate' : 'low';
    
    await this.pool.query(`
      INSERT INTO learning_signals (
        wax_id,
        session_id,
        signal_type,
        signal_text,
        signal_confidence,
        extracted_by,
        observed_at
      ) VALUES ($1, $2, 'session_engagement', $3, 0.7, 'session_extractor', NOW())
      ON CONFLICT (wax_id, session_id, signal_type) DO NOTHING
    `, [wax_id, session_id, engagementLevel]);
  }
}

export default SessionEvidenceExtractor;
