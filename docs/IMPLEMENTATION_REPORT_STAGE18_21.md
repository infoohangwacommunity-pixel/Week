# Stages 18–21 Implementation Report

**Status:** Implemented  
**Date:** September 2026  
**Branch:** `feature/stage-18-21-prototype-foundation`

---

## Executive Summary

This implementation completes Stages 18–21 of the WaxPrep build guide, establishing:

- **Stage 18:** Context Window Management — The AI now sees recent conversation history
- **Stage 19:** Response Validation & Delivery — AI responses are validated and formatted for WhatsApp
- **Stage 20:** AI Orchestration — Central orchestration layer with provider fallback
- **Stage 21:** First Functioning Prototype — End-to-end integration of all components

The implementation follows the WaxPrep philosophy: **The AI is the intelligence. The software is the infrastructure.**

---

## Architecture Overview

```
Student
  ↓
WhatsApp
  ↓
Webhook
  ↓
Identity / WaxID
  ↓
Queue
  ↓
ContextAssembler (Stage 18) ← Fetches recent conversation history
  ↓
AIOrchestrator (Stage 20) ← Routes to provider, handles fallback
  ↓
Provider (Anthropic/OpenAI/Groq)
  ↓
ResponseValidator (Stage 19) ← Validates, formats, splits
  ↓
Outbound Queue
  ↓
WhatsApp
  ↓
Student
```

---

## Stage 18: Context Window Management

### Files Created

- `src/context/ContextAssembler.js`

### Purpose

Gives the AI short-term working memory by assembling recent conversation history into each AI request.

### Key Features

1. **Conversation History Retrieval**
   - Fetches recent messages from the `messages` table
   - Configurable limit via `CONTEXT_MAX_HISTORY_MESSAGES` (default: 20)
   - Orders messages chronologically for context

2. **Token Budgeting**
   - Configurable via `CONTEXT_MAX_INPUT_TOKENS` (default: 4000)
   - Reserves response budget via `CONTEXT_RESPONSE_TOKEN_BUDGET` (default: 1024)
   - Estimates tokens using character-based calculation (1 token ≈ 4 characters)

3. **Intelligent Truncation**
   - Never cuts messages in the middle
   - Preserves complete conversation turns
   - Keeps at least 2 turns (4 messages) when truncating
   - Logs truncation events

4. **Context Assembly**
   - Separates system instructions from conversation
   - Builds `messages[]` array with `role: 'user'` / `role: 'assistant'`
   - Merges current message into last user message if exists

### Configuration Added

```env
CONTEXT_MAX_HISTORY_MESSAGES=20
CONTEXT_MAX_INPUT_TOKENS=4000
CONTEXT_RESPONSE_TOKEN_BUDGET=1024
```

---

## Stage 19: Response Validation, Formatting & Delivery

### Files Created

- `src/validation/ResponseValidator.js`

### Purpose

Validates AI responses before delivery, formats them for WhatsApp, and tracks delivery lifecycle.

### Key Features

1. **Response Validation**
   - Empty response detection
   - Whitespace-only response detection
   - Prompt leakage detection (system instructions in response)
   - Internal error message detection
   - Repetition detection (similarity comparison with previous response)

2. **Formatting Normalization**
   - Normalizes line endings
   - Fixes markdown formatting issues
   - Normalizes bold/italic markers
   - Cleans up excessive spacing

3. **Intelligent Response Splitting**
   - Splits at paragraph boundaries first
   - Falls back to sentence boundaries
   - Respects `RESPONSE_MAX_CHUNK_CHARS` (default: 1000)
   - Never cuts numbered lists incorrectly

4. **Delivery Lifecycle Tracking**
   - States: `generated` → `queued` → `sent` → `delivered` → `read`
   - Or: `generated` → `queued` → `failed` → `retry`
   - Tracks chunk count and retry attempts

### Database Migration

- `infra/migrations/003_response_deliveries.sql`

Creates `response_deliveries` table with:
- Ownership tracking (wax_id, session_id)
- Correlation ID linking to `ai_requests`
- Delivery state machine
- Chunk tracking
- Error tracking with retry count
- Timing timestamps

