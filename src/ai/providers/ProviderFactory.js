/**
 * WaxPrep - Provider Factory
 *
 * Creates the appropriate provider adapter based on configuration.
 * Provider selection is configuration-driven, not hardcoded.
 *
 * Unknown providers fail immediately during startup with a structured
 * AIProviderError so the orchestrator can classify and route accordingly.
 */

import { validateProviderImplementation } from './AIProviderInterface.js';
import { createAIError, AIErrorTypes } from '../schemas/AIErrors.js';
import { logger } from '../../observability/index.js';
import config from '../../config/index.js';

// Per-name provider cache so we don't construct a new adapter (and a new
// underlying HTTP client) on every orchestrator call. Construction is
// idempotent because adapter constructors only read config + build an SDK
// client — no I/O.
const providerCache = new Map();

/**
 * Get a provider instance by name.
 *
 * @param {string} providerName - Provider name from configuration
 * @returns {Promise<Object>} - Provider adapter instance
 * @throws {Error} - If provider is unknown or construction fails
 */
export async function getProvider(providerName) {
  if (!providerName || typeof providerName !== 'string') {
    throw createAIError({
      errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
      providerMessage: 'providerName is required and must be a non-empty string',
    });
  }

  const name = providerName.toLowerCase();

  if (providerCache.has(name)) {
    return providerCache.get(name);
  }

  logger.info({ component: 'ProviderFactory' }, `Loading provider: ${providerName}`);

  let provider;
  try {
    if (name === 'fake') {
      const { default: FakeAIAdapter } = await import('./FakeAIAdapter.js');
      provider = new FakeAIAdapter();
    } else if (name === 'anthropic') {
      const { default: AnthropicAdapter } = await import('./AnthropicAdapter.js');
      provider = new AnthropicAdapter();
    } else if (name === 'openai' || name === 'groq') {
      const { default: OpenAIAdapter } = await import('./OpenAIAdapter.js');
      provider = new OpenAIAdapter({ isGroq: name === 'groq' });
    } else if (name === 'cerebras') {
      const { default: CerebrasAIAdapter } = await import('./CerebrasAIAdapter.js');
      provider = new CerebrasAIAdapter();
    } else {
      throw createAIError({
        errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
        providerMessage:
          `Unknown AI provider: ${providerName}. ` +
          `Supported providers: ${getAvailableProviders().join(', ')}`,
      });
    }

    if (!validateProviderImplementation(provider)) {
      throw new Error(`${name} adapter does not implement AIProviderInterface correctly`);
    }

    providerCache.set(name, provider);
    return provider;
  } catch (error) {
    logger.error(
      {
        component: 'ProviderFactory',
        provider: name,
        errorMessage: error?.message || String(error),
        errorType: error?.errorType || 'UNKNOWN',
      },
      'Failed to load provider'
    );
    throw error;
  }
}

/**
 * Initialize all providers at startup.
 *
 * This validates that all configured providers are available.
 * Called once during worker startup.
 *
 * @returns {Promise<Object>} - Registry of provider instances
 */
export async function initializeProviders() {
  const providerName = (config.AI_PRIMARY_PROVIDER || '').toLowerCase();
  if (!providerName) {
    throw createAIError({
      errorType: AIErrorTypes.INVALID_REQUEST_ERROR,
      providerMessage: 'AI_PRIMARY_PROVIDER is not configured',
    });
  }

  logger.info({ component: 'ProviderFactory' }, `Initializing primary provider: ${providerName}`);

  try {
    const provider = await getProvider(providerName);
    const registry = {
      primary: provider,
      current: providerName,
    };

    // Optionally pre-warm the fallback provider too.
    const fallbackName = (config.AI_FALLBACK_PROVIDER || '').toLowerCase().trim();
    if (fallbackName && fallbackName !== providerName) {
      try {
        registry.fallback = await getProvider(fallbackName);
        logger.info(
          { component: 'ProviderFactory', fallback: fallbackName },
          'Fallback provider pre-warmed'
        );
      } catch (fallbackErr) {
        logger.warn(
          { component: 'ProviderFactory', fallback: fallbackName, err: fallbackErr.message },
          'Fallback provider failed to initialize (non-fatal)'
        );
      }
    }

    return registry;
  } catch (error) {
    logger.error(
      {
        component: 'ProviderFactory',
        provider: providerName,
        errorMessage: error?.message || String(error),
        errorType: error?.errorType || 'UNKNOWN',
      },
      'Failed to initialize AI provider'
    );
    logger.error(
      { component: 'ProviderFactory' },
      'Please check your AI_PRIMARY_PROVIDER configuration. ' +
        `Supported providers: ${getAvailableProviders().join(', ')}`
    );
    throw error;
  }
}

/**
 * Get available providers.
 *
 * @returns {Array<string>} - List of available provider names
 */
export function getAvailableProviders() {
  return ['fake', 'anthropic', 'openai', 'groq', 'cerebras'];
}

/**
 * Clear the provider cache. Intended for tests only.
 */
export function _clearProviderCacheForTests() {
  providerCache.clear();
}

export default {
  getProvider,
  initializeProviders,
  getAvailableProviders,
  _clearProviderCacheForTests,
};
