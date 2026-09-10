-- Migration: 023_add_assessment_questions_table.sql
-- Creates the assessment_questions table referenced by generateQuestionTool.
-- Per the Newborn AI philosophy, the AI drafts the question text, correct
-- answer, and grading rubric; this table persists them so evidence recorded
-- against them (via record_evidence) can be linked back.

CREATE TABLE IF NOT EXISTS assessment_questions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Student + session scoping
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID REFERENCES sessions(id) ON DELETE SET NULL,

  -- Concept linkage
  concept_tag TEXT NOT NULL,

  -- Question metadata
  difficulty TEXT NOT NULL DEFAULT 'medium'
    CHECK (difficulty IN ('easy', 'medium', 'hard')),
  format TEXT NOT NULL DEFAULT 'multiple_choice'
    CHECK (format IN ('multiple_choice', 'short_answer', 'open_ended')),

  -- Question content (drafted by the AI)
  question_text TEXT NOT NULL,
  correct_answer JSONB NOT NULL,
  grading_rubric JSONB,

  -- Optional: misconception this question targets
  targeted_misconception TEXT,

  -- Lifecycle
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'archived', 'superseded')),

  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_assessment_questions_wax_concept
  ON assessment_questions (wax_id, concept_tag)
  WHERE status = 'active' AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_assessment_questions_session
  ON assessment_questions (session_id)
  WHERE deleted_at IS NULL;

COMMENT ON TABLE assessment_questions IS
  'Formative assessment questions drafted by the AI (per Newborn AI philosophy: AI provides intelligence, infrastructure persists).';
