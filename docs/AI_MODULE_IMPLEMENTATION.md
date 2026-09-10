# AI Module - Stage 15-17 Implementation

## Overview

This module implements the AI provider abstraction layer, basic AI communication, and AI identity & system prompts for WAXPREP.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    AI Worker (BullMQ)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                    AIService (Orchestration)                │
│  - Validates requests                                        │
│  - Estimates token usage                                     │
│  - Builds system prompt                                      │
│  - Calls provider                                            │
│  - Normalizes responses                                      │
│  - Persists metadata                                         │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
┌─────────────────────────────────────────────────────────────┐
│                  ProviderFactory                             │
│  - Configuration-driven provider selection                   │
│  - Single point of provider instantiation                    │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ↓
    ┌────────────────┼────────────────┬────────────────┐
    ↓                ↓                ↓                ↓
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐
│Fake     │    │Anthropic │    │ OpenAI   │    │ Groq     │
│Adapter  │    │Adapter   │    │Adapter   │    │Adapter   │
└─────────┘    └──────────┘    └──────────┘    └──────────┘
```

## Provider Abstraction (Stage 15)

### Purpose

Create a permanent abstraction between WAXPREP and any AI provider. The rest of the codebase must never know which provider is being used.

### Components

#### Provider Interface
- **Location**: `src/ai/providers/AIProviderInterface.js`
- **Purpose**: Defines the contract all provider adapters must implement
- **Key Method**: `complete(request: AIRequest): Promise<AIResponse>`

#### Provider Factory
- **Location**: `src/ai/providers/ProviderFactory.js`
- **Purpose**: Creates provider instances based on configuration
- **Behavior**: Unknown providers fail immediately during startup

#### Normalized Request Schema
- **Location**: `src/ai/schemas/AIRequest.js`
- **Purpose**: Defines the standard request format all adapters accept
- **Key Fields**:
  - `systemPrompt`: System instructions (separate from messages)
  - `messages`: Array of conversation messages (user/assistant only)
  - `model`: Model identifier
  - `maxOutputTokens`: Maximum tokens in response
  - `temperature`: Generation temperature
  - `waxId`, `sessionId`, `correlationId`: Internal metadata
  - `promptVersion`: Version of system prompt used

#### Normalized Response Schema
- **Location**: `src/ai/schemas/AIResponse.js`
- **Purpose**: Defines the standard response format all adapters return
- **Key Fields**:
  - `content`: Text response
  - `model`: Actual model that responded
  - `provider`: Provider name
  - `finishReason`: Normalized finish reason
  - `usage`: Token usage (inputTokens, outputTokens, totalTokens)
  - `latencyMs`: Request latency

#### Error Normalization
- **Location**: `src/ai/schemas/AIErrors.js`
- **Purpose**: Normalizes provider-specific errors to a common taxonomy
- **Error Types**:
  - `AUTHENTICATION_ERROR`: Invalid API key
  - `RATE_LIMIT_ERROR`: Too many requests
  - `CONTEXT_LENGTH_ERROR`: Request too large
  - `INVALID_REQUEST_ERROR`: Malformed request
  - `CONTENT_SAFETY_ERROR`: Safety refusal
  - `PROVIDER_SERVER_ERROR`: 500/503 errors
  - `TIMEOUT_ERROR`: Request timed out
  - `UNKNOWN_ERROR`: Anything else

### Fake Provider

**Location**: `src/ai/providers/FakeAIAdapter.js`

The Fake Provider is a complete, first-class implementation used for:
- Local development without API costs
- CI/CD testing without network calls
- Deterministic behavior for testing
- Simulating failures and latency

**Configuration**:
```bash
AI_PRIMARY_PROVIDER=fake
AI_FAKE_RESPONSE="Your simulated response"
AI_FAKE_LATENCY_MS=500
AI_FAKE_SIMULATE_FAILURE=false
```

### Real Provider Adapters

#### AnthropicAdapter
**Location**: `src/ai/providers/AnthropicAdapter.js`

Implements Anthropic's native Messages API with:
- System prompt as top-level parameter
- Support for prompt caching
- Content blocks for multimodal (future)
- Normalized finish reasons
- Usage tracking with cache tokens

#### OpenAIAdapter
**Location**: `src/ai/providers/OpenAIAdapter.js`

Implements OpenAI's Chat Completions API with:
- System message in messages array
- Support for Groq (OpenAI-compatible)
- Normalized responses
- Error handling

## AI Communication (Stage 16)

### AIService

**Location**: `src/ai/AIService.js`

The AIService is the orchestration layer that:
1. Validates input parameters
2. Builds the system prompt
3. Estimates token usage
4. Calls the provider through the factory
5. Normalizes the response
6. Persists metadata to the database
7. Handles errors and retries

### Database Schema

**Migration**: `infra/migrations/002_ai_requests.sql`

The `ai_requests` table tracks:
- Ownership (wax_id, session_id)
- Tracing (correlation_id)
- Request metadata (provider, model, prompt_version)
- Status and errors
- Token usage (for future cost tracking)
- Timing and latency
- Provider request ID

**Privacy Note**: This table stores only metadata, NOT full prompts or responses.

### Timeout and Retry

- **Timeout**: Configurable via `AI_TIMEOUT_MS` (default: 60000ms)
- **Retry**: Handled by BullMQ, not the provider adapter
- **Retryable Errors**: RATE_LIMIT_ERROR, PROVIDER_SERVER_ERROR, TIMEOUT_ERROR, etc.
- **Non-Retryable Errors**: AUTHENTICATION_ERROR, CONTEXT_LENGTH_ERROR, etc.

## AI Identity & System Prompts (Stage 17)

### System Prompt Builder

**Location**: `src/ai/prompt/SystemPromptBuilder.js`

The System Prompt Builder:
1. Loads templates from version-controlled files
2. Interpolates safe variables (date, context)
3. Returns the prompt and version identifier
4. Caches templates for performance

### Prompt Template

**Location**: `src/ai/prompt/templates/waxprep_identity.v1.txt`

The v1 identity prompt establishes:
- WAXPREP's role as an AI tutor
- Nigerian educational awareness (WAEC, NECO, JAMB, etc.)
- Communication style (clear, concise, WhatsApp-friendly)
- Academic integrity (teach, don't just answer)
- Safety boundaries (self-harm, dangerous activities, etc.)
- IMPORTANT: Does NOT include curriculum or teaching rules

### Prompt Versioning

The `PromptVersioning` utility:
- Calculates deterministic hashes from templates
- Enables tracking which prompt version was used
- Supports rollback and evaluation

## Configuration

All runtime configuration is in `src/config/index.js`:

```bash
# Provider selection
AI_PRIMARY_PROVIDER=anthropic  # or: fake, openai, groq

