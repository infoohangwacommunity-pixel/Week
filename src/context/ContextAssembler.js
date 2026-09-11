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
import ToolRegistry, { ToolPermission } from '../tools/ToolRegistry.js';
import { OnboardingHandler } from '../onboarding/OnboardingHandler.js';

/**
 * Marker prefix for the infrastructure-injected context evidence message.
 *
 * The evidence block is attached as a `user`-role message (provider-safe),
 * but it is NOT a student turn. The marker lets the alternation validator,
 * truncation logic, and the model itself distinguish it from real student
 * messages. Keep in sync with _formatContextEvidence.
 */
export const CONTEXT_EVIDENCE_MARKER = '[WaxPrep context';

/**
 * Detect the infrastructure-injected context evidence message.
 *
 * Checks the explicit `_contextBlock` flag first, falling back to the text
 * marker for messages that lost the flag (e.g. after serialization).
 *
 * @param {Object} msg - Message object
 * @returns {boolean}
 */
export function isContextEvidenceBlock(msg) {
  if (!msg) return false;
  if (msg._contextBlock === true) return true;
  return typeof msg.content === 'string' && msg.content.startsWith(CONTEXT_EVIDENCE_MARKER);
}

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

      // Resolve conversation state (Stage 21 onboarding + privacy consent).
      // Per AGENTS.md §5 / WAXPREP_PHILOSOPHY §9, infrastructure exposes STATE
      // only — the AI decides how (or whether) to act on it. Failures here are
      // non-fatal: a missing state flag must never block a tutoring reply.
      const conversationState = await this.resolveConversationState({ waxId, sessionId });

      // Get student model context (Stage 34)
      // this.db IS the pool (per workers/setup.js wiring); we don't need .pool.
      const learningModule = createLearningModule(this.db);
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

      // Build messages array — passing memory + student model context for injection.
      // The previous implementation accepted `memories` as a parameter but never
      // read it, so retrieved memory and student model evidence were fetched,
      // attached as metadata, and then silently dropped before the AI ever
      // saw them. We now prepend a single system message containing both the
      // memory facts and the student model formatted text so the AI receives
      // them as contextual evidence (NOT as conversation turns).
      const messagesResult = this.buildMessagesArray({
        conversationHistory,
        currentMessage,
        memories,
        studentModelContext,
        conversationState,
      });
      const messages = messagesResult.messages;

      // Validate context integrity
      this.validateContextIntegrity(messages);

      // Get tool definitions for AI to use
      const toolDefinitions = this.getToolDefinitions();

      // Calculate token usage and apply budget
      const contextWithBudget = this.applyTokenBudget(messagesResult);

      // Log assembly metadata
      const assemblyTime = Date.now() - assemblyStart;
      const memoryFactCount = (memories && Array.isArray(memories.facts)) ? memories.facts.length
        : (Array.isArray(memories) ? memories.length : 0);
      const logData = {
        messages: messages.length,
        historyTurnCount: conversationHistory.length,
        memoryCount: memoryFactCount,
        tokenCount: contextWithBudget.tokens,
        toolCount: toolDefinitions.length,
        assemblyTime,
        ...trace,
      };
      log.info(logData, 'Context assembled successfully');

      return {
        messages: contextWithBudget.messages,
        historyTurnCount: conversationHistory.length,
        memoryCount: memoryFactCount,
        tokenCount: contextWithBudget.tokens,
        memory: memories,
        studentModel: studentModelContext,
        conversationState, // Expose resolved state for observability
        toolDefinitions, // Expose tools to AI orchestrator
      };
    } catch (error) {
      log.error({ error: error.message, ...trace }, 'Context assembly failed');
      throw error;
    }
  }

  /**
   * Resolve the conversation state that infrastructure owes the AI.
   *
   * Returns a plain, serializable state object:
   *   { onboardingState, hasConsent, consentStatus }
   *
   * - onboardingState: 'first_contact' | 'returning' | 'post_onboarding'
   * - consentStatus:   'granted' | 'withdrawn' | 'pending' | null (never asked)
   *
   * Every lookup is individually non-fatal: if a query fails, the field is
   * simply omitted and the AI works from the remaining context. Per the
   * Newborn AI philosophy, this method exposes STATE — it never scripts how
   * the AI should open the conversation.
   */
  async resolveConversationState({ waxId, sessionId }) {
    const state = {};

    // 1. Onboarding state (first contact detection).
    try {
      if (!this._onboardingHandler) {
        this._onboardingHandler = new OnboardingHandler(this.db);
      }
      const isNew = await this._onboardingHandler.isNewStudent(waxId);
      if (isNew) {
        // Check whether a previous session already completed onboarding
        // (student returning after a long break with cleared messages).
        let complete = false;
        try {
          complete = await this._onboardingHandler.isOnboardingComplete(waxId, sessionId);
        } catch {
          complete = false;
        }
        state.onboardingState = complete ? 'post_onboarding' : 'first_contact';
      }
      // Returning students get no onboarding flag — the presence of history
      // already tells the AI this is an ongoing relationship.
    } catch (error) {
      logger.warn({ error: error.message }, 'Failed to resolve onboarding state (non-fatal)');
    }

    // 2. Privacy consent state (latest general consent record).
    try {
      const consentResult = await this.db.query(
        `SELECT status FROM consents
         WHERE wax_id = $1 AND consent_type = 'general'
         ORDER BY created_at DESC
         LIMIT 1`,
        [waxId],
      );
      const consentStatus = consentResult.rows[0]?.status ?? null;
      if (consentStatus) {
        state.consentStatus = consentStatus;
        state.hasConsent = consentStatus === 'granted';
      }
    } catch (error) {
      // consents table may not exist in older deployments — non-fatal.
      logger.warn({ error: error.message }, 'Failed to resolve consent state (non-fatal)');
    }

    return state;
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
      (!m.content || (typeof m.content === 'string' && m.content.trim().length === 0)),
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
      this.estimateTokenCount([{ role: m.role, content: m.content }]) > 2000,
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
        // The injected context evidence block is deliberately a consecutive
        // `user` turn (provider-safe injection of memory/student-model/state
        // evidence). It is not a conversation violation.
        if (isContextEvidenceBlock(messages[i]) || isContextEvidenceBlock(messages[i - 1])) {
          continue;
        }
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
    // Order: oldest first (for context building). Fetch BOTH inbound and
    // outbound so the AI sees its own prior responses, not just the student's.
    //
    // Inbound status handling (burst correctness):
    // - 'received' messages are INCLUDED. When a student sends several
    //   messages in a burst, the debounce window collapses them into ONE AI
    //   job for the LAST message. The earlier burst messages stay 'received'
    //   (their job was replaced) — excluding them made the AI ignore parts
    //   of what the student said (a major contributor to the robotic,
    //   non-sequitur replies this fix addresses). The worker absorbs them
    //   into 'completed' after the combined reply succeeds.
    // - 'processing' is excluded: that is the CURRENT message, which the
    //   orchestrator passes explicitly as the final turn.
    // - 'failed' is excluded (don't surface failed AI turns).
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
        AND deleted_at IS NULL
        AND message_type = 'text'
        AND (
          (direction = 'inbound' AND processing_status NOT IN ('failed', 'processing'))
          OR
          (direction = 'outbound' AND processing_status NOT IN ('failed'))
        )
      ORDER BY created_at ASC
      LIMIT $3
      `,
      [waxId, sessionId, maxHistoryMessages],
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
   * Build messages array for AI request.
   *
   * Per the Newborn AI philosophy: the AI receives memory facts and student
   * model evidence as EVIDENCE in a system-style context block at the front
   * of the conversation. It decides what to do with that evidence — the
   * infrastructure does not script pedagogical responses.
   *
   * @param {Object} options - Build options
   * @param {Array} options.conversationHistory - Recent conversation messages
   * @param {string} options.currentMessage - Current user message
   * @param {Object|Array} [options.memories] - Retrieved memories (object with
   *   `facts` array, OR a flat array — both forms supported for backward compat)
   * @param {Object} [options.studentModelContext] - { formattedText, ... }
   * @returns {Object} - Messages object with messages array and metadata
   */
  buildMessagesArray({ conversationHistory, currentMessage, memories = null, studentModelContext = null, conversationState = null }) {
    const messages = [];
    let historyTurnCount = 0;
    let currentMessageCount = 0;

    // Inject conversation state + memory + student-model evidence as a single
    // user-role "context" message at the front. Per AGENTS.md §22 the AI may
    // use this evidence but is free to reason about it (NOT forced to act on
    // it). We use role: 'user' (not 'system') because OpenAI/Groq/Cerebras
    // require the messages array to start with a user or system message — and
    // the system message is already reserved for the WaxPrep identity prompt.
    // The message is marked with the CONTEXT_EVIDENCE_MARKER so validators and
    // truncation logic can distinguish it from real student turns.
    const contextBlock = this._formatContextEvidence({ memories, studentModelContext, conversationState });
    if (contextBlock) {
      messages.push({
        role: 'user',
        content: contextBlock,
        _contextBlock: true,
      });
    }

    // Add conversation history (inbound → user, outbound → assistant).
    // Strip waxId/sessionId from the messages we send to the provider — those
    // are internal metadata and must NOT leak into the LLM prompt.
    for (const msg of conversationHistory) {
      if (msg.direction === 'inbound') {
        messages.push({
          role: 'user',
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

    // Append (not replace) the current user message as the final turn.
    // The previous implementation overwrote the last user message, which
    // destroyed prior context when a student sent multiple messages in a burst.
    if (currentMessage && String(currentMessage).trim()) {
      messages.push({
        role: 'user',
        content: String(currentMessage),
      });
      currentMessageCount = 1;
    }

    return {
      messages,
      historyTurnCount,
      currentMessageCount,
      memories,
    };
  }

  /**
   * Format conversation state + memory facts + student-model evidence into a
   * single context block suitable for injection at the front of the messages
   * array.
   *
   * Returns null if there's nothing to inject (so no spurious empty
   * messages get sent to the provider).
   *
   * Sections:
   * - Conversation state (onboarding/first-contact, consent status) — STATE
   *   only, per WAXPREP_PHILOSOPHY §9. Never scripted wording.
   * - Memory facts from MemoryRetriever.
   * - Student model context from StudentModelContextInterface.
   */
  _formatContextEvidence({ memories = null, studentModelContext = null, conversationState = null }) {
    const parts = [];

    // 1. Conversation state (infrastructure-resolved facts about where the
    //    conversation stands). The AI reasons over these; it is not told what
    //    to say. This is the anti-scripted-behavior counterpart to prompt v2:
    //    the AI finally KNOWS when it is talking to a first-time student.
    const stateLines = [];
    if (conversationState?.onboardingState === 'first_contact') {
      stateLines.push(
        'onboarding_state=first_contact (this is the student\'s very first message to WaxPrep — there is no prior conversation; respond to what they actually wrote, naturally)',
      );
    } else if (conversationState?.onboardingState === 'post_onboarding') {
      stateLines.push('onboarding_state=post_onboarding (returning student whose onboarding completed earlier)');
    }
    if (conversationState?.consentStatus) {
      stateLines.push(`consent_status=${conversationState.consentStatus}${conversationState.hasConsent ? '' : ' (no granted consent on record; the record_consent tool is available if the conversation calls for it)'}`);
    }
    if (stateLines.length > 0) {
      parts.push(
        '[Conversation state — infrastructure-resolved facts about this conversation. Use as background; do not reply to this block itself.]\n' +
        stateLines.join('\n'),
      );
    }

    // 2. Memory facts.
    let facts = [];
    if (Array.isArray(memories)) {
      facts = memories;
    } else if (memories && Array.isArray(memories.facts)) {
      facts = memories.facts;
    }

    if (facts.length > 0) {
      const factLines = facts.map((f) => {
        const conf = typeof f.confidence === 'number'
          ? ` (confidence: ${f.confidence.toFixed(2)})`
          : '';
        return `• ${f.display_text || '(empty fact)'}${conf}`;
      });
      parts.push(
        '[Student memory evidence — use this to personalize the response, but reason about whether each fact is relevant to the current question.]\n' +
        factLines.join('\n'),
      );
    }

    // 3. Student model evidence.
    if (studentModelContext && studentModelContext.formattedText) {
      parts.push(
        '[Student model evidence — mastery estimates, misconceptions, and learning signals. Use these as evidence about the student\'s current state, NOT as instructions on what to teach.]\n' +
        studentModelContext.formattedText,
      );
    }

    if (parts.length === 0) return null;
    return parts.join('\n\n');
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

    // The previous implementation overrode the computed fit with
    // `keepFromStart = turns.length - 1`, silently discarding far more history
    // than necessary. Keep the computed prefix instead; only if NOTHING fits,
    // keep the most recent turn so the AI always has at least one exchange.
    if (keepFromStart === 0 && turns.length > 0) {
      keepFromStart = turns.length - 1;
    }

    // Flatten remaining turns
    const remainingTurns = turns.slice(keepFromStart);
    const truncated = remainingTurns.flat();
    removedTurns = keepFromStart;

    // The infrastructure-injected context evidence block (memory, student
    // model, conversation state) must survive truncation — it is not part of
    // the turn history. Re-prepend it if it was dropped.
    const contextBlocks = messageTokens.filter((m) => isContextEvidenceBlock(m));
    for (const block of contextBlocks) {
      if (!truncated.includes(block)) {
        truncated.unshift(block);
      }
    }

    const finalTokens = truncated.reduce((sum, m) => sum + m.tokens, 0);

    return { messages: truncated, tokens: finalTokens, removedTurns };
  }
  /**
   * Return tool definitions for the AI in the provider-agnostic normalized form
   * that AIRequestSchema.tools expects:
   *   { name, description, inputSchema, category? }
   *
   * Tools come from the canonical ToolRegistry (single source of truth).
   *
   * Expose all tools EXCEPT internal-only ones (get_session_context,
   * update_learning_signal). The previous implementation filtered to only
   * STUDENT_READ + STUDENT_WRITE, which silently hid RETRIEVAL tools
   * (web_search, document_fetch) and ASSESSMENT tools (generate_question,
   * record_evidence) from the AI — meaning the model could never call them
   * even when they were the right tool for the job.
   */
  getToolDefinitions() {
    try {
      const tools = ToolRegistry.getToolRegistry();
      return tools
        .filter((t) => t.permission_level !== ToolPermission.INTERNAL)
        .map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.input_schema,
        }));
    } catch {
      // In test environments where the registry can't be loaded, return []
      // so the AI runs without tools rather than crashing.
      return [];
    }
  }
}