### Configuration Added

```env
# Existing (already present)
RESPONSE_MAX_CHUNK_CHARS=1000
RESPONSE_TYPING_INDICATOR_ENABLED=true
```

---

## Stage 20: AI Orchestration & Routing

### Files Created

- `src/orchestration/AIOrchestrator.js`

### Purpose

Central orchestration layer for all AI requests. Business logic never calls providers directly.

### Key Features

1. **Provider Routing**
   - Primary provider from `AI_PRIMARY_PROVIDER`
   - Fallback provider from `AI_FALLBACK_PROVIDER`
   - Automatic fallback on retryable errors:
     - Rate limiting (429)
     - Server errors (500, 502, 503, 504)
     - Network errors (ECONNREFUSED, ETIMEDOUT)
     - Provider errors (PROVIDER_RATE_LIMITED, PROVIDER_SERVER_ERROR)

2. **Orchestration Flow**
   ```
   Context Assembly (Stage 18)
         ↓
   System Prompt (Stage 17)
         ↓
   Provider Call (Primary → Fallback)
         ↓
   Response Validation (Stage 19)
         ↓
   Metadata Persistence
   ```

3. **Response Handling**
   - If validation fails but can retry: retries with context
   - If validation fails permanently: returns graceful student message
   - Logs all failures with error types

4. **Observability**
   - Logs provider, model, latency, token usage
   - Tracks fallback usage
   - Persists metadata to `ai_requests` table

### Configuration Added

```env
AI_FALLBACK_PROVIDER=
AI_ORCHESTRATOR_TIMEOUT_MS=60000
```

---

## Stage 21: First Functioning Prototype

### Files Created

- `src/onboarding/OnboardingHandler.js`
- Updated: `src/workers/setup.js`

### Purpose

Wires all components into an end-to-end prototype that a real student can use.

### Key Features

1. **End-to-End Integration**
   - Worker now uses full AIOrchestrator
   - Context assembled from database
   - Response validated and ready for outbound delivery
   - All failure paths handled gracefully

2. **Lightweight Onboarding Detection**
   - Detects first contact via database query
   - Marks onboarding state in session metadata
   - Provides context flags to AI
   - NO hardcoded welcome messages
   - NO scripted conversations
   - AI generates welcome naturally through system prompt

### Onboarding Handler Features

- `isNewStudent()` — Checks if student has no message history
- `isOnboardingComplete()` — Checks onboarding status
- `completeOnboarding()` — Marks onboarding as complete
- `getOnboardingContext()` — Returns context flags for AI (NO hardcoded text)

---

## Files Created

| File | Purpose |
|------|---------|
| `src/context/ContextAssembler.js` | Stage 18 context assembly |
| `src/validation/ResponseValidator.js` | Stage 19 validation & formatting |
| `src/orchestration/AIOrchestrator.js` | Stage 20 orchestration |
| `src/onboarding/OnboardingHandler.js` | Stage 21 onboarding detection |
| `infra/migrations/003_response_deliveries.sql` | Response delivery tracking table |

---

## Files Modified

| File | Changes |
|------|---------|
| `src/config/index.js` | Added context, orchestration configuration |
| `.env.example` | Documented new configuration variables |
| `src/workers/setup.js` | Integrated AIOrchestrator into worker |

---

## Database Changes

### New Table: `response_deliveries`

Tracks AI response delivery lifecycle:

```sql
CREATE TABLE response_deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wax_id UUID NOT NULL REFERENCES students(id),
    session_id UUID NOT NULL REFERENCES sessions(id),
    correlation_id TEXT NOT NULL REFERENCES ai_requests(correlation_id),
    state TEXT NOT NULL DEFAULT 'generated',
    total_chunks INTEGER DEFAULT 1,
    sent_chunks INTEGER DEFAULT 0,
    error_type TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- ... plus timing and metadata columns
);
```

Indexes:
- `idx_response_deliveries_wax_id` — Student-scoped queries
- `idx_response_deliveries_correlation_id` — Request tracing
- `idx_response_deliveries_state` — State-based queries

