-- Migration: 006_learning_intelligence_foundation.sql
-- Phase F: Learning Intelligence Infrastructure (Stages 27-34)
-- 
-- This migration creates the complete schema for:
-- - Stage 27: Student Model Schema (concepts, knowledge states, observations)
-- - Stage 28: Evidence Collection Pipeline
-- - Stage 29: Mastery Estimation (RWEA)
-- - Stage 30: Misconception Detection
-- - Stage 31: Learning Signals and Behavioral Analytics
-- - Stage 33: Student Model Versioning and Integrity
-- - Stage 34: Student Model Snapshots (context interface)
--
-- IMPORTANT: Evidence collection (Stage 28) is designed before knowledge states
-- (Stage 27) because the schema must be designed around actual evidence that
-- can be collected from WhatsApp conversation.

-- ============================================================
-- CONCEPT REGISTRY
-- Flexible, non-curriculum-prescriptive concept definitions.
-- Concepts are not a fixed list. They emerge from instruction.
-- ============================================================

CREATE TABLE IF NOT EXISTS concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Canonical identifier (slug format, no spaces)
  -- Examples: quadratic_equations, newton_second_law, photosynthesis
  canonical_tag TEXT NOT NULL UNIQUE,
  
  -- Human-readable name
  display_name TEXT NOT NULL,
  
  -- Classification metadata (all optional — do not require upfront)
  subject TEXT,              -- 'mathematics', 'physics', 'chemistry', etc.
  granularity TEXT,          -- 'micro', 'meso', 'macro' — how atomic is this concept?
  
  -- Exam relevance metadata (optional array for flexibility)
  exam_references JSONB DEFAULT '[]',
  -- Example: [{"exam":"WAEC","year":2026},{"exam":"JAMB"}]
  
  -- Curriculum context (optional — do not enforce any specific curriculum)
  curriculum_notes TEXT,
  -- Free-text: "This concept appears in SS2 Physics curriculum" 
  -- NOT a structured foreign key to any curriculum database
  
  -- Aliases (other ways this concept might be referred to)
  aliases JSONB DEFAULT '[]',
  -- Example: ["quadratic formula", "solving quadratics", "ax2+bx+c"]
  
  -- Concept relationships (lightweight, optional)
  -- Stored as JSONB — no foreign key enforcement
  -- The AI uses these as hints, not as hard rules
  related_concepts JSONB DEFAULT '[]',
  -- Example: {"has_prerequisites": ["linear_equations"], "related_to": ["cubic_equations"]}
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',  -- 'system', 'ai_extraction', 'admin'
  
  -- Soft deletion (concepts are never hard-deleted)
  archived_at TIMESTAMPTZ,
  archive_reason TEXT
);

CREATE UNIQUE INDEX idx_concepts_tag ON concepts(canonical_tag);
CREATE INDEX idx_concepts_subject ON concepts(subject) WHERE subject IS NOT NULL;
CREATE INDEX idx_concepts_aliases ON concepts USING gin(aliases);

-- ============================================================
-- LEARNING OBSERVATIONS — APPEND-ONLY EVIDENCE LOG
-- Every piece of learning-relevant evidence WaxPrep collects.
-- This is the ground truth. States are derived from this.
-- ============================================================

