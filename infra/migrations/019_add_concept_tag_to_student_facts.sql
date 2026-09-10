-- Migration: 019_add_concept_tag_to_student_facts.sql
-- The memoryWriteTool currently INSERTs a concept_tag column that does not
-- exist in the schema, causing runtime failures. This migration adds the
-- column as an optional text field (no FK to keep the schema permissive —
-- concepts may not always be registered before facts reference them).

ALTER TABLE student_facts
  ADD COLUMN IF NOT EXISTS concept_tag TEXT;

CREATE INDEX IF NOT EXISTS idx_student_facts_concept_tag
  ON student_facts (wax_id, concept_tag)
  WHERE status = 'active' AND concept_tag IS NOT NULL;

COMMENT ON COLUMN student_facts.concept_tag IS
  'Optional concept linkage for the fact. Free-text tag (e.g. "algebra:linear-equations").';
