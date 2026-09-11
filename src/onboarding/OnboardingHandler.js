/**
 * WaxPrep - Onboarding Handler
 * 
 * Stage 21: First Functioning Prototype
 * 
 * Provides infrastructure for onboarding detection:
 * - Detects first contact
 * - Marks onboarding state
 * - Provides context flags to AI
 * - NO hardcoded welcome messages
 * - NO scripted conversations
 * - NO fixed educational wording
 * 
 * The AI conducts onboarding as a natural conversation.
 * The software only provides infrastructure to detect and track onboarding.
 * 
 * The AI is the intelligence. This provides the infrastructure for onboarding detection.
 */

/**
 * Onboarding states
 */
export const OnboardingState = Object.freeze({
  NOT_STARTED: 'not_started',
  IN_PROGRESS: 'in_progress',
  COMPLETE: 'complete',
});

/**
 * OnboardingHandler - Handles onboarding detection and tracking
 */
export class OnboardingHandler {
  constructor(database) {
    this.db = database;
  }

  /**
   * Check if student is new (first message)
   *
   * @param {string} waxId - Student identifier
   * @returns {Promise<boolean>} - Whether student is new
   */
  async isNewStudent(waxId) {
    // NOTE: `this.db` is the shared pg.Pool (per workers/setup.js wiring),
    // NOT a db module. The previous implementation called
    // `this.db.createPool(config)` which would throw on a Pool instance —
    // one of the reasons this handler was never wired into the pipeline.
    const result = await this.db.query(
      `
      SELECT COUNT(*) as message_count
      FROM messages
      WHERE wax_id = $1
        AND deleted_at IS NULL
      `,
      [waxId],
    );

    const count = parseInt(result.rows[0]?.message_count ?? '0', 10);
    return count === 0;
  }

  /**
   * Check if onboarding is complete
   * 
   * @param {string} waxId - Student identifier
   * @param {string} sessionId - Session identifier
   * @returns {Promise<boolean>} - Whether onboarding is complete
   */
  async isOnboardingComplete(waxId, sessionId) {
    const result = await this.db.query(
      `
      SELECT 
        metadata->>'onboarding_complete' as is_complete
      FROM sessions
      WHERE wax_id = $1
        AND id = $2
        AND ended_at IS NULL
      `,
      [waxId, sessionId],
    );
    
    if (result.rows.length === 0 || !result.rows[0].is_complete) {
      return false;
    }
    
    return result.rows[0].is_complete === 'true';
  }

  /**
   * Mark onboarding as complete
   * 
   * @param {string} waxId - Student identifier
   * @param {string} sessionId - Session identifier
   * @returns {Promise<void>}
   */
  async completeOnboarding(waxId, sessionId) {
    // Store onboarding completion in metadata
    await this.db.query(
      `
      UPDATE sessions
      SET 
        metadata = jsonb_set(
          COALESCE(metadata, '{}'::jsonb),
          '{onboarding_complete}',
          'true'::jsonb
        ),
        updated_at = NOW()
      WHERE wax_id = $1
        AND id = $2
        AND ended_at IS NULL
      `,
      [waxId, sessionId],
    );
  }

  /**
   * Get onboarding context for the AI.
   *
   * Returns a single state flag that the AI can act on. Per AGENTS.md §5,
   * onboarding must not become a fixed questionnaire — the AI conducts it as a
   * natural conversation. The infrastructure's job is to expose STATE, not
   * to script responses.
   */
  getOnboardingContext(isNewStudent, isOnboardingComplete) {
    const context = {};

    if (isNewStudent && !isOnboardingComplete) {
      context.onboardingState = 'first_contact';
    } else if (isNewStudent) {
      context.onboardingState = 'post_onboarding';
    }

    return context;
  }
}

export default OnboardingHandler;
