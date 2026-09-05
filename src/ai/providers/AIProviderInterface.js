/**
 * WaxPrep - AI Provider Interface
 * 
 * This is the abstract interface that all AI provider adapters must implement.
 * It defines the contract between AIService and provider implementations.
 * 
 * IMPORTANT: This file is a documentation interface, not a runtime class.
 * All provider adapters must implement these methods and properties.
 */

/**
 * ProviderCapabilities defines what features a provider supports.
 * This metadata enables future routing and feature detection.
 */
export const ProviderCapabilitiesSchema = {
  /** Whether the provider supports text-only responses */
  supportsText: true,
  
  /** Whether the provider can accept image input */
  supportsImageInput: false,
  
  /** Whether the provider can accept audio input */
  supportsAudioInput: false,
  
  /** Whether the provider supports tool/function calling */
  supportsToolCalling: false,
  
  /** Whether the provider can guarantee structured JSON output */
  supportsStructuredOutput: false,
  
  /** Whether the provider supports streaming responses */
  supportsStreaming: false,
  
  /** Whether the provider supports prompt caching for cost reduction */
  supportsPromptCaching: false,
  
  /** Maximum context window size in tokens */
  maxContextTokens: 200000,
  
  /** Maximum output tokens supported */
  maxOutputTokens: 4096,
};

/**
 * AIProviderInterface - All provider adapters must implement this
 * 
 * @interface
 */
export class AIProviderInterface {
  /**
   * @type {string} - The provider name (e.g., 'anthropic', 'openai', 'fake')
   */
  name;

  /**
   * @type {ProviderCapabilities} - The capabilities this provider supports
   */
  capabilities;

  /**
   * Initialize the provider adapter with configuration
   * 
   * @param {Object} config - Provider-specific configuration
   */
  constructor(config) {}

  /**
   * Complete a request and return a normalized response
   * 
   * This is the main entry point for all AI requests.
   * All provider-specific logic stays inside the adapter.
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Promise<import('../schemas/AIResponse.js').AIResponse>} - Normalized response
   * @throws {import('../schemas/AIErrors.js').AIProviderError} - Normalized error
   */
  async complete(request) {}

  /**
   * Future: Stream a request and return chunks
   * 
   * This method is reserved for future streaming support.
   * Not implemented in Stage 15, but the interface acknowledges it.
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Promise<AsyncIterable<import('../schemas/AIResponse.js').AIStreamChunk>>} - Stream of chunks
   */
  async *completeStream(request) {
    // Not implemented in Stage 15
    throw new Error('Streaming not implemented yet');
  }
}

/**
 * Helper to validate that a class implements AIProviderInterface
 * 
 * @param {Object} provider - The provider instance to validate
 * @returns {boolean} - True if valid implementation
 */
export function validateProviderImplementation(provider) {
  if (!provider) return false;
  if (typeof provider.complete !== 'function') return false;
  if (!provider.name) return false;
  if (!provider.capabilities) return false;
  return true;
}

export default AIProviderInterface;
