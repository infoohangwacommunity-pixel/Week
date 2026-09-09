/**
 * Hybrid Search - Phase H Stage 43
 * 
 * Implements hybrid BM25 + semantic search using Reciprocal Rank Fusion (RRF).
 * Uses PostgreSQL with pg_textsearch (BM25) and pgvector (semantic).
 * 
 * Architecture:
 * 1. Run BM25 keyword search
 * 2. Run semantic vector search
 * 3. Combine results using RRF
 * 4. Return fused results
 */

import config from '../config/index.js';

/**
 * Reciprocal Rank Fusion (RRF) scoring
 * 
 * rrf_score(d) = sum(1 / (k + rank_method(d)))
 * where k is a constant (default 60)
 */
function calculateRRFScore(ranks, k = 60) {
  let score = 0;
  for (const rank of ranks) {
    if (rank !== null && rank !== undefined) {
      score += 1 / (k + rank);
    }
  }
  return score;
}

/**
 * Hybrid search result class
 */
class HybridSearchResult {
  constructor({
    id,
    waxId,
    content,
    bm25Rank,
    semanticRank,
    bm25Score,
    semanticScore,
    rrfScore,
    type,
  }) {
    this.id = id;
    this.waxId = waxId;
    this.content = content;
    this.bm25Rank = bm25Rank;
    this.semanticRank = semanticRank;
    this.bm25Score = bm25Score;
    this.semanticScore = semanticScore;
    this.rrfScore = rrfScore;
    this.type = type;
  }

  static fromFact(fact, bm25Rank, semanticRank) {
    return new HybridSearchResult({
      id: fact.id,
      waxId: fact.wax_id,
      content: fact.display_text,
      bm25Rank,
      semanticRank,
      bm25Score: fact.bm25_score || null,
      semanticScore: fact.semantic_score || null,
      rrfScore: 0, // Calculated after fusion
      type: 'fact',
    });
  }

  static fromEpisode(episode, bm25Rank, semanticRank) {
    return new HybridSearchResult({
      id: episode.id,
      waxId: episode.wax_id,
      content: episode.summary_text,
      bm25Rank,
      semanticRank,
      bm25Score: episode.bm25_score || null,
      semanticScore: episode.semantic_score || null,
      rrfScore: 0,
      type: 'episode',
    });
  }

  toObject() {
    return {
      id: this.id,
      type: this.type,
      content: this.content,
      rrf_score: this.rrfScore,
      bm25_score: this.bm25Score,
      semantic_score: this.semanticScore,
    };
  }
}

/**
 * Hybrid search service
 */
export class HybridSearch {
  constructor({ db }) {
    this.db = db;
  }

  /**
   * Execute hybrid search across facts and episodes
   */
  async search({ waxId, query, maxResults = null }) {
    maxResults = maxResults || config.RETRIEVAL_MAX_RESULTS;

    // Step 1: Run BM25 search
    const bm25Results = await this.runBM25Search({ waxId, query });

    // Step 2: Run semantic search
    const semanticResults = await this.runSemanticSearch({ waxId, query });

    // Step 3: Fuse results
    const fusedResults = this.fuseResults({
      bm25Results,
      semanticResults,
      maxResults,
    });

    return fusedResults;
  }

  /**
   * Run BM25 (full-text) search
   */
  async runBM25Search({ waxId, query }) {
    // Normalize query
    const searchQuery = query.toLowerCase().trim();

    // Build tsquery
    const tsquery = this.buildTsQuery(searchQuery);

    const queryStr = `
      WITH search_terms AS (
        SELECT to_tsquery('english', $1) as query
      )
      SELECT 
        sf.id,
        sf.wax_id,
        sf.display_text,
        sf.fact_value,
        sf.fact_category,
        sf.provenance,
        sf.confidence,
        sf.created_at,
        'fact' as type,
        ts_rank_cd(to_tsvector('english', sf.display_text), st.query) as bm25_score
      FROM student_facts sf, search_terms st
      WHERE sf.wax_id = $2
        AND sf.status = 'active'
        AND to_tsvector('english', sf.display_text) @@ st.query
      ORDER BY bm25_score DESC
      LIMIT 20
    `;

    const result = await this.db.query(queryStr, [tsquery, waxId]);
    return result.rows;
  }

