/**
 * WaxPrep - Cerebras AI Provider Adapter
 *
 * Cerebras provides an OpenAI-compatible API, so this adapter subclasses
 * OpenAIAdapter and only overrides the constructor (different baseURL/model).
 *
 * All buildOpenAIRequest, buildMessages, normalizeResponse, normalizeError,
 * callWithTimeout, and tool-call handling are inherited from OpenAIAdapter.
 * This guarantees behavioral parity with the OpenAI/Groq adapter.
 */

import { OpenAIAdapter } from './OpenAIAdapter.js';
import config from '../../config/index.js';

export class CerebrasAIAdapter extends OpenAIAdapter {
  constructor() {
    super({
      isGroq: false,
      apiKey: config.AI_CEREBRAS_API_KEY || config.AI_PRIMARY_API_KEY,
      baseURL: 'https://api.cerebras.ai/v1',
    });

    // Override the name (OpenAIAdapter defaults to 'openai' for non-groq)
    this.name = 'cerebras';

    this.capabilities = {
      supportsText: true,
      supportsImageInput: false,
      supportsAudioInput: false,
      supportsToolCalling: true,
      supportsStructuredOutput: false,
      supportsStreaming: true,
      supportsPromptCaching: false,
      maxContextTokens: 256000,
      maxOutputTokens: 4096,
    };

    this.defaultModel = config.AI_CEREBRAS_MODEL || config.AI_PRIMARY_MODEL || 'llama3.1-8b';
  }
}

export default CerebrasAIAdapter;
