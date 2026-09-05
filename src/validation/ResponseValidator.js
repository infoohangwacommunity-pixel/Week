/**
 * WaxPrep - Response Validator
 * 
 * Stage 19: Response Validation, Formatting & Delivery
 * 
 * Validates and processes AI responses before delivery:
 * - Empty response detection
 * - Prompt leakage detection
 * - Format normalization
 * - WhatsApp-compatible formatting
 * - Intelligent response splitting
 * 
 * The AI is the intelligence. This provides the infrastructure for safe delivery.
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';

/**
 * Response validation states
 */
export const ValidationState = Object.freeze({
  VALID: 'valid',
  EMPTY: 'empty',
  WHITESPACE_ONLY: 'whitespace_only',
  PROMPT_LEAKAGE: 'prompt_leakage',
  INTERNAL_ERROR: 'internal_error',
  FORMATTING_ERROR: 'formatting_error',
  REPEATED: 'repeated',
});

/**
 * Response delivery states
 */
export const DeliveryState = Object.freeze({
  GENERATED: 'generated',
  QUEUED: 'queued',
  SENT: 'sent',
  FAILED: 'failed',
  RETRYING: 'retrying',
});

/**
 * ResponseValidator - Validates and processes AI responses
 */
export class ResponseValidator {
  constructor(database) {
    this.db = database;
  }

  /**
   * Validate an AI response
   * 
   * @param {Object} options - Validation options
   * @param {string} options.response - AI response content
   * @param {Object} options.trace - Trace context
   * @returns {Promise<Object>} - Validation result
   */
  async validate({ response, trace = {} }) {
    const log = logger.child({ ...trace });
    const validationStart = Date.now();

    // Check for empty response
    if (!response || response.trim().length === 0) {
      log.warn({ responseLength: 0 }, 'Empty response detected');
      return {
        valid: false,
        state: ValidationState.EMPTY,
        message: 'AI returned an empty response',
        canRetry: true,
      };
    }

    // Check for whitespace-only response
    if (response.trim().length === 0) {
      log.warn({ responseLength: response.length }, 'Whitespace-only response detected');
      return {
        valid: false,
        state: ValidationState.WHITESPACE_ONLY,
        message: 'AI returned a whitespace-only response',
        canRetry: true,
      };
    }

    // Check for prompt leakage
    const leakageCheck = this.checkPromptLeakage(response);
    if (leakageCheck.hasLeakage) {
      log.warn({ leakageType: leakageCheck.type }, 'Prompt leakage detected');
      return {
        valid: false,
        state: ValidationState.PROMPT_LEAKAGE,
        message: 'Response contains internal system information',
        canRetry: false,
        leakageType: leakageCheck.type,
      };
    }

    // Check for internal error messages
    const errorCheck = this.checkInternalErrors(response);
    if (errorCheck.hasError) {
      log.warn({ errorType: errorCheck.type }, 'Internal error detected in response');
      return {
        valid: false,
        state: ValidationState.INTERNAL_ERROR,
        message: 'Response contains internal error information',
        canRetry: true,
        errorType: errorCheck.type,
      };
    }

    // Check for repetition (if previous response available)
    if (trace.previousResponse) {
      const repetitionCheck = this.checkRepetition(response, trace.previousResponse);
      if (repetitionCheck.isRepeated) {
        log.warn({ repetitionScore: repetitionCheck.score }, 'Repeated response detected');
        return {
          valid: false,
          state: ValidationState.REPEATED,
          message: 'Response is identical to previous response',
          canRetry: true,
          repetitionScore: repetitionCheck.score,
        };
      }
    }

    const validationTime = Date.now() - validationStart;
    log.debug({ 
      responseLength: response.length,
      validationTimeMs: validationTime,
    }, 'Response validation passed');

    return {
      valid: true,
      state: ValidationState.VALID,
      message: 'Response is valid',
      canRetry: false,
    };
  }

  /**
   * Check for prompt leakage
   * 
   * @param {string} response - AI response
   * @returns {Object} - Leakage information
   */
  checkPromptLeakage(response) {
    const leakagePatterns = [
      // System prompt indicators
      /\[System.*?\]/i,
      /\[AI.*?\]/i,
      /\[Instruction.*?\]/i,
      
      // Internal markers
      /WaxPrep system/i,
      /system prompt/i,
      /internal instruction/i,
      
      // Debug markers
      /DEBUG:/i,
      /TRACE:/i,
      /\[DEBUG\]/i,
    ];

    for (const pattern of leakagePatterns) {
      if (pattern.test(response)) {
        return {
          hasLeakage: true,
          type: 'prompt_leakage',
        };
      }
    }

    return { hasLeakage: false };
  }

