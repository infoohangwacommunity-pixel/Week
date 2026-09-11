/**
 * WaxPrep - Student Model Context Interface
 * 
 * Stage 34: Student Model to AI Interface
 * 
 * This is the most important stage - it translates the student model
 * (structured data in PostgreSQL) into readable, interpretable, 
 * token-budget-aware context that the AI receives before each tutoring turn.
 * 
 * Design Principles:
 * 1. Evidence, not decisions - communicate raw evidence, not recommendations
 * 2. Uncertainty is information - communicate confidence levels
 * 3. Recency is information - include when evidence was last observed
 * 4. Token budgeted - respect context budget (default 500 tokens)
 * 5. Prioritized - only show relevant concepts
 * 
 * The interface outputs both formatted text (for AI context injection)
 * and structured JSON (for programmatic access).
 */

import { promisify } from 'util';

/**
 * Student Model Context Interface
 */
export class StudentModelContextInterface {
  /**
   * Create a StudentModelContextInterface
   * @param {import('../db/index.js').Pool} pool - Database connection pool
   * @param {Object} learningModule - StudentLearningAccess instance
   */
  constructor(pool, learningModule) {
    this.pool = pool;
    this.learningModule = learningModule;
    
    // Default token budget
    this.DEFAULT_TOKEN_BUDGET = 500;
  }

  /**
   * Get student model context for AI injection
   * 
   * This is the primary interface method. It returns:
   * - formattedText: Ready for AI context injection
   * - snapshotJson: Structured data for programmatic access
   * - metadata: Token estimates and quality notes
   * 
   * @param {string} wax_id - Student's WaxID
   * @param {Object} options - Query options
   * @param {number} [options.tokenBudget] - Maximum tokens (default: 500)
   * @param {boolean} [options.includeMisconceptions=true] - Include active misconceptions
   * @param {boolean} [options.includeSignals=true] - Include learning signals
   * @param {string} [options.freshness='cached'] - Use cached snapshot if available
   * @param {string[]} [options.conceptTags] - Only include these concepts
   * 
   * @returns {Promise<Object>} Student model context
   */
  async getStudentModelContext(wax_id, options = {}) {
    const {
      tokenBudget = this.DEFAULT_TOKEN_BUDGET,
      includeMisconceptions = true,
      includeSignals = true,
      freshness = 'cached',
      conceptTags = null,
    } = options;

    // Try to use cached snapshot
    if (freshness !== 'fresh') {
      const snapshot = await this.learningModule.getStudentModelSnapshot(wax_id);
      if (snapshot && !snapshot.is_stale) {
        return {
          formattedText: snapshot.snapshot_text,
          snapshotJson: snapshot.snapshot_json,
          metadata: {
            totalTokensEstimated: snapshot.estimated_tokens,
            conceptsIncluded: snapshot.concept_count,
            conceptsOmitted: 0,
            snapshotAge: 'cached',
            evidenceQualityNote: this._generateQualityNote(snapshot.snapshot_json),
            source: 'snapshot',
          },
        };
      }
    }

    // Build fresh context
    const context = await this._buildFreshContext(wax_id, {
      tokenBudget,
      includeMisconceptions,
      includeSignals,
      conceptTags,
    });

    return {
      formattedText: context.formattedText,
      snapshotJson: context.snapshotJson,
      metadata: {
        totalTokensEstimated: context.estimatedTokens,
        conceptsIncluded: context.conceptsIncluded,
        conceptsOmitted: context.conceptsOmitted,
        snapshotAge: 'fresh',
        evidenceQualityNote: context.evidenceQualityNote,
        source: 'fresh',
      },
    };
  }

