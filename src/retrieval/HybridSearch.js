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
import { EmbeddingService } from './EmbeddingService.js';

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
  constructor({ db, embeddingService }) {
    this.db = db;
    this.embeddingService = embeddingService;
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
    // Extract text content if query is an object (e.g., webhook payload)
    let searchText = query;
    if (typeof query === 'object' && query !== null) {
      // Try to extract text from common webhook/message formats
      searchText = query.content || query.text || query.message || '';
    }
    if (typeof searchText !== 'string') {
      searchText = String(searchText || '');
    }
    
    // Normalize query
    const searchQuery = searchText.toLowerCase().trim();

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
    // Generate embedding for query (returns JS array [0.1, 0.2, ...])
    const queryEmbedding = await this.generateEmbedding(query);

    // Debug: log embedding details
    console.log('[HybridSearch] Semantic search starting');
    console.log('[HybridSearch] Embedding length:', queryEmbedding.length);
    console.log('[HybridSearch] Embedding sample (first 3):', queryEmbedding.slice(0, 3));
    
    // Pass embedding as JavaScript array - pg driver will handle serialization
    // pgvector supports array parameters natively
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
        1 - (sf.embedding <=> $1::vector) as semantic_score
      FROM student_facts sf
      WHERE sf.wax_id = $2
        AND sf.status = 'active'
        AND sf.embedding IS NOT NULL
      ORDER BY semantic_score DESC
      LIMIT 20
    `;

    try {
      // Pass embedding array directly - pg driver should serialize correctly
      console.log('[HybridSearch] Passing embedding as array with', queryEmbedding.length, 'dimensions');
      const result = await this.db.query(queryStr, [queryEmbedding, waxId]);
      console.log('[HybridSearch] Semantic search completed, got', result.rows.length, 'results');
      return result.rows;
    } catch (err) {
      console.error('[HybridSearch] Semantic search error:', err.message);
      console.error('[HybridSearch] Embedding type:', typeof queryEmbedding, Array.isArray(queryEmbedding) ? 'array' : 'not array');
      console.error('[HybridSearch] Embedding sample:', queryEmbedding.slice(0, 3));
      throw err;
    }
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
   * Returns JavaScript array [0.1, 0.2, ...] for proper pg vector binding
   */
  async generateEmbedding(text) {
    // Try to use the injected embedding service
    if (this.embeddingService) {
      try {
        const embedding = await this.embeddingService.generateEmbedding(text);
        // EmbeddingService already returns a JavaScript array
        return embedding;
      } catch (error) {
        // Log error but continue with mock embedding
        console.warn('Embedding service failed, using mock embedding:', error.message);
      }
    }
    
    // Fallback to mock embedding if service unavailable
    const dimensions = config.EMBEDDING_DIMENSIONS || 1536;
    return Array(dimensions).fill(0);
  }
}

export default HybridSearch;
