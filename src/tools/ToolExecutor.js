/**
 * Tool Executor - Phase G Stage 35
 * 
 * Handles tool validation, rate limiting, execution, and loop detection.
 * This is the security boundary between AI requests and tool execution.
 * 
 * Security requirements:
 * - Reject unknown tools immediately
 * - Reject arguments with additional properties (prevents argument stuffing)
 * - Enforce per-tool rate limits and session-level tool budgets
 * - Detect tool loops: same tool + identical arguments in same turn = reject
 * - Enforce timeouts. Kill tool after timeout.
 * - Log all calls with metadata (not sensitive raw content)
 */

import config from '../config/index.js';
import {
  getToolByName,
  validateToolArguments,
  getToolLimits,
  ToolPermission,
} from './ToolRegistry.js';
import { ToolError, ToolErrorCode } from './ToolErrors.js';

/**
 * Tool execution result
 */
class ToolExecutionResult {
  constructor({
    success,
    data = null,
    error = null,
    latencyMs = 0,
    wasSanitized = false,
  }) {
    this.success = success;
    this.data = data;
    this.error = error;
    this.latencyMs = latencyMs;
    this.wasSanitized = wasSanitized;
  }

  static success(data, latencyMs = 0, wasSanitized = false) {
    return new ToolExecutionResult({
      success: true,
      data,
      latencyMs,
      wasSanitized,
    });
  }

  static failure(error, latencyMs = 0) {
    return new ToolExecutionResult({
      success: false,
      error,
      latencyMs,
    });
  }
}

/**
 * Tool executor class
 */
export class ToolExecutor {
  constructor({ db, queue, logger, configOverride = {} }) {
    this.db = db;
    this.queue = queue;
    this.logger = logger;
    this.config = configOverride;

    // Rate limit tracking: Map<sessionId, Map<toolName, count>>
    this.sessionToolCounts = new Map();

    // Loop detection: Map<sessionId, Array<{toolName, argsHash}>>
    this.sessionToolHistory = new Map();
  }

  /**
   * Execute a tool call with full validation and security checks
   */
  async execute({
    waxId,
    sessionId,
    aiRequestId,
    toolName,
    arguments: args,
    turnIndex = 0,
  }) {
    const startTime = Date.now();

    try {
      // Step 1: Validate tool name is known
      const tool = getToolByName(toolName);
      if (!tool) {
        throw new ToolError(
          ToolErrorCode.UNKNOWN_TOOL,
          `Unknown tool: ${toolName}`
        );
      }

      // Step 2: Validate arguments against schema
      const validation = validateToolArguments(toolName, args);
      if (!validation.valid) {
        throw new ToolError(
          ToolErrorCode.INVALID_ARGUMENTS,
          `Invalid arguments: ${validation.errors.join(', ')}`
        );
      }

      // Step 3: Check argument size limit
      const argSize = JSON.stringify(args).length;
      const maxArgSize = tool.execution_limits.max_arguments_size_bytes || config.TOOL_ARGUMENT_MAX_SIZE_BYTES;
      if (argSize > maxArgSize) {
        throw new ToolError(
          ToolErrorCode.SIZE_EXCEEDED,
          `Arguments exceed limit: ${argSize} > ${maxArgSize} bytes`
        );
      }

      // Step 4: Check rate limits
      const rateLimitResult = this.checkRateLimits({
        waxId,
        sessionId,
        toolName,
        tool,
      });
      if (!rateLimitResult.allowed) {
        throw new ToolError(
          ToolErrorCode.RATE_LIMIT_EXCEEDED,
          rateLimitReason
        );
      }

      // Step 5: Check for tool loops (same tool + identical args in same turn)
      const loopResult = this.checkForLoops({
        sessionId,
        toolName,
        args,
        turnIndex,
      });
      if (loopResult.isLoop) {
        throw new ToolError(
          ToolErrorCode.LOOP_DETECTED,
          `Duplicate tool call detected: ${toolName} with identical arguments`
        );
      }

      // Step 6: Record tool call for rate limiting and loop detection
      this.recordToolCall({ sessionId, toolName, args, turnIndex });

      // Step 7: Execute the tool with timeout
      const result = await this.executeWithTimeout({
        tool,
        waxId,
        sessionId,
        aiRequestId,
        args,
      });

      // Step 8: Log invocation
      await this.logInvocation({
        waxId,
        sessionId,
        aiRequestId,
        toolName,
        args,
        result,
        startTime,
      });

      return result;
    } catch (error) {
      // Log failed invocation
      await this.logFailedInvocation({
        waxId,
        sessionId,
        aiRequestId,
        toolName,
        args,
        error,
        startTime,
      });

      throw error;
    }
  }

  /**
   * Check rate limits for a tool call
   */
  checkRateLimits({ waxId, sessionId, toolName, tool }) {
    const limits = tool.execution_limits;
    const maxCalls = limits.max_calls_per_session;

    if (maxCalls === null) {
      // No limit
      return { allowed: true };
    }

    // Initialize session tracking
    if (!this.sessionToolCounts.has(sessionId)) {
      this.sessionToolCounts.set(sessionId, new Map());
    }
    const toolCounts = this.sessionToolCounts.get(sessionId);

    const currentCount = toolCounts.get(toolName) || 0;
    if (currentCount >= maxCalls) {
      return {
        allowed: false,
        reason: `Rate limit exceeded: ${toolName} called ${currentCount}/${maxCalls} times this session`,
      };
    }

    return { allowed: true };
  }

