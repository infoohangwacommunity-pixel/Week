-- =============================================================================
-- Migration: 014_add_session_id_to_messages
-- =============================================================================
-- Add session_id and external_id columns to messages table
-- 
-- session_id: Links messages to sessions for:
--   - Session summarization
--   - Evidence extraction
--   - Context assembly
-- 
-- external_id: Stores WhatsApp's wamid for:
--   - Idempotency (preventing duplicate processing)
--   - Webhook retry handling
--   - External system correlation
-- =============================================================================

-- Add session_id column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- Add external_id column for WhatsApp wamid
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Create index for efficient session-based queries
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id) 
  WHERE deleted_at IS NULL;

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at DESC) 
  WHERE deleted_at IS NULL;

-- Create unique index for external_id idempotency
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id ON messages(external_id) 
  WHERE external_id IS NOT NULL AND deleted_at IS NULL;
