-- =============================================================================
-- Migration: 002_ai_requests.sql
-- =============================================================================
-- Purpose: Create ai_requests table for tracking AI provider interactions
-- 
-- This table stores metadata about AI requests without storing full prompts
-- or responses (which are stored in the messages table).
--
-- Privacy: Never store full prompts or responses in this table.
-- =============================================================================

-- Create ai_requests table
CREATE TABLE IF NOT EXISTS ai_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership (always scoped to student)
    wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    
    -- Tracing
    correlation_id TEXT NOT NULL,
    
    -- Request metadata
    provider TEXT NOT NULL,                 -- 'anthropic', 'openai', 'fake'
    model TEXT NOT NULL,                    -- Actual model used
    prompt_version TEXT NOT NULL,           -- Which system prompt version
    
    -- Status
    status TEXT NOT NULL,                   -- 'success', 'failed', 'timeout', 'safety_refused'
    error_type TEXT,                        -- AIErrorType if failed
    finish_reason TEXT,                     -- Normalized finish reason
    retry_count INTEGER NOT NULL DEFAULT 0,
    
    -- Usage (for future cost tracking — capture now, analyze later)
    input_tokens INTEGER,
    output_tokens INTEGER,
    total_tokens INTEGER,
    cached_input_tokens INTEGER DEFAULT 0,
    cache_write_tokens INTEGER DEFAULT 0,
    
    -- Timing
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    latency_ms INTEGER,
    
    -- Provider debugging (internal only)
    provider_request_id TEXT,
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_ai_requests_wax_id ON ai_requests(wax_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_requests_session_id ON ai_requests(session_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_correlation_id ON ai_requests(correlation_id);
CREATE INDEX IF NOT EXISTS idx_ai_requests_status ON ai_requests(status) WHERE status != 'success';
CREATE INDEX IF NOT EXISTS idx_ai_requests_provider ON ai_requests(provider);
CREATE INDEX IF NOT EXISTS idx_ai_requests_started_at ON ai_requests(started_at);

-- Add comments for documentation
COMMENT ON TABLE ai_requests IS 'Tracks AI provider request metadata without storing full prompts or responses';
COMMENT ON COLUMN ai_requests.wax_id IS 'Student identifier (scoped to student privacy)';
COMMENT ON COLUMN ai_requests.session_id IS 'Session identifier for conversation context';
COMMENT ON COLUMN ai_requests.correlation_id IS 'Trace correlation ID for debugging';
COMMENT ON COLUMN ai_requests.provider IS 'AI provider name (anthropic, openai, fake, etc.)';
COMMENT ON COLUMN ai_requests.model IS 'Actual model that responded';
COMMENT ON COLUMN ai_requests.prompt_version IS 'Version of system prompt used';
COMMENT ON COLUMN ai_requests.status IS 'Request status (success, failed, timeout, safety_refused)';
COMMENT ON COLUMN ai_requests.error_type IS 'Normalized error type if failed';
COMMENT ON COLUMN ai_requests.finish_reason IS 'Normalized finish reason from provider';
COMMENT ON COLUMN ai_requests.retry_count IS 'Number of retry attempts';
COMMENT ON COLUMN ai_requests.input_tokens IS 'Number of input tokens used';
COMMENT ON COLUMN ai_requests.output_tokens IS 'Number of output tokens generated';
COMMENT ON COLUMN ai_requests.total_tokens IS 'Total tokens (input + output)';
COMMENT ON COLUMN ai_requests.cached_input_tokens IS 'Cached input tokens (Anthropic prompt caching)';
COMMENT ON COLUMN ai_requests.cache_write_tokens IS 'Cache write tokens (Anthropic prompt caching)';
COMMENT ON COLUMN ai_requests.started_at IS 'Request start timestamp';
COMMENT ON COLUMN ai_requests.completed_at IS 'Request completion timestamp';
COMMENT ON COLUMN ai_requests.latency_ms IS 'Total latency in milliseconds';
COMMENT ON COLUMN ai_requests.provider_request_id IS 'Provider\'s own request ID for debugging';
