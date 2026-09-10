-- =============================================================================
-- Migration: 016_add_outbound_messages_table.sql
-- =============================================================================
-- Stages 47-56: Complete Idempotency Implementation (Recovery)
-- 
-- Recreates the outbound_messages table that should have been created in 011
-- but failed due to missing pgcrypto extension.
-- =============================================================================

-- Add outbound_messages table for tracking sent chunks
CREATE TABLE IF NOT EXISTS outbound_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Ownership
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  
  -- Message tracking
  outbound_chunk_id TEXT NOT NULL UNIQUE,
  triggering_message_id UUID NOT NULL REFERENCES messages(id),
  
  -- Content
  content TEXT NOT NULL,
  
  -- Delivery status
  processing_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (processing_status IN ('pending', 'sent', 'failed', 'retrying')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  
  -- Timing
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_outbound_wax_id ON outbound_messages(wax_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_outbound_status ON outbound_messages(processing_status, created_at ASC)
  WHERE processing_status IN ('pending', 'retrying');
CREATE INDEX IF NOT EXISTS idx_outbound_triggering ON outbound_messages(triggering_message_id);

INSERT INTO schema_migrations (version) VALUES (16) ON CONFLICT (version) DO NOTHING;

-- Helper function: Check if AI call already exists for message
CREATE OR REPLACE FUNCTION ai_call_already_processed(p_triggering_message_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM ai_requests
    WHERE triggering_message_id = p_triggering_message_id
    AND status = 'success'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Get stored AI response for message
CREATE OR REPLACE FUNCTION get_stored_ai_response(p_triggering_message_id UUID)
RETURNS TABLE (
  ai_request_id UUID,
  response_content JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT ar.id, ar.response_json
  FROM ai_requests ar
  WHERE ar.triggering_message_id = p_triggering_message_id
  AND ar.status = 'success'
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Helper function: Mark outbound message as sent
CREATE OR REPLACE FUNCTION mark_outbound_as_sent(p_outbound_chunk_id TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  v_exists BOOLEAN;
BEGIN
  UPDATE outbound_messages
  SET 
    processing_status = 'sent',
    sent_at = NOW(),
    updated_at = NOW()
  WHERE outbound_chunk_id = p_outbound_chunk_id
  AND processing_status != 'sent'
  RETURNING EXISTS (SELECT 1 FROM outbound_messages WHERE outbound_chunk_id = p_outbound_chunk_id)
  INTO v_exists;
  
  RETURN v_exists;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