---

## Configuration Summary

### Stage 18: Context

| Variable | Default | Description |
|----------|---------|-------------|
| `CONTEXT_MAX_HISTORY_MESSAGES` | 20 | Recent messages to fetch |
| `CONTEXT_MAX_INPUT_TOKENS` | 4000 | Max tokens for AI request |
| `CONTEXT_RESPONSE_TOKEN_BUDGET` | 1024 | Tokens reserved for response |

### Stage 20: Orchestration

| Variable | Default | Description |
|----------|---------|-------------|
| `AI_FALLBACK_PROVIDER` | (none) | Fallback provider name |
| `AI_ORCHESTRATOR_TIMEOUT_MS` | 60000 | Orchestration timeout |

---

## Audit Findings

### Philosophy Compliance Check

✓ **No hardcoded educational logic** - All educational decisions left to AI  
✓ **No scripted conversations** - Onboarding detection only, AI generates welcome  
✓ **Infrastructure-only approach** - All components provide mechanisms, not decisions  
✓ **Provider agnostic** - All providers work through abstraction layer  
✓ **Student isolation** - All queries scoped by wax_id  

### Critical Correction

**Onboarding Implementation Corrected:**
- Removed any hardcoded welcome messages
- Changed from "scripted welcome" to "detection infrastructure"
- AI now generates welcome naturally through system prompt context
- Software only detects first contact and marks state
- Follows WaxPrep philosophy: "The AI is the intelligence"

---

## Testing

### Manual Testing Steps

1. **Setup**
   - Run migration: `pnpm migrate`
   - Configure `.env.local` with valid credentials
   - Start worker: `pnpm worker`

2. **Test Context Assembly (Stage 18)**
   - Send first message → AI should respond
   - Send follow-up → AI should reference previous context
   - Check logs for `Context assembled successfully`

3. **Test Response Validation (Stage 19)**
   - Check `response_deliveries` table for state transitions
   - Verify response formatting in WhatsApp
   - Test chunked delivery for long responses

4. **Test Provider Fallback (Stage 20)**
   - Set `AI_FALLBACK_PROVIDER` to different provider
   - Simulate primary provider failure (`AI_FAKE_SIMULATE_FAILURE=true`)
   - Verify fallback is used (`fallbackUsed: true` in logs)

5. **Test End-to-End (Stage 21)**
   - Send message from WhatsApp
   - Verify AI response received
   - Send follow-up → AI understands context
   - Verify onboarding welcome on first message (AI-generated, not scripted)

---

## Known Limitations

1. **Token Estimation**
   - Current implementation uses character-based estimation (1 token ≈ 4 chars)
   - More accurate estimators can be added later (e.g., tiktoken)

2. **Context Compression**
   - Truncation removes oldest messages
   - No summarization or compression yet
   - Future stage for advanced context management

3. **Response Delivery**
   - Delivery state tracked in database
   - Actual WhatsApp sending delegated to existing outbound system
   - Typing indicators and chunk delays not yet implemented

4. **Onboarding**
   - Detection only (no welcome message generation)
   - AI decides what to say through system prompt
   - Onboarding state tracked in session metadata

---

## Git Safety Confirmation

- [x] Did not modify `main` branch
- [x] Did not rename or delete `main`
- [x] Did not force-push
- [x] Did not rewrite history
- [x] Created proper feature branch
- [x] Commits are logical and atomic

---

## Conclusion

Stages 18–21 establish WaxPrep's first functioning prototype:

- AI now sees recent conversation history (Stage 18)
- AI responses are validated and formatted for WhatsApp (Stage 19)
- Central orchestration with provider fallback (Stage 20)
- End-to-end integration with onboarding detection (Stage 21)

**Critical correction:** Onboarding implementation removed all hardcoded scripts. The software only detects first contact and provides context to the AI, which then generates the welcome naturally.

The architecture is ready for:
- Real student testing
- Provider experimentation
- Future memory and retrieval stages
- Tool integration

**The AI is the intelligence. The software provides the infrastructure.**
