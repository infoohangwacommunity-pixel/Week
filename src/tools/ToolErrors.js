/**
 * Tool Errors - Phase G Stage 35
 * 
 * Error codes and classes for tool execution failures.
 */

/**
 * Tool error codes
 */
export const ToolErrorCode = {
  UNKNOWN_TOOL: 'UNKNOWN_TOOL',
  INVALID_ARGUMENTS: 'INVALID_ARGUMENTS',
  UNAUTHORIZED: 'UNAUTHORIZED',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  TIMEOUT: 'TIMEOUT',
  LOOP_DETECTED: 'LOOP_DETECTED',
  SIZE_EXCEEDED: 'SIZE_EXCEEDED',
  NO_HANDLER: 'NO_HANDLER',
  HANDLER_FAILED: 'HANDLER_FAILED',
  SANITIZATION_FAILED: 'SANITIZATION_FAILED',
  STUDENT_ISOLATION_VIOLATION: 'STUDENT_ISOLATION_VIOLATION',
};

/**
 * Base tool error class
 */
export class ToolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ToolError';
    this.code = code;
    this.details = details;
    this.timestamp = new Date();

    // Ensure proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, ToolError);
    }
  }

  /**
   * Convert to log-safe object
   */
  toLogObject() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
      details: this.details,
    };
  }

  /**
   * Convert to API response
   */
  toApiError() {
    return {
      error: this.code,
      message: this.message,
      timestamp: this.timestamp.toISOString(),
    };
  }
}

/**
 * Validation error for tool arguments
 */
export class ToolValidationError extends ToolError {
  constructor(errors) {
    super(
      ToolErrorCode.INVALID_ARGUMENTS,
      `Validation failed: ${Array.isArray(errors) ? errors.join(', ') : errors}`,
      { errors: Array.isArray(errors) ? errors : [errors] }
    );
    this.name = 'ToolValidationError';
  }
}

/**
 * Rate limit error
 */
export class ToolRateLimitError extends ToolError {
  constructor(message, retryAfter = null) {
    super(ToolErrorCode.RATE_LIMIT_EXCEEDED, message, { retryAfter });
    this.name = 'ToolRateLimitError';
  }
}

/**
 * Timeout error
 */
export class ToolTimeoutError extends ToolError {
  constructor(toolName, timeoutMs) {
    super(
      ToolErrorCode.TIMEOUT,
      `Tool ${toolName} timed out after ${timeoutMs}ms`,
      { toolName, timeoutMs }
    );
    this.name = 'ToolTimeoutError';
  }
}

/**
 * Loop detection error
 */
export class ToolLoopError extends ToolError {
  constructor(toolName) {
    super(
      ToolErrorCode.LOOP_DETECTED,
      `Tool loop detected: ${toolName} called with identical arguments in same turn`
    );
    this.name = 'ToolLoopError';
  }
}

/**
 * Student isolation error
 */
export class StudentIsolationError extends ToolError {
  constructor(message) {
    super(
      ToolErrorCode.STUDENT_ISOLATION_VIOLATION,
      `Student isolation violation: ${message}`
    );
    this.name = 'StudentIsolationError';
  }
}

/**
 * Handler execution error
 */
export class HandlerExecutionError extends ToolError {
  constructor(toolName, originalError) {
    super(
      ToolErrorCode.HANDLER_FAILED,
      `Handler for ${toolName} failed: ${originalError.message}`,
      { originalError: originalError.message }
    );
    this.name = 'HandlerExecutionError';
    this.originalError = originalError;
  }
}

export default {
  ToolError,
  ToolValidationError,
  ToolRateLimitError,
  ToolTimeoutError,
  ToolLoopError,
  StudentIsolationError,
  HandlerExecutionError,
  ToolErrorCode,
};
