-- Migration: 008_tools_and_safety_foundation.sql
-- Phase G-I: Tools, Safety, and Crisis Infrastructure (Stages 35-46)
--
-- This migration creates the complete schema for:
-- - Stage 35: Tool registry and execution tracking
-- - Stage 37: Memory write validation
-- - Stage 38: Web search result tracking
-- - Stage 44-46: Safety events and crisis detection
--
-- IMPORTANT: This migration assumes pgvector is already installed (from migration 005).

-- ============================================================
-- TOOL INVOCATIONS TRACKING (Stage 35)
-- Every tool call is logged with arguments, results, and metadata.
-- ============================================================

CREATE TABLE IF NOT EXISTS tool_invocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership (absolute isolation)
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ai_request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
  
  -- Tool identification
  tool_name TEXT NOT NULL,
  tool_category TEXT NOT NULL,
  -- Categories: STUDENT_READ, STUDENT_WRITE, RETRIEVAL, ASSESSMENT, INTERNAL
  
  -- Arguments (validated before execution)
  arguments_json JSONB NOT NULL,
  arguments_size_bytes INTEGER NOT NULL,
  
  -- Execution result
  result_json JSONB,
  result_size_bytes INTEGER,
  
  -- Execution status
  status TEXT NOT NULL DEFAULT 'pending' 
    CHECK (status IN ('pending', 'success', 'failed', 'timeout', 'rejected')),
  rejection_reason TEXT,
  -- Rejection reasons: unknown_tool, invalid_arguments, unauthorized, 
  -- rate_limit_exceeded, timeout, loop_detected, size_exceeded
  
  -- Performance metadata
  latency_ms INTEGER,
  timeout_ms INTEGER,
  
  -- Security metadata
  injection_risk_score NUMERIC(4,3),  -- For web results, 0.0-1.0
  was_sanitized BOOLEAN DEFAULT FALSE,
  
  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Constraints
  CONSTRAINT check_injection_score_range 
    CHECK (injection_risk_score IS NULL OR 
           (injection_risk_score >= 0 AND injection_risk_score <= 1))
);

CREATE INDEX idx_tool_invocations_wax_session 
  ON tool_invocations(wax_id, session_id, created_at DESC);

CREATE INDEX idx_tool_invocations_tool_name 
  ON tool_invocations(tool_name, status);

CREATE INDEX idx_tool_invocations_wax_created 
  ON tool_invocations(wax_id, created_at DESC);

CREATE INDEX idx_tool_invocations_ai_request 
  ON tool_invocations(ai_request_id) WHERE ai_request_id IS NOT NULL;

-- ============================================================
-- SAFETY EVENTS (Stages 44-46)
-- Parallel safety classifier outputs and crisis detection.
-- ============================================================

CREATE TABLE IF NOT EXISTS safety_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  ai_request_id UUID REFERENCES ai_requests(id) ON DELETE SET NULL,
  
  -- Event classification
  event_type TEXT NOT NULL,
  -- 'welfare_concern' | 'inappropriate_response' | 'adversarial_pattern' | 'crisis'
  
  -- Event level (for crisis detection)
  level INTEGER NOT NULL,
  -- 1 = academic mention (no action)
  -- 2 = ambiguous welfare signal (soft check-in)
  -- 3 = high-confidence crisis (deterministic response)
  
  -- Classifier metadata
  classifier_model TEXT NOT NULL,
  
  -- Classifier scores (0.0-1.0 for each dimension)
  educational_context_score NUMERIC(4,3),
  -- Binary: is this educational content?
  
  welfare_concern_score NUMERIC(4,3),
  -- Binary + urgency: is this a welfare concern?
  
  inappropriate_response_score NUMERIC(4,3),
  -- Binary: is this inappropriate content?
  
  adversarial_pattern_score NUMERIC(4,3),
  -- Binary: is this a jailbreak/attack pattern?
  
  -- Action taken by infrastructure
  action_taken TEXT NOT NULL,
  -- 'none' | 'soft_checkin' | 'crisis_response_delivered' | 'response_withheld' | 'tools_disabled'
  
  -- Crisis-specific fields
  crisis_resources_delivered BOOLEAN DEFAULT FALSE,
  -- Did we deliver deterministic crisis resources?
  
  operator_notified BOOLEAN DEFAULT FALSE,
  -- Did we notify an operator?
  
  -- Review tracking
  requires_review BOOLEAN DEFAULT FALSE,
  reviewed_at TIMESTAMPTZ,
  reviewer_notes TEXT,
  
  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_safety_events_wax 
  ON safety_events(wax_id, created_at DESC);

