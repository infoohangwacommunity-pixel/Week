-- Migration: 005_memory_foundation.sql
-- Stage 22: Persistent Memory Schema & Storage
CREATE EXTENSION IF NOT EXISTS vector;
CREATE TABLE IF NOT EXISTS student_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  fact_key TEXT NOT NULL, fact_category TEXT NOT NULL, fact_value JSONB NOT NULL,
  display_text TEXT NOT NULL, provenance TEXT NOT NULL,
  source_session_id UUID REFERENCES sessions(id),
  source_message_id UUID REFERENCES messages(id),
  source_ai_request_id UUID REFERENCES ai_requests(id),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  contradicted_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived', 'flagged')),
  superseded_by UUID REFERENCES student_facts(id),
  superseded_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS student_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id),
  summary_text TEXT NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]',
  subjects JSONB NOT NULL DEFAULT '[]',
  breakthroughs JSONB DEFAULT '[]',
  confusions JSONB DEFAULT '[]',
  questions_asked INTEGER DEFAULT 0,
  student_mood TEXT,
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ NOT NULL,
  session_duration_minutes INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  summary_generated_by TEXT NOT NULL,
  summary_model TEXT NOT NULL,
  summary_prompt_version TEXT NOT NULL,
  summary_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_status TEXT NOT NULL DEFAULT 'complete' CHECK (summary_status IN ('complete', 'failed', 'partial', 'skipped')),
  summary_error TEXT,
  embedding vector(1536),
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS memory_retrieval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  ai_request_id UUID REFERENCES ai_requests(id),
  session_id UUID REFERENCES sessions(id),
  facts_retrieved INTEGER NOT NULL DEFAULT 0,
  episodes_retrieved INTEGER NOT NULL DEFAULT 0,
  total_memory_tokens_estimated INTEGER NOT NULL DEFAULT 0,
  retrieval_strategy TEXT NOT NULL,
  retrieval_latency_ms INTEGER NOT NULL,
  facts_deduplicated INTEGER DEFAULT 0,
  marked_useful BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS memory_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  fact_a_id UUID NOT NULL REFERENCES student_facts(id) ON DELETE RESTRICT,
  fact_b_id UUID REFERENCES student_facts(id) ON DELETE RESTRICT,
  conflict_type TEXT NOT NULL,
  conflict_description TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved_by_supersession', 'resolved_by_ai', 'acknowledged')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detected_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS memory_confidence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL REFERENCES student_facts(id) ON DELETE CASCADE,
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  previous_confidence NUMERIC(4,3) NOT NULL,
  new_confidence NUMERIC(4,3) NOT NULL,
  delta NUMERIC(4,3) NOT NULL,
  change_reason TEXT NOT NULL,
  change_evidence TEXT,
  triggered_by_session_id UUID REFERENCES sessions(id),
  triggered_by_ai_request_id UUID REFERENCES ai_requests(id),
  triggered_by_job TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_facts_wax_id_status ON student_facts(wax_id, status);
CREATE INDEX IF NOT EXISTS idx_facts_wax_id_category ON student_facts(wax_id, fact_category, status);
CREATE INDEX IF NOT EXISTS idx_facts_wax_id_key ON student_facts(wax_id, fact_key, status);
CREATE INDEX IF NOT EXISTS idx_facts_wax_id_recency ON student_facts(wax_id, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_facts_confidence ON student_facts(wax_id, confidence DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_facts_superseded_by ON student_facts(superseded_by) WHERE superseded_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_episodes_wax_id_recency ON student_episodes(wax_id, session_end DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_wax_id_subjects ON student_episodes USING gin(subjects);
CREATE INDEX IF NOT EXISTS idx_episodes_wax_id_topics ON student_episodes USING gin(topics);
CREATE INDEX IF NOT EXISTS idx_episodes_session_id ON student_episodes(session_id);
CREATE INDEX IF NOT EXISTS idx_contradictions_wax_id ON memory_contradictions(wax_id, status);
CREATE INDEX IF NOT EXISTS idx_contradictions_fact_a ON memory_contradictions(fact_a_id);
CREATE INDEX IF NOT EXISTS idx_confidence_history_fact ON memory_confidence_history(fact_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_confidence_history_wax ON memory_confidence_history(wax_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_log_wax ON memory_retrieval_log(wax_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_retrieval_log_request ON memory_retrieval_log(ai_request_id);
