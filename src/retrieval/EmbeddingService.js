/**
 * Embedding Service - Phase H Stage 41
 * 
 * Asynchronous embedding generation for student_facts and student_episodes.
 * 
 * Architecture:
 * - On write: save record with embedding = NULL, enqueue BullMQ job
 * - Provider abstraction: OpenAI text-embedding-3-small recommended
 * - Batch processing for cost efficiency
 * - Cache concept tag embeddings
 */

import config from '../config/index.js';

/**
 * Embedding service class
 */
export class EmbeddingService {
  constructor({ db, queue, logger }) {
    this.db = db;
    this.queue = queue;
    this.logger = logger;
  }

  /**
   * Queue embedding generation for a record
   */
  async queueEmbedding({ targetType, targetId, waxId, text }) {
    // Create embedding job
    const job = await this.queue.add('generate-embedding', {
      targetType,
      targetId,
      waxId,
      text,
    });

    return { jobId: job.id };
  }

  /**
   * Process embedding generation job
   */
  async processEmbeddingJob({ targetType, targetId, waxId, text }) {
    try {
      // Generate embedding
      const embedding = await this.generateEmbedding(text);

      // Update record with embedding
      await this.updateEmbedding({
        targetType,
        targetId,
        embedding,
      });

      return { success: true, embeddingLength: embedding.length };
    } catch (error) {
      this.logger.error('Embedding generation failed', {
        error: error.message,
        targetType,
        targetId,
      }, 'Embedding generation failed');

      // Update job status to failed
      await this.markJobFailed({ targetType, targetId, error: error.message });

      return { success: false, error: error.message };
    }
  }

  /**
   * Generate embedding for text
   */
  async generateEmbedding(text) {
    const provider = config.EMBEDDING_PROVIDER;

    switch (provider) {
      case 'openai':
        return await this.generateOpenAIEmbedding(text);
      case 'nomic':
        return await this.generateNomicEmbedding(text);
      case 'cohere':
        return await this.generateCohereEmbedding(text);
      case 'gemini':
        return await this.generateGeminiEmbedding(text);
      default:
        throw new Error(`Unknown embedding provider: ${provider}`);
    }
  }

  /**
   * Generate OpenAI embedding
   */
  async generateOpenAIEmbedding(text) {
    const apiKey = config.EMBEDDING_API_KEY;
    const model = config.EMBEDDING_MODEL || 'text-embedding-3-small';

    if (!apiKey) {
      throw new Error('EMBEDDING_API_KEY is not configured');
    }

    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model,
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data[0].embedding;
  }

  /**
   * Generate Nomic embedding
   */
  async generateNomicEmbedding(text) {
    // Nomic AI embeddings
    const apiKey = config.EMBEDDING_API_KEY;

    const response = await fetch('https://api.nomic.ai/v1/embedding', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        embedding_type: 'text',
        text_inputs: [text],
        model: 'nomic-embed-text-v1',
      }),
    });

    if (!response.ok) {
      throw new Error(`Nomic API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embeddings[0];
  }

  /**
   * Generate Cohere embedding
   */
  async generateCohereEmbedding(text) {
    const apiKey = config.EMBEDDING_API_KEY;

    const response = await fetch('https://api.cohere.ai/v1/embed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
        'X-Client-Name': 'WaxPrep/1.0',
      },
      body: JSON.stringify({
        texts: [text],
        model: 'embed-english-v3.0',
        input_type: 'search_document',
      }),
    });

    if (!response.ok) {
      throw new Error(`Cohere API error: ${response.status}`);
    }

    const data = await response.json();
    return data.embeddings[0];
  }

  /**
   * Generate Gemini embedding
   */
  async generateGeminiEmbedding(text) {
    const apiKey = config.EMBEDDING_API_KEY;
    const model = config.EMBEDDING_MODEL || 'gemini-embedding-2';
    const dimensions = config.EMBEDDING_DIMENSIONS || 1536;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': apiKey,
        },
        body: JSON.stringify({
          content: {
            parts: [{ text }],
          },
          outputDimensionality: dimensions,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `Gemini API error: ${response.status} ${response.statusText} - ${
          errorData.error?.message || 'Unknown error'
        }`,
      );
    }

    const data = await response.json();

    if (!data.embedding || !data.embedding.values) {
      throw new Error('Invalid response from Gemini API: missing embedding values');
    }

    let embedding = data.embedding.values;

    // Handle dimensionality mismatch
    if (embedding.length !== dimensions) {
      if (embedding.length > dimensions) {
        // Truncate
        embedding = embedding.slice(0, dimensions);
      } else {
        // Pad with zeros
        embedding = [...embedding, ...Array(dimensions - embedding.length).fill(0)];
      }
    }

    return embedding;
  }

  /**
   * Update record with embedding
   */
  async updateEmbedding({ targetType, targetId, embedding }) {
    // Build vector literal for pgvector: [0.1,0.2,0.3]
    // The pg driver does not automatically serialize arrays to pgvector format,
    // so we construct the literal string and cast with ::vector
    const vectorLiteral = '[' + embedding.join(',') + ']';
    
    if (targetType === 'student_fact') {
      await this.db.query(
        `UPDATE student_facts
         SET embedding = $1::vector,
             updated_at = NOW()
         WHERE id = $2`,
        [vectorLiteral, targetId],
      );
    } else if (targetType === 'student_episode') {
      await this.db.query(
        `UPDATE student_episodes
         SET embedding = $1::vector,
             updated_at = NOW()
         WHERE id = $2`,
        [vectorLiteral, targetId],
      );
    } else {
      throw new Error(`Unknown target type: ${targetType}`);
    }
  }

  /**
   * Mark embedding job as failed
   */
  async markJobFailed({ targetType, targetId, error }) {
    await this.db.query(
      `UPDATE embedding_jobs
       SET status = 'failed',
           error_message = $1,
           completed_at = NOW()
       WHERE target_type = $2 AND target_id = $3
       AND status IN ('pending', 'processing')`,
      [error, targetType, targetId],
    );
  }

  /**
   * Process batch of embeddings
   */
  async processBatchEmbeddings(records) {
    const batchSize = config.EMBEDDING_BATCH_SIZE;
    const results = [];

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const batchResults = await Promise.allSettled(
        batch.map(record =>
          this.processEmbeddingJob({
            targetType: record.targetType,
            targetId: record.targetId,
            waxId: record.waxId,
            text: record.text,
          }),
        ),
      );

      results.push(...batchResults.map((r, idx) => ({
        ...batch[idx],
        status: r.status,
        result: r.status === 'fulfilled' ? r.value : r.reason,
      })));

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return results;
  }

  /**
   * Convert embedding array to PostgreSQL vector format
   * pgvector accepts: [val1,val2,...] (square brackets, no spaces)
   */
  embeddingToArray(embedding) {
    return '[' + embedding.join(',') + ']';
  }

  /**
   * Get pending embedding jobs
   */
  async getPendingJobs(limit = 100) {
    const result = await this.db.query(
      `SELECT * FROM embedding_jobs
       WHERE status = 'pending'
       ORDER BY created_at ASC
       LIMIT $1`,
      [limit],
    );
    return result.rows;
  }
}

export default EmbeddingService;
