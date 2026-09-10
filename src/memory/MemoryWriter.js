import { StudentMemoryAccess } from './StudentMemoryAccess.js';
import { FACT_CATEGORIES, FACT_KEYS, PROVENANCE } from './MemoryTaxonomy.js';
import { MemoryWriterError, FactConflictError } from './MemoryErrors.js';

export class MemoryWriter {
  /**
   * Create a memory writer for a student.
   *
   * @param {string} waxId - Student identifier.
   * @param {import('pg').Pool} [db] - Optional pool. Forwarded to StudentMemoryAccess.
   */
  constructor(waxId, db) {
    this.waxId = waxId;
    this.memoryAccess = new StudentMemoryAccess(waxId, db);
  }

  async writeFact(params) {
    try {
      const { factKey, factCategory, factValue, displayText, provenance, sessionId = null, aiRequestId = null } = params;

      // Validate fact_category against the lowercase `.name` (DB stores
      // lowercase, tool files validate lowercase). The previous
      // implementation used `Object.keys(FACT_CATEGORIES)` (uppercase)
      // which rejected every valid write.
      const validCategories = Object.values(FACT_CATEGORIES).map((c) => c.name);
      if (!validCategories.includes(factCategory)) {
        throw new MemoryWriterError(
          `Invalid fact category: ${factCategory}. Valid: ${validCategories.join(', ')}`,
          this.waxId, factKey
        );
      }

      // Same for provenance: validate against `.value` (lowercase).
      const validProvenances = Object.values(PROVENANCE).map((p) => p.value);
      if (!validProvenances.includes(provenance)) {
        throw new MemoryWriterError(
          `Invalid provenance: ${provenance}. Valid: ${validProvenances.join(', ')}`,
          this.waxId, factKey
        );
      }

      // Warn on unknown fact_key but don't reject — new keys may be added by the AI.
      const validKeys = FACT_KEYS.map((k) => k.key);
      if (factKey && !validKeys.includes(factKey)) {
        console.warn(`[MemoryWriter] Unknown fact_key: ${factKey}`);
      }

      const fact = await this.memoryAccess.writeFact({
        factKey, factCategory, factValue, displayText, provenance, sessionId, aiRequestId,
      });
      return { success: true, fact, action: 'created' };
    } catch (err) {
      if (err instanceof MemoryWriterError || err instanceof FactConflictError) throw err;
      throw new MemoryWriterError(`Failed to write fact: ${err.message}`, this.waxId, params.factKey);
    }
  }

  async writeMultipleFacts(facts, sessionId = null, aiRequestId = null) {
    const results = [], errors = [];
    for (const fact of facts) {
      try {
        const result = await this.writeFact({
          ...fact,
          sessionId: fact.sessionId || sessionId,
          aiRequestId: fact.aiRequestId || aiRequestId,
        });
        results.push(result);
      } catch (err) {
        errors.push({ factKey: fact.factKey, error: err.message });
      }
    }
    return { results, errors, successCount: results.length, errorCount: errors.length };
  }

  async writeExtractedFacts(extractedFacts, sessionId, aiRequestId = null) {
    return this.writeMultipleFacts(
      extractedFacts.map((fact) => ({
        factKey: fact.fact_key,
        factCategory: fact.fact_category,
        factValue: fact.fact_value,
        displayText: fact.display_text,
        provenance: fact.provenance,
        sessionId, aiRequestId,
      })),
      sessionId, aiRequestId
    );
  }

  async getFactByKey(factKey) {
    const facts = await this.memoryAccess.retrieveFacts({ minConfidence: 0 });
    return facts.find((f) => f.fact_key === factKey && f.status === 'active') || null;
  }
}

export default MemoryWriter;
