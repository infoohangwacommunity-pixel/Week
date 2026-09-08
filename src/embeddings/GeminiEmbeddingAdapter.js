/**
 * WaxPrep - Gemini Embedding Adapter
 * 
 * Generates embeddings using Google Gemini Embedding API.
 * Supports configurable output dimensionality with automatic truncation/padding.
 */

import config from '../config/index.js';

/**
 * Gemini Embedding Adapter
 */
export class GeminiEmbeddingAdapter {
  constructor() {
    this.name = 'gemini';
    this.defaultModel = config.EMBEDDING_MODEL || 'gemini-embedding-2';
    this.apiKey = config.EMBEDDING_API_KEY;
    this.dimensions = config.EMBEDDING_DIMENSIONS || 1536;
  }

  /**
   * Generate embedding for text using Gemini API
   * 
   * @param {string} text - Text to embed
   * @returns {Promise<number[]>} - Embedding vector
   */
  async generate(text) {
    if (!this.apiKey) {
      throw new Error('EMBEDDING_API_KEY is not configured for Gemini');
    }

    const model = this.defaultModel;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:embedContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
          },
          body: JSON.stringify({
            content: {
              parts: [
                {
                  text: text,
                },
              ],
            },
            outputDimensionality: this.dimensions,
          }),
          signal: AbortSignal.timeout(30000),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gemini API error: ${response.status} ${response.statusText} - ${
            errorData.error?.message || 'Unknown error'
          }`
        );
      }

      const data = await response.json();

      if (!data.embedding || !data.embedding.values) {
        throw new Error('Invalid response from Gemini API: missing embedding values');
      }

      let embedding = data.embedding.values;

      // Handle dimensionality mismatch
      if (embedding.length !== this.dimensions) {
        if (embedding.length > this.dimensions) {
          // Truncate
          embedding = embedding.slice(0, this.dimensions);
        } else {
          // Pad with zeros
          while (embedding.length < this.dimensions) {
            embedding.push(0);
          }
        }
      }

      return embedding;
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Gemini embedding request timed out');
      }
      throw error;
    }
  }

  /**
   * Generate embeddings for multiple texts (batch)
   * 
   * @param {string[]} texts - Array of texts to embed
   * @returns {Promise<number[][]>} - Array of embedding vectors
   */
  async generateBatch(texts) {
    if (!this.apiKey) {
      throw new Error('EMBEDDING_API_KEY is not configured for Gemini');
    }

    const model = this.defaultModel;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:batchEmbedContents`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': this.apiKey,
          },
          body: JSON.stringify({
            requests: texts.map(text => ({
              model: `models/${model}`,
              content: {
                parts: [{ text }],
              },
              outputDimensionality: this.dimensions,
            })),
          }),
          signal: AbortSignal.timeout(60000),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          `Gemini API error: ${response.status} ${response.statusText} - ${
            errorData.error?.message || 'Unknown error'
          }`
        );
      }

      const data = await response.json();

      if (!data.embeddings || data.embeddings.length !== texts.length) {
        throw new Error('Invalid response from Gemini API: missing or incomplete embeddings');
      }

      // Process and normalize dimensions
      return data.embeddings.map(embedding => {
        let values = embedding.values;

        // Handle dimensionality mismatch
        if (values.length !== this.dimensions) {
          if (values.length > this.dimensions) {
            values = values.slice(0, this.dimensions);
          } else {
            values = [...values, ...Array(this.dimensions - values.length).fill(0)];
          }
        }

        return values;
      });
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error('Gemini batch embedding request timed out');
      }
      throw error;
    }
  }
}

export default GeminiEmbeddingAdapter;
