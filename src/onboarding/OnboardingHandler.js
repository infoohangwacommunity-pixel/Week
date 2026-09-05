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

import config from '../config/index.js';

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
    const pool = await this.db.createPool(config);
    
    const result = await pool.query(
      `
      SELECT COUNT(*) as message_count
      FROM messages
      WHERE wax_id = $1
        AND deleted_at IS NULL
      `,
      [waxId]
    );
    
    return parseInt(result.rows[0].message_count, 10) === 0;
  }

  /**
   * Check if onboarding is complete
   * 
   * @param {string} waxId - Student identifier
   * @param {string} sessionId - Session identifier
   * @returns {Promise<boolean>} - Whether onboarding is complete
   */
  async isOnboardingComplete(waxId, sessionId) {
    const pool = await this.db.createPool(config);
    
    const result = await pool.query(
      `
      SELECT 
        metadata->>'onboarding_complete' as is_complete
      FROM sessions
      WHERE wax_id = $1
        AND id = $2
        AND ended_at IS NULL
      `,
      [waxId, sessionId]
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
    const pool = await this.db.createPool(config);
    
    // Store onboarding completion in metadata
    await pool.query(
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
      [waxId, sessionId]
    );
  }

  /**
   * Get onboarding context for AI
   * 
   * Returns context flags that allow the AI to know it's onboarding.
   * The AI decides what to say naturally through the system prompt.
   * 
   * @param {boolean} isNewStudent - Whether student is new
   * @param {boolean} isOnboardingComplete - Whether onboarding is complete
   * @returns {Object} - Onboarding context for AI
   */
  getOnboardingContext(isNewStudent, isOnboardingComplete) {
    const context = {};

    // Only include onboarding context if needed
    if (isNewStudent && !isOnboardingComplete) {
      context.onboardingState = 'first_contact';
      context.onboardingContext = `
The student is contacting WaxPrep for the first time.
This is their initial message to the tutor.

You should:
- Welcome them naturally and conversationally
- Introduce yourself as their AI tutor
- Ask open questions to understand their learning needs
- Be friendly and encouraging
- Let them guide the conversation about what they want to learn

Do NOT:
- Use a scripted welcome message
- Ask a fixed questionnaire
- Make assumptions about their goals
- Be overly formal or robotic
      `.trim();
    } else if (isNewStudent) {
      context.onboardingState = 'completed';
      context.onboardingContext = `
The student is new but has already completed initial onboarding.
Proceed with normal tutoring interaction.
      `.trim();
    }

    return context;
  }
}

export default OnboardingHandler;