CREATE INDEX idx_safety_events_review 
  ON safety_events(requires_review, created_at DESC) 
  WHERE requires_review = TRUE;

CREATE INDEX idx_safety_events_type_level 
  ON safety_events(event_type, level, created_at DESC);

CREATE INDEX idx_safety_events_wax_session 
  ON safety_events(wax_id, session_id);

-- ============================================================
-- WEB SEARCH RESULTS (Stage 38)
-- Tracked separately for injection analysis and caching.
-- ============================================================

CREATE TABLE IF NOT EXISTS web_search_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to tool invocation
  tool_invocation_id UUID NOT NULL REFERENCES tool_invocations(id) ON DELETE CASCADE,
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  
  -- Search metadata
  query TEXT NOT NULL,
  
  -- Result identification
  result_url TEXT NOT NULL,
  result_domain TEXT NOT NULL,
  result_title TEXT,
  
  -- Source credibility (tier 1-3)
  source_tier INTEGER NOT NULL DEFAULT 3,
  -- Tier 1: waec.gov.ng, jamb.gov.ng, neco.gov.ng, education.gov.ng, .edu.ng
  -- Tier 2: punchng.com, guardian.ng (education), khanacademy.org, bbc.co.uk/education
  -- Tier 3: General web (use with caution)
  
  -- Content size tracking
  raw_content_length INTEGER,
  sanitized_content_length INTEGER,
  
  -- Injection detection
  was_injection_risk_detected BOOLEAN DEFAULT FALSE,
  was_returned_to_ai BOOLEAN DEFAULT TRUE,
  -- False if result was blocked or too risky
  
  -- Temporal
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_web_results_tool_invocation 
  ON web_search_results(tool_invocation_id);

CREATE INDEX idx_web_results_wax_domain 
  ON web_search_results(wax_id, result_domain);

CREATE INDEX idx_web_results_domain_cache 
  ON web_search_results(result_domain, query, created_at DESC);

-- ============================================================
-- TOOL RATE LIMIT TRACKING (Stage 35)
-- Per-session tool call tracking for rate limiting.
-- ============================================================

CREATE TABLE IF NOT EXISTS tool_rate_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Tool identification
  tool_name TEXT NOT NULL,
  
  -- Rate limit tracking
  call_count INTEGER NOT NULL DEFAULT 0,
  -- Number of calls in current window
  
  window_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  window_ends_at TIMESTAMPTZ NOT NULL,
  -- Session-based windows: window_ends_at = session ends
  
  -- Last call tracking
  last_call_at TIMESTAMPTZ,
  
  -- Constrained uniqueness
  UNIQUE (wax_id, session_id, tool_name),
  
  CONSTRAINT check_call_count 
    CHECK (call_count >= 0)
);

CREATE INDEX idx_tool_rate_limits_wax_session 
  ON tool_rate_limits(wax_id, session_id);

CREATE INDEX idx_tool_rate_limits_tool 
  ON tool_rate_limits(tool_name);

-- ============================================================
-- EMBEDDING GENERATION QUEUE (Stage 41)
-- Asynchronous embedding generation tracking.
-- ============================================================

CREATE TABLE IF NOT EXISTS embedding_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Target record
  target_type TEXT NOT NULL,
  -- 'student_fact' | 'student_episode'
  
  target_id UUID NOT NULL,
  -- student_facts.id or student_episodes.id
  
  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'complete', 'failed', 'retrying')),
  
  -- Provider metadata
  provider TEXT,
  model TEXT,
  dimensions INTEGER,
  
  -- Result
  embedding_created BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  
  -- Error tracking
  error_message TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  max_retries INTEGER NOT NULL DEFAULT 3,
  
  -- Constraints
  CONSTRAINT check_max_retries 
    CHECK (max_retries >= 0)
);

CREATE INDEX idx_embedding_jobs_target 
  ON embedding_jobs(target_type, target_id);

