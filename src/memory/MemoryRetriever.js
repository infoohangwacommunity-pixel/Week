import { StudentMemoryAccess } from './StudentMemoryAccess.js';
import { FACT_CATEGORIES, TOKEN_BUDGETS, RETRIEVAL_STRATEGIES, CONFIDENCE_BOUNDS } from './MemoryTaxonomy.js';
import { RetrievalError } from './MemoryErrors.js';
export class MemoryRetriever {
  constructor(waxId) { this.waxId = waxId; this.memoryAccess = new StudentMemoryAccess(waxId); }
  async retrieveRelevantMemories(params = {}) {
    const { sessionId = null, currentMessage = '', tokenBudget = null } = params;
    const startTime = Date.now();
    try {
      const facts = await this._retrieveFacts({ currentMessage, sessionId, tokenBudget: tokenBudget || TOKEN_BUDGETS.FACTS });
      const episodes = [];
      const latency = Date.now() - startTime;
      await this._logRetrieval({ factsCount: facts.length, episodesCount: episodes.length, latency });
      return { facts, episodes, totalTokensEstimated: this._estimateTokens(facts, episodes), latency, strategy: RETRIEVAL_STRATEGIES.RECENCY };
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
  _extractSubjectsFromMessage(message) {
    const subjects = ['math', 'mathematics', 'physics', 'chemistry', 'biology', 'english', 'french', 'government', 'economics', 'geography', 'literature', 'commerce', 'accounting', 'civic', 'religious'];
    return subjects.filter(subject => message.toLowerCase().includes(subject));
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
    return `[Student Profile Memory${lines.length > 0 ? ' — use this to personalize responses' : ''}]
` + lines.join('
');
  }
  async _logRetrieval(params) { const { factsCount, episodesCount, latency } = params; console.log(`Memory retrieval: ${factsCount} facts, ${episodesCount} episodes, ${latency}ms`); }
}
export default MemoryRetriever;
