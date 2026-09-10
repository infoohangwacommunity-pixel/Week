-- Migration: 026_make_unique_constraint_migrations_idempotent.sql
-- =============================================================================
-- Migrations 003 and 020 both `ALTER TABLE ... ADD CONSTRAINT name UNIQUE (col)`.
-- PostgreSQL does not support `ADD CONSTRAINT IF NOT EXISTS`, so re-applying
-- these migrations on a database where the constraint already exists (e.g.,
-- after a partial recovery, a CI run that uses psql -f instead of migrate.js,
-- or a DB restore that skipped some schema_migrations rows) crashes with
-- `ERROR: relation "..." already exists`.
--
-- This migration wraps both constraints in idempotent DO blocks so they can
-- be safely re-applied. (Existing constraints are left as-is.)
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_requests_correlation_id_unique'
  ) THEN
    ALTER TABLE ai_requests ADD CONSTRAINT ai_requests_correlation_id_unique UNIQUE (correlation_id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'response_deliveries_correlation_id_unique'
  ) THEN
    ALTER TABLE response_deliveries ADD CONSTRAINT response_deliveries_correlation_id_unique UNIQUE (correlation_id);
  END IF;
END $$;

INSERT INTO schema_migrations (version) VALUES (26) ON CONFLICT (version) DO NOTHING;
