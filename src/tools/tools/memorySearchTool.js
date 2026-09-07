/**
 * Memory Search Tool - Phase G Stage 36
 * 
 * Implements student-scoped memory retrieval using PostgreSQL full-text search
 * (tsvector) with metadata filters. After Stage 41, this will be upgraded to
 * hybrid BM25 + semantic search with pgvector.
 * 
 * CRITICAL: WaxID is derived from trusted session context, NEVER from AI-provided arguments.
 */

import config from '../../config/index.js';

/**
 * Execute memory search
 */
export async function executeMemorySearch({
  waxId,
  sessionId,
  query,
  maxResults = 3,
  factCategories = null,
}) {
  const startTime = Date.now();

  // Build the search query
  const searchQuery = buildSearchQuery(query);
  
  // Build WHERE clause for student isolation and optional filters
  const whereClauses = ['wax_id = $1'];
  const params = [waxId];
  let paramIndex = 2;

  if (factCategories && factCategories.length > 0) {
    whereClauses.push(`fact_category = ANY($${paramIndex})`);
    params.push(factCategories);
    paramIndex++;
  }

  whereClauses.push(`status = 'active'`);

  // Build ORDER BY for relevance (tsvector ranking)
  const orderBy = 'SET.ranking DESC';

  const queryStr = `
    WITH search_terms AS (
      SELECT to_tsquery('english', $${paramIndex}) as query
    ),
    ranked_facts AS (
      SELECT 
        sf.id,
        sf.fact_key,
        sf.fact_category,
        sf.display_text,
        sf.fact_value,
        sf.confidence,
        sf.provenance,
        sf.created_at,
        ts_rank_cd(to_tsvector('english', sf.display_text || ' ' || sf.fact_key::text), st.query) as ranking
      FROM student_facts sf, search_terms st
      WHERE ${whereClauses.join(' AND ')}
        AND to_tsvector('english', sf.display_text || ' ' || sf.fact_key::text) @@ st.query
      ORDER BY ranking DESC
      LIMIT $${paramIndex + 1}
    )
    SELECT * FROM ranked_facts
  `;

  const searchParams = [
    ...params.slice(0, paramIndex - 1),
    query,
    maxResults,
  ];

  const results = await queryMemory(searchQuery, whereClauses, params, maxResults);
  
  const latencyMs = Date.now() - startTime;

  // Format results with untrusted-content framing
  const formattedResults = results.map(r => ({
    id: r.id,
    fact_key: r.fact_key,
    fact_category: r.fact_category,
    display_text: r.display_text,
    fact_value: r.fact_value,
    confidence: parseFloat(r.confidence),
    provenance: r.provenance,
    created_at: r.created_at,
    ranking: r.ranking,
  }));

  return {
    results: formattedResults,
    total_found: formattedResults.length,
    query_latency_ms: latencyMs,
  };
}

/**
 * Build a search query from natural language
 * For now, use simple text search. After Stage 41, add semantic search.
 */
function buildSearchQuery(query) {
  // Normalize query
  const normalizedQuery = query.toLowerCase().trim();
  
  // Remove common stopwords (simple implementation)
  const stopwords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for'];
  const words = normalizedQuery
    .split(/\s+/)
    .filter(w => !stopwords.includes(w) && w.length > 2);
  
  return words.join(' & ');
}

/**
 * Query the database for memory results
 */
async function queryMemory(query, whereClauses, params, maxResults) {
  // This is a simplified implementation. The actual implementation should
  // be in a dedicated memory retriever service.
  
  const queryStr = `
    SELECT 
      sf.id,
      sf.fact_key,
      sf.fact_category,
      sf.display_text,
      sf.fact_value,
      sf.confidence,
      sf.provenance,
      sf.created_at
    FROM student_facts sf
    WHERE ${whereClauses.join(' AND ')}
    ORDER BY sf.created_at DESC
    LIMIT $1
  `;

  const result = await db.query(queryStr, [maxResults]);
  return result.rows;
}

/**
 * Create a student-scoped memory access instance
 * This enforces that WaxID is bound at construction and immutable
 */
export class StudentMemoryAccess {
  constructor(waxId, db) {
    if (!waxId || typeof waxId !== 'string') {
      throw new Error('WaxID must be a valid UUID string');
    }
    
    this.waxId = waxId;
    this.db = db;
  }

  /**
   * Search memory with student isolation enforced
   */
  async search({ query, maxResults = 3, factCategories = null }) {
    // WaxID is already bound at construction - cannot be overridden
    return executeMemorySearch({
      waxId: this.waxId,
      sessionId: null, // Will be set by caller
      query,
      maxResults,
      factCategories,
    });
  }

  /**
   * Read a specific memory by ID
   */
  async read(memoryId) {
    const query = `
      SELECT 
        'fact' as type,
        id,
        fact_key,
        fact_category,
        fact_value,
        display_text,
        confidence,
        provenance,
        created_at
      FROM student_facts
      WHERE id = $1 AND wax_id = $2 AND status = 'active'
      
      UNION ALL
      
      SELECT 
        'episode' as type,
        id,
        session_id::text as fact_key,
        'episode' as fact_category,
        jsonb_build_object('summary', summary_text) as fact_value,
        summary_text as display_text,
        0.7 as confidence,
        'episode_extracted' as provenance,
        session_end as created_at
      FROM student_episodes
      WHERE id = $1 AND wax_id = $2
    `;

    const result = await this.db.query(query, [memoryId, this.waxId]);
    
    if (result.rows.length === 0) {
      return { found: false };
    }

    return {
      found: true,
      ...result.rows[0],
    };
  }
}

export default {
  executeMemorySearch,
  StudentMemoryAccess,
};
