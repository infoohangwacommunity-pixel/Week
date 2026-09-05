/**
 * WaxPrep - Context Assembler
 * 
 * Stage 18: Context Window Management
 * 
 * Assembles conversation context for AI requests by:
 * - Fetching recent conversation history
 * - Managing token budgets
 * - Applying intelligent truncation
 * - Separating system instructions from conversation
 * - Logging context metadata
 * 
 * The AI is the intelligence. This provides the infrastructure for context.
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';

/**
 * ContextAssembler - Assembles conversation context for AI requests
 */
export class ContextAssembler {
  constructor(database) {
    this.db = database;
  }

  /**
   * Assemble context for an AI request
   * 
   * @param {Object} options - Assembly options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @param {string} options.currentMessage - Current user message to include
   * @param {Object} options.trace - Trace context
   * @returns {Promise<Object>} - Assembled context
   */
  async assemble({ waxId, sessionId, currentMessage, trace = {} }) {
    const log = logger.child({ waxId, sessionId, ...trace });
    const assemblyStart = Date.now();

    try {
      // Fetch recent conversation history
      const conversationHistory = await this.fetchConversationHistory({ waxId, sessionId });

      // Build messages array
      const messages = this.buildMessagesArray({
        conversationHistory,
        currentMessage,
      });

      // Calculate token usage and apply budget
      const contextWithBudget = this.applyTokenBudget(messages);

      // Log assembly metadata
      const assemblyTime = Date.now() - assemblyStart;
      log.info({
        messageCount: contextWithBudget.messages.length,
        estimatedTokens: contextWithBudget.estimatedTokens,
        truncationOccurred: contextWithBudget.truncationOccurred,
        assemblyTimeMs: assemblyTime,
      }, 'Context assembled successfully');

      return contextWithBudget;
    } catch (error) {
      log.error({ error: error.message }, 'Context assembly failed');
      throw error;
    }
  }

  /**
   * Fetch recent conversation history from database
   * 
   * @param {Object} options - Fetch options
   * @param {string} options.waxId - Student identifier
   * @param {string} options.sessionId - Session identifier
   * @returns {Promise<Array>} - Array of message objects
   */
  async fetchConversationHistory({ waxId, sessionId }) {
    const maxHistoryMessages = config.CONTEXT_MAX_HISTORY_MESSAGES || 20;

    const pool = await this.db.createPool(config);

    // Fetch recent messages for this student and session
    // Order: oldest first (for context building)
    const result = await pool.query(
      `
      SELECT 
        id,
        wax_id,
        session_id,
        direction,
        content,
        message_type,
        created_at
      FROM messages
      WHERE wax_id = $1
        AND session_id = $2
        AND direction = 'inbound'
        AND deleted_at IS NULL
      ORDER BY created_at ASC
      LIMIT $3
      `,
      [waxId, sessionId, maxHistoryMessages]
    );

    return result.rows.map(row => ({
      id: row.id,
      waxId: row.wax_id,
      sessionId: row.session_id,
      direction: row.direction,
      content: row.content,
      messageType: row.message_type,
      createdAt: new Date(row.created_at),
    }));
  }

  /**
   * Build messages array for AI request
   * 
   * @param {Object} options - Build options
   * @param {Array} options.conversationHistory - Recent conversation messages
   * @param {string} options.currentMessage - Current user message
   * @returns {Array} - Formatted messages array
   */
  buildMessagesArray({ conversationHistory, currentMessage }) {
    const messages = [];

    // Add conversation history
    for (const msg of conversationHistory) {
      if (msg.direction === 'inbound') {
        messages.push({
          role: 'user',
          content: msg.content,
        });
      } else {
        messages.push({
          role: 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current message as the last user message
    if (currentMessage && currentMessage.trim()) {
      // Replace the last user message if exists, or append
      const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
      if (lastUserMessageIndex >= 0) {
        messages[lastUserMessageIndex] = {
          role: 'user',
          content: currentMessage,
        };
      } else {
        messages.push({
          role: 'user',
          content: currentMessage,
        });
      }
    }

    return messages;
  }

  /**
   * Apply token budget to context
   * 
   * @param {Array} messages - Messages array
   * @returns {Object} - Context with budget information
   */
  applyTokenBudget(messages) {
    const maxInputTokens = config.CONTEXT_MAX_INPUT_TOKENS || 4000;
    const responseTokenBudget = config.CONTEXT_RESPONSE_TOKEN_BUDGET || 1024;

    // Estimate token usage
    const estimatedTokens = this.estimateTokenCount(messages);

    let finalMessages = messages;
    let truncationOccurred = false;

    // Apply truncation if over budget
    if (estimatedTokens > maxInputTokens) {
      const { messages: truncated, tokens: finalTokens } = this.truncateMessages({
        messages,
        maxTokens: maxInputTokens,
      });

      finalMessages = truncated;
      truncationOccurred = true;

      logger.debug({
        originalTokens: estimatedTokens,
        finalTokens,
        maxTokens: maxInputTokens,
      }, 'Context truncated due to token budget');
    }

    return {
      messages: finalMessages,
      estimatedTokens: truncationOccurred 
        ? this.estimateTokenCount(finalMessages) 
        : estimatedTokens,
      tokenBudget: {
        maxInputTokens,
        responseTokenBudget,
        truncationOccurred,
      },
    };
  }

  /**
   * Estimate token count for messages
   * 
   * @param {Array} messages - Messages array
   * @returns {number} - Estimated token count
   */
  estimateTokenCount(messages) {
    // Simple character-based estimation
    // Average: 1 token ≈ 4 characters in English
    let totalChars = 0;

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalChars += msg.content.length;
      } else if (Array.isArray(msg.content)) {
        // Handle multimodal content if needed
        for (const part of msg.content) {
          if (part.type === 'text' && typeof part.text === 'string') {
            totalChars += part.text.length;
          }
        }
      }
    }

    return Math.ceil(totalChars / 4);
  }

  /**
   * Truncate messages to fit within token budget
   * 
   * Preserves complete conversation turns and never cuts in the middle of a message.
   * 
   * @param {Object} options - Truncate options
   * @param {Array} options.messages - Messages to truncate
   * @param {number} options.maxTokens - Maximum tokens allowed
   * @returns {Object} - Truncated messages and final token count
   */
  truncateMessages({ messages, maxTokens }) {
    if (messages.length === 0) {
      return { messages: [], tokens: 0 };
    }

    // Calculate tokens for each message
    const messageTokens = messages.map(msg => ({
      ...msg,
      tokens: this.estimateTokenCount([msg]),
    }));

    // Calculate total tokens
    let totalTokens = messageTokens.reduce((sum, m) => sum + m.tokens, 0);

    if (totalTokens <= maxTokens) {
      return { messages: messageTokens, tokens: totalTokens };
    }

    // Remove oldest messages until we fit
    let cumulativeTokens = 0;
    let keepFromStart = 0;

    for (let i = 0; i < messageTokens.length; i++) {
      cumulativeTokens += messageTokens[i].tokens;
      if (cumulativeTokens > maxTokens) {
        break;
      }
      keepFromStart = i + 1;
    }

    // Keep at least the last 2 turns (4 messages) if possible
    const minMessages = 4;
    if (messageTokens.length - keepFromStart > minMessages) {
      keepFromStart = Math.max(0, messageTokens.length - minMessages);
    }

    const truncated = messageTokens.slice(keepFromStart);
    const finalTokens = truncated.reduce((sum, m) => sum + m.tokens, 0);

    return { messages: truncated, tokens: finalTokens };
  }
}

export default ContextAssembler;
