# WaxPrep Learning Intelligence Module

## Overview

This module implements **Phase F: Learning Intelligence Infrastructure (Stages 27-34)** for WaxPrep. It provides the complete infrastructure for tracking student learning, estimating mastery, detecting misconceptions, and presenting this information to the AI tutor.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    AI Tutor (External)                          │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│              Student Model Context Interface (Stage 34)         │
│  ─────────────────────────────────────────────────────────────  │
│  Translates structured data → AI-readable context              │
└─────────────────────────────────────────────────────────────────┘
                              ↕
┌─────────────────────────────────────────────────────────────────┐
│                  Student Learning Access Layer                  │
│  ─────────────────────────────────────────────────────────────  │
│  Primary API for all learning operations                       │
└─────────────────────────────────────────────────────────────────┘
         ↕                    ↕                    ↕
┌──────────────┐    ┌──────────────┐    ┌──────────────────┐
│Evidence      │    │ Mastery      │    │ Misconception    │
│Writer        │    │ Engine       │    │ Tracker          │
│(Stage 28)    │    │(Stage 29)    │    │(Stage 30)        │
└──────────────┘    └──────────────┘    └──────────────────┘
         ↕                    ↕                    ↕
┌─────────────────────────────────────────────────────────────────┐
│                    PostgreSQL Tables                            │
│  ─────────────────────────────────────────────────────────────  │
│  concepts | learning_observations | knowledge_states           │
│  misconceptions | learning_signals | student_model_snapshots  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Evidence Collection (Stage 28)

**Purpose:** Transform raw conversational interactions into structured, typed, confidence-annotated learning evidence.

**Key Files:**
- `EvidenceTaxonomy.js` - Defines evidence types and their properties
- `EvidenceWriter.js` - Writes observations to the database

**Evidence Types:**
- `direct_response` - Student answered a question (highest quality)
- `explanation_attempt` - Student explained a concept
- `self_explanation` - Student spontaneously explained reasoning
- `correction_response` - Student responded to a correction
- `error_commission` - Student made an identifiable error
- `concept_mention` - Student mentioned a concept (lowest quality)
- `hint_request` - Student asked for help (behavioral signal)
- `self_reported` - Student stated confidence (metacognitive signal)

**Usage:**
```javascript
import { createLearningModule } from './src/learning/index.js';

const learning = createLearningModule(pool);

// Write an observation
await learning.writeObservation({
  wax_id: 'student-uuid',
  session_id: 'session-uuid',
  concept_tag: 'newton_second_law',
  evidence_type: 'direct_response',
  correctness: 0.85,  // 0.0-1.0 scale
  hint_level: 0,      // 0 = no hints, 1+ = hints received
  extraction_confidence: 0.90,
  extraction_method: 'ai_inline',
  possible_misconception: false,
});
```

### 2. Mastery Estimation - RWEA (Stage 29)

**Purpose:** Implement the Recency-Weighted Evidence Accumulator that transforms raw learning observations into calibrated mastery estimates.

**Key Files:**
- `MasteryEngine.js` - Core RWEA computation

**RWEA Algorithm:**
1. Filter valid observations for student/concept
2. Compute observation weights (recency × hint penalty × confidence)
3. Calculate success and failure signals
4. Apply tanh transform to get raw mastery
5. Apply time-since-last-evidence decay
6. Clamp to [0.05, 0.95] range

**Configuration:**
```javascript
// Environment variables (see .env.example)
MASTERY_RECENCY_HALFLIFE_DAYS=30    // Evidence half-life
HINT_PENALTY_COEFFICIENT=0.3         // Hint penalty strength
SENSITIVITY=2.0                       // Response sharpness
MASTERY_BASELINE=0.10                 // Starting mastery
DECAY_LAMBDA=0.015                    // Forgetting rate
```

**Usage:**
```javascript
// Compute mastery for a concept
const state = await learning.updateKnowledgeState(
  'student-uuid',
  'newton_second_law'
);

console.log(state.mastery_estimate);  // 0.71 (71% mastery)
console.log(state.recent_trend);      // 'improving' | 'stable' | 'declining'
console.log(state.hint_dependency);   // 0.15 (15% of attempts needed hints)
```

### 3. Misconception Detection (Stage 30)

**Purpose:** Identify, record, and track systematic errors in student understanding.

**Key Files:**
- `MisconceptionTracker.js` - Tracks misconception lifecycle

**Misconception Lifecycle:**
1. **Suspected** - 1-2 observations suggest a pattern
2. **Confirmed** - 3+ observations with consistent pattern
3. **Resolved** - Student demonstrates correct understanding
4. **Archived** - No longer active

