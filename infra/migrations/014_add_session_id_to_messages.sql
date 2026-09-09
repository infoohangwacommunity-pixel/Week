-- =============================================================================
-- Migration: 014_add_session_id_to_messages
-- =============================================================================
-- Add session_id column to messages table for session tracking
-- 
-- Links messages to sessions for:
-- - Session summarization
-- - Evidence extraction
-- - Context assembly
-- =============================================================================

-- Add session_id column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS session_id UUID REFERENCES sessions(id) ON DELETE SET NULL;

-- Create index for efficient session-based queries
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id) 
  WHERE deleted_at IS NULL;

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at DESC) 
  WHERE deleted_at IS NULL;
