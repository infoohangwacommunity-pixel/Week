-- =============================================================================
-- Migration: 002b_add_correlation_id_unique.sql
-- =============================================================================
-- Purpose: Add UNIQUE constraint to ai_requests.correlation_id
-- 
-- This migration fixes the FK reference issue in 003_response_deliveries.sql
-- by adding the required UNIQUE constraint to correlation_id.
--
-- NOTE: This is a separate migration because the original 002 was applied
-- without the UNIQUE constraint, and we cannot retroactively change it.
-- =============================================================================

-- Add UNIQUE constraint to correlation_id
ALTER TABLE ai_requests 
ADD CONSTRAINT ai_requests_correlation_id_unique 
UNIQUE (correlation_id);

COMMENT ON COLUMN ai_requests.correlation_id IS 'Trace correlation ID for debugging (UNIQUE)';