**Usage:**
```javascript
// Record a possible misconception
await learning.misconceptionTracker.recordPossibleMisconception({
  wax_id: 'student-uuid',
  concept_tag: 'newton_second_law',
  observation_id: 'obs-uuid',
  description: 'Student believes force is required for constant velocity',
  detected_by: 'session_summarizer',
});

// Get active misconceptions
const active = await learning.getActiveMisconceptions('student-uuid');
```

### 4. Student Model Context Interface (Stage 34)

**Purpose:** Translate student model data into AI-readable context.

**Key Files:**
- `StudentModelContextInterface.js` - Context generation

**Design Principles:**
1. Evidence, not decisions - communicate raw data, not recommendations
2. Uncertainty is information - include confidence levels
3. Recency is information - include when evidence was observed
4. Token budgeted - respect context budget (default 500 tokens)
5. Prioritized - only show relevant concepts

**Usage:**
```javascript
const context = await learning.contextInterface.getStudentModelContext(
  'student-uuid',
  {
    tokenBudget: 500,
    includeMisconceptions: true,
    includeSignals: true,
  }
);

// Inject into AI prompt
const finalPrompt = `
[Student Learning Model]
${context.formattedText}

[Now continue with tutoring...]
`;
```

## Database Schema

### Tables

1. **concepts** - Registry of learning concepts
2. **learning_observations** - Append-only evidence log
3. **knowledge_states** - Materialized mastery estimates
4. **misconceptions** - Detected systematic errors
5. **learning_signals** - Behavioral aggregates
6. **student_model_snapshots** - Cached context for AI

### Key Relationships

```
students ──┬── learning_observations
           ├── knowledge_states
           ├── misconceptions
           ├── learning_signals
           └── student_model_snapshots
```

All tables enforce student isolation via `wax_id` foreign keys.

## Integration Points

### Session Summarizer

The `SessionEvidenceExtractor` runs after the session summarizer completes:

```javascript
// In sessionSummarizer.js, after summarization:
import SessionEvidenceExtractor from './workers/sessionEvidenceExtractor.js';

const extractor = new SessionEvidenceExtractor(pool, aiService);
const results = await extractor.extractEvidenceFromSession({
  session_id: session.id,
  wax_id: session.wax_id,
  messages: sessionMessages,
  summarizedFacts: summary.extractedFacts,
});

console.log(`Wrote ${results.observationsWritten} observations`);
```

### AI Orchestration

The student model context is injected into AI requests:

```javascript
// In AIOrchestrator.js or context assembler
const context = await learning.contextInterface.getStudentModelContext(
  wax_id,
  { tokenBudget: config.STUDENT_MODEL_TOKEN_BUDGET }
);

const enrichedMessages = [
  { role: 'system', content: systemPrompt },
  { role: 'system', content: `Learning Context: ${context.formattedText}` },
  ...conversationHistory,
];
```

## Testing

### Unit Tests

Tests should verify:
- RWEA computation with known inputs produces correct output
- Evidence from one student never affects another
- Mastery always clamped to [0.05, 0.95]
- Time decay reduces mastery over time

### Integration Tests

Tests should verify:
- Write observation → knowledge state updates
- Misconception promotion from suspected to confirmed
- Context generation respects token budget
- Snapshot invalidation on new evidence

## Privacy and Security

- All learning data is scoped to `wax_id` (student isolation)
- Observations contain no raw response text (only metadata)
- Soft deletion supports NDPA right to erasure
- Misconception descriptions are AI-generated, not hardcoded

## Configuration

All RWEA parameters are configurable via environment variables (see `.env.example`). Default values are research-backed:

- `MASTERY_RECENCY_HALFLIFE_DAYS=30` - Based on Ebbinghaus forgetting curve
- `DECAY_LAMBDA=0.015` - ~46 day half-life
- `HINT_PENALTY_COEFFICIENT=0.3` - Reflects negative correlation between hint use and learning

## Future Enhancements

**FUTURE (not in Phase F):**
- Population-level IRT calibration
- Advanced misconception taxonomy
- Spaced repetition scheduling
- Engagement modeling
- Cross-concept relationship inference

## References

- WAXPREP_TODO.md Sections 27-34
- Corbett & Anderson (1994) - Bayesian Knowledge Tracing
- Scarlatos, Baker & Lan (2025) - LLM-based Knowledge Tracing
- Black & Wiliam (1998) - Formative Assessment
- Ebbinghaus (1885) - Forgetting Curve