  /**
   * Build a fresh student model context
   * @private
   */
  async _buildFreshContext(wax_id, options) {
    const {
      tokenBudget,
      includeMisconceptions,
      includeSignals,
      conceptTags,
    } = options;

    // Get knowledge states
    const knowledgeStates = await this.learningModule.getKnowledgeStates(wax_id, {
      conceptTags,
      minMastery: 0.05, // Only show concepts with some evidence
    });

    // Get active misconceptions
    const activeMisconceptions = includeMisconceptions 
      ? await this.learningModule.getActiveMisconceptions(wax_id)
      : [];

    // Get recent learning signals
    const learningSignals = includeSignals
      ? await this.learningModule.getLearningSignals(wax_id, {
          signal_type: 'session_engagement',
        })
      : [];

    // Prioritize concepts
    const prioritizedConcepts = this._prioritizeConcepts(knowledgeStates, activeMisconceptions);

    // Build formatted text within token budget
    const { formattedText, estimatedTokens, conceptsIncluded, conceptsOmitted } = 
      this._formatContext(prioritizedConcepts, activeMisconceptions, learningSignals, tokenBudget);

    // Build JSON representation
    const snapshotJson = {
      knowledge_states: prioritizedConcepts.slice(0, conceptsIncluded),
      active_misconceptions: activeMisconceptions,
      learning_signals: learningSignals.slice(0, 5), // Limit signals
      metadata: {
        total_concepts: knowledgeStates.length,
        concepts_included: conceptsIncluded,
        concepts_omitted: conceptsOmitted,
        token_estimate: estimatedTokens,
      },
    };

    // Generate quality note
    const evidenceQualityNote = this._generateQualityNote(snapshotJson);

    return {
      formattedText,
      snapshotJson,
      estimatedTokens,
      conceptsIncluded,
      conceptsOmitted,
      evidenceQualityNote,
    };
  }

  /**
   * Prioritize concepts for inclusion in context
   * @private
   */
  _prioritizeConcepts(knowledgeStates, activeMisconceptions) {
    const misconceptionConcepts = new Set(
      activeMisconceptions.map(m => m.concept_tag),
    );

    // Sort by priority:
    // 1. Concepts with active misconceptions
    // 2. Concepts with most recent evidence
    // 3. Concepts with highest evidence count
    // 4. Concepts with highest mastery (for reinforcement)

    return [...knowledgeStates].sort((a, b) => {
      // Priority 1: Has misconception
      const aHasMisconception = misconceptionConcepts.has(a.concept_tag);
      const bHasMisconception = misconceptionConcepts.has(b.concept_tag);
      if (aHasMisconception && !bHasMisconception) return -1;
      if (!aHasMisconception && bHasMisconception) return 1;

      // Priority 2: Recent evidence
      const aRecent = new Date(a.last_evidence_at || 0).getTime();
      const bRecent = new Date(b.last_evidence_at || 0).getTime();
      if (aRecent !== bRecent) return bRecent - aRecent;

      // Priority 3: Evidence count
      if (a.evidence_count !== b.evidence_count) {
        return b.evidence_count - a.evidence_count;
      }

      // Priority 4: Mastery (for concepts being reinforced)
      return b.mastery_estimate - a.mastery_estimate;
    });
  }

