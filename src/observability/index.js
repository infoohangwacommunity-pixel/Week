/**
 * WaxPrep - Observability Module
 * 
 * Provides structured JSON logging with Pino and correlation ID propagation
 * using AsyncLocalStorage for distributed tracing across async boundaries.
 */

import pino from 'pino';
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

// Create Pino logger instance
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level(label) {
      return { level: label };
    },
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    service: 'waxprep',
  },
  redact: {
    paths: [
      'config.AI_PRIMARY_API_KEY',
      'config.WHATSAPP_APP_SECRET',
      'config.PHONE_HMAC_SECRET',
      'req.headers.authorization',
      'student.phoneRaw',
      'payload.phone',
      '*.apiKey',
      '*.secret',
      '*.password',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Run a function with a specific context that propagates through async boundaries
 */
export function runWithContext(context, fn) {
  return als.run(context, fn);
}

/**
 * Get the current async context
 */
export function getContext() {
  return als.getStore() ?? {};
}

/**
 * Get a child logger with the current context automatically included
 */
export function getLogger() {
  const ctx = getContext();
  return logger.child(ctx);
}

/**
 * Extract trace context from a job payload for queue propagation
 */
export function extractTraceContext(payload) {
  return payload._trace || {};
}

/**
 * Add trace context to a job payload for queue propagation
 */
export function addTraceContext(payload, trace) {
  return {
    ...payload,
    _trace: {
      ...trace,
      timestamp: new Date().toISOString(),
    },
  };
}

export { logger };
