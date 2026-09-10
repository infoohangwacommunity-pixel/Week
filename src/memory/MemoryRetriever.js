import { StudentMemoryAccess } from './StudentMemoryAccess.js';
import { FACT_CATEGORIES, TOKEN_BUDGETS, RETRIEVAL_STRATEGIES, CONFIDENCE_BOUNDS } from './MemoryTaxonomy.js';
import { RetrievalError } from './MemoryErrors.js';
import { HybridSearch } from '../retrieval/HybridSearch.js';
import { EmbeddingService } from '../retrieval/EmbeddingService.js';

export class MemoryRetriever {
  constructor(waxId, db, logger) {
    this.waxId = waxId;
    this.memoryAccess = new StudentMemoryAccess(waxId, db);
    this.db = db;
    this.logger = logger;
    // Create embedding service for hybrid search
    const embeddingService = new EmbeddingService({ db, queue: null, logger });
    this.hybridSearch = new HybridSearch({ db, embeddingService });
  }
  async retrieveRelevantMemories(params = {}) {
    const { sessionId = null, currentMessage = '', tokenBudget = null, useHybridSearch = true } = params;
    const startTime = Date.now();
    try {
      let facts;
      if (useHybridSearch && currentMessage) {
        // Use hybrid search for semantic retrieval
        facts = await this._retrieveFactsHybrid({ currentMessage, tokenBudget: tokenBudget || TOKEN_BUDGETS.FACTS });
      } else {
        // Use recency-based retrieval
        facts = await this._retrieveFacts({ currentMessage, sessionId, tokenBudget: tokenBudget || TOKEN_BUDGETS.FACTS });
      }
      const episodes = [];
      const latency = Date.now() - startTime;
      await this._logRetrieval({ factsCount: facts.length, episodesCount: episodes.length, latency, strategy: useHybridSearch && currentMessage ? RETRIEVAL_STRATEGIES.HYBRID : RETRIEVAL_STRATEGIES.RECENCY });
      return { facts, episodes, totalTokensEstimated: this._estimateTokens(facts, episodes), latency, strategy: useHybridSearch && currentMessage ? RETRIEVAL_STRATEGIES.HYBRID : RETRIEVAL_STRATEGIES.RECENCY };
    } catch (err) { throw new RetrievalError(`Retrieval failed: ${err.message}`, this.waxId, RETRIEVAL_STRATEGIES.RECENCY); }
  }
  async _retrieveFacts(params) {
    const { currentMessage = '', sessionId = null, tokenBudget = TOKEN_BUDGETS.FACTS } = params;
    const allFacts = await this.memoryAccess.retrieveFacts({ strategy: RETRIEVAL_STRATEGIES.RECENCY, limit: 100, minConfidence: CONFIDENCE_BOUNDS.MIN_FOR_RETRIEVAL });
    const currentSubjects = this._extractSubjectsFromMessage(currentMessage);
    const rankedFacts = this._rankFacts(allFacts, currentSubjects);
    const deduplicatedFacts = this._deduplicateFacts(rankedFacts, sessionId, currentMessage);
    return this._applyTokenBudget(deduplicatedFacts, tokenBudget);
  }