  /**
   * Run semantic search using pgvector
   */
  async runSemanticSearch({ waxId, query }) {
    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);

    // Use raw SQL with string concatenation to avoid pg driver escaping
    // The embedding is already in pgvector tuple format: (0,0,0,...)
    const queryStr = `
      SELECT 
        sf.id,
        sf.wax_id,
        sf.display_text,
        sf.fact_value,
        sf.fact_category,
        sf.provenance,
        sf.confidence,
        sf.created_at,
        'fact' as type,
        1 - (sf.embedding <=> '${queryEmbedding}') as semantic_score
      FROM student_facts sf
      WHERE sf.wax_id = $1
        AND sf.status = 'active'
        AND sf.embedding IS NOT NULL
      ORDER BY semantic_score DESC
      LIMIT 20
    `;

    const result = await this.db.query(queryStr, [waxId]);
    return result.rows;
  }

  /**
   * Fuse BM25 and semantic results using RRF
   */
  fuseResults({ bm25Results, semanticResults, maxResults }) {
    const k = config.RETRIEVAL_RRF_K;

    // Create rank maps
    const bm25Ranks = new Map();
    bm25Results.forEach((result, index) => {
      bm25Ranks.set(result.id, {
        rank: index + 1,
        score: result.bm25_score,
        data: result,
      });
    });

    const semanticRanks = new Map();
    semanticResults.forEach((result, index) => {
      semanticRanks.set(result.id, {
        rank: index + 1,
        score: result.semantic_score,
        data: result,
      });
    });

    // Calculate RRF scores
    const allIds = new Set([
      ...bm25Ranks.keys(),
      ...semanticRanks.keys(),
    ]);

    const scoredResults = [];

    for (const id of allIds) {
      const bm25Rank = bm25Ranks.get(id);
      const semanticRank = semanticRanks.get(id);

      const rrfScore = calculateRRFScore(
        [
          bm25Rank ? bm25Rank.rank : null,
          semanticRank ? semanticRank.rank : null,
        ],
        k
      );

      if (rrfScore > 0) {
        // Use BM25 data as base (or semantic if BM25 not available)
        const data = bm25Rank ? bm25Rank.data : semanticRank.data;

        scoredResults.push({
          id,
          data,
          bm25Rank: bm25Rank ? bm25Rank.rank : null,
          semanticRank: semanticRank ? semanticRank.rank : null,
          bm25Score: bm25Rank ? bm25Rank.score : null,
          semanticScore: semanticRank ? semanticRank.score : null,
          rrfScore,
          type: data.type,
        });
      }
    }

    // Sort by RRF score
    scoredResults.sort((a, b) => b.rrfScore - a.rrfScore);

    // Convert to result objects
    const results = scoredResults
      .slice(0, maxResults)
      .map(r => {
        const resultObj = new HybridSearchResult({
          id: r.data.id,
          waxId: r.data.wax_id,
          content: r.data.display_text,
          bm25Rank: r.bm25Rank,
          semanticRank: r.semanticRank,
          bm25Score: r.bm25Score,
          semanticScore: r.semanticScore,
          rrfScore: r.rrfScore,
          type: r.type,
        });

        return resultObj.toObject();
      });

    return results;
  }

  /**
   * Build tsquery from natural language query
   */
  buildTsQuery(query) {
    // Simple implementation: split on whitespace, require at least one word
    const words = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 2);

    if (words.length === 0) {
      return '*';
    }

    // Use OR combination for broader results
    return words.map(w => `${w}:*`).join(' | ');
  }

  /**
   * Generate embedding for query
   */
  async generateEmbedding(text) {
    // This would integrate with the embedding service
    // For now, return mock embedding as pgvector tuple string
    // We return a string that will be used in raw SQL concatenation
    // to avoid pg driver double-escaping
    const dimensions = config.EMBEDDING_DIMENSIONS || 1536;
    const embedding = Array(dimensions).fill(0);
    // pgvector accepts vector in tuple format: (v1,v2,v3,...)
    return `(${embedding.join(',')})`;
  }
}

export default HybridSearch;
