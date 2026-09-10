/**
 * WaxPrep - AI Error Schemas
 * 
 * Defines the normalized error taxonomy for AI provider errors.
 * All provider adapters must normalize their errors to this schema.
 */

import { z } from 'zod';

// Normalized error types
const AIErrorTypeSchema = z.enum([
  'AUTHENTICATION_ERROR',      // API key invalid, expired, or missing
  'RATE_LIMIT_ERROR',          // 429 - too many requests
  'CONTEXT_LENGTH_ERROR',      // Request too large for model context window
  'INVALID_REQUEST_ERROR',     // Request is malformed
  'CONTENT_SAFETY_ERROR',      // Provider refused for safety reasons
  'MODEL_UNAVAILABLE_ERROR',   // Model not found, deprecated, or unavailable
  'PROVIDER_SERVER_ERROR',     // 500/503 - provider-side error
  'TIMEOUT_ERROR',             // Request timed out
  'MALFORMED_RESPONSE_ERROR',  // Response was not parseable
  'UNKNOWN_ERROR',             // Anything else
]);

// Provider-specific error response schema
export const AIProviderErrorSchema = z.object({
  // Error type from the normalized taxonomy
  errorType: AIErrorTypeSchema,
  
  // Whether BullMQ should retry this error
  isRetryable: z.boolean(),
  
  // Original HTTP status code from provider
  providerStatusCode: z.number().optional(),
  
  // Provider's error message (safe to log, NOT to send to student)
  providerMessage: z.string(),
  
  // Optional: Retry-After header value in seconds
  retryAfter: z.number().optional(),
  
  // Optional: Provider-specific details for debugging
  providerDetails: z.record(z.unknown()).optional(),
});

// Export error type constants for convenience
export const AIErrorTypes = {
  AUTHENTICATION_ERROR: 'AUTHENTICATION_ERROR',
  RATE_LIMIT_ERROR: 'RATE_LIMIT_ERROR',
  CONTEXT_LENGTH_ERROR: 'CONTEXT_LENGTH_ERROR',
  INVALID_REQUEST_ERROR: 'INVALID_REQUEST_ERROR',
  CONTENT_SAFETY_ERROR: 'CONTENT_SAFETY_ERROR',
  MODEL_UNAVAILABLE_ERROR: 'MODEL_UNAVAILABLE_ERROR',
  PROVIDER_SERVER_ERROR: 'PROVIDER_SERVER_ERROR',
  TIMEOUT_ERROR: 'TIMEOUT_ERROR',
  MALFORMED_RESPONSE_ERROR: 'MALFORMED_RESPONSE_ERROR',
  UNKNOWN_ERROR: 'UNKNOWN_ERROR',
};

// Export retryable error types for BullMQ worker usage.
// MALFORMED_RESPONSE_ERROR and MODEL_UNAVAILABLE_ERROR are NOT retryable by default:
// - A malformed response indicates a parsing or contract drift that will reproduce on retry.
// - A model-unavailable error means the configured model name is wrong or deprecated;
//   retrying with the same model burns queue budget until the operator fixes config.
export const RETRYABLE_ERROR_TYPES = new Set([
  AIErrorTypes.RATE_LIMIT_ERROR,
  AIErrorTypes.PROVIDER_SERVER_ERROR,
  AIErrorTypes.TIMEOUT_ERROR,
]);

// Export non-retryable error types
export const NON_RETRYABLE_ERROR_TYPES = new Set([
  AIErrorTypes.AUTHENTICATION_ERROR,
  AIErrorTypes.CONTEXT_LENGTH_ERROR,
  AIErrorTypes.INVALID_REQUEST_ERROR,
  AIErrorTypes.CONTENT_SAFETY_ERROR,
  AIErrorTypes.MALFORMED_RESPONSE_ERROR,
  AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
  AIErrorTypes.UNKNOWN_ERROR,
]);

