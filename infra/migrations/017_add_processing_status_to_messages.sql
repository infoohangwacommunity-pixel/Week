-- =============================================================================
-- Migration: 017_add_processing_status_to_messages
-- =============================================================================
-- Add processing_status column to messages table
-- 
-- processing_status tracks the processing state of inbound messages:
-- - 'pending': Message received, awaiting processing
-- - 'processing': Message currently being processed
-- - 'completed': Message successfully processed
-- - 'failed': Message processing failed
-- - 'received': Message already processed (idempotency)
-- 
-- This allows filtering out messages that have already been processed
-- or failed, preventing duplicate AI processing.
-- =============================================================================

-- Add processing_status column to messages table
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS processing_status TEXT DEFAULT 'pending'
  CHECK (processing_status IN ('pending', 'processing', 'completed', 'failed', 'received'));

-- Create index for efficient filtering of unprocessed messages
CREATE INDEX IF NOT EXISTS idx_messages_processing_status 
ON messages(processing_status, created_at ASC) 
WHERE deleted_at IS NULL;

-- Update existing messages to have 'received' status (already processed)
UPDATE messages 
SET processing_status = 'received' 
WHERE processing_status IS NULL;

INSERT INTO schema_migrations (version) VALUES (17) ON CONFLICT (version) DO NOTHING;
