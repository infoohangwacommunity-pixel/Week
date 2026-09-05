import { StudentMemoryAccess } from './StudentMemoryAccess.js';
import { FACT_CATEGORIES, FACT_KEYS, PROVENANCE } from './MemoryTaxonomy.js';
import { MemoryWriterError, FactConflictError } from './MemoryErrors.js';
export class MemoryWriter {
  constructor(waxId) { this.waxId = waxId; this.memoryAccess = new StudentMemoryAccess(waxId); }
  async writeFact(params) {
    try {
      const { factKey, factCategory, factValue, displayText, provenance, sessionId = null, aiRequestId = null } = params;
      const validKeys = FACT_KEYS.map(k => k.key);
      if (!validKeys.includes(factKey)) console.warn(`Unknown fact_key: ${factKey}`);
      const validCategories = Object.keys(FACT_CATEGORIES);
      if (!validCategories.includes(factCategory)) throw new MemoryWriterError(`Invalid fact category: ${factCategory}`, this.waxId, factKey);
      const validProvenances = Object.keys(PROVENANCE);
      if (!validProvenances.includes(provenance)) throw new MemoryWriterError(`Invalid provenance: ${provenance}`, this.waxId, factKey);
      const fact = await this.memoryAccess.writeFact({ factKey, factCategory, factValue, displayText, provenance, sessionId, aiRequestId });
      return { success: true, fact, action: 'created' };
    } catch (err) {
      if (err instanceof MemoryWriterError || err instanceof FactConflictError) throw err;
      throw new MemoryWriterError(`Failed to write fact: ${err.message}`, this.waxId, params.factKey);
    }
  }
  async writeMultipleFacts(facts, sessionId = null, aiRequestId = null) {
    const results = [], errors = [];
    for (const fact of facts) {
      try { const result = await this.writeFact({ ...fact, sessionId: fact.sessionId || sessionId, aiRequestId: fact.aiRequestId || aiRequestId }); results.push(result); }
      catch (err) { errors.push({ factKey: fact.factKey, error: err.message }); }
    }
    return { results, errors, successCount: results.length, errorCount: errors.length };
  }
  async writeExtractedFacts(extractedFacts, sessionId, aiRequestId = null) {
    return this.writeMultipleFacts(extractedFacts.map(fact => ({ factKey: fact.fact_key, factCategory: fact.fact_category, factValue: fact.fact_value, displayText: fact.display_text, provenance: fact.provenance, sessionId, aiRequestId })), sessionId, aiRequestId);
  }
  async getFactByKey(factKey) {
    const facts = await this.memoryAccess.retrieveFacts({ categories: [FACT_KEYS.find(k => k.key === factKey)?.category], minConfidence: 0 });
    return facts.find(f => f.fact_key === factKey && f.status === 'active') || null;
  }
}
export default MemoryWriter;
