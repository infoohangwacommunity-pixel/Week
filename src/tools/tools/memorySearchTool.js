/**
 * Memory Search Tool - Phase G Stage 36
 *
 * Implements student-scoped memory retrieval using PostgreSQL full-text search
 * (tsvector) with metadata filters. After Stage 41, this is augmented by
 * hybrid BM25 + semantic search via HybridSearch.
 *
 * CRITICAL: WaxID is derived from trusted session context, NEVER from
 * AI-provided arguments.
 */

/**
 * Execute memory search.
 *
 * @param {Object} ctx - Handler context provided by ToolExecutor.
 * @param {import('pg').Pool} ctx.db - The shared Postgres pool.
 * @param {string} ctx.waxId - Student identifier (from session context).
 * @param {string} ctx.sessionId - Session identifier.
 * @param {string} ctx.query - Search query (natural language).
 * @param {number} [ctx.maxResults] - Max facts to return.
 * @param {string[]} [ctx.factCategories] - Optional category filter.
 */
export async function executeMemorySearch({
  db,
  waxId,
  sessionId,
  query,
  maxResults = 3,
  factCategories = null,
}) {
  if (!db) {
    throw new Error('executeMemorySearch: db pool is required (handler context.db)');
  }
  if (!waxId) {
    throw new Error('executeMemorySearch: waxId is required');
  }
  if (!query || typeof query !== 'string') {
    throw new Error('executeMemorySearch: query must be a non-empty string');
  }

  const startTime = Date.now();

  // Build a tsquery in websearch_to_tsquery format (supports OR/AND, quoting,
  // and prefix matching via `word*`).
  const tsQuery = buildSearchQuery(query);

  // Build WHERE clauses for student isolation + optional filters.
  // $1 = waxId (always), $2 = tsquery, $3 = factCategories (optional), $4 = maxResults.
  const whereClauses = ['wax_id = $1', 'status = \'active\''];
  const params = [waxId];
  let paramIndex = 2;

  if (factCategories && Array.isArray(factCategories) && factCategories.length > 0) {
    whereClauses.push(`fact_category = ANY($${paramIndex})`);
    params.push(factCategories);
    paramIndex++;
  }

  // Append tsquery placeholder.
  const tsQueryParamIndex = paramIndex;
  params.push(tsQuery);
  paramIndex++;

  const limitParamIndex = paramIndex;
  params.push(Math.max(1, Math.min(maxResults, 20)));
  paramIndex++;

  const queryStr = `
    SELECT
      sf.id,
      sf.fact_key,
      sf.fact_category,
      sf.display_text,
      sf.fact_value,
      sf.confidence,
      sf.provenance,
      sf.created_at,
      ts_rank_cd(to_tsvector('english', sf.display_text || ' ' || COALESCE(sf.fact_key::text, '')), to_tsquery('english', $${tsQueryParamIndex})) as ranking
    FROM student_facts sf
    WHERE ${whereClauses.join(' AND ')}
      AND to_tsvector('english', sf.display_text || ' ' || COALESCE(sf.fact_key::text, '')) @@ to_tsquery('english', $${tsQueryParamIndex})
    ORDER BY ranking DESC, sf.created_at DESC
    LIMIT $${limitParamIndex}
  `;

  let result;
  try {
    result = await db.query(queryStr, params);
  } catch (err) {
    return {
      success: false,
      error: `Memory search query failed: ${err.message}`,
    };
  }

  const latencyMs = Date.now() - startTime;

  const formattedResults = result.rows.map((r) => ({
    id: r.id,
    fact_key: r.fact_key,
    fact_category: r.fact_category,
    display_text: r.display_text,
    fact_value: r.fact_value,
    confidence: parseFloat(r.confidence),
    provenance: r.provenance,
    created_at: r.created_at,
    ranking: parseFloat(r.ranking),
  }));

  return {
    success: true,
    results: formattedResults,
    total_found: formattedResults.length,
    query_latency_ms: latencyMs,
    waxId,
    sessionId,
  };
}

/**
 * Build a tsquery string from natural-language input.
 * Splits on whitespace, drops stopwords, OR-joins the rest.
 * Returns the empty string if no useful tokens remain.
 */
function buildSearchQuery(query) {
  const normalized = query.toLowerCase().trim();
  const stopwords = new Set([
    'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
    'is', 'are', 'was', 'were', 'be', 'been', 'of', 'with',
  ]);
  const words = normalized.split(/\s+/).filter((w) => w.length > 2 && !stopwords.has(w));
  if (words.length === 0) return '';
  // websearch_to_tsquery OR-joins with whitespace and supports `word*` prefix.
  return words.map((w) => `${w.replace(/[^\w*]/g, '')}*`).join(' ');
}

/**
 * Create a student-scoped memory access instance.
 * Kept for backwards compatibility with tests.
 */
export class StudentMemoryAccess {
  constructor(waxId, db) {
    if (!waxId || typeof waxId !== 'string') {
      throw new Error('WaxID must be a valid UUID string');
    }
    this.waxId = waxId;
    this.db = db;
  }

  async search({ query, maxResults = 3, factCategories = null }) {
    return executeMemorySearch({
      db: this.db,
      waxId: this.waxId,
      sessionId: null,
      query,
      maxResults,
      factCategories,
    });
  }

  async read({ memoryId }) {
    if (!this.db) throw new Error('StudentMemoryAccess.read: db not configured');
    const result = await this.db.query(
      `SELECT id, fact_key, fact_category, display_text, fact_value, confidence, provenance, created_at
       FROM student_facts
       WHERE id = $1 AND wax_id = $2 AND status = 'active'
       LIMIT 1`,
      [memoryId, this.waxId],
    );
    return result.rows[0] || null;
  }
}

export default {
  executeMemorySearch,
  StudentMemoryAccess,
};