CREATE TABLE IF NOT EXISTS learning_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership (mandatory, absolute isolation)
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id),
  
  -- Source
  message_id UUID REFERENCES messages(id),     -- The specific message this came from
  ai_request_id UUID REFERENCES ai_requests(id), -- The AI call that produced this evidence
  
  -- Concept identification
  concept_tag TEXT NOT NULL,                   -- References concepts.canonical_tag
  -- NOTE: NOT a foreign key — concept may not be registered yet at write time
  -- The evidence pipeline resolves/creates the registry entry separately
  
  -- Evidence type taxonomy (complete taxonomy defined in Section 12 of WAXPREP_TODO.md)
  evidence_type TEXT NOT NULL,
  -- 'direct_response'    — student directly answered a question
  -- 'explanation_attempt' — student tried to explain a concept
  -- 'correction_response' — student responded to a correction
  -- 'hint_request'       — student asked for help
  -- 'self_reported'      — student stated their own confidence level
  -- 'error_commission'   — student made an identifiable error
  -- 'concept_mention'    — student mentioned the concept (without assessment)
  -- 'self_explanation'   — student spontaneously explained a concept
  
  -- Outcome (for assessable evidence types) 
  -- Null for non-assessable types (concept_mention, hint_request)
  correctness NUMERIC(4,3),            -- 0.000 = completely wrong, 1.000 = completely correct
  -- Not a boolean. Partial credit is real.
  correctness_confidence NUMERIC(4,3), -- How confident is the evaluator in this correctness score?
  
  -- Partial correctness breakdown (optional, for richer evidence)
  correctness_breakdown JSONB,
  -- Example: {"conceptual_understanding": 0.8, "procedural_accuracy": 0.5}
  
  -- Help behavior
  hint_level INTEGER DEFAULT 0,        -- 0 = no hints, 1+ = number of hints received
  -- IMPORTANT: A correct response with hint_level=2 is weaker evidence than
  -- a correct response with hint_level=0
  
  -- Response timing
  response_time_ms INTEGER,            -- NULL if not measurable in WhatsApp context
  -- WhatsApp does not reliably expose typing speed, but we can track
  -- time between message receipt and response message
  
  -- Evidence quality metadata
  extraction_method TEXT NOT NULL,     -- 'llm_evaluation', 'ai_inline', 'self_report'
  extraction_confidence NUMERIC(4,3),  -- How confident is the extraction itself?
  evaluator_model TEXT,                -- Which AI model produced this evidence
  evaluator_prompt_version TEXT,       -- Which evaluation prompt version
  
  -- Misconception flag (preliminary — detailed misconception table is separate)
  possible_misconception BOOLEAN DEFAULT FALSE,
  misconception_tag TEXT,              -- If a known misconception category
  
  -- Temporal
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Immutability enforcement
  -- Once written, observations are never modified.
  -- If an observation is erroneous: soft-delete it and recompute states.
  deleted_at TIMESTAMPTZ,             -- NULL = valid evidence
  deletion_reason TEXT,
  deletion_authorized_by TEXT,        -- Who authorized the deletion
  
  -- Idempotency key (prevents duplicate evidence from retried webhooks)
  UNIQUE (wax_id, message_id, concept_tag, evidence_type),
  
  CONSTRAINT check_correctness_range 
    CHECK (correctness IS NULL OR (correctness >= 0 AND correctness <= 1)),
  CONSTRAINT check_confidence_range
    CHECK (extraction_confidence IS NULL OR 
           (extraction_confidence >= 0 AND extraction_confidence <= 1)),
  CONSTRAINT check_hint_level
    CHECK (hint_level >= 0)
);

-- Performance indexes (evidence is queried heavily per student per concept)
CREATE INDEX idx_observations_wax_concept 
  ON learning_observations(wax_id, concept_tag, observed_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_observations_wax_session 
  ON learning_observations(wax_id, session_id)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_observations_concept_type
  ON learning_observations(concept_tag, evidence_type)
  WHERE deleted_at IS NULL;

CREATE INDEX idx_observations_wax_recent
  ON learning_observations(wax_id, observed_at DESC)
  WHERE deleted_at IS NULL;

-- Partial index for misconception screening
CREATE INDEX idx_observations_misconceptions
  ON learning_observations(wax_id, concept_tag, observed_at DESC)
  WHERE possible_misconception = TRUE AND deleted_at IS NULL;

-- ============================================================
-- KNOWLEDGE STATES — MATERIALIZED MASTERY ESTIMATES
-- Derived from learning_observations. Always recomputable.
-- This is the infrastructure's answer to "what does the student know?"
-- ============================================================

CREATE TABLE IF NOT EXISTS knowledge_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  concept_tag TEXT NOT NULL,
  
  -- RWEA Model parameters (see WAXPREP_TODO.md Section 2.7)
  mastery_estimate NUMERIC(4,3) NOT NULL DEFAULT 0.100,
  -- 0.000–1.000. This is NOT P(mastery) in the BKT sense.
  -- It is the RWEA output: a calibrated signal for the AI.
  -- Never exactly 0 or 1 — always [0.05, 0.95]
  
  -- Component signals (the AI can use these individually)
  success_signal NUMERIC(5,3) NOT NULL DEFAULT 0.000,  -- Accumulated weighted successes
  failure_signal NUMERIC(5,3) NOT NULL DEFAULT 0.000,  -- Accumulated weighted failures
  
  -- Trend signals
  recent_trend TEXT,        -- 'improving', 'stable', 'declining', 'insufficient_data'
  -- Computed by comparing recent 3 observations vs previous 3
  
  -- Help dependency
  hint_dependency NUMERIC(4,3) DEFAULT NULL, -- NULL = no data. 0-1 scale.
  hint_dependency_trend TEXT,                -- 'increasing', 'decreasing', 'stable', NULL
  
  -- Evidence metadata
  evidence_count INTEGER NOT NULL DEFAULT 0,
  direct_response_count INTEGER NOT NULL DEFAULT 0,   -- Only the highest-quality evidence type
  last_evidence_at TIMESTAMPTZ,
  first_evidence_at TIMESTAMPTZ,
  
  -- Temporal decay
  decay_factor_applied NUMERIC(5,4),   -- The decay factor applied at last update
  -- Allows the AI to see how stale the estimate is
  
  -- State validity
  state_version INTEGER NOT NULL DEFAULT 1,  -- Increments on every recomputation
  last_computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- A single active state per (wax_id, concept_tag)
  UNIQUE (wax_id, concept_tag),
  
  CONSTRAINT check_mastery_range 
    CHECK (mastery_estimate >= 0 AND mastery_estimate <= 1)
);

-- Performance indexes
CREATE INDEX idx_knowledge_states_wax 
  ON knowledge_states(wax_id, mastery_estimate DESC);

