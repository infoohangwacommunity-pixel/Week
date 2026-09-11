import { getDefaultPool } from '../db/index.js';
import config from '../config/index.js';
import { FACT_CATEGORIES, FACT_KEYS, PROVENANCE, CONFLICT_TYPES, CONFIDENCE_BOUNDS, RETRIEVAL_STRATEGIES, CHANGE_REASONS } from './MemoryTaxonomy.js';
import { applyConfidenceTransition, createConfidenceHistoryRecord, isValidConfidence, isConfidenceValidForWrite, isConfidenceValidForRetrieval, getInitialConfidence } from './ConfidenceEngine.js';
import { StudentIsolationError, FactConflictError, ConfidenceBoundsError, FactNotFoundError, DatabaseError } from './MemoryErrors.js';

export class StudentMemoryAccess {
  /**
   * Create a student-scoped memory access instance.
   *
   * @param {string} waxId - Student identifier (bound for the lifetime of this instance).
   * @param {import('pg').Pool} [db] - Optional pool. If omitted, falls back to
   *   the global default pool. Passing `db` is preferred for testability and
   *   for cases where the caller already has a shared pool.
   */
  constructor(waxId, db) {
    if (!waxId || typeof waxId !== 'string') {
      throw new Error('waxId is required and must be a string');
    }
    this.waxId = waxId;
    this._injectedPool = db || null;
  }

  /**
   * Resolve the pool: use the injected pool if available, otherwise lazily
   * fetch the global default pool. The previous implementation declared
   * `pool` as a `const` inside writeFact only, leaving the other 5 methods
   * referencing an undefined `pool` identifier — which threw ReferenceError
   * at runtime.
   */
  async _getPool() {
    if (this._injectedPool) return this._injectedPool;
    return await getDefaultPool(config);
  }

