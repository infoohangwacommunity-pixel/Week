/**
 * Safety Event Logger - Phase I Stage 44-46
 * 
 * Logs safety events to the database and tracks patterns over time.
 */

import config from '../config/index.js';

/**
 * Safety event logger class
 */
export class SafetyEventLogger {
  constructor({ db, logger }) {
    this.db = db;
    this.logger = logger;
  }

  /**
   * Log a safety event
   */
  async logEvent(eventData) {
    const event = {
      wax_id: eventData.waxId,
      session_id: eventData.sessionId,
      ai_request_id: eventData.aiRequestId,
      event_type: eventData.eventType,
      level: eventData.level,
      classifier_model: eventData.classifierModel || config.SAFETY_CLASSIFIER_MODEL,
      educational_context_score: eventData.educationalContextScore,
      welfare_concern_score: eventData.welfareConcernScore,
      inappropriate_response_score: eventData.inappropriateResponseScore,
      adversarial_pattern_score: eventData.adversarialPatternScore,
      action_taken: eventData.actionTaken,
      crisis_resources_delivered: eventData.crisisResourcesDelivered || false,
      operator_notified: eventData.operatorNotified || false,
      requires_review: eventData.requiresReview || false,
      created_at: new Date(),
    };

    try {
      await this.db.query(
        `INSERT INTO safety_events (
          wax_id, session_id, ai_request_id, event_type, level,
          classifier_model, educational_context_score, welfare_concern_score,
          inappropriate_response_score, adversarial_pattern_score,
          action_taken, crisis_resources_delivered, operator_notified,
          requires_review, reviewer_notes, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW())`,
        [
          event.wax_id,
          event.session_id,
          event.ai_request_id,
          event.event_type,
          event.level,
          event.classifier_model,
          event.educational_context_score,
          event.welfare_concern_score,
          event.inappropriate_response_score,
          event.adversarial_pattern_score,
          event.action_taken,
          event.crisis_resources_delivered,
          event.operator_notified,
          event.requires_review,
          null, // reviewer_notes
        ]
      );

      return { success: true, eventId: true }; // Simplified
    } catch (error) {
      this.logger.error('Failed to log safety event', {
        error: error.message,
        waxId: eventData.waxId,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Track adversarial patterns
   */
  async trackAdversarialPattern({ waxId, patternType, severity = 1 }) {
    try {
      // Check if pattern already exists
      const existing = await this.db.query(
        `SELECT id, incident_count, last_occurrence_at, action_taken
         FROM adversarial_patterns
         WHERE wax_id = $1 AND pattern_type = $2`,
        [waxId, patternType]
      );

      if (existing.rows.length > 0) {
        // Increment count
        const count = parseInt(existing.rows[0].incident_count, 10) + 1;
        const lastOccurrence = new Date();

        await this.db.query(
          `UPDATE adversarial_patterns
           SET incident_count = $1, last_occurrence_at = $2
           WHERE wax_id = $3 AND pattern_type = $4`,
          [count, lastOccurrence, waxId, patternType]
        );

        // Check if tools should be disabled
        if (count >= config.SAFETY_ADVERSARIAL_DISABLE_TOOLS_AFTER) {
          await this.db.query(
            `UPDATE adversarial_patterns
             SET action_taken = 'tools_disabled',
                 tools_disabled_until = $1
             WHERE wax_id = $2 AND pattern_type = $3`,
            [
              new Date(Date.now() + 3600000), // 1 hour
              waxId,
              patternType,
            ]
          );

          return {
            success: true,
            toolsDisabled: true,
            disabledUntil: new Date(Date.now() + 3600000),
          };
        }

        return {
          success: true,
          toolsDisabled: false,
          incidentCount: count,
        };
      } else {
        // Create new pattern record
        await this.db.query(
          `INSERT INTO adversarial_patterns (
            wax_id, pattern_type, severity, incident_count, last_occurrence_at
          ) VALUES ($1, $2, $3, $4, $5)`,
          [waxId, patternType, severity, 1, new Date()]
        );

        return {
          success: true,
          toolsDisabled: false,
          incidentCount: 1,
        };
      }
    } catch (error) {
      this.logger.error('Failed to track adversarial pattern', {
        error: error.message,
        waxId,
      });
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if tools should be disabled for a student
   */
  async checkToolsDisabled(waxId) {
    try {
      const result = await this.db.query(
        `SELECT tools_disabled_until, incident_count
         FROM adversarial_patterns
         WHERE wax_id = $1 
         AND action_taken = 'tools_disabled'
         AND (tools_disabled_until IS NULL OR tools_disabled_until > NOW())`,
        [waxId]
      );

      if (result.rows.length > 0) {
        const row = result.rows[0];
        const disabledUntil = new Date(row.tools_disabled_until);
        const remainingMs = disabledUntil - Date.now();

        return {
          disabled: true,
          remainingMs,
          remainingMinutes: Math.ceil(remainingMs / 60000),
          incidentCount: parseInt(row.incident_count, 10),
        };
      }

      return { disabled: false };
    } catch (error) {
      this.logger.error('Failed to check tools disabled status', {
        error: error.message,
      });
      return { disabled: false };
    }
  }

  /**
   * Get safety event history for a student
   */
  async getEventHistory({ waxId, limit = 50, eventType = null }) {
    try {
      let query = `
        SELECT * FROM safety_events
        WHERE wax_id = $1
      `;
      const params = [waxId];

      if (eventType) {
        query += ` AND event_type = $2`;
        params.push(eventType);
      }

      query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

      const result = await this.db.query(query, params);
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get safety event history', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Get review queue (events requiring review)
   */
  async getReviewQueue({ limit = 20 }) {
    try {
      const result = await this.db.query(
        `SELECT * FROM safety_events
         WHERE requires_review = TRUE
         AND reviewed_at IS NULL
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return result.rows;
    } catch (error) {
      this.logger.error('Failed to get review queue', {
        error: error.message,
      });
      return [];
    }
  }

  /**
   * Mark event as reviewed
   */
  async markAsReviewed(eventId, reviewerId, notes = null) {
    try {
      await this.db.query(
        `UPDATE safety_events
         SET reviewed_at = $1, reviewer_notes = $2
         WHERE id = $3`,
        [new Date(), notes, eventId]
      );
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to mark event as reviewed', {
        error: error.message,
      });
      return { success: false, error: error.message };
    }
  }
}

export default SafetyEventLogger;