  async _retrieveFactsHybrid(params) {
    const { currentMessage, tokenBudget = TOKEN_BUDGETS.FACTS } = params;

    // Use hybrid search for semantic retrieval
    const searchResults = await this.hybridSearch.search({
      waxId: this.waxId,
      query: currentMessage,
      maxResults: 10,
    });

    // Convert hybrid search results to fact format using the REAL metadata
    // returned by HybridSearchResult.toObject() (fact_key, confidence,
    // provenance, etc. from the DB row — no longer fabricated constants).
    const facts = searchResults
      .filter((r) => r.type === 'fact')
      .map((r) => ({
        id: r.id,
        fact_key: r.fact_key || `fact_${r.id}`,
        fact_category: r.fact_category || 'academic',
        display_text: r.content,
        fact_value: r.fact_value || {},
        confidence: typeof r.confidence === 'number' ? r.confidence : 0.5,
        provenance: r.provenance || 'episode_extracted',
        created_at: r.created_at ? new Date(r.created_at) : new Date(),
        _rankScore: r.rrf_score,
      }));

    // Apply deduplication + token budget (the previous implementation skipped
    // dedup, which could allow duplicate facts to reach the prompt).
    const deduplicatedFacts = this._deduplicateFacts(facts, params.sessionId, currentMessage);
    return this._applyTokenBudget(deduplicatedFacts, tokenBudget);
  }
  _extractSubjectsFromMessage(message) {
    // Per AGENTS.md §4: infrastructure must not encode a fixed subject list.
    // The previous implementation hardcoded 14 school subjects (math, physics,
    // chemistry, etc.) and excluded Nigerian subjects like Further Mathematics,
    // Agricultural Science, Computer Science, Yoruba/Igbo/Hausa.
    //
    // Return an empty array — the recency-based ranker no longer biases
    // by hardcoded subjects. The AI decides subject relevance based on
    // the actual content of the messages and facts.
    return [];
  }
  _rankFacts(facts, currentSubjects) {
    const categoryPriority = { profile: 1, misconception: 2, progress: 3, academic: 4, preference: 5, behavioral: 6 };
    return facts.map(fact => {
      let score = categoryPriority[fact.fact_category] || 999;
      score -= fact.confidence * 0.5;
      if (currentSubjects.length > 0) { const factSubjects = fact.fact_value?.subjects || []; score -= factSubjects.filter(s => currentSubjects.includes(s.toLowerCase())).length * 0.2; }
      const recencyScore = (Date.now() - new Date(fact.created_at)) / (1000 * 60 * 60 * 24);
      score -= Math.min(recencyScore, 30) * 0.01;
      return { ...fact, _rankScore: score };
    }).sort((a, b) => a._rankScore - b._rankScore);
  }
  _deduplicateFacts(facts, sessionId, currentMessage) {
    const seenKeys = new Set(), deduplicated = [];
    for (const fact of facts) {
      if (seenKeys.has(fact.fact_key)) continue;
      if (currentMessage.toLowerCase().includes(fact.fact_key.toLowerCase())) continue;
      const wordsInFact = fact.display_text.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      const wordsInMessage = currentMessage.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      if (wordsInFact.filter(w => wordsInMessage.includes(w)).length >= 3) continue;
      deduplicated.push(fact);
      seenKeys.add(fact.fact_key);
    }
    return deduplicated;
  }
  _applyTokenBudget(facts, tokenBudget) {
    let currentTokens = 0, budgetedFacts = [];
    for (const fact of facts) {
      const factTokens = Math.ceil(fact.display_text.length / 3.5);
      if (currentTokens + factTokens <= tokenBudget) { budgetedFacts.push(fact); currentTokens += factTokens; }
    }
    return budgetedFacts;
  }
  _estimateTokens(facts, episodes) {
    let total = 0;
    for (const fact of facts) total += Math.ceil(fact.display_text.length / 3.5);
    for (const episode of episodes) total += Math.ceil(episode.summary_text.length / 3.5);
    return total;
  }
  formatFactsForContext(facts) {
    if (facts.length === 0) return '';
    const lines = facts.map(fact => {
      const level = fact.confidence >= 0.85 ? 'very_high' : fact.confidence >= 0.70 ? 'high' : fact.confidence >= 0.50 ? 'reasonable' : 'moderate';
      const text = level !== 'high' && level !== 'very_high' ? ` (${level})` : '';
      return `• ${fact.display_text}${text}`;
    });
    return `[Student Profile Memory${lines.length > 0 ? ' — use this to personalize responses' : ''}]\n` + lines.join('\n');
  }
  async _logRetrieval(params) {
    const { factsCount, episodesCount, latency, strategy } = params;
    if (!this.logger) {
      console.log(`Memory retrieval: ${factsCount} facts, ${episodesCount} episodes, ${latency}ms (${strategy || 'unknown'})`);
      return;
    }
    const log = this.logger.child ? this.logger.child({ component: 'MemoryRetriever' }) : this.logger;
    log.info({ factsCount, episodesCount, latency, strategy }, 'Memory retrieval completed');
  }
}
export default MemoryRetriever;