  /**
   * Format context text within token budget
   * @private
   */
  _formatContext(concepts, misconceptions, signals, tokenBudget) {
    let text = '';
    let estimatedTokens = 0;
    let conceptsIncluded = 0;
    const conceptsOmitted = concepts.length;

    // Header
    text += '[Student Learning Model — use as evidence for teaching, not as prescriptions]\n\n';
    estimatedTokens += 12;

    // Concept knowledge section
    text += 'Concept Knowledge (based on evidence):\n';
    estimatedTokens += 6;

    for (const concept of concepts) {
      const line = this._formatConceptLine(concept);
      const lineTokens = this._estimateTokens(line);
      
      if (estimatedTokens + lineTokens > tokenBudget) {
        break;
      }

      text += line + '\n';
      estimatedTokens += lineTokens;
      conceptsIncluded++;
    }

    if (conceptsOmitted > conceptsIncluded) {
      text += `\n... and ${conceptsOmitted - conceptsIncluded} more concepts (token budget limit)`;
      estimatedTokens += 8;
    }

    text += '\n';

    // Misconceptions section
    if (misconceptions.length > 0) {
      text += 'Active Misconceptions:\n';
      estimatedTokens += 3;

      for (const mc of misconceptions) {
        const status = mc.status === 'confirmed' ? '[CONFIRMED]' : '[SUSPECTED]';
        const line = `• ${mc.concept_tag}: ${status} "${mc.description}"`;
        const lineTokens = this._estimateTokens(line);
        
        if (estimatedTokens + lineTokens > tokenBudget) {
          break;
        }

        text += line + '\n';
        estimatedTokens += lineTokens;
      }

      text += '\n';
    }

    // Learning signals section
    if (signals.length > 0) {
      text += 'Recent Learning Signals:\n';
      estimatedTokens += 3;

      for (const signal of signals.slice(0, 3)) {
        const line = `• ${signal.signal_type}: ${signal.signal_text || signal.signal_value}`;
        const lineTokens = this._estimateTokens(line);
        
        if (estimatedTokens + lineTokens > tokenBudget) {
          break;
        }

        text += line + '\n';
        estimatedTokens += lineTokens;
      }

      text += '\n';
    }

    return {
      formattedText: text.trim(),
      estimatedTokens,
      conceptsIncluded,
      conceptsOmitted,
    };
  }

  /**
   * Format a single concept line
   * @private
   */
  _formatConceptLine(concept) {
    const mastery = (concept.mastery_estimate * 100).toFixed(0);
    const trend = concept.recent_trend === 'insufficient_data' 
      ? `${concept.evidence_count} observation(s)`
      : `${concept.evidence_count} observations | ${concept.recent_trend}`;
    
    const lastEvidence = concept.last_evidence_at 
      ? `| ${this._formatRecency(concept.last_evidence_at)}`
      : '';
    
    const hintDep = concept.hint_dependency !== null 
      ? `| hint dependency: ${concept.hint_dependency < 0.2 ? 'low' : concept.hint_dependency < 0.5 ? 'moderate' : 'high'}`
      : '';

    return `• ${concept.concept_tag || concept.display_name || concept.canonical_tag}: mastery ${mastery}% | ${trend}${lastEvidence}${hintDep}`;
  }

  /**
   * Format recency as human-readable string
   * @private
   */
  _formatRecency(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'today';
    if (diffDays === 1) return 'yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return `${Math.floor(diffDays / 30)} months ago`;
  }

  /**
   * Estimate token count for text
   * @private
   */
  _estimateTokens(text) {
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate evidence quality note
   * @private
   */
  _generateQualityNote(snapshotJson) {
    const totalStates = snapshotJson.knowledge_states.length;
    const avgEvidence = snapshotJson.knowledge_states.reduce((sum, s) => sum + s.evidence_count, 0) / Math.max(totalStates, 1);

    if (avgEvidence < 3) {
      return 'Most knowledge estimates based on limited observations. Treat as preliminary signals. Do not treat mastery estimates as definitive. Use your judgment.';
    } else if (avgEvidence < 5) {
      return 'Knowledge estimates based on moderate evidence. Use as guidance but apply your pedagogical judgment.';
    } else {
      return 'Knowledge estimates based on substantial evidence. Use as reliable guidance for instruction.';
    }
  }

  /**
   * Create a student model snapshot
   * @param {string} wax_id - Student's WaxID
   * @returns {Promise<Object>} Created snapshot
   */
  async createSnapshot(wax_id) {
    const context = await this.getStudentModelContext(wax_id, { freshness: 'fresh' });
    
    return this.learningModule.createStudentModelSnapshot(wax_id, {
      snapshot_text: context.formattedText,
      snapshot_json: context.snapshotJson,
      estimated_tokens: context.metadata.totalTokensEstimated,
    });
  }

  /**
   * Invalidate a student's snapshot (mark as stale)
   * @param {string} wax_id - Student's WaxID
   */
  async invalidateSnapshot(wax_id) {
    await this.learningModule.markSnapshotStale(wax_id);
  }
}

export default StudentModelContextInterface;