  /**
   * Check for internal error messages
   * 
   * @param {string} response - AI response
   * @returns {Object} - Error information
   */
  checkInternalErrors(response) {
    const errorPatterns = [
      /Exception:/i,
      /Error:/i,
      /Traceback:/i,
      /stack trace/i,
      /at \w+ \(/i, // JavaScript stack trace pattern
    ];

    for (const pattern of errorPatterns) {
      if (pattern.test(response)) {
        return {
          hasError: true,
          type: 'internal_error',
        };
      }
    }

    return { hasError: false };
  }

  /**
   * Check for repeated responses
   * 
   * @param {string} response - Current response
   * @param {string} previousResponse - Previous response
   * @returns {Object} - Repetition information
   */
  checkRepetition(response, previousResponse) {
    const normalize = (text) => text.toLowerCase().trim().replace(/\s+/g, ' ');
    
    const normalizedCurrent = normalize(response);
    const normalizedPrevious = normalize(previousResponse);

    if (normalizedCurrent === normalizedPrevious) {
      return {
        isRepeated: true,
        score: 1.0,
      };
    }

    // Check for high similarity (>= 90%)
    const similarity = this.calculateSimilarity(normalizedCurrent, normalizedPrevious);
    
    return {
      isRepeated: similarity > 0.9,
      score: similarity,
    };
  }

  /**
   * Calculate simple similarity between two strings
   * 
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} - Similarity score (0-1)
   */
  calculateSimilarity(str1, str2) {
    const shorter = str1.length < str2.length ? str1 : str2;
    const longer = str1.length < str2.length ? str2 : str1;
    
    if (shorter.length === 0) {
      return 1.0;
    }
    
    const editDistance = this.levenshteinDistance(shorter, longer);
    return 1 - editDistance / longer.length;
  }

  /**
   * Calculate Levenshtein distance between two strings
   * 
   * @param {string} str1 - First string
   * @param {string} str2 - Second string
   * @returns {number} - Edit distance
   */
  levenshteinDistance(str1, str2) {
    const matrix = [];
    
    for (let i = 0; i <= str2.length; i++) {
      matrix[i] = [i];
    }
    
    for (let j = 0; j <= str1.length; j++) {
      matrix[0][j] = j;
    }
    
    for (let i = 1; i <= str2.length; i++) {
      for (let j = 1; j <= str1.length; j++) {
        if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1,
            matrix[i][j - 1] + 1,
            matrix[i - 1][j] + 1
          );
        }
      }
    }
    
    return matrix[str2.length][str1.length];
  }

  /**
   * Normalize response formatting for WhatsApp
   * 
   * @param {string} response - AI response
   * @returns {string} - Normalized response
   */
  normalizeFormatting(response) {
    let normalized = response;

    // Normalize line endings
    normalized = normalized.replace(/\r\n/g, '\n');

    // Normalize multiple blank lines to double newlines
    normalized = normalized.replace(/\n{3,}/g, '\n\n');

    // Fix common markdown issues
    // Remove spaces before bold/italic markers
    normalized = normalized.replace(/\s(\*\*|__)/g, '$1');
    normalized = normalized.replace(/\s(\*|_)/g, '$1');

    // Ensure spaces after bold/italic markers when followed by text
    normalized = normalized.replace(/(\*\*|__)(\w)/g, '$1 $2');
    normalized = normalized.replace(/(\*)(\w)/g, '$1 $2');

    // Fix list formatting - ensure proper spacing
    normalized = normalized.replace(/^(\s*)([-*+]\s)/gm, '$1• $2');

    // Remove excessive spacing
    normalized = normalized.replace(/[ \t]+$/gm, '');

    return normalized;
  }

  /**
   * Split response into WhatsApp-compatible chunks
   * 
   * @param {string} response - AI response
   * @returns {Array} - Array of chunks
   */
  splitResponse(response) {
    const maxChars = config.RESPONSE_MAX_CHUNK_CHARS || 1000;
    const chunks = [];
    
    // Split on paragraph boundaries first
    const paragraphs = response.split(/\n\s*\n/);
    let currentChunk = '';
    
    for (const paragraph of paragraphs) {
      // If a single paragraph exceeds the limit, split on sentences
      if (paragraph.length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk);
          currentChunk = '';
        }
        
        const sentences = paragraph.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [paragraph];
        
        for (const sentence of sentences) {
          if ((currentChunk + sentence).length <= maxChars) {
            currentChunk += (currentChunk ? '\n\n' : '') + sentence;
          } else {
            if (currentChunk) {
              chunks.push(currentChunk);
            }
            currentChunk = sentence;
          }
        }
      } else {
        // Paragraph fits within limit
        if ((currentChunk + paragraph).length <= maxChars) {
          currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
        } else {
          if (currentChunk) {
            chunks.push(currentChunk);
          }
          currentChunk = paragraph;
        }
      }
    }
    
    if (currentChunk) {
      chunks.push(currentChunk);
    }
    
    return chunks.length > 0 ? chunks : [response];
  }

  /**
   * Create delivery record for tracking
   * 
   * @param {Object} options - Delivery options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {string} options.correlationId - Correlation ID
   * @param {string} options.state - Delivery state
   * @returns {Promise<void>}
   */
  async createDeliveryRecord({ waxId, sessionId, correlationId, state }) {
    const pool = await this.db.createPool(config);

    await pool.query(
      `
      INSERT INTO response_deliveries (
        wax_id,
        session_id,
        correlation_id,
        state,
        created_at
      ) VALUES (
        $1, $2, $3, $4, NOW()
      )
      ON CONFLICT (correlation_id) DO UPDATE SET
        state = EXCLUDED.state,
        updated_at = NOW()
      `,
      [waxId, sessionId, correlationId, state]
    );
  }

  /**
   * Update delivery state
   * 
   * @param {Object} options - Update options
   * @param {string} options.correlationId - Correlation ID
   * @param {string} options.state - New state
   * @returns {Promise<void>}
   */
  async updateDeliveryState({ correlationId, state }) {
    const pool = await this.db.createPool(config);

    await pool.query(
      `
      UPDATE response_deliveries
      SET 
        state = $1,
        updated_at = NOW()
      WHERE correlation_id = $2
      `,
      [state, correlationId]
    );
  }
}

export default ResponseValidator;
export { ValidationState, DeliveryState };