CREATE INDEX idx_embedding_jobs_status 
  ON embedding_jobs(status, created_at ASC) 
  WHERE status IN ('pending', 'retrying');

-- Create separate indexes for each target type since PostgreSQL doesn't support
-- subqueries in index expressions. This maintains the same query performance
-- for looking up embedding jobs by student wax_id.
CREATE INDEX idx_embedding_jobs_wax_student_facts 
  ON embedding_jobs(target_id, created_at DESC) 
  WHERE target_type = 'student_fact';

CREATE INDEX idx_embedding_jobs_wax_student_episodes 
  ON embedding_jobs(target_id, created_at DESC) 
  WHERE target_type = 'student_episodes';

-- ============================================================
-- WEB SEARCH CACHE (Stage 38)
-- Cache by query+date for cost control.
-- ============================================================

CREATE TABLE IF NOT EXISTS web_search_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Cache key
  query_hash TEXT NOT NULL,
  query TEXT NOT NULL,
  
  -- Provider response cache (sanitized)
  cached_results JSONB NOT NULL,
  
  -- Metadata
  provider TEXT NOT NULL,
  result_count INTEGER NOT NULL,
  
  -- TTL tracking
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  
  -- Constraints
  UNIQUE (query_hash, provider)
);

CREATE INDEX idx_web_search_cache_hash 
  ON web_search_cache(query_hash, provider);

-- Note: Using regular index instead of partial index with NOW() because
-- NOW() is not an immutable function and cannot be used in index predicates.
-- The regular index provides adequate performance for expired cache lookups.
CREATE INDEX idx_web_search_cache_expires 
  ON web_search_cache(expires_at);

-- ============================================================
-- ADVERSARIAL PATTERN TRACKING (Stage 45)
-- Track repeated adversarial attempts per student.
-- ============================================================

CREATE TABLE IF NOT EXISTS adversarial_patterns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  
  -- Pattern classification
  pattern_type TEXT NOT NULL,
  -- 'prompt_injection' | 'jailbreak_attempt' | 'tool_abuse' | 'memory_poisoning' | 'other'
  
  -- Severity
  severity INTEGER NOT NULL DEFAULT 1,
  -- 1 = low, 2 = medium, 3 = high
  
  -- Count
  incident_count INTEGER NOT NULL DEFAULT 1,
  
  -- Last occurrence
  last_occurrence_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Action taken
  action_taken TEXT DEFAULT 'logged',
  -- 'logged' | 'tools_disabled' | 'session_terminated' | 'operator_notified'
  
  -- Tools disabled tracking
  tools_disabled_until TIMESTAMPTZ,
  
  -- Created
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_adversarial_wax 
  ON adversarial_patterns(wax_id, last_occurrence_at DESC);

CREATE INDEX idx_adversarial_type 
  ON adversarial_patterns(pattern_type, severity DESC);

-- ============================================================
-- CRISIS RESPONSE LOG (Stage 46)
-- Track deterministic crisis responses for audit.
-- ============================================================

CREATE TABLE IF NOT EXISTS crisis_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Link to safety event
  safety_event_id UUID NOT NULL REFERENCES safety_events(id) ON DELETE CASCADE,
  
  -- Response metadata
  response_version TEXT NOT NULL DEFAULT 'v1',
  -- Version of deterministic crisis response template used
  
  -- Delivery tracking
  delivered_via TEXT NOT NULL,
  -- 'whatsapp' | 'email' | 'operator_alert'
  
  -- Operator notification
  operator_notified_at TIMESTAMPTZ,
  operator_notification_method TEXT,
  -- 'email' | 'sms' | 'pagerduty' | 'slack'
  
  -- Follow-up
  follow_up_required BOOLEAN DEFAULT FALSE,
  follow_up_completed_at TIMESTAMPTZ,
  follow_up_notes TEXT,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_crisis_responses_safety 
  ON crisis_responses(safety_event_id);

CREATE INDEX idx_crisis_responses_followup 
  ON crisis_responses(follow_up_required, created_at ASC) 
  WHERE follow_up_required = TRUE;

-- ============================================================
-- MIGRATION TRACKING
-- ============================================================

INSERT INTO schema_migrations (version) VALUES (8)
ON CONFLICT (version) DO NOTHING;
