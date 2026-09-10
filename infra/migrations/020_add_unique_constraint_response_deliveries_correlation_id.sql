-- Migration: 020_add_unique_constraint_response_deliveries_correlation_id.sql
-- ResponseValidator.createDeliveryRecord uses ON CONFLICT (correlation_id)
-- DO UPDATE. That requires a UNIQUE constraint, not just an index.

ALTER TABLE response_deliveries
  ADD CONSTRAINT response_deliveries_correlation_id_unique
  UNIQUE (correlation_id);

-- The existing non-unique idx_response_deliveries_correlation_id is now
-- redundant; leave it for backwards compatibility (it becomes a no-op
-- duplicate of the unique constraint's implicit index).
