/**
 * WaxPrep - Fake AI Provider Adapter
 * 
 * A complete, first-class implementation of the AIProviderInterface.
 * Used for local development, CI testing, and deterministic behavior.
 * 
 * This is NOT a mock or stub - it is a full implementation that:
 * - Implements the complete interface
 * - Simulates configurable latency
 * - Simulates configurable failures
 * - Returns deterministic responses
 * - Enables CI testing without network calls
 * - Requires zero network calls
 */

import { AIProviderInterface } from './AIProviderInterface.js';
import { createAIResponse, FinishReason, AIUsageSchema } from '../schemas/AIResponse.js';
import { createAIError, AIErrorTypes } from '../schemas/AIErrors.js';
import config from '../config/index.js';

/**
 * FakeAIAdapter implements the full AIProviderInterface
 */
export class FakeAIAdapter extends AIProviderInterface {
  constructor(fakeConfig) {
    super();
    this.name = 'fake';
    
    this.capabilities = {
      supportsText: true,
      supportsImageInput: false,
      supportsAudioInput: false,
      supportsToolCalling: false,
      supportsStructuredOutput: false,
      supportsStreaming: false,
      supportsPromptCaching: false,
      maxContextTokens: 200000,
      maxOutputTokens: 4096,
    };

    // Configuration from environment
    this.fakeResponse = config.AI_FAKE_RESPONSE || 'This is a simulated response from the Fake AI Provider. In production, this would be a real AI response from your configured provider.';
    this.fakeLatencyMs = config.AI_FAKE_LATENCY_MS || 500;
    this.fakeSimulateFailure = config.AI_FAKE_SIMULATE_FAILURE === 'true';
    this.fakeFailureMessage = config.AI_FAKE_FAILURE_MESSAGE || 'Simulated failure for testing';
    this.fakeFailureType = config.AI_FAKE_FAILURE_TYPE || AIErrorTypes.PROVIDER_SERVER_ERROR;

    // Call tracking for testing
    this.callHistory = [];
  }

  /**
   * Complete a request with a fake deterministic response
   * 
   * @param {import('../schemas/AIRequest.js').AIRequest} request - Normalized request
   * @returns {Promise<import('../schemas/AIResponse.js').AIResponse>} - Fake response
   * @throws {import('../schemas/AIErrors.js').AIProviderError} - If configured to fail
   */
  async complete(request) {
    // Record the call for testing
    const callRecord = {
      timestamp: Date.now(),
      request,
    };
    this.callHistory.push(callRecord);

    // Simulate latency
    await new Promise(resolve => setTimeout(resolve, this.fakeLatencyMs));

    // Simulate failure if configured
    if (this.fakeSimulateFailure) {
      throw createAIError({
        errorType: this.fakeFailureType,
        providerMessage: this.fakeFailureMessage,
        providerStatusCode: 500,
      });
    }

    // Return deterministic fake response
    const response = createAIResponse({
      content: this.fakeResponse,
      model: request.model || 'fake-model',
      provider: 'fake',
      finishReason: FinishReason.COMPLETED,
      usage: {
        inputTokens: Math.ceil(request.systemPrompt.length / 4) + 
                     request.messages.reduce((sum, msg) => {
                       if (typeof msg.content === 'string') {
                         return sum + msg.content.length;
                       }
                       return sum + JSON.stringify(msg.content).length;
                     }, 0) / 4,
        outputTokens: Math.ceil(this.fakeResponse.length / 4),
        totalTokens: Math.ceil((this.fakeResponse.length + request.systemPrompt.length) / 4),
      },
      providerRequestId: `fake-${request.correlationId}`,
      latencyMs: this.fakeLatencyMs,
    });

    return response;
  }

  /**
   * Get the call history for testing
   * 
   * @returns {Array} - Array of call records
   */
  getCallHistory() {
    return [...this.callHistory];
  }

  /**
   * Clear the call history
   */
  clearCallHistory() {
    this.callHistory = [];
  }

  /**
   * Configure the fake response
   * 
   * @param {string} response - The fake response text
   */
  setFakeResponse(response) {
    this.fakeResponse = response;
  }

  /**
   * Configure the fake latency
   * 
   * @param {number} latencyMs - Latency in milliseconds
   */
  setFakeLatency(latencyMs) {
    this.fakeLatencyMs = latencyMs;
  }

  /**
   * Configure failure simulation
   * 
   * @param {boolean} simulate - Whether to simulate failures
   * @param {string} errorMessage - Error message if failing
   * @param {string} errorType - Error type if failing
   */
  configureFailure(simulate, errorMessage, errorType) {
    this.fakeSimulateFailure = simulate;
    this.fakeFailureMessage = errorMessage;
    this.fakeFailureType = errorType;
  }
}

export default FakeAIAdapter;
