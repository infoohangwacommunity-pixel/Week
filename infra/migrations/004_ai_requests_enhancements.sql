-- =============================================================================
-- Migration: 004_ai_requests_enhancements.sql
-- =============================================================================
-- Purpose: Add additional metadata fields to ai_requests table
-- 
-- Adds fields required by Stage 20 orchestration:
-- - context_turn_count
-- - context_was_truncated
-- - validation_passed
-- - chunk_count
-- =============================================================================

-- Add new columns to ai_requests table
ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS context_turn_count INTEGER;
ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS context_was_truncated BOOLEAN DEFAULT FALSE;
ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS validation_passed BOOLEAN DEFAULT TRUE;
ALTER TABLE ai_requests ADD COLUMN IF NOT EXISTS chunk_count INTEGER DEFAULT 1;

-- Add comments for documentation
COMMENT ON COLUMN ai_requests.context_turn_count IS 'Number of conversation turns included in context';
COMMENT ON COLUMN ai_requests.context_was_truncated IS 'Whether context was truncated to fit budget';
COMMENT ON COLUMN ai_requests.validation_passed IS 'Whether response passed validation checks';
COMMENT ON COLUMN ai_requests.chunk_count IS 'Number of WhatsApp chunks for this response';

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_ai_requests_context_truncated ON ai_requests(context_was_truncated) WHERE context_was_truncated = true;
CREATE INDEX IF NOT EXISTS idx_ai_requests_validation_failed ON ai_requests(validation_passed) WHERE validation_passed = false;