  async writeFact(params) {
    const pool = await this._getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { factKey, factCategory, factValue, displayText, provenance, sessionId = null, messageId = null, aiRequestId = null } = params;
      const confidence = params.confidence || getInitialConfidence(provenance);
      if (!isValidConfidence(confidence)) throw new ConfidenceBoundsError(confidence, CONFIDENCE_BOUNDS, 'write');
      if (!isConfidenceValidForWrite(confidence)) throw new Error(`Confidence ${confidence} is below minimum for write`);

      const existingQuery = 'SELECT id, confidence, evidence_count, contradicted_count, status, fact_value FROM student_facts WHERE wax_id = $1 AND fact_key = $2 AND status = \'active\' LIMIT 1';
      const existingResult = await client.query(existingQuery, [this.waxId, factKey]);

      if (existingResult.rows.length > 0) {
        const existingFact = existingResult.rows[0];
        const valuesMatch = JSON.stringify(existingFact.fact_value) === JSON.stringify(factValue);
        if (valuesMatch) {
          return await this._reinforceFact(client, { factId: existingFact.id, confidence, provenance, sessionId, aiRequestId, evidenceCount: existingFact.evidence_count + 1, currentConfidence: existingFact.confidence });
        } else {
          return await this._handleFactConflict(client, { existingFact, newFactValue: factValue, displayText, provenance, factCategory, factKey, sessionId, messageId, aiRequestId });
        }
      }

      const newFactQuery = 'INSERT INTO student_facts (wax_id, fact_key, fact_category, fact_value, display_text, provenance, source_session_id, source_message_id, source_ai_request_id, confidence, evidence_count, contradicted_count, status, valid_from) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW()) RETURNING *';
      const newFactResult = await client.query(newFactQuery, [this.waxId, factKey, factCategory, factValue, displayText, provenance, sessionId, messageId, aiRequestId, confidence, 1, 0, 'active']);

      const historyRecord = createConfidenceHistoryRecord({ factId: newFactResult.rows[0].id, waxId: this.waxId, previousConfidence: 0, newConfidence: confidence, reason: CHANGE_REASONS.INITIALIZE, triggeredBySessionId: sessionId, triggeredByAiRequestId: aiRequestId });
      await client.query('INSERT INTO memory_confidence_history (fact_id, wax_id, previous_confidence, new_confidence, delta, change_reason, change_evidence, triggered_by_session_id, triggered_by_ai_request_id, triggered_by_job) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [historyRecord.fact_id, historyRecord.wax_id, historyRecord.previous_confidence, historyRecord.new_confidence, historyRecord.delta, historyRecord.change_reason, historyRecord.change_evidence, historyRecord.triggered_by_session_id, historyRecord.triggered_by_ai_request_id, historyRecord.triggered_by_job]);

      await client.query('COMMIT');
      return newFactResult.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof StudentIsolationError || err instanceof FactConflictError || err instanceof ConfidenceBoundsError) throw err;
      throw new DatabaseError(err.message, 'writeFact', [this.waxId]);
    } finally { client.release(); }
  }

  async _reinforceFact(client, params) {
    const { factId, confidence, provenance, sessionId, aiRequestId, evidenceCount, currentConfidence } = params;
    const newConfidence = applyConfidenceTransition(currentConfidence, provenance, CHANGE_REASONS.REINFORCE);
    const updateQuery = 'UPDATE student_facts SET confidence = $1, evidence_count = $2, updated_at = NOW() WHERE id = $3 AND wax_id = $4 AND status = \'active\' RETURNING *';
    const updateResult = await client.query(updateQuery, [newConfidence, evidenceCount, factId, this.waxId]);
    if (updateResult.rows.length === 0) throw new FactNotFoundError(factId, this.waxId);
    const historyRecord = createConfidenceHistoryRecord({ factId, waxId: this.waxId, previousConfidence: currentConfidence, newConfidence, reason: CHANGE_REASONS.REINFORCE, evidence: 'Confidence increased', triggeredBySessionId: sessionId, triggeredByAiRequestId: aiRequestId });
    await client.query('INSERT INTO memory_confidence_history (fact_id, wax_id, previous_confidence, new_confidence, delta, change_reason, change_evidence, triggered_by_session_id, triggered_by_ai_request_id, triggered_by_job) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [historyRecord.fact_id, historyRecord.wax_id, historyRecord.previous_confidence, historyRecord.new_confidence, historyRecord.delta, historyRecord.change_reason, historyRecord.change_evidence, historyRecord.triggered_by_session_id, historyRecord.triggered_by_ai_request_id, historyRecord.triggered_by_job]);
    await client.query('COMMIT');
    return updateResult.rows[0];
  }

  async _handleFactConflict(client, params) {
    const { existingFact, newFactValue, displayText, provenance, factCategory, factKey, sessionId, messageId, aiRequestId } = params;
    const isTemporalUpdate = this._isTemporalUpdate(factKey, existingFact.fact_value, newFactValue);
    if (isTemporalUpdate) return await this._supersedeFact(client, { oldFact: existingFact, newFactValue, displayText, provenance, factCategory, factKey, sessionId, messageId, aiRequestId });
    else return await this._createContradiction(client, { oldFact: existingFact, newFactValue, displayText, provenance, factCategory, factKey, sessionId, messageId, aiRequestId });
  }

  _isTemporalUpdate(factKey, oldValue, newValue) {
    // Per the Newborn AI philosophy (AGENTS.md §4): infrastructure must NOT
    // enforce a fixed educational progression (e.g., "JSS1 → JSS2 → SS1 → SS3"
    // or "WAEC before NECO before JAMB"). That's pedagogical intelligence
    // encoded as a rule engine — exactly what the philosophy forbids.
    //
    // The previous implementation hardcoded class_level and exam_target
    // ordering, which:
    //   - Excluded students who don't follow that exact ladder (private
    //     candidates, adult learners, transfer students).
    //   - Treated exam_target changes as "temporal progression" when they
    //     may be lateral (e.g., NECO → WAEC for a different subject set).
    //
    // We treat any change as a temporal update (supersede the old value)
    // rather than a contradiction. The AI can decide whether the change
    // reflects natural progression, a correction, or a new goal — based
    // on context, not a hardcoded ladder.
    if (oldValue === newValue) return false;
    return true;
  }

  async _supersedeFact(client, params) {
    const { oldFact, newFactValue, displayText, provenance, factCategory, factKey, sessionId, messageId, aiRequestId } = params;
    const now = new Date();
    await client.query('UPDATE student_facts SET status = \'superseded\', superseded_at = $1, valid_until = $1 WHERE id = $2', [now, oldFact.id]);
    const newFactQuery = 'INSERT INTO student_facts (wax_id, fact_key, fact_category, fact_value, display_text, provenance, source_session_id, source_message_id, source_ai_request_id, confidence, evidence_count, contradicted_count, status, valid_from) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *';
    const newFactResult = await client.query(newFactQuery, [this.waxId, factKey, factCategory, newFactValue, displayText, provenance, sessionId, messageId, aiRequestId, getInitialConfidence(provenance), 1, 0, 'active', now]);
    const newFact = newFactResult.rows[0];
    await client.query('UPDATE student_facts SET superseded_by = $1 WHERE id = $2', [newFact.id, oldFact.id]);
    const oldHistory = createConfidenceHistoryRecord({ factId: oldFact.id, waxId: this.waxId, previousConfidence: oldFact.confidence, newConfidence: oldFact.confidence, reason: CHANGE_REASONS.SUPERSEDE, evidence: `Superseded by fact ${newFact.id}`, triggeredBySessionId: sessionId, triggeredByAiRequestId: aiRequestId });
    await client.query('INSERT INTO memory_confidence_history (fact_id, wax_id, previous_confidence, new_confidence, delta, change_reason, change_evidence, triggered_by_session_id, triggered_by_ai_request_id, triggered_by_job) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)', [oldHistory.fact_id, oldHistory.wax_id, oldHistory.previous_confidence, oldHistory.new_confidence, oldHistory.delta, oldHistory.change_reason, oldHistory.change_evidence, oldHistory.triggered_by_session_id, oldHistory.triggered_by_ai_request_id, oldHistory.triggered_by_job]);
    await client.query('COMMIT');
    return newFact;
  }

  async _createContradiction(client, params) {
    const { oldFact, newFactValue, displayText, provenance, factCategory, factKey, sessionId, messageId, aiRequestId } = params;
    const now = new Date();
    await client.query('INSERT INTO memory_contradictions (wax_id, fact_a_id, conflict_type, conflict_description, fact_key, status, detected_by) VALUES ($1, $2, $3, $4, $5, $6, $7)', [this.waxId, oldFact.id, CONFLICT_TYPES.VALUE_CONFLICT, `Fact key ${factKey} has conflicting values: ${JSON.stringify(oldFact.fact_value)} vs ${JSON.stringify(newFactValue)}`, factKey, 'unresolved', 'write_trigger']);
    const newFactQuery = 'INSERT INTO student_facts (wax_id, fact_key, fact_category, fact_value, display_text, provenance, source_session_id, source_message_id, source_ai_request_id, confidence, evidence_count, contradicted_count, status, valid_from) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *';
    const newFactResult = await client.query(newFactQuery, [this.waxId, factKey, factCategory, newFactValue, displayText, provenance, sessionId, messageId, aiRequestId, getInitialConfidence(provenance), 1, 1, 'flagged', now]);
    await client.query('COMMIT');
    return newFactResult.rows[0];
  }

  async retrieveFacts(params = {}) {
    const { strategy = RETRIEVAL_STRATEGIES.RECENCY, limit = 50, categories = null, minConfidence = CONFIDENCE_BOUNDS.MIN_FOR_RETRIEVAL } = params;
    let query = 'SELECT id, wax_id, fact_key, fact_category, fact_value, display_text, provenance, confidence, evidence_count, contradicted_count, status, valid_from, valid_until, created_at, updated_at FROM student_facts WHERE wax_id = $1 AND status = \'active\'  AND confidence >= $2';
    const paramsArray = [this.waxId, minConfidence];
    if (categories && categories.length > 0) { query += ' AND fact_category = ANY($3)'; paramsArray.push(categories); }
    if (strategy === RETRIEVAL_STRATEGIES.RECENCY) query += ' ORDER BY created_at DESC';
    else if (strategy === RETRIEVAL_STRATEGIES.HYBRID) query += ' ORDER BY confidence DESC, created_at DESC';
    query += ` LIMIT $${paramsArray.length + 1}`;
    paramsArray.push(limit);
    try {
      const pool = await this._getPool();
      const result = await pool.query(query, paramsArray);
      for (const row of result.rows) if (row.wax_id !== this.waxId) throw new StudentIsolationError(this.waxId, 'retrieve_facts');
      return result.rows.map(row => ({ id: row.id, wax_id: row.wax_id, fact_key: row.fact_key, fact_category: row.fact_category, fact_value: row.fact_value, display_text: row.display_text, provenance: row.provenance, confidence: parseFloat(row.confidence), evidence_count: row.evidence_count, contradicted_count: row.contradicted_count, status: row.status, valid_from: row.valid_from, valid_until: row.valid_until, created_at: row.created_at, updated_at: row.updated_at }));
    } catch (err) {
      if (err instanceof StudentIsolationError) throw err;
      throw new DatabaseError(err.message, 'retrieveFacts', [this.waxId]);
    }
  }

  async getFactById(factId) {
    const query = 'SELECT id, wax_id, fact_key, fact_category, fact_value, display_text, provenance, confidence, evidence_count, contradicted_count, status, superseded_by, superseded_at, valid_from, valid_until, created_at, updated_at FROM student_facts WHERE id = $1';
    try {
      const pool = await this._getPool();
      const result = await pool.query(query, [factId]);
      if (result.rows.length === 0) return null;
      const row = result.rows[0];
      if (row.wax_id !== this.waxId) throw new StudentIsolationError(this.waxId, 'get_fact_by_id');
      return { id: row.id, wax_id: row.wax_id, fact_key: row.fact_key, fact_category: row.fact_category, fact_value: row.fact_value, display_text: row.display_text, provenance: row.provenance, confidence: parseFloat(row.confidence), evidence_count: row.evidence_count, contradicted_count: row.contradicted_count, status: row.status, superseded_by: row.superseded_by, superseded_at: row.superseded_at, valid_from: row.valid_from, valid_until: row.valid_until, created_at: row.created_at, updated_at: row.updated_at };
    } catch (err) {
      if (err instanceof StudentIsolationError) throw err;
      throw new DatabaseError(err.message, 'getFactById', [factId]);
    }
  }

  async archiveOldFacts(months = 12) {
    const pool = await this._getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const cutoffDate = new Date(); cutoffDate.setMonth(cutoffDate.getMonth() - months);
      const query = 'UPDATE student_facts SET status = \'archived\', updated_at = NOW() WHERE wax_id = $1 AND status = \'superseded\' AND superseded_at < $2 RETURNING id';
      const result = await client.query(query, [this.waxId, cutoffDate]);
      await client.query('COMMIT');
      return result.rowCount;
    } catch (err) {
      await client.query('ROLLBACK');
      if (err instanceof StudentIsolationError) throw err;
      throw new DatabaseError(err.message, 'archiveOldFacts', [this.waxId]);
    } finally { client.release(); }
  }

  async getUnresolvedContradictions() {
    const query = 'SELECT mc.*, fa.fact_key, fa.fact_value as fact_a_value, fa.display_text as fact_a_display, fa.confidence as fact_a_confidence, fb.fact_value as fact_b_value, fb.display_text as fact_b_display, fb.confidence as fact_b_confidence FROM memory_contradictions mc JOIN student_facts fa ON mc.fact_a_id = fa.id LEFT JOIN student_facts fb ON mc.fact_b_id = fb.id WHERE mc.wax_id = $1 AND mc.status = \'unresolved\'';
    try {
      const pool = await this._getPool();
      const result = await pool.query(query, [this.waxId]);
      return result.rows.map(row => ({ id: row.id, wax_id: row.wax_id, fact_a_id: row.fact_a_id, fact_b_id: row.fact_b_id, conflict_type: row.conflict_type, conflict_description: row.conflict_description, fact_key: row.fact_key, status: row.status, resolved_at: row.resolved_at, resolution_notes: row.resolution_notes, detected_at: row.detected_at, detected_by: row.detected_by, fact_a_value: row.fact_a_value, fact_b_value: row.fact_b_value, fact_a_display: row.fact_a_display, fact_b_display: row.fact_b_display, fact_a_confidence: parseFloat(row.fact_a_confidence), fact_b_confidence: parseFloat(row.fact_b_confidence) }));
    } catch (err) { throw new DatabaseError(err.message, 'getUnresolvedContradictions', [this.waxId]); }
  }

  async getConfidenceHistory(factId) {
    const query = 'SELECT id, wax_id, fact_id, previous_confidence, new_confidence, delta, change_reason, change_evidence, triggered_by_session_id, triggered_by_ai_request_id, triggered_by_job, created_at FROM memory_confidence_history WHERE fact_id = $1 ORDER BY created_at DESC';
    try {
      const pool = await this._getPool();
      const result = await pool.query(query, [factId]);
      return result.rows.map(row => ({ id: row.id, wax_id: row.wax_id, fact_id: row.fact_id, previous_confidence: parseFloat(row.previous_confidence), new_confidence: parseFloat(row.new_confidence), delta: parseFloat(row.delta), change_reason: row.change_reason, change_evidence: row.change_evidence, triggered_by_session_id: row.triggered_by_session_id, triggered_by_ai_request_id: row.triggered_by_ai_request_id, triggered_by_job: row.triggered_by_job, created_at: row.created_at }));
    } catch (err) { throw new DatabaseError(err.message, 'getConfidenceHistory', [factId]); }
  }
}

export default StudentMemoryAccess;
