-- =============================================================================
-- Migration: 015_add_external_id_to_messages
-- =============================================================================
-- Add external_id column to messages table for WhatsApp wamid storage
-- 
-- This migration fixes the schema mismatch where enqueue.js expects
-- external_id column but it was missing from migration 014.
-- 
-- external_id: Stores WhatsApp's wamid for:
--   - Idempotency (preventing duplicate processing)
--   - Webhook retry handling  
--   - External system correlation
-- =============================================================================

-- Add external_id column for WhatsApp wamid
ALTER TABLE messages 
ADD COLUMN IF NOT EXISTS external_id TEXT;

-- Create unique index for external_id idempotency
-- Only index non-null values to allow NULLs
CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_external_id 
ON messages(external_id) 
WHERE external_id IS NOT NULL AND deleted_at IS NULL;