/**
 * Creates a normalized AI provider error.
 *
 * `options.isRetryable` (when explicitly provided) overrides the default
 * retryability derived from `errorType`. Use this only when the caller has
 * out-of-band knowledge that a normally-retryable error type should NOT be
 * retried (e.g., a 500 status code returned for a permanently malformed request).
 */
export function createAIError(options) {
  const computedRetryable =
    typeof options.isRetryable === 'boolean'
      ? options.isRetryable
      : RETRYABLE_ERROR_TYPES.has(options.errorType);

  const normalized = AIProviderErrorSchema.parse({
    errorType: options.errorType,
    isRetryable: computedRetryable,
    providerStatusCode: options.providerStatusCode,
    providerMessage: options.providerMessage,
    retryAfter: options.retryAfter,
    providerDetails: options.providerDetails,
  });

  const error = new Error(`AI Provider Error: ${normalized.providerMessage}`);
  error.name = 'AIProviderError';
  error.errorType = normalized.errorType;
  error.isRetryable = normalized.isRetryable;
  error.providerStatusCode = normalized.providerStatusCode;
  error.providerMessage = normalized.providerMessage;
  error.retryAfter = normalized.retryAfter;
  error.providerDetails = normalized.providerDetails;

  return error;
}

/**
 * Creates a timeout error
 */
export function createTimeoutError(message = 'AI request timed out') {
  return createAIError({
    errorType: AIErrorTypes.TIMEOUT_ERROR,
    providerMessage: message,
    retryAfter: undefined,
  });
}

/**
 * Creates a rate limit error
 */
export function createRateLimitError(message = 'Rate limit exceeded', retryAfterSeconds) {
  return createAIError({
    errorType: AIErrorTypes.RATE_LIMIT_ERROR,
    providerMessage: message,
    retryAfter: retryAfterSeconds,
  });
}

/**
 * Creates an authentication error
 */
export function createAuthenticationError(message = 'Authentication failed') {
  return createAIError({
    errorType: AIErrorTypes.AUTHENTICATION_ERROR,
    providerMessage: message,
  });
}

/**
 * Creates a context length error
 */
export function createContextLengthError(message = 'Request exceeds maximum context length') {
  return createAIError({
    errorType: AIErrorTypes.CONTEXT_LENGTH_ERROR,
    providerMessage: message,
  });
}

/**
 * Creates a content safety error
 */
export function createContentSafetyError(message = 'Content was refused by safety filters') {
  return createAIError({
    errorType: AIErrorTypes.CONTENT_SAFETY_ERROR,
    providerMessage: message,
  });
}

/**
 * Creates a provider server error.
 * `statusCode` controls retryability: 5xx → retryable; everything else → not.
 */
export function createProviderServerError(message = 'Provider server error', statusCode) {
  const isRetryable = statusCode === 500 || statusCode === 503 || statusCode === 502 || statusCode === 504;
  return createAIError({
    errorType: AIErrorTypes.PROVIDER_SERVER_ERROR,
    providerMessage: message,
    providerStatusCode: statusCode,
    isRetryable,
  });
}

/**
 * Creates a malformed response error
 */
export function createMalformedResponseError(message = 'Response could not be parsed') {
  return createAIError({
    errorType: AIErrorTypes.MALFORMED_RESPONSE_ERROR,
    providerMessage: message,
  });
}

/**
 * Creates an unknown error
 */
export function createUnknownError(message = 'Unknown error occurred') {
  return createAIError({
    errorType: AIErrorTypes.UNKNOWN_ERROR,
    providerMessage: message,
  });
}

export default {
  AIErrorTypes,
  RETRYABLE_ERROR_TYPES,
  NON_RETRYABLE_ERROR_TYPES,
  createAIError,
  createTimeoutError,
  createRateLimitError,
  createAuthenticationError,
  createContextLengthError,
  createContentSafetyError,
  createProviderServerError,
  createMalformedResponseError,
  createUnknownError,
};