CREATE INDEX idx_knowledge_states_wax_recent
  ON knowledge_states(wax_id, last_evidence_at DESC NULLS LAST);

CREATE INDEX idx_knowledge_states_concept
  ON knowledge_states(concept_tag, mastery_estimate DESC);

-- ============================================================
-- MISCONCEPTIONS
-- Structured records of identified systematic errors.
-- Each misconception record is supported by evidence observations.
-- ============================================================

CREATE TABLE IF NOT EXISTS misconceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  
  -- What and where
  concept_tag TEXT NOT NULL,
  
  -- Misconception description (AI-extracted, free text)
  description TEXT NOT NULL,
  -- Example: "Student believes force is required to maintain constant velocity 
  -- (Newton's First Law violation, Aristotelian physics misconception)"
  
  -- Evidence support
  observation_ids UUID[] NOT NULL DEFAULT '{}',
  -- Array of learning_observations.id values that support this misconception
  evidence_count INTEGER NOT NULL DEFAULT 1,
  
  -- Confidence
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  -- How confident are we that this is a stable misconception vs a one-time slip?
  
  -- Status lifecycle
  status TEXT NOT NULL DEFAULT 'suspected'
    CHECK (status IN ('suspected', 'confirmed', 'resolved', 'archived')),
  -- suspected: 1-2 observations
  -- confirmed: 3+ observations
  -- resolved: student has demonstrated correct understanding since
  -- archived: no longer active
  
  resolved_at TIMESTAMPTZ,
  resolution_evidence_id UUID REFERENCES learning_observations(id),
  
  -- Extraction metadata
  detected_by TEXT NOT NULL,  -- 'llm_inline', 'session_summarizer', 'manual'
  first_detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_confirmed_at TIMESTAMPTZ,
  
  -- Soft deletion
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_misconceptions_wax_active
  ON misconceptions(wax_id, concept_tag, status)
  WHERE status IN ('suspected', 'confirmed') AND deleted_at IS NULL;

CREATE INDEX idx_misconceptions_wax_recent
  ON misconceptions(wax_id, first_detected_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- LEARNING SIGNALS
-- Session-level and cross-session behavioral aggregates.
-- These are NOT mastery estimates. They are behavioral signals
-- that give the AI information about HOW the student is learning.
-- ============================================================

CREATE TABLE IF NOT EXISTS learning_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID REFERENCES sessions(id),  -- NULL = cross-session signal
  concept_tag TEXT,                          -- NULL = session-wide signal
  
  -- Signal type
  signal_type TEXT NOT NULL,
  -- 'session_engagement': overall session engagement level
  -- 'hint_dependency_session': hint dependency for this session
  -- 'response_latency_trend': is the student taking longer to respond?
  -- 'concept_revisit': student asked about same concept in multiple sessions
  -- 'self_efficacy': student expressed confidence or lack thereof
  -- 'frustration_signal': behavioral indicators of frustration
  
  -- Signal value
  signal_value NUMERIC(6,3),    -- Numeric value where applicable
  signal_text TEXT,              -- Text signal where more meaningful
  signal_metadata JSONB,         -- Additional structured context
  
  -- Confidence in this signal
  signal_confidence NUMERIC(4,3) DEFAULT 0.700,
  
  -- Extraction
  extracted_by TEXT NOT NULL,   -- 'llm_session_analyzer', 'rule_engine', 'system'
  
  observed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_signals_wax_type
  ON learning_signals(wax_id, signal_type, observed_at DESC);

CREATE INDEX idx_signals_wax_session
  ON learning_signals(wax_id, session_id)
  WHERE session_id IS NOT NULL;

-- ============================================================
-- STUDENT MODEL SNAPSHOTS
-- Pre-assembled student model context for efficient AI injection.
-- Generated at the end of each session (background job) or
-- lazily at context assembly time if stale.
-- ============================================================

CREATE TABLE IF NOT EXISTS student_model_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id),
  
  -- Snapshot content
  snapshot_text TEXT NOT NULL,    -- Pre-formatted text for AI context injection
  snapshot_json JSONB NOT NULL,   -- Structured data for programmatic access
  
  -- Freshness tracking
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  covers_through TIMESTAMPTZ NOT NULL,  -- What timestamp range does this cover
  
  -- Validity
  is_stale BOOLEAN NOT NULL DEFAULT FALSE,
  -- Mark stale when new observations arrive that post-date covers_through
  
  -- Metadata
  knowledge_state_count INTEGER NOT NULL DEFAULT 0,
  active_misconception_count INTEGER NOT NULL DEFAULT 0,
  concept_count INTEGER NOT NULL DEFAULT 0,
  
  -- Token estimation (for context budget management)
  estimated_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX idx_snapshots_wax_fresh
  ON student_model_snapshots(wax_id, generated_at DESC)
  WHERE is_stale = FALSE;

-- ============================================================
-- MIGRATION TRACKING
-- ============================================================

INSERT INTO schema_migrations (version) VALUES (6)
ON CONFLICT (version) DO NOTHING;
