/**
 * Generate Question Tool - Phase G Stage 39
 *
 * Per the Newborn AI philosophy: the AI drafts the question text, correct
 * answer, and grading rubric. This tool PERSISTS them — it does NOT generate
 * the question itself.
 *
 * The AI provides:
 *   - concept_tag (which concept to assess)
 *   - difficulty (easy/medium/hard)
 *   - format (multiple_choice/short_answer/open_ended)
 *   - question_text (the actual question)
 *   - correct_answer (JSON string)
 *   - grading_rubric (optional JSON string)
 *   - targeted_misconception (optional)
 *
 * The tool returns a question_id that the AI can later use with record_evidence
 * to track whether the student answered correctly.
 */

import { randomUUID } from 'crypto';

/**
 * Execute question persistence.
 *
 * @param {Object} ctx - Handler context.
 * @param {import('pg').Pool} ctx.db - Shared Postgres pool.
 * @param {string} ctx.waxId - Student identifier.
 * @param {string} ctx.sessionId - Session identifier.
 * @param {string} ctx.concept_tag - Concept tag.
 * @param {string} ctx.difficulty - 'easy' | 'medium' | 'hard'.
 * @param {string} ctx.format - 'multiple_choice' | 'short_answer' | 'open_ended'.
 * @param {string} ctx.question_text - The question text drafted by the AI.
 * @param {string} ctx.correct_answer - Correct answer as JSON string.
 * @param {string} [ctx.grading_rubric] - Optional grading rubric as JSON string.
 * @param {string} [ctx.targeted_misconception] - Optional targeted misconception.
 */
export async function executeGenerateQuestion({
  db,
  waxId,
  sessionId,
  concept_tag,
  difficulty = 'medium',
  format = 'multiple_choice',
  question_text,
  correct_answer,
  grading_rubric = null,
  targeted_misconception = null,
}) {
  if (!db) {
    throw new Error('executeGenerateQuestion: db pool is required');
  }
  if (!waxId) {
    throw new Error('executeGenerateQuestion: waxId is required');
  }
  if (!concept_tag) {
    return { success: false, error: 'concept_tag is required' };
  }
  if (!question_text || question_text.length < 10) {
    return { success: false, error: 'question_text must be at least 10 characters' };
  }
  if (!correct_answer) {
    return { success: false, error: 'correct_answer is required' };
  }

  // Validate JSON-shaped string fields.
  let correctAnswerJson;
  try {
    correctAnswerJson = typeof correct_answer === 'string'
      ? JSON.parse(correct_answer)
      : correct_answer;
  } catch {
    return { success: false, error: 'correct_answer must be valid JSON' };
  }

  let gradingRubricJson = null;
  if (grading_rubric) {
    try {
      gradingRubricJson = typeof grading_rubric === 'string'
        ? JSON.parse(grading_rubric)
        : grading_rubric;
    } catch {
      return { success: false, error: 'grading_rubric must be valid JSON or null' };
    }
  }

  try {
    const result = await db.query(
      `INSERT INTO assessment_questions (
        id, wax_id, session_id, concept_tag, difficulty, format,
        question_text, correct_answer, grading_rubric, targeted_misconception,
        status, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'active', NOW(), NOW())
      RETURNING id`,
      [
        randomUUID(),
        waxId,
        sessionId,
        concept_tag,
        difficulty,
        format,
        question_text,
        JSON.stringify(correctAnswerJson),
        gradingRubricJson ? JSON.stringify(gradingRubricJson) : null,
        targeted_misconception,
      ],
    );

    return {
      success: true,
      question_id: result.rows[0].id,
      question_text,
      question_type: format,
      difficulty,
      concept_tag,
      generated_at: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to persist question: ${error.message}`,
    };
  }
}

export default { executeGenerateQuestion };
