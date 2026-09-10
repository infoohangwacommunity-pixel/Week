-- Migration: 022_add_vector_indexes.sql
-- Adds IVFFlat indexes on the embedding columns so that semantic search
-- uses an ANN index instead of a sequential scan. Without this, hybrid
-- search is O(N) per query.

-- IVFFlat requires the extension to be present (created in 006).
-- Use cosine distance operator class to match HybridSearch's use of `<=>`.

CREATE INDEX IF NOT EXISTS idx_student_facts_embedding_cosine
  ON student_facts
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL AND status = 'active';

CREATE INDEX IF NOT EXISTS idx_student_episodes_embedding_cosine
  ON student_episodes
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100)
  WHERE embedding IS NOT NULL AND archived_at IS NULL;

COMMENT ON INDEX idx_student_facts_embedding_cosine IS
  'IVFFlat ANN index for cosine similarity search over active student facts.';
COMMENT ON INDEX idx_student_episodes_embedding_cosine IS
  'IVFFlat ANN index for cosine similarity search over non-archived student episodes.';
