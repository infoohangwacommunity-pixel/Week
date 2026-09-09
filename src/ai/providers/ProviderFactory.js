/**
 * WaxPrep - Provider Factory
 * 
 * Creates the appropriate provider adapter based on configuration.
 * Provider selection is configuration-driven, not hardcoded.
 * 
 * Unknown providers fail immediately during startup.
 */

import { validateProviderImplementation } from './AIProviderInterface.js';
import { createAIError, AIErrorTypes } from '../schemas/AIErrors.js';
import config from '../config/index.js';

/**
 * Get a provider instance by name
 * 
 * @param {string} providerName - Provider name from configuration
 * @returns {Object} - Provider adapter instance
 * @throws {Error} - If provider is unknown
 */
export async function getProvider(providerName) {
  const name = providerName.toLowerCase();
  
  // Lazy import adapters to avoid circular dependencies
  if (name === 'fake') {
    const { default: FakeAIAdapter } = await import('./FakeAIAdapter.js');
    const provider = new FakeAIAdapter();
    if (!validateProviderImplementation(provider)) {
      throw new Error('FakeAIAdapter does not implement AIProviderInterface correctly');
    }
    return provider;
  }
  
  if (name === 'anthropic') {
    const { default: AnthropicAdapter } = await import('./AnthropicAdapter.js');
    const provider = new AnthropicAdapter();
    if (!validateProviderImplementation(provider)) {
      throw new Error('AnthropicAdapter does not implement AIProviderInterface correctly');
    }
    return provider;
  }
  
  if (name === 'openai' || name === 'groq') {
    const { default: OpenAIAdapter } = await import('./OpenAIAdapter.js');
    const provider = new OpenAIAdapter({ isGroq: name === 'groq' });
    if (!validateProviderImplementation(provider)) {
      throw new Error('OpenAIAdapter does not implement AIProviderInterface correctly');
    }
    return provider;
  }
  
  if (name === 'cerebras') {
    const { default: CerebrasAIAdapter } = await import('./CerebrasAIAdapter.js');
    const provider = new CerebrasAIAdapter();
    if (!validateProviderImplementation(provider)) {
      throw new Error('CerebrasAIAdapter does not implement AIProviderInterface correctly');
    }
    return provider;
  }
  
  if (name === 'gemini') {
    throw createAIError({
      errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
      providerMessage: 'Gemini provider not yet implemented',
    });
  }
  
  throw createAIError({
    errorType: AIErrorTypes.MODEL_UNAVAILABLE_ERROR,
    providerMessage: `Unknown AI provider: ${providerName}. Supported providers: fake, anthropic, openai, groq, cerebras, gemini`,
  });
}

/**
 * Initialize all providers at startup
 * 
 * This validates that all configured providers are available.
 * Called once during worker startup.
 * 
 * @returns {Object} - Registry of provider instances
 */
export async function initializeProviders() {
  const providerName = config.AI_PRIMARY_PROVIDER.toLowerCase();
  
  try {
    const provider = await getProvider(providerName);
    
    return {
      primary: provider,
      current: providerName,
    };
  } catch (error) {
    console.error('Failed to initialize AI provider:');
    console.error(`  Provider: ${providerName}`);
    console.error(`  Error: ${error.message}`);
    console.error('\nPlease check your AI_PRIMARY_PROVIDER configuration.');
    console.error('Supported providers: fake, anthropic, openai, groq, cerebras, gemini');
    throw error;
  }
}

/**
 * Get available providers
 * 
 * @returns {Array<string>} - List of available provider names
 */
export function getAvailableProviders() {
  return ['fake', 'anthropic', 'openai', 'groq', 'cerebras', 'gemini'];
}

export default {
  getProvider,
  initializeProviders,
  getAvailableProviders,
};
