/**
 * Pino Logger Argument Order Regression Tests
 *
 * Verifies that all production-path logger calls use the correct pino
 * argument order: logger.method(obj, msg) — NOT logger.method(msg, obj).
 *
 * Pino's API: logger.info(obj, msg) or logger.info(msg)
 * Wrong:      logger.info('message', { key: 'value' })
 *   → pino treats first arg as format string, second as merge object
 *   → structured fields NOT emitted as JSON fields
 *
 * Correct:    logger.info({ key: 'value' }, 'message')
 *   → obj fields become JSON fields, msg becomes the "msg" field
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const SRC_DIR = join(process.cwd(), 'src');

function findJsFiles(dir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      findJsFiles(fullPath, files);
    } else if (entry.name.endsWith('.js')) {
      files.push(fullPath);
    }
  }
  return files;
}

describe('Pino logger argument order', () => {
  it('should use logger.method(obj, msg) not logger.method(msg, obj) in SafetyClassifier', () => {
    const source = readFileSync('src/safety/SafetyClassifier.js', 'utf-8');

    // The old pattern was: this.logger.warn('message string', { ... })
    // The new pattern is:  this.logger.warn({ ... }, 'message string')
    //
    // Check that no warn/error calls use the reversed pattern.
    const reversedPattern = /this\.logger\.(warn|error)\s*\(\s*['"][^'"]*['"]\s*,\s*\{/g;
    const matches = source.match(reversedPattern);
    expect(matches, `Found reversed logger calls: ${matches?.join(', ')}`).toBeNull();
  });

  it('should include errorType and providerMessage in safety classifier error logs', () => {
    const source = readFileSync('src/safety/SafetyClassifier.js', 'utf-8');

    // Each classification catch block should log errorType and providerMessage
    const warnCalls = source.match(/this\.logger\.warn\(\{[^}]*\},\s*'[^']*classification failed'\)/g);
    expect(warnCalls).not.toBeNull();
    expect(warnCalls.length).toBe(4); // educational, welfare, inappropriate, adversarial

    for (const call of warnCalls) {
      expect(call).toContain('errorType');
      expect(call).toContain('providerStatusCode');
      expect(call).toContain('providerMessage');
    }
  });

  it('should use logger.method(obj, msg) in AIOrchestrator provider error logging', () => {
    const source = readFileSync('src/orchestration/AIOrchestrator.js', 'utf-8');

    // The orchestrator's Primary provider failed log should use the correct
    // argument order: logger.warn({ ... }, 'msg')
    expect(source).toContain('}, \'Primary provider failed\')');
    expect(source).toContain('}, \'Fallback provider also failed\')');

    // It should include the diagnostic fields
    expect(source).toContain('providerStatusCode');
    expect(source).toContain('providerMessage');
    expect(source).toContain('errorType');
    expect(source).toContain('isRetryable');
  });

  it('should use logger.method(obj, msg) in workers/setup.js error handling', () => {
    const source = readFileSync('src/workers/setup.js', 'utf-8');

    // The AI request failed log should use the correct argument order
    expect(source).toContain('logger.error(errorInfo, \'AI request failed\')');
  });
});