# Model configuration
AI_PRIMARY_MODEL=claude-sonnet-4-6
AI_PRIMARY_API_KEY=sk-...

# Timeout and generation
AI_TIMEOUT_MS=60000
AI_MAX_TOKENS=1024
AI_TEMPERATURE=0.7

# Provider-specific (optional)
AI_ANTHROPIC_API_KEY=sk-...
AI_OPENAI_API_KEY=sk-...
AI_GROQ_API_KEY=gsk_...

# Fake provider (for development)
AI_PRIMARY_PROVIDER=fake
AI_FAKE_RESPONSE="Simulated response"
AI_FAKE_LATENCY_MS=500

# System prompt
AI_SYSTEM_PROMPT_PATH=src/ai/prompt/templates/waxprep_identity.v1.txt
```

## Usage

### Basic Usage

```javascript
import { AIService } from './ai/AIService.js';
import ProviderFactory from './ai/providers/ProviderFactory.js';

// Initialize provider
const providerRegistry = await ProviderFactory.initializeProviders();

// Create AI service
const aiService = new AIService({
  providerFactory: providerRegistry.primary,
  promptBuilder: null,
  database: () => Promise.resolve(pool),
});

// Complete a request
const response = await aiService.complete({
  waxId: 'student-uuid',
  sessionId: 'session-uuid',
  messages: [
    { role: 'user', content: 'What is photosynthesis?' },
  ],
  context: { correlationId: 'trace-uuid' },
});

console.log(response.content);
```

### Provider Switching

To switch providers, only change the configuration:

```bash
# Switch from Anthropic to OpenAI
AI_PRIMARY_PROVIDER=openai
AI_OPENAI_API_KEY=sk-...

# Switch to fake provider for testing
AI_PRIMARY_PROVIDER=fake
```

No code changes required.

## Testing

Run the test suite:

```bash
pnpm test tests/unit/ai-provider.test.js
```

Tests cover:
- Fake provider functionality
- System prompt building
- Prompt versioning
- Request/response validation
- Error handling

## Future Compatibility

This architecture is designed to support:
- **Streaming**: Interface acknowledges future `completeStream()` method
- **Tool Calling**: Provider capabilities include `supportsToolCalling`
- **Multimodal**: Content block schema supports image/audio (future)
- **Prompt Caching**: Anthropic adapter implements cache control
- **Multiple Providers**: Factory pattern supports adding new providers

## Security & Privacy

- **API Keys**: Never logged, stored only in environment variables
- **Student Data**: Phone numbers never sent to providers
- **Metadata Only**: Full prompts/responses not stored in `ai_requests`
- **Student Isolation**: All requests scoped to wax_id
- **Data Minimization**: Only essential data sent to providers

## Philosophy Compliance

This implementation adheres to WAXPREP's core philosophy:

> **The AI is the intelligence. The software is the infrastructure.**

- ✅ Infrastructure provides capabilities (provider abstraction, error handling, metadata)
- ✅ AI makes educational judgments (no hardcoded curriculum or teaching rules)
- ✅ Configuration over code (provider selection via config)
- ✅ Privacy by design (minimal data, student isolation)

## Git Safety

- Feature branch: `feature/stage-15-17-ai-foundation`
- Main branch: Unchanged
- Migrations: Forward-only, no modifications to existing migrations
- All changes are additive and reversible

## Next Steps

After Stages 15-17 are complete:
1. Test with real provider (switch `AI_PRIMARY_PROVIDER` to `anthropic`)
2. Monitor token usage and costs
3. Iterate on system prompt based on AI behavior
4. Prepare for Stage 18+ (Context Assembly, Memory, Tools)
