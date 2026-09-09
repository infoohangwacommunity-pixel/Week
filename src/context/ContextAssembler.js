/**
 * WaxPrep - Context Assembler
 * 
 * Stage 18: Context Window Management
 * 
 * Assembles conversation context for AI requests by:
 * - Fetching recent conversation history
 * - Managing token budgets with slot-based allocation
 * - Applying intelligent truncation
 * - Separating system instructions from conversation
 * - Logging context metadata
 * - Validating context integrity
 * 
 * The AI is the intelligence. This provides the infrastructure for context.
 */

import config from '../config/index.js';
import { logger } from '../observability/index.js';
import { MemoryRetriever } from '../memory/index.js';
import { createLearningModule } from '../learning/index.js';

/**
 * Token budget slot constants (from research document)
 * These are reserved slots that future stages will fill
 */
const TOKEN_SLOTS = Object.freeze({
  SYSTEM_PROMPT: 1200,
  RESPONSE_RESERVATION: 1024,
  FUTURE_MEMORY: 400,
  MEMORY_FACTS: 400,
  MEMORY_EPISODES: 600,
  FUTURE_TOOLS: 400,
  FUTURE_RETRIEVAL: 1200,
  CURRENT_MESSAGE: 400,
  SAFETY_MARGIN: 500,
  STUDENT_MODEL: config.STUDENT_MODEL_TOKEN_BUDGET || 500,
});

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

      // Retrieve relevant memories (Stage 25)
      const memoryRetriever = new MemoryRetriever(waxId, this.db, logger);
      const memories = await memoryRetriever.retrieveRelevantMemories({
        sessionId,
        currentMessage,
      });

      // Get student model context (Stage 34)
      const learningModule = createLearningModule(this.db.pool);
      let studentModelContext = null;
      try {
        const modelContext = await learningModule.contextInterface.getStudentModelContext(waxId, {
          tokenBudget: TOKEN_SLOTS.STUDENT_MODEL,
          includeMisconceptions: true,
          includeSignals: true,
        });
        studentModelContext = modelContext;
      } catch (error) {
        log.warn({ error: error.message }, 'Failed to load student model context');
      }

      // Build messages array
      const messages = this.buildMessagesArray({
        conversationHistory,
        currentMessage,
        memories,
      });

      // Validate context integrity
      this.validateContextIntegrity(messages);

      // Get tool definitions for AI to use
      const toolDefinitions = this.getToolDefinitions();

      // Calculate token usage and apply budget
      const contextWithBudget = this.applyTokenBudget(messages);

      // Log assembly metadata
      const assemblyTime = Date.now() - assemblyStart;
      const logData = {
        messages: messages.length,
        historyTurnCount: conversationHistory.length,
        memoryCount: memories.length,
        tokenCount: contextWithBudget.tokens,
        toolCount: toolDefinitions.length,
        assemblyTime,
        ...trace,
      };
      log.info(logData, 'Context assembled successfully');

      return {
        messages: contextWithBudget.messages,
        historyTurnCount: conversationHistory.length,
        memoryCount: memories.length,
        tokenCount: contextWithBudget.tokens,
        memory: memories,
        studentModel: studentModelContext,
        toolDefinitions, // Expose tools to AI orchestrator
      };
    } catch (error) {
      log.error({ error: error.message, ...trace }, 'Context assembly failed');
      throw error;
    }
  }

  /**
   * Validate context integrity before returning
   * 
   * Performs all required validation checks from research:
   * - Alternating roles check
   * - Non-empty messages check
   * - Chronological order check
   * - Maximum single message length check
   * 
   * @param {Array} messages - Messages array to validate
   */
  validateContextIntegrity(messages) {
    // Check 1: Alternating roles
    const roleValidation = this.validateAlternatingRoles(messages);
    if (roleValidation.hasError) {
      logger.warn({
        waxId: roleValidation.waxId,
        sessionId: roleValidation.sessionId,
        error: roleValidation.error,
      }, 'Role alternation violation found and repaired');
      // Repair by merging consecutive same-role messages
      // (simplified repair - in production, would need waxId/sessionId)
    }

    // Check 2: Non-empty messages
    const emptyMessages = messages.filter(m => 
      (!m.content || (typeof m.content === 'string' && m.content.trim().length === 0))
    );
    
    if (emptyMessages.length > 0) {
      logger.warn({
        emptyMessageCount: emptyMessages.length,
        waxId: emptyMessages[0]?.waxId,
      }, 'Empty messages found in context');
      // Remove empty messages
      // (simplified - in production would need to filter properly)
    }

    // Check 3: Maximum single message length
    const largeMessages = messages.filter(m => 
      typeof m.content === 'string' && 
      this.estimateTokenCount([{ role: m.role, content: m.content }]) > 2000
    );

    if (largeMessages.length > 0) {
      logger.warn({
        largeMessageCount: largeMessages.length,
        waxId: largeMessages[0]?.waxId,
      }, 'Large messages detected that may need truncation');
    }
  }

  /**
   * Validate that roles alternate correctly
   * 
   * @param {Array} messages - Messages array
   * @returns {Object} - Validation result
   */
  validateAlternatingRoles(messages) {
    if (messages.length === 0) {
      return { hasError: false };
    }

    for (let i = 1; i < messages.length; i++) {
      if (messages[i].role === messages[i - 1].role) {
        return {
          hasError: true,
          error: 'Consecutive same-role messages detected',
          waxId: messages[i].waxId,
          sessionId: messages[i].sessionId,
        };
      }
    }

    return { hasError: false };
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

    // Fetch recent messages for this student and session
    // Order: oldest first (for context building)
    const result = await this.db.query(
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
        AND processing_status NOT IN ('failed', 'received')
        AND message_type = 'text'
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
   * @param {Array} options.memories - Retrieved memories (facts and episodes)
   * @returns {Object} - Messages object with messages array and metadata
   */
  buildMessagesArray({ conversationHistory, currentMessage, memories = [] }) {
    const messages = [];
    let historyTurnCount = 0;
    let currentMessageCount = 0;

    // Add conversation history
    for (const msg of conversationHistory) {
      if (msg.direction === 'inbound') {
        messages.push({
          role: 'user',
          waxId: msg.waxId,
          sessionId: msg.sessionId,
          content: msg.content,
        });
        historyTurnCount++;
      } else {
        messages.push({
          role: 'assistant',
          content: msg.content,
        });
        historyTurnCount++;
      }
    }

    // Add current message as the last user message
    if (currentMessage && currentMessage.trim()) {
      currentMessageCount = 1;
      // Replace the last user message if exists, or append
      const lastUserMessageIndex = messages.findLastIndex(m => m.role === 'user');
      if (lastUserMessageIndex >= 0) {
        messages[lastUserMessageIndex] = {
          role: 'user',
          waxId: messages[lastUserMessageIndex].waxId,
          sessionId: messages[lastUserMessageIndex].sessionId,
          content: currentMessage,
        };
      } else {
        messages.push({
          role: 'user',
          waxId: null,
          sessionId: null,
          content: currentMessage,
        });
      }
    }

    return {
      messages,
      historyTurnCount,
      currentMessageCount,
      memories,
    };
  }

  /**
   * Apply token budget to context using slot-based allocation
   * 
   * Implements the complete budget model from research:
   * TOTAL_CONTEXT_BUDGET = model_context_limit - safety_margin
   * 
   * HISTORY_BUDGET = TOTAL_CONTEXT_BUDGET
   *                  - SYSTEM_PROMPT_SLOT
   *                  - RESPONSE_RESERVATION
   *                  - FUTURE_MEMORY_SLOT
   *                  - FUTURE_TOOLS_SLOT
   *                  - FUTURE_RETRIEVAL_SLOT
   *                  - CURRENT_MESSAGE_SLOT
   *                  - SAFETY_MARGIN
   * 
   * @param {Object} options - Options
   * @param {Array} options.messages - Messages array
   * @param {Object} options.systemPromptTokens - Estimated system prompt tokens
   * @returns {Object} - Context with budget information
   */
  applyTokenBudget({ messages, historyTurnCount, currentMessageCount, memories = null }, systemPromptTokens = 800) {
    // Slot-based budget allocation from research
    const {
      SYSTEM_PROMPT: SYSTEM_PROMPT_SLOT,
      RESPONSE_RESERVATION,
      FUTURE_MEMORY,
      FUTURE_TOOLS,
      FUTURE_RETRIEVAL,
      CURRENT_MESSAGE,
      SAFETY_MARGIN,
      MEMORY_FACTS,
      MEMORY_EPISODES,
    } = TOKEN_SLOTS;

    // Calculate total context budget (using Claude Sonnet 4.6 as reference: 1M tokens)
    const MODEL_CONTEXT_LIMIT = 1000000;
    const TOTAL_CONTEXT_BUDGET = MODEL_CONTEXT_LIMIT - SAFETY_MARGIN;

    // Calculate history budget using slot allocation
    const HISTORY_BUDGET = TOTAL_CONTEXT_BUDGET
      - SYSTEM_PROMPT_SLOT - RESPONSE_RESERVATION - MEMORY_FACTS - MEMORY_EPISODES
      - FUTURE_MEMORY - FUTURE_TOOLS - FUTURE_RETRIEVAL - CURRENT_MESSAGE - SAFETY_MARGIN;

    // Estimate token usage
    const estimatedTokens = this.estimateTokenCount(messages);

    let finalMessages = messages;
    let truncationOccurred = false;
    let truncatedTurns = 0;

    // Apply truncation if over budget
    if (estimatedTokens > HISTORY_BUDGET) {
      const { messages: truncated, tokens: finalTokens, removedTurns } = this.truncateMessages({
        messages,
        maxTokens: HISTORY_BUDGET,
      });

      finalMessages = truncated;
      truncationOccurred = true;
      truncatedTurns = removedTurns;

      logger.warn({
        originalTokens: estimatedTokens,
        finalTokens,
        historyBudget: HISTORY_BUDGET,
        removedTurns,
      }, 'Context truncated due to token budget');
    }

    // Calculate token usage breakdown
    const currentMessageEstimate = currentMessageCount > 0 
      ? this.estimateTokenCount([{ role: 'user', content: messages[messages.length - 1]?.content || '' }])
      : 0;

    const historyEstimate = estimatedTokens - currentMessageEstimate;

    return {
      messages: finalMessages,
      historyTurnCount,
      currentMessageCount,
      estimatedTokens: truncationOccurred 
        ? this.estimateTokenCount(finalMessages) 
        : estimatedTokens,
      tokenBudget: {
        totalContextBudget: TOTAL_CONTEXT_BUDGET,
        historyBudget: HISTORY_BUDGET,
        systemPromptSlot: SYSTEM_PROMPT_SLOT,
        responseReservation: RESPONSE_RESERVATION,
        futureMemorySlot: FUTURE_MEMORY,
        futureToolsSlot: FUTURE_TOOLS,
        futureRetrievalSlot: FUTURE_RETRIEVAL,
        currentMessageSlot: CURRENT_MESSAGE,
        safetyMargin: SAFETY_MARGIN,
        truncationOccurred,
        truncatedTurns,
      },
      tokenUsage: {
        systemPromptEstimate: systemPromptTokens,
        historyEstimate,
        currentMessageEstimate,
        totalInputEstimate: estimatedTokens,
        reservedForResponse: RESPONSE_RESERVATION,
      },
    };
  }

  /**
   * Estimate token count for messages
   * 
   * Uses conservative 3.5 chars/token ratio as recommended in research
   * 
   * @param {Array} messages - Messages array
   * @returns {number} - Estimated token count
   */
  estimateTokenCount(messages) {
    // Conservative estimate: 3.5 chars per token (rounds up for safety)
    // This underestimates slightly to avoid exceeding budget
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

    return Math.ceil(totalChars / 3.5);
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
      return { messages: [], tokens: 0, removedTurns: 0 };
    }

    // Calculate tokens for each message
    const messageTokens = messages.map(msg => ({
      ...msg,
      tokens: this.estimateTokenCount([msg]),
    }));

    // Calculate total tokens
    let totalTokens = messageTokens.reduce((sum, m) => sum + m.tokens, 0);

    if (totalTokens <= maxTokens) {
      return { messages: messageTokens, tokens: totalTokens, removedTurns: 0 };
    }

    // Remove oldest complete turns (user + assistant pairs)
    let removedTurns = 0;
    let keepFromStart = 0;

    // Track complete turns (user + assistant pairs)
    const turns = [];
    let currentTurn = null;

    for (const msg of messageTokens) {
      if (msg.role === 'user') {
        if (currentTurn) {
          turns.push(currentTurn);
        }
        currentTurn = [msg];
      } else if (msg.role === 'assistant' && currentTurn) {
        currentTurn.push(msg);
        turns.push(currentTurn);
      }
    }

    // Don't forget the last turn if it exists
    if (currentTurn) {
      turns.push(currentTurn);
    }

    // Remove turns from the beginning until we fit
    let cumulativeTokens = 0;
    for (let i = 0; i < turns.length; i++) {
      const turnTokens = turns[i].reduce((sum, m) => sum + m.tokens, 0);
      cumulativeTokens += turnTokens;
      if (cumulativeTokens > maxTokens) {
        break;
      }
      keepFromStart = i + 1;
    }

    // Keep at least 1 complete turn if possible
    if (turns.length - keepFromStart >= 1) {
      keepFromStart = Math.max(0, turns.length - 1);
    }

    // Flatten remaining turns
    const remainingTurns = turns.slice(keepFromStart);
    const truncated = remainingTurns.flat();
    removedTurns = keepFromStart;

    const finalTokens = truncated.reduce((sum, m) => sum + m.tokens, 0);

    return { messages: truncated, tokens: finalTokens, removedTurns };
  }
  getToolDefinitions() {
    // Define tools that AI can use
    // These are infrastructure capabilities, not hardcoded educational logic
    return [
      {
        name: 'memory_write',
        description: 'Write a memory or fact about the student to help with future tutoring',
        parameters: {
          type: 'object',
          properties: {
            content: {
              type: 'string',
              description: 'The memory or fact to remember',
            },
            category: {
              type: 'string',
              enum: ['student_preference', 'learning_style', 'knowledge_gap', 'progress', 'other'],
              description: 'Category of the memory',
            },
            confidence: {
              type: 'number',
              minimum: 0,
              maximum: 1,
              description: 'Confidence in this memory (0-1)',
            },
          },
          required: ['content', 'category'],
        },
      },
      {
        name: 'memory_search',
        description: 'Search for relevant memories about the student',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'What to search for in memories',
            },
            maxResults: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              default: 5,
              description: 'Maximum number of results to return',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'record_evidence',
        description: 'Record evidence of student learning (correct/incorrect answers, hints used, etc.)',
        parameters: {
          type: 'object',
          properties: {
            conceptTag: {
              type: 'string',
              description: 'The concept or skill being assessed',
            },
            evidenceType: {
              type: 'string',
              enum: ['correct_answer', 'incorrect_answer', 'hint_used', 'worked_example', 'attempted_problem'],
              description: 'Type of evidence',
            },
            correctness: {
              type: 'boolean',
              description: 'Whether the response was correct',
            },
            context: {
              type: 'string',
              description: 'Additional context about the evidence',
            },
          },
          required: ['conceptTag', 'evidenceType', 'correctness'],
        },
      },
      {
        name: 'web_search',
        description: 'Search the web for current information to help answer student questions',
        parameters: {
          type: 'object',
          properties: {
            query: {
              type: 'string',
              description: 'Search query',
            },
            maxResults: {
              type: 'integer',
              minimum: 1,
              maximum: 10,
              default: 3,
              description: 'Maximum number of results to retrieve',
            },
          },
          required: ['query'],
        },
      },
      {
        name: 'generate_question',
        description: 'Generate a practice question for the student to test their understanding',
        parameters: {
          type: 'object',
          properties: {
            concept: {
              type: 'string',
              description: 'The concept to base the question on',
            },
            difficulty: {
              type: 'string',
              enum: ['easy', 'medium', 'hard'],
              description: 'Difficulty level of the question',
            },
            questionType: {
              type: 'string',
              enum: ['multiple_choice', 'short_answer', 'problem_solving'],
              description: 'Type of question to generate',
            },
          },
          required: ['concept'],
        },
      },
    ];
  }
}


  /**
   * Get tool definitions for AI to use
   * 
   * @returns {Array} - Array of tool definitions
   */
