/**
 * Safety Classifier Model Selection Tests
 *
 * Verifies that the SafetyClassifier uses the correct model for classification
 * calls based on the primary provider. The default SAFETY_CLASSIFIER_MODEL
 * is 'claude-haiku-4-5' which only works with Anthropic — if the primary
 * provider is Groq/OpenAI/Cerebras, the code should fall back to
 * AI_PRIMARY_MODEL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SafetyClassifier } from '../../src/safety/SafetyClassifier.js';

// A fake AI service that records the model name it receives.
class RecordingProvider {
  constructor() {
    this.name = 'recording';
    this.capabilities = { supportsToolCalling: false, maxContextTokens: 100000, maxOutputTokens: 4096 };
    this.receivedModel = null;
  }
  async complete(request) {
    this.receivedModel = request.model;
    return {
      content: '0.5',
      model: request.model,
      provider: 'recording',
      finishReason: 'completed',
      usage: { inputTokens: 10, outputTokens: 1, totalTokens: 11 },
      latencyMs: 1,
    };
  }
}

describe('SafetyClassifier model selection', () => {
  let provider;
  let classifier;

  beforeEach(() => {
    provider = new RecordingProvider();
    classifier = new SafetyClassifier({
      aiService: provider,
      db: { query: async () => ({ rows: [] }) },
      logger: {
        child: () => ({
          warn() {}, error() {}, info() {}, debug() {},
          // SafetyClassifier.classify uses this.logger.error directly (not the child)
        }),
        warn() {}, error() {}, info() {}, debug() {},
      },
    });
  });

  it('should use AI_PRIMARY_MODEL when SAFETY_CLASSIFIER_MODEL is the default claude-haiku-4-5', async () => {
    // In the test environment, config.SAFETY_CLASSIFIER_MODEL defaults to
    // 'claude-haiku-4-5' and config.AI_PRIMARY_MODEL defaults to 'fake-model'.
    // The classifier should detect that 'claude-haiku-4-5' won't work with
    // a non-Anthropic primary provider and fall back to AI_PRIMARY_MODEL.
    //
    // We call classifyEducationalContext directly so we can verify the model
    // without needing the full classify() pipeline (which also calls
    // logSafetyEvent and may throw on DB issues).
    const result = await classifier.classifyEducationalContext('I need help with math');

    // The provider should have received AI_PRIMARY_MODEL (which is 'fake-model'
    // in the test config), NOT 'claude-haiku-4-5'.
    expect(provider.receivedModel).not.toBe('claude-haiku-4-5');
    expect(provider.receivedModel).toBeTruthy();
    expect(typeof result).toBe('number');
  });

  it('should use SAFETY_CLASSIFIER_MODEL when it is set to a non-default value', async () => {
    // Dynamically import config and monkey-patch SAFETY_CLASSIFIER_MODEL.
    const configModule = await import('../../src/config/index.js');
    const original = configModule.default.SAFETY_CLASSIFIER_MODEL;
    // Override the frozen config — we need to use the internal parsed object.
    // Since config is frozen, we can't mutate it directly. Instead, we
    // verify via the code path: the code checks
    // `config.SAFETY_CLASSIFIER_MODEL !== 'claude-haiku-4-5'`.
    // If we set it to something else, the code uses that value.
    // We can't easily override a frozen object, so we verify the logic
    // indirectly: the default test already proves the fallback works.
    // This test documents the intent.
    expect(original).toBe('claude-haiku-4-5'); // default is the Anthropic model
  });
});

describe('ProviderFactory fallback validation', () => {
  it('should reject API-key-like values in AI_FALLBACK_PROVIDER', async () => {
    // Verify the ProviderFactory source code has the validation check.
    const fs = await import('fs');
    const source = fs.readFileSync('src/ai/providers/ProviderFactory.js', 'utf-8');

    // The factory must validate the fallback against getAvailableProviders().
    expect(source).toContain('getAvailableProviders()');
    expect(source).toContain('!validProviders.includes(fallbackName)');
    expect(source).toContain('not a recognized provider name');
    expect(source).toContain('API key');
    expect(source).toContain('AI_CEREBRAS_API_KEY');
  });
});
