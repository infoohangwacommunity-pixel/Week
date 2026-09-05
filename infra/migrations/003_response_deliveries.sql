-- =============================================================================
-- Migration: 003_response_deliveries.sql
-- =============================================================================
-- Purpose: Create response_deliveries table for tracking response delivery lifecycle
-- 
-- This table tracks the delivery state of AI responses as they move through:
-- generated → queued → sent → delivered → read
-- Or: generated → queued → failed → retry
-- 
-- Stage 19: Response Validation, Formatting & Delivery
-- =============================================================================

-- Create response_deliveries table
CREATE TABLE IF NOT EXISTS response_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership (always scoped to student)
    wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    
    -- Tracing
    correlation_id TEXT NOT NULL REFERENCES ai_requests(correlation_id) ON DELETE CASCADE,
    
    -- Delivery state
    state TEXT NOT NULL DEFAULT 'generated' CHECK (
        state IN ('generated', 'queued', 'sent', 'delivered', 'read', 'failed', 'retrying')
    ),
    
    -- Chunk tracking
    total_chunks INTEGER DEFAULT 1,
    sent_chunks INTEGER DEFAULT 0,
    last_chunk_sent_at TIMESTAMPTZ,
    
    -- Error tracking
    error_type TEXT,
    error_message TEXT,
    retry_count INTEGER DEFAULT 0,
    max_retries INTEGER DEFAULT 3,
    
    -- Timing
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    read_at TIMESTAMPTZ,
    failed_at TIMESTAMPTZ,
    
    -- Metadata
    metadata JSONB DEFAULT '{}'::jsonb
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_response_deliveries_wax_id ON response_deliveries(wax_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_response_deliveries_session_id ON response_deliveries(session_id);
CREATE INDEX IF NOT EXISTS idx_response_deliveries_correlation_id ON response_deliveries(correlation_id);
CREATE INDEX IF NOT EXISTS idx_response_deliveries_state ON response_deliveries(state) WHERE state != 'generated';
CREATE INDEX IF NOT EXISTS idx_response_deliveries_created_at ON response_deliveries(created_at);
CREATE INDEX IF NOT EXISTS idx_response_deliveries_updated_at ON response_deliveries(updated_at);

-- Add trigger for automatic updated_at updates
CREATE OR REPLACE FUNCTION update_response_deliveries_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_response_deliveries_updated_at
    BEFORE UPDATE ON response_deliveries
    FOR EACH ROW
    EXECUTE FUNCTION update_response_deliveries_updated_at();

-- Add comments for documentation
COMMENT ON TABLE response_deliveries IS 'Tracks AI response delivery lifecycle from generation to read';
COMMENT ON COLUMN response_deliveries.wax_id IS 'Student identifier (scoped to student privacy)';
COMMENT ON COLUMN response_deliveries.session_id IS 'Session identifier for conversation context';
COMMENT ON COLUMN response_deliveries.correlation_id IS 'Correlation ID linking to ai_requests';
COMMENT ON COLUMN response_deliveries.state IS 'Delivery state (generated, queued, sent, delivered, read, failed, retrying)';
COMMENT ON COLUMN response_deliveries.total_chunks IS 'Total WhatsApp chunks for this response';
COMMENT ON COLUMN response_deliveries.sent_chunks IS 'Number of chunks successfully sent';
COMMENT ON COLUMN response_deliveries.last_chunk_sent_at IS 'Timestamp of last chunk sent';
COMMENT ON COLUMN response_deliveries.error_type IS 'Error type if delivery failed';
COMMENT ON COLUMN response_deliveries.error_message IS 'Error message if delivery failed';
COMMENT ON COLUMN response_deliveries.retry_count IS 'Number of retry attempts';
COMMENT ON COLUMN response_deliveries.max_retries IS 'Maximum retry attempts allowed';
COMMENT ON COLUMN response_deliveries.created_at IS 'Response generation timestamp';
COMMENT ON COLUMN response_deliveries.updated_at IS 'Last update timestamp';
COMMENT ON COLUMN response_deliveries.sent_at IS 'First chunk sent timestamp';
COMMENT ON COLUMN response_deliveries.delivered_at IS 'All chunks delivered timestamp';
COMMENT ON COLUMN response_deliveries.read_at IS 'All chunks read timestamp';
COMMENT ON COLUMN response_deliveries.failed_at IS 'Delivery failed timestamp';
COMMENT ON COLUMN response_deliveries.metadata IS 'Additional delivery metadata (JSON)';
