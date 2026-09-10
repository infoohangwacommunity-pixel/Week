# WAXPREP Memory System Implementation
## Complete Documentation for Stages 22-26

**Status:** Production Ready  
**Implemented:** September 2026  
**Branch:** Merged to main

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Database Schema](#database-schema)
4. [Core Components](#core-components)
5. [API Reference](#api-reference)
6. [Usage Examples](#usage-examples)
7. [Configuration](#configuration)
8. [Testing](#testing)
9. [Deployment](#deployment)
10. [Troubleshooting](#troubleshooting)

---

## Overview

The WaxPrep Memory System provides persistent, student-isolated memory storage for the AI tutor. It implements the complete memory architecture specified in Stages 22-26 of the WAXPREP research.

### Key Features

- **Persistent Storage**: Long-term memory for student facts and session summaries
- **WaxID Isolation**: Complete student data isolation at database level
- **Confidence Tracking**: Epistemic reliability with provenance and confidence scores
- **Supersession**: Append-only design that preserves historical data
- **Token Budgeting**: Configurable memory slots to control context size
- **Future-Proof**: Ready for semantic search via pgvector integration

### What It's Not

- NOT a hardcoded curriculum
- NOT educational intelligence (the AI makes educational decisions)
- NOT provider-specific (works with any AI provider)
- NOT a database dump (structured, queryable, with metadata)

---

## Architecture

### Design Principles

1. **AI is the Intelligence**: Software provides infrastructure, AI makes decisions
2. **Student Isolation**: Each student's memory is completely isolated (WaxID)
3. **Append-Only**: No hard deletes, supersession preserves history
4. **Configuration Over Code**: All thresholds and settings are configurable
5. **Provider-Agnostic**: Works with any AI provider

### System Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Context Assembler                        │
│  (Integrates memory retrieval into AI context building)     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Memory Retriever                           │
│  (Retrieves relevant facts and episodes with budgeting)     │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              StudentMemoryAccess                            │
│  (Database access layer with WaxID isolation)               │
└────────────────────┬────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Database (PostgreSQL)                          │
│  - student_facts                                            │
│  - student_episodes                                         │
│  - memory_contradictions                                    │
│  - memory_confidence_history                                │
│  - memory_retrieval_log                                     │
└─────────────────────────────────────────────────────────────┘
```

### Data Flow

1. **Write Path**:
   ```
   AI → MemoryWriter → StudentMemoryAccess → Database
   ```

2. **Read Path**:
   ```
   Context Assembler → MemoryRetriever → StudentMemoryAccess → Database
   ```

3. **Session Summary**:
   ```
   Session Complete → SessionSummarizer → MemoryWriter → Database
   ```

---

## Database Schema

### Tables

#### 1. student_facts

Durable profile facts about students.

```sql
CREATE TABLE student_facts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  fact_key TEXT NOT NULL,
  fact_category TEXT NOT NULL,
  fact_value JSONB NOT NULL,
  display_text TEXT NOT NULL,
  provenance TEXT NOT NULL,
  source_session_id UUID REFERENCES sessions(id),
  source_message_id UUID REFERENCES messages(id),
  source_ai_request_id UUID REFERENCES ai_requests(id),
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,
  evidence_count INTEGER NOT NULL DEFAULT 1,
  contradicted_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'superseded', 'archived', 'flagged')),
  superseded_by UUID REFERENCES student_facts(id),
  superseded_at TIMESTAMPTZ,
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  valid_until TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,
  embedding vector(1536),  -- Future semantic search
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**Indexes**:
- `(wax_id, status)` - Primary lookup
- `(wax_id, fact_category, status)` - Category filtering
- `(wax_id, fact_key, status)` - Key-specific lookup
- `(wax_id, created_at DESC)` WHERE `status = 'active'` - Recency retrieval
- `(wax_id, confidence DESC)` WHERE `status = 'active'` - Confidence ranking

#### 2. student_episodes

Session summaries with structured metadata.

```sql
CREATE TABLE student_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id),
  summary_text TEXT NOT NULL,
  topics JSONB NOT NULL DEFAULT '[]',
  subjects JSONB NOT NULL DEFAULT '[]',
  breakthroughs JSONB DEFAULT '[]',
  confusions JSONB DEFAULT '[]',
  questions_asked INTEGER DEFAULT 0,
  student_mood TEXT,
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ NOT NULL,
  session_duration_minutes INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  summary_generated_by TEXT NOT NULL,
  summary_model TEXT NOT NULL,
  summary_prompt_version TEXT NOT NULL,
  summary_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  summary_status TEXT NOT NULL DEFAULT 'complete' CHECK (summary_status IN ('complete', 'failed', 'partial', 'skipped')),
  summary_error TEXT,
  embedding vector(1536),  -- Future semantic search
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 3. memory_contradictions

Tracks conflicting facts for AI resolution.

```sql
CREATE TABLE memory_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  fact_a_id UUID NOT NULL REFERENCES student_facts(id) ON DELETE RESTRICT,
  fact_b_id UUID REFERENCES student_facts(id) ON DELETE RESTRICT,
  conflict_type TEXT NOT NULL,
  conflict_description TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'unresolved' CHECK (status IN ('unresolved', 'resolved_by_supersession', 'resolved_by_ai', 'acknowledged')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detected_by TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 4. memory_confidence_history

Append-only record of confidence changes.

```sql
CREATE TABLE memory_confidence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL REFERENCES student_facts(id) ON DELETE CASCADE,
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  previous_confidence NUMERIC(4,3) NOT NULL,
  new_confidence NUMERIC(4,3) NOT NULL,
  delta NUMERIC(4,3) NOT NULL,
  change_reason TEXT NOT NULL,
  change_evidence TEXT,
  triggered_by_session_id UUID REFERENCES sessions(id),
  triggered_by_ai_request_id UUID REFERENCES ai_requests(id),
  triggered_by_job TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### 5. memory_retrieval_log

Observability for memory retrieval.

```sql
CREATE TABLE memory_retrieval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  ai_request_id UUID REFERENCES ai_requests(id),
  session_id UUID REFERENCES sessions(id),
  facts_retrieved INTEGER NOT NULL DEFAULT 0,
  episodes_retrieved INTEGER NOT NULL DEFAULT 0,
  total_memory_tokens_estimated INTEGER NOT NULL DEFAULT 0,
  retrieval_strategy TEXT NOT NULL,
  retrieval_latency_ms INTEGER NOT NULL,
  facts_deduplicated INTEGER DEFAULT 0,
  marked_useful BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Core Components

### 1. MemoryTaxonomy

Defines the complete taxonomy of memory types.

**Fact Categories**:
- `profile` - Durable biographical facts (no decay)
- `academic` - Academic engagement (2% decay per 30 days)
- `misconception` - Incorrect understandings (5% decay per 30 days)
- `preference` - Interaction preferences (2% decay per 30 days)
- `progress` - Conceptual mastery (3% decay per 30 days)
- `behavioral` - Behavioral patterns (2% decay per 30 days)

**Provenance Values**:
- `student_stated_direct` - Student explicitly stated (80% initial confidence)
- `student_stated_correction` - Student corrected (85% initial confidence)
- `student_stated_indirect` - Student implied (55% initial confidence)
- `ai_inferred_from_behavior` - AI observed behavior (45% initial confidence)
- `ai_inferred_from_error` - AI identified from error (55% initial confidence)
- `ai_inferred_cross_session` - AI pattern across sessions (35% initial confidence)
- `system_computed` - Computed by system (65% initial confidence)
- `episode_extracted` - Extracted from summary (60% initial confidence)
- `confirmed_by_repetition` - Re-stated fact (2% confidence increase)

### 2. StudentMemoryAccess

Core database access layer with WaxID isolation.

**Key Methods**:
- `writeFact(params)` - Write or update a fact
- `retrieveFacts(params)` - Retrieve facts with filtering
- `getFactById(factId)` - Get single fact
- `archiveOldFacts(months)` - Archive old superseded facts
- `getUnresolvedContradictions()` - Get active contradictions
- `getConfidenceHistory(factId)` - Get confidence history

**WaxID Isolation**:
- Constructor requires `waxId`
- All queries scoped by `wax_id = $1`
- Runtime assertions validate isolation
- `StudentIsolationError` thrown on violation

### 3. MemoryWriter

Writes facts extracted by AI to the memory system.

**Key Methods**:
- `writeFact(params)` - Write single fact with validation
- `writeMultipleFacts(facts, sessionId, aiRequestId)` - Batch write
- `writeExtractedFacts(extractedFacts, sessionId, aiRequestId)` - Session summary extraction

**Validation**:
- Fact key validation against taxonomy
- Category validation
- Provenance validation
- Confidence bounds checking

### 4. MemoryRetriever

Retrieves and formats memories for context injection.

**Key Methods**:
- `retrieveRelevantMemories(params)` - Main retrieval entry point
- `formatFactsForContext(facts)` - Format facts for context injection

**Features**:
- Token budgeting (default 400 tokens for facts)
- Category-based ranking
- Deduplication against current session
- Subject matching from current message

**Token Budget**:
- FACTS: 400 tokens
- EPISODES: 600 tokens
- FUTURE: 400 tokens

### 5. ConfidenceEngine

Implements the confidence state machine.

**Operations**:
- `INITIALIZE` - Set initial confidence based on provenance
- `REINFORCE` - Increase confidence on corroboration
- `CONTRADICT` - Decrease confidence on conflict
- `SUPERSEDE` - Replace fact with new version
- `DECAY` - Decrease confidence over time

**Confidence Scale**:
- Range: 0.000 to 0.950 (never reaches 1.0)
- Levels: weak (0-0.3), moderate (0.3-0.5), reasonable (0.5-0.7), high (0.7-0.85), very_high (0.85-0.95)

### 6. SessionSummarizer

Background worker for session summarization.

**Workflow**:
1. Fetch all messages in completed session
2. Generate AI summary with metadata
3. Extract new facts from summary
4. Create episode record
5. Write extracted facts to memory

---

## API Reference

### StudentMemoryAccess

```javascript
import { StudentMemoryAccess } from './memory/index.js';

const memoryAccess = new StudentMemoryAccess(waxId);

// Write a fact
await memoryAccess.writeFact({
  factKey: 'exam_target',
  factCategory: 'profile',
  factValue: 'WAEC',
  displayText: 'Student is preparing for WAEC',
  provenance: 'student_stated_direct',
  sessionId: 'session-123',
  aiRequestId: 'ai-request-456'
});

// Retrieve facts
const facts = await memoryAccess.retrieveFacts({
  strategy: 'recency',  // or 'hybrid'
  limit: 50,
  categories: ['profile', 'academic'],
  minConfidence: 0.4
});

// Get fact by ID
const fact = await memoryAccess.getFactById(factId);

// Get contradictions
const contradictions = await memoryAccess.getUnresolvedContradictions();

// Get confidence history
const history = await memoryAccess.getConfidenceHistory(factId);
```

### MemoryWriter

```javascript
import { MemoryWriter } from './memory/index.js';

const writer = new MemoryWriter(waxId);

// Write single fact
const result = await writer.writeFact({
  factKey: 'class_level',
  factCategory: 'profile',
  factValue: 'SS2',
  displayText: 'Student is in SS2',
  provenance: 'student_stated_direct'
});

// Write multiple facts
const batchResult = await writer.writeMultipleFacts([
  { factKey: 'exam_target', factCategory: 'profile', factValue: 'WAEC', displayText: '...', provenance: '...' },
  { factKey: 'class_level', factCategory: 'profile', factValue: 'SS2', displayText: '...', provenance: '...' }
], 'session-123');
```

### MemoryRetriever

```javascript
import { MemoryRetriever } from './memory/index.js';

const retriever = new MemoryRetriever(waxId);

// Retrieve relevant memories
const memories = await retriever.retrieveRelevantMemories({
  sessionId: 'session-123',
  currentMessage: 'Help me with physics',
  tokenBudget: 400  // Optional override
});

// Format facts for context
const contextText = retriever.formatFactsForContext(memories.facts);
```

### ContextAssembler (Integration)

```javascript
import { ContextAssembler } from './context/index.js';

const assembler = new ContextAssembler(database);

const context = await assembler.assemble({
  waxId: 'student-123',
  sessionId: 'session-456',
  currentMessage: 'I need help with Newton\'s laws',
  trace: { requestId: 'req-789' }
});

// context includes:
// - messages: Conversation messages
// - memories: { facts, episodes, totalTokensEstimated, latency }
// - tokenBudget: Budget breakdown
// - tokenUsage: Token usage breakdown
```

---

## Usage Examples

### Example 1: Writing a Student Fact

```javascript
import { MemoryWriter } from './memory/index.js';

const writer = new MemoryWriter('wax-student-123');

// Student says: "I'm preparing for WAEC next year"
await writer.writeFact({
  factKey: 'exam_target',
  factCategory: 'profile',
  factValue: 'WAEC',
  displayText: 'Student is preparing for WAEC in 2027',
  provenance: 'student_stated_direct',
  sessionId: 'session-abc',
  aiRequestId: 'ai-request-xyz'
});

// Result:
// {
//   success: true,
//   fact: { id: 'uuid', wax_id: 'wax-student-123', ... },
//   action: 'created'
// }
```

### Example 2: Retrieving Facts for Context

```javascript
import { MemoryRetriever } from './memory/index.js';

const retriever = new MemoryRetriever('wax-student-123');

const memories = await retriever.retrieveRelevantMemories({
  sessionId: 'session-abc',
  currentMessage: 'Can you explain force diagrams?',
  tokenBudget: 400
});

// memories.facts might contain:
// [
//   {
//     fact_key: 'exam_target',
//     fact_category: 'profile',
//     fact_value: 'WAEC',
//     display_text: 'Student is preparing for WAEC in 2027',
//     confidence: 0.85,
//     provenance: 'student_stated_direct'
//   },
//   {
//     fact_key: 'class_level',
//     fact_category: 'profile',
//     fact_value: 'SS2',
//     display_text: 'Student is in SS2',
//     confidence: 0.80,
//     provenance: 'student_stated_direct'
//   }
// ]

const contextText = retriever.formatFactsForContext(memories.facts);
// Returns formatted text for context injection:
// """
// [Student Profile Memory — use this to personalize responses]
// • Student is preparing for WAEC in 2027 (very_high)
// • Student is in SS2 (high)
// """
```

### Example 3: Handling Fact Conflicts

```javascript
import { MemoryWriter } from './memory/index.js';

const writer = new MemoryWriter('wax-student-123');

// Student initially says: "I'm in SS1"
await writer.writeFact({
  factKey: 'class_level',
  factCategory: 'profile',
  factValue: 'SS1',
  displayText: 'Student is in SS1',
  provenance: 'student_stated_direct'
});

// Later, student says: "I'm now in SS2"
// System detects temporal update (SS1 → SS2)
await writer.writeFact({
  factKey: 'class_level',
  factCategory: 'profile',
  factValue: 'SS2',
  displayText: 'Student is in SS2',
  provenance: 'student_stated_direct'
});

// Result:
// - Old fact (SS1) marked as superseded
// - New fact (SS2) created as active
// - History preserved in database
// - Superseded_by pointer set
```

### Example 4: Session Summarization

```javascript
import { SessionSummarizer } from './workers/sessionSummarizer.js';

const summarizer = new SessionSummarizer(aiService);

// After session ends
const result = await summarizer.summarizeSession({
  id: 'session-abc',
  wax_id: 'wax-student-123'
});

// Result:
// {
//   success: true,
//   episode: { id: 'uuid', wax_id: 'wax-student-123', summary_text: '...', ... },
//   extractedFacts: [
//     {
//       fact_key: 'weak_subjects',
//       fact_category: 'academic',
//       fact_value: ['Chemistry'],
//       display_text: 'Student struggles with Chemistry',
//       provenance: 'episode_extracted'
//     }
//   ]
// }
```

---

## Configuration

### Environment Variables

All memory system configuration is handled through constants in the codebase. Key configurable values:

**MemoryTaxonomy.js**:
```javascript
// Confidence bounds
CONFIDENCE_BOUNDS = {
  MIN: 0.000,
  MAX: 0.950,
  MIN_FOR_RETRIEVAL: 0.400,
  MIN_FOR_WRITE: 0.550,
  ARCHIVE_THRESHOLD: 0.200
};

// Token budgets
TOKEN_BUDGETS = {
  FACTS: 400,
  EPISODES: 600,
  FUTURE: 400
};
```

**To modify these values, edit the constants in the respective files.**

### Database Configuration

No additional database configuration needed. The system uses the existing PostgreSQL connection pool.

**Requirements**:
- PostgreSQL with `uuid-ossp` extension
- `pgvector` extension (enabled in migration, ready for future use)

---

## Testing

### Running Tests

```bash
# Run all tests
pnpm test

# Run memory-specific tests
pnpm test tests/memory/memorySystem.test.js

# Run with coverage
pnpm test --coverage
```

### Test Coverage

- **Confidence Engine**: State machine transitions, decay calculations
- **StudentMemoryAccess**: WaxID isolation, CRUD operations, conflict detection
- **MemoryWriter**: Validation, fact writing, supersession
- **MemoryRetriever**: Retrieval, ranking, deduplication, token budgeting

### Example Test

```javascript
import { describe, it, expect } from 'vitest';
import { MemoryWriter } from '../../src/memory/MemoryWriter.js';
import { PROVENANCE } from '../../src/memory/MemoryTaxonomy.js';

describe('MemoryWriter', () => {
  it('should validate fact category', async () => {
    const writer = new MemoryWriter('test-wax-id');
    
    await expect(writer.writeFact({
      factKey: 'test',
      factCategory: 'invalid_category',
      factValue: {},
      displayText: 'Test',
      provenance: PROVENANCE.STUDENT_STATED_DIRECT.value
    })).rejects.toThrow('Invalid fact category');
  });
});
```

---

## Deployment

### Running Migrations

```bash
# Run all pending migrations
pnpm migrate

# The memory migration (005_memory_foundation.sql) will be automatically applied
```

### Production Checklist

- [ ] Migration 005 applied successfully
- [ ] Database has all 5 memory tables
- [ ] Indexes created and verified
- [ ] WaxID isolation tested
- [ ] Memory retrieval tested with sample data
- [ ] Token budgeting verified
- [ ] Logs and monitoring in place

### Monitoring

Key metrics to monitor:
- Memory retrieval latency (should be < 20ms)
- Fact write success rate
- Contradiction detection rate
- Token budget utilization
- Confidence distribution

---

## Troubleshooting

### Common Issues

#### 1. WaxID Isolation Error

**Error**: `StudentIsolationError: Student isolation violation`

**Cause**: Query attempted to access another student's memory

**Solution**:
- Verify all queries use `WHERE wax_id = $1`
- Check `StudentMemoryAccess` constructor is called with valid `waxId`
- Review runtime assertions in retrieval code

#### 2. Confidence Out of Bounds

**Error**: `ConfidenceBoundsError: Confidence out of bounds`

**Cause**: Confidence value outside 0.000-0.950 range

**Solution**:
- Verify confidence calculations use `Math.min(MAX, value)` and `Math.max(MIN, value)`
- Check provenance initial confidence values are correct
- Review decay calculations

#### 3. Fact Conflict Not Detected

**Issue**: Conflicting facts not being detected

**Solution**:
- Verify `writeFact` checks for existing active fact with same `fact_key`
- Check `_isTemporalUpdate` logic for correct fact keys
- Review contradiction logging

#### 4. Memory Not Retrieving

**Issue**: No facts returned from retrieval

**Solution**:
- Check `minConfidence` threshold (default 0.4)
- Verify facts have `status = 'active'`
- Check WaxID isolation in query
- Review ranking and deduplication logic

#### 5. Supersession Not Working

**Issue**: Old facts not being marked as superseded

**Solution**:
- Verify `_handleFactConflict` detects temporal updates correctly
- Check supersession transaction completes successfully
- Review `superseded_by` pointer updates

### Debugging Tips

1. **Enable detailed logging**:
```javascript
import { logger } from '../observability/index.js';
logger.level = 'debug';
```

2. **Check database directly**:
```sql
-- Check active facts for a student
SELECT fact_key, confidence, status, created_at 
FROM student_facts 
WHERE wax_id = 'student-uuid' 
  AND status = 'active'
ORDER BY created_at DESC;

-- Check confidence history
SELECT previous_confidence, new_confidence, delta, change_reason, created_at
FROM memory_confidence_history
WHERE fact_id = 'fact-uuid'
ORDER BY created_at DESC;
```

3. **Test WaxID isolation**:
```javascript
const access1 = new StudentMemoryAccess('wax-1');
const access2 = new StudentMemoryAccess('wax-2');
// All queries from access1 should only return wax-1 data
```

---

## Future Enhancements

### Stage 27+ Ready

The memory system is designed for future enhancements:

1. **Semantic Search**: Enable `pgvector` and populate embeddings
2. **Consolidation Jobs**: Background jobs for archiving, decay, contradiction review
3. **Evaluation**: Track memory usefulness and impact on AI responses
4. **Advanced Retrieval**: Hybrid ranking with semantic similarity
5. **Student Model**: Build knowledge state from memory evidence

### Migration Path

All enhancements can be added without breaking changes:
- New provenance values can be added to taxonomy
- New fact categories can be added
- Embedding columns are already in schema
- Additional metadata fields can be added

---

## Support

For issues or questions:
1. Check this documentation
2. Review test files for usage examples
3. Check ADR for architectural decisions
4. Contact the WaxPrep engineering team

---

**Document Version**: 1.0  
**Last Updated**: September 2026  
**Author**: AI Coding Agent  
**Status**: Production Ready
