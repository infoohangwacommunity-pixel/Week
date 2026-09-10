-- Migration: 025_add_external_message_id_to_outbound_messages.sql
-- =============================================================================
-- The outbound.js sendWhatsAppChunk helper updates outbound_messages after a
-- successful WhatsApp Cloud API call to record the WhatsApp message ID
-- returned by the API. The previous schema had no column for this, so the
-- UPDATE silently errored ("column "external_message_id" of relation
-- "outbound_messages" does not exist") and the error was swallowed by a
-- try/catch — leaving every outbound row permanently stuck on
-- processing_status='pending'.
--
-- This migration adds the missing column so the audit trail actually
-- reflects what was sent.
-- =============================================================================

ALTER TABLE outbound_messages
  ADD COLUMN IF NOT EXISTS external_message_id TEXT;

COMMENT ON COLUMN outbound_messages.external_message_id IS
  'WhatsApp message ID returned by the Cloud API after a successful send. NULL while pending.';

CREATE INDEX IF NOT EXISTS idx_outbound_external_message_id
  ON outbound_messages (external_message_id)
  WHERE external_message_id IS NOT NULL;
