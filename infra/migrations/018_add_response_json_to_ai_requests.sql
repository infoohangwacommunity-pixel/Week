-- Migration: 018_add_response_json_to_ai_requests.sql
-- Adds the response_json column referenced by idempotency code and PL/pgSQL
-- functions (get_stored_ai_response). Without this column, durable AI idempotency
-- cannot function.

ALTER TABLE ai_requests
  ADD COLUMN IF NOT EXISTS response_json JSONB;

COMMENT ON COLUMN ai_requests.response_json IS
  'Stored AI response payload (content, usage, model) used for idempotent replay.';

-- Backfill is unnecessary: existing rows simply have NULL response_json, which
-- the idempotency layer treats as "no cached response".