  /**
   * Check for tool loops (identical tool+args in same turn)
   */
  checkForLoops({ sessionId, toolName, args, turnIndex }) {
    if (!this.sessionToolHistory.has(sessionId)) {
      this.sessionToolHistory.set(sessionId, []);
    }
    const history = this.sessionToolHistory.get(sessionId);

    // Only check current turn (turnIndex)
    const currentTurnCalls = history.filter(
      call => call.turnIndex === turnIndex
    );

    // Check for identical tool + args
    for (const call of currentTurnCalls) {
      if (call.toolName === toolName) {
        // Compare args
        if (this.argsAreIdentical(call.args, args)) {
          return { isLoop: true };
        }
      }
    }

    return { isLoop: false };
  }

  /**
   * Check if two argument objects are identical
   */
  argsAreIdentical(args1, args2) {
    return JSON.stringify(args1) === JSON.stringify(args2);
  }

  /**
   * Record a tool call for rate limiting and loop detection
   */
  recordToolCall({ sessionId, toolName, args, turnIndex }) {
    // Increment rate limit counter
    if (!this.sessionToolCounts.has(sessionId)) {
      this.sessionToolCounts.set(sessionId, new Map());
    }
    const toolCounts = this.sessionToolCounts.get(sessionId);
    toolCounts.set(toolName, (toolCounts.get(toolName) || 0) + 1);

    // Record for loop detection
    if (!this.sessionToolHistory.has(sessionId)) {
      this.sessionToolHistory.set(sessionId, []);
    }
    const history = this.sessionToolHistory.get(sessionId);
    history.push({
      toolName,
      args,
      turnIndex,
      timestamp: Date.now(),
    });
  }

  /**
   * Execute tool with timeout
   */
  async executeWithTimeout({ tool, waxId, sessionId, aiRequestId, args }) {
    const timeoutMs =
      tool.execution_limits.timeout_ms || config.TOOL_DEFAULT_TIMEOUT_MS;

    return Promise.race([
      this.performToolExecution({ tool, waxId, sessionId, aiRequestId, args }),
      new Promise((_, reject) => {
        setTimeout(() => {
          reject(
            new ToolError(
              ToolErrorCode.TIMEOUT,
              `Tool ${toolName} timed out after ${timeoutMs}ms`
            )
          );
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Perform the actual tool execution (to be overridden by subclasses)
   */
  async performToolExecution({ tool, waxId, sessionId, aiRequestId, args }) {
    // This is a base implementation - specific handlers should be registered
    // For now, return an error indicating no handler is registered
    throw new ToolError(
      ToolErrorCode.NO_HANDLER,
      `No handler registered for tool: ${tool.name}`
    );
  }

  /**
   * Log a successful tool invocation
   */
  async logInvocation({
    waxId,
    sessionId,
    aiRequestId,
    toolName,
    args,
    result,
    startTime,
  }) {
    const invocation = {
      wax_id: waxId,
      session_id: sessionId,
      ai_request_id: aiRequestId,
      tool_name: toolName,
      tool_category: getToolByName(toolName)?.permission_level,
      arguments_json: args,
      arguments_size_bytes: JSON.stringify(args).length,
      result_json: result.data,
      result_size_bytes: result.data ? JSON.stringify(result.data).length : null,
      status: result.success ? 'success' : 'failed',
      latency_ms: result.latencyMs,
      was_sanitized: result.wasSanitized,
      created_at: new Date(),
    };

    if (result.error) {
      invocation.rejection_reason = result.error.message;
    }

    try {
      await this.db.query(
        `INSERT INTO tool_invocations (
          wax_id, session_id, ai_request_id, tool_name, tool_category,
          arguments_json, arguments_size_bytes, result_json, result_size_bytes,
          status, rejection_reason, latency_ms, was_sanitized, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
        [
          invocation.wax_id,
          invocation.session_id,
          invocation.ai_request_id,
          invocation.tool_name,
          invocation.tool_category,
          JSON.stringify(invocation.arguments_json),
          invocation.arguments_size_bytes,
          invocation.result_json ? JSON.stringify(invocation.result_json) : null,
          invocation.result_size_bytes,
          invocation.status,
          invocation.rejection_reason,
          invocation.latency_ms,
          invocation.was_sanitized,
          invocation.created_at,
        ]
      );
    } catch (dbError) {
      // Log but don't throw - we don't want logging failures to break tool execution
      this.logger.error('Failed to log tool invocation', {
        tool: toolName,
        error: dbError.message,
      });
    }
  }

  /**
   * Log a failed tool invocation
   */
  async logFailedInvocation({
    waxId,
    sessionId,
    aiRequestId,
    toolName,
    args,
    error,
    startTime,
  }) {
    const latencyMs = Date.now() - startTime;

    try {
      await this.db.query(
        `INSERT INTO tool_invocations (
          wax_id, session_id, ai_request_id, tool_name, tool_category,
          arguments_json, arguments_size_bytes, status, rejection_reason,
          latency_ms, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [
          waxId,
          sessionId,
          aiRequestId,
          toolName,
          getToolByName(toolName)?.permission_level,
          JSON.stringify(args),
          JSON.stringify(args).length,
          'failed',
          error.message,
          latencyMs,
          new Date(),
        ]
      );
    } catch (dbError) {
      this.logger.error('Failed to log tool invocation', {
        tool: toolName,
        error: dbError.message,
      });
    }
  }

  /**
   * Reset rate limit tracking for a session (called when session ends)
   */
  resetSession(sessionId) {
    this.sessionToolCounts.delete(sessionId);
    this.sessionToolHistory.delete(sessionId);
  }

  /**
   * Reset all tracking data (for testing)
   */
  resetAll() {
    this.sessionToolCounts.clear();
    this.sessionToolHistory.clear();
  }
}

export { ToolExecutionResult, ToolError, ToolErrorCode };
export default ToolExecutor;
