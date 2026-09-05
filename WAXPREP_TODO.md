WAXPREP TODO

This is a living document for current research and implementation work.

## CURRENT RESEARCH

Paste the research or instructions for the current task below:

- 


## AGENT WORKFLOW

When working on WaxPrep, the agent must:

1. Read this document and the other root documents first.
2. Inspect the entire repository and understand the current `main` branch before changing anything.
3. Understand the existing architecture, files, dependencies, and current state before implementing the requested work.
4. Review the research/instructions above and determine exactly what needs to be changed.
5. Before making changes, create a new side branch from the correct current `main` state.
6. Never modify or rename `main` directly.
7. Implement the authorized work on the side branch.
8. Document meaningful changes in the appropriate `docs/` section.
9. Run the relevant tests/checks and review the final diff.
10. Save all completed work and documentation on the side branch.
11. Report exactly what was changed, what was researched, what was implemented, and anything that still needs attention.
12. Tell the founder to review the completed side branch.
13. **Do not merge automatically.**
14. After the founder has reviewed the work, ask for explicit permission before merging the side branch into `main`.



# WAXPREP MASTER BUILD GUIDE




I have the full brief. Let me do targeted research on the most critical technical areas before writing.

I have everything I need. This will be the most important document in the WaxPrep project. Writing it now in full.

---

# WAXPREP — PERSISTENT MEMORY ARCHITECTURE
## STAGES 22–26: THE DEFINITIVE PRODUCTION BLUEPRINT
### Memory Schema · Core Facts · Episodic Learning · Retrieval · Confidence & Provenance
### Principal Research Architect — September 2026

---

# FOUNDATIONAL PRINCIPLE: WHAT MEMORY MEANS FOR WAXPREP

Before any technical discussion, understand what memory means in this system and why it is not what most developers think it is.

The model itself remembers nothing. When WaxPrep sends a message to Claude, Anthropic's server processes that request in total isolation from every previous request ever made. There is no continuity on the provider's side. Every API call is born and dies with zero connection to what came before. This is not a limitation of Claude specifically — it is how all transformer-based LLMs work at the API level.

WaxPrep's memory system is the engineering that creates the illusion of continuity across this technical amnesia. But it is not an illusion designed to deceive. It is infrastructure designed to serve genuine intelligence. The AI does not merely retrieve facts and recite them back. The AI receives evidence, reasons over that evidence with its full intelligence, and produces original understanding. WaxPrep's memory system is the filing cabinet. The AI is the brilliant analyst who reads what is in the cabinet and thinks.

This distinction is the single most important architectural principle of Stages 22–26:

**WaxPrep stores evidence. The AI interprets evidence. Infrastructure does not interpret. AI does not store.**

Every schema design decision, every retrieval algorithm, every confidence rule — all of it flows from this principle. When you are unsure about a design decision, ask: am I replacing AI reasoning with infrastructure logic? If yes, stop and redesign.

The second most important principle: **a student's memory belongs only to that student.** The WaxID isolation established in Stage 12 is absolute. No query, no retrieval, no background job should ever produce memory from Student A when processing Student B's request. This is a hard correctness requirement, not a performance optimization.

---

# PART ONE: THE MEMORY LANDSCAPE IN 2026

## 1. What the Research Actually Shows

The state of agentic memory in mid-2026 is best understood by what the benchmarks reveal. The LoCoMo benchmark — covering single-hop, multi-hop, open-domain, and temporal recall — shows that current systems perform well on single-hop factual recall and poorly on almost everything else. As conversation history grows, performance degrades faster than context grows. Most systems that score well on accuracy require 26,000+ tokens per query — not production viable. A December 2025 benchmark study found that a plain filesystem storing memories as markdown files scored 74% on standard memory tasks — beating dedicated vector databases. [Medium](https://medium.com/@brian-curry-research/the-memory-problem-building-persistent-queryable-memory-for-production-ai-agents-dccb1e293887)

This finding is counterintuitive and important. It tells us that the fundamental value of a memory system is not the storage technology — it is the quality of what is written and the discipline of what is retrieved. A system that writes precise, structured, well-provenanced facts and retrieves them cleanly will outperform a system that stores everything with embeddings and retrieves semantically.

For WaxPrep at Stage 22–26, this means: build the write path with extreme care. Get the memory taxonomy right. Get the confidence model right. Get the provenance model right. The retrieval technology can evolve. The schema design is much harder to change.

The AI agent memory market has reached $6.27 billion in 2026. That growth reflects a hard-earned industry realization: the model is not the product. The memory is. An agent with a frontier-class model but no persistent memory is a genius with amnesia. It might give you a brilliant answer today and then greet you as a stranger tomorrow. [AI Magicx](https://www.aimagicx.com/blog/ai-agent-memory-architecture-developer-guide-2026)

Every practical AI agent problem eventually becomes a memory problem. Context windows now exceed 1 million tokens; persistence across sessions is still zero. An agent that cannot recall the context of a prior conversation cannot serve a user across sessions. [Datapace](https://datapace.ai/blog/ai-agent-memory-layer-architecture-guide-2026)

## 2. The Four Memory Types — Cognitive Architecture Basis

Cognitive science and AI engineering both recognize four distinct memory types. WaxPrep's architecture covers all four, though it implements them at different stages.

**Working Memory (In-Context):** The active conversation currently in the context window. This is Stage 18's domain. Fast, immediate, bounded by the context window. Zero persistence between sessions. WaxPrep already has this.

**Episodic Memory:** Records of specific past experiences. What happened in previous sessions, when, with what outcome. This is the autobiographical record of the student's journey with WaxPrep. Stage 24 builds this.

**Semantic Memory (Core Facts):** Stable facts about the student — their name, their school, the exam they are preparing for, their strengths, their persistent misconceptions. These are general truths distilled from experience rather than raw transcripts of individual events. Stage 23 builds this.

**Procedural Memory:** How to act — instructions, learned strategies, behavioral rules. For WaxPrep, this is the AI's own teaching approach, which is never stored in the memory system. It lives in the system prompt (Stage 17). WaxPrep does not build procedural memory in the student's memory store — the AI's teaching approach is the AI's own intelligence, not something WaxPrep prescribes.

A common mistake is to treat "long-term memory" as a fourth peer alongside episodic and procedural. It is not. It is the umbrella that contains all three. [Ml4devs](https://www.ml4devs.com/what-is/agent-memory/)

Understanding this prevents a category error: "long-term memory" is not a type of memory. Episodic and semantic memories are both long-term. The distinction is what kind of knowledge they hold.

## 3. The Append-Only Architecture — Why It Matters

Research published in late 2025 proposes a unified temporal-semantic-relational schema for agent memory combining time-series context, vector embeddings, and graph-style entity relationships in a single PostgreSQL-backed, append-only database. The append-only constraint matters architecturally: it prevents data decoherence, the failure mode where updating or deleting memories creates inconsistencies between what the agent remembers and what actually happened. [Datapace](https://datapace.ai/blog/ai-agent-memory-layer-architecture-guide-2026)

Append-only is the architectural foundation of WaxPrep's memory system. No memory record is ever updated in place. No memory record is ever hard-deleted. Every change produces a new record that either supersedes or reinforces the existing record. The old record remains permanently, with a status of `superseded` or `archived`.

This is not merely a database design preference. It is a correctness requirement for three reasons:

First, provenance. If a memory is updated in place, the original source is lost. You cannot answer: "When did WaxPrep learn that this student was preparing for WAEC?" or "What evidence supported the belief that this student misunderstood force?"

Second, auditability. The Nigeria Data Protection Act and general educational ethics require that a system dealing with minors can produce a complete audit trail of what information was held about a student and when it was acquired.

Third, AI reasoning quality. A fact confirmed five times and a fact contradicted twice end up looking identical without explicit state tracking — same shape, same weight, same retrieval priority. That is not a storage bug; it is a missing dimension. Append-only storage preserves the history of confidence changes, which enables the AI to reason about the reliability of its own knowledge. [Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)

---

# PART TWO: STAGE 22 — PERSISTENT MEMORY SCHEMA AND STORAGE

## 4. Memory Architecture Comparison

Before designing the schema, understand the available architectural approaches and why WaxPrep should choose the one it does.

### 4.1 Relational Memory (PostgreSQL)

Data is stored in structured tables with defined schemas. Relationships between data are expressed through foreign keys and joins. Queries are expressed in SQL. The schema enforces data integrity through constraints.

Strengths for WaxPrep: ACID guarantees prevent partial writes from corrupting memory state. Foreign key constraints enforce WaxID isolation at the database level. SQL makes complex queries (find all misconceptions for this student about physics, ordered by confidence) straightforward. PostgreSQL is already deployed (Stage 3). No new infrastructure. Mature tooling. The entire infrastructure team (currently one person) already knows the database.

Weaknesses: Schema changes require migrations. Unstructured or variable-structure data is awkward to represent. Semantic similarity search requires the `pgvector` extension.

### 4.2 Document Memory (MongoDB, Firestore)

Data is stored as JSON documents. Schema is flexible — each document can have different fields. Queries are expressed as document filters.

Strengths: Flexible schema accommodates variable-structure memory entries. No migration needed to add new fields.

Weaknesses: No ACID multi-document transactions (MongoDB has limited multi-document transactions; Firestore has limited cross-collection transactions). WaxID isolation enforcement is application-level only. No native SQL. Requires new infrastructure. Harder to express relational queries (find all memories for this student where confidence > 0.7 and category = 'misconception', ordered by recency). No native vector search.

### 4.3 Graph Memory (Neo4j, Graphiti)

Zep/Graphiti ships the temporal-graph substrate (bitemporal validity, episode provenance, contradiction handling) at production scale with a peer-reviewed paper. Bitemporal validity, episode tracing, and contradiction handling are all core graph memory capabilities. [GitHub](https://github.com/hopiumlab/skymem-io)

Data is stored as nodes (entities) and edges (relationships). Queries traverse graph structure. Rich for representing relationships between concepts, students, and knowledge.

Strengths: Natural representation of concept relationships (quadratic equations → algebra → mathematics). Multi-hop reasoning ("the student who struggled with velocity also struggles with momentum"). Temporal knowledge graphs model how facts change over time naturally.

Weaknesses: Requires entirely new infrastructure and expertise. Overkill for WaxPrep's current student memory requirements. Much harder to enforce WaxID isolation. Complex operational overhead. Graph query languages (Cypher) are unfamiliar.

### 4.4 Event Sourcing

Every change is stored as an immutable event. Current state is derived by replaying events. The event log IS the data store.

Strengths: Perfect audit trail. Completely immutable history. Supports time travel (reconstruct what the AI knew about a student on any past date).

Weaknesses: State derivation from event replay is complex and slow at scale. Query patterns that are simple in relational models (give me the current facts about this student) require replaying potentially thousands of events. Adds significant engineering complexity.

### 4.5 Hybrid Memory — The Production-Grade Choice

Most production AI agents follow one of two patterns: a split stack or a unified stack. The key insight: Most architectures use Redis for short-term, Pinecone or Weaviate for semantic, PostgreSQL for episodic and procedural. TiDB can cover all four layers in one system. [PingCAP](https://www.pingcap.com/compare/best-database-for-ai-agents/)

Production-grade agents now consolidate all three memory types using PostgreSQL extensions: hypertables partition conversation history by time, pgvector indexes enable semantic search over embedded knowledge, and standard tables store user preferences with ACID guarantees. One database connection constructs complete context windows spanning episodic, semantic, and procedural memory in a single query. [TigerData](https://www.tigerdata.com/learn/building-ai-agents-with-persistent-memory-a-unified-database-approach)

**RECOMMENDATION: Relational-first using PostgreSQL with forward-compatible columns for future pgvector integration.**

The reasoning is precise. WaxPrep already runs PostgreSQL on Railway (Stage 3). Every memory type WaxPrep needs in Stages 22–26 is well-served by relational tables with structured JSON columns for variable-content fields. The `pgvector` extension is available on all managed PostgreSQL providers (Railway, Supabase, Neon, DigitalOcean) and can be enabled with a single migration command when semantic retrieval is needed in a future stage. This means WaxPrep starts with zero new infrastructure, gains ACID guarantees, and retains the option to add vector search without a database migration redesign — only by adding a nullable `embedding vector(1536)` column to existing tables.

**What this is NOT:** This is not "start with the wrong architecture and migrate later." PostgreSQL with `pgvector` is the production-standard database for AI memory systems in 2026. pgvector handles millions of vectors well. pgvector is an open-source PostgreSQL extension that adds the ability to store, index and search vector embeddings — turning PostgreSQL into a vector database, eliminating the need for a separate vector database for most AI use cases like semantic search, RAG, and recommendations. WaxPrep starts with the right database. It starts with less of its features than it will eventually use. [Databricks](https://www.databricks.com/blog/what-is-pgvector)

## 5. The Master Memory Schema

The following schema is the complete database foundation for Stages 22–26. Every subsequent section references this foundation. Read it carefully.

### 5.1 The Core Memory Taxonomy Table

```sql
-- Migration: 005_memory_foundation.sql

-- Enable pgvector for future semantic search
-- Run this ONCE before the memory tables:
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- STUDENT CORE FACTS (Stage 23)
-- Durable profile facts that the AI knows about the student.
-- One "active" record per (wax_id, fact_key) at any time.
-- All superseded versions remain for audit and provenance.
-- ============================================================
CREATE TABLE student_facts (
  -- Primary identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  
  -- Fact taxonomy
  fact_key TEXT NOT NULL,        -- e.g. 'exam_target', 'school_name', 'class_level'
  fact_category TEXT NOT NULL,   -- e.g. 'profile', 'academic', 'preference', 'misconception'
  fact_value JSONB NOT NULL,     -- Flexible: "WAEC" or {"subjects":["Math","Physics"]}
  
  -- Human-readable form (for context injection)
  display_text TEXT NOT NULL,    -- e.g. "Student is preparing for WAEC in 2027"
  
  -- Provenance
  provenance TEXT NOT NULL,      -- See Section 21 for full taxonomy
  source_session_id UUID REFERENCES sessions(id),
  source_message_id UUID REFERENCES messages(id),
  source_ai_request_id UUID REFERENCES ai_requests(id),
  
  -- Confidence
  confidence NUMERIC(4,3) NOT NULL DEFAULT 0.500,  -- 0.000 to 1.000
  evidence_count INTEGER NOT NULL DEFAULT 1,
  contradicted_count INTEGER NOT NULL DEFAULT 0,
  
  -- Lifecycle status
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'superseded', 'archived', 'flagged')),
  superseded_by UUID REFERENCES student_facts(id),  -- Points to newer version
  superseded_at TIMESTAMPTZ,
  
  -- Temporal validity (when this fact was/is true)
  valid_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- When this fact became true
  valid_until TIMESTAMPTZ,                          -- NULL = still true now
  
  -- Soft deletion (never hard delete)
  deleted_at TIMESTAMPTZ,
  deletion_reason TEXT,
  
  -- Future semantic search (nullable until embeddings are added)
  embedding vector(1536),        -- Populated in future embedding stage
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- EPISODIC MEMORY (Stage 24)
-- Summaries of past sessions. The AI's long-term memory
-- of what happened, when, and with what educational outcome.
-- ============================================================
CREATE TABLE student_episodes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  session_id UUID NOT NULL REFERENCES sessions(id),
  
  -- Episode content (AI-generated summary of the session)
  summary_text TEXT NOT NULL,           -- Natural language summary for context injection
  
  -- Structured metadata (extracted from summary, AI-generated)
  topics JSONB NOT NULL DEFAULT '[]',   -- Array of topic strings
  subjects JSONB NOT NULL DEFAULT '[]', -- Array of subject strings (Math, Physics, etc.)
  breakthroughs JSONB DEFAULT '[]',     -- Array of things the student understood
  confusions JSONB DEFAULT '[]',        -- Array of things that remained unclear
  questions_asked INTEGER DEFAULT 0,    -- How many questions the student asked
  student_mood TEXT,                    -- 'engaged', 'frustrated', 'confident', 'uncertain'
  
  -- Temporal context
  session_start TIMESTAMPTZ NOT NULL,
  session_end TIMESTAMPTZ NOT NULL,
  session_duration_minutes INTEGER NOT NULL,
  turn_count INTEGER NOT NULL,
  
  -- Summary generation metadata
  summary_generated_by TEXT NOT NULL,  -- Which AI provider generated the summary
  summary_model TEXT NOT NULL,         -- Which model
  summary_prompt_version TEXT NOT NULL, -- Which prompt version
  summary_generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Quality tracking
  summary_status TEXT NOT NULL DEFAULT 'complete'
    CHECK (summary_status IN ('complete', 'failed', 'partial', 'skipped')),
  summary_error TEXT,                  -- If summary_status = 'failed'
  
  -- Future semantic search
  embedding vector(1536),             -- Summary embedding for semantic retrieval
  
  -- Lifecycle
  archived_at TIMESTAMPTZ,            -- When moved to cold storage (future)
  deleted_at TIMESTAMPTZ,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEMORY RETRIEVAL LOG (Stage 25)
-- Observability: every time memory is retrieved for a student,
-- log what was retrieved, why, and whether it was useful.
-- ============================================================
CREATE TABLE memory_retrieval_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  ai_request_id UUID REFERENCES ai_requests(id),
  session_id UUID REFERENCES sessions(id),
  
  -- What was retrieved
  facts_retrieved INTEGER NOT NULL DEFAULT 0,
  episodes_retrieved INTEGER NOT NULL DEFAULT 0,
  total_memory_tokens_estimated INTEGER NOT NULL DEFAULT 0,
  
  -- Retrieval metadata
  retrieval_strategy TEXT NOT NULL,    -- 'recency', 'hybrid', 'semantic'
  retrieval_latency_ms INTEGER NOT NULL,
  
  -- Deduplication metrics
  facts_deduplicated INTEGER DEFAULT 0,  -- Facts excluded as duplicates
  
  -- Future: outcome tracking (was the memory useful?)
  marked_useful BOOLEAN,               -- Set by future evaluation stage
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MEMORY CONTRADICTION LOG (Stage 26)
-- When two facts conflict, record the conflict explicitly.
-- Let the AI reason about contradictions — do not resolve automatically.
-- ============================================================
CREATE TABLE memory_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  
  -- The conflicting facts
  fact_a_id UUID NOT NULL REFERENCES student_facts(id),
  fact_b_id UUID NOT NULL REFERENCES student_facts(id),
  
  -- Contradiction details
  conflict_type TEXT NOT NULL,         -- 'value_conflict', 'temporal_conflict', 'logical_conflict'
  conflict_description TEXT NOT NULL,  -- Human-readable description of the conflict
  fact_key TEXT NOT NULL,              -- Which fact_key the conflict is about
  
  -- Resolution status
  status TEXT NOT NULL DEFAULT 'unresolved'
    CHECK (status IN ('unresolved', 'resolved_by_supersession', 'resolved_by_ai', 'acknowledged')),
  resolved_at TIMESTAMPTZ,
  resolution_notes TEXT,
  
  -- Detection metadata
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  detected_by TEXT NOT NULL,           -- 'write_trigger', 'background_job', 'ai_flagged'
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONFIDENCE HISTORY (Stage 26)
-- Append-only record of every confidence change for every fact.
-- Never lose the history of why confidence changed.
-- ============================================================
CREATE TABLE memory_confidence_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fact_id UUID NOT NULL REFERENCES student_facts(id),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE RESTRICT,
  
  -- The change
  previous_confidence NUMERIC(4,3) NOT NULL,
  new_confidence NUMERIC(4,3) NOT NULL,
  delta NUMERIC(4,3) NOT NULL,          -- new - previous (positive = increase)
  
  -- Reason
  change_reason TEXT NOT NULL,          -- See Section 21: REINFORCE, CONTRADICT, SUPERSEDE, DECAY, CONFIRM
  change_evidence TEXT,                 -- Description of what caused the change
  
  -- Source
  triggered_by_session_id UUID REFERENCES sessions(id),
  triggered_by_ai_request_id UUID REFERENCES ai_requests(id),
  triggered_by_job TEXT,               -- Background job name if not from a request
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES (Critical for production performance)
-- Every column in a WHERE clause needs an index.
-- ============================================================

-- student_facts indexes
CREATE INDEX idx_facts_wax_id_status ON student_facts(wax_id, status);
CREATE INDEX idx_facts_wax_id_category ON student_facts(wax_id, fact_category, status);
CREATE INDEX idx_facts_wax_id_key ON student_facts(wax_id, fact_key, status);
CREATE INDEX idx_facts_wax_id_recency ON student_facts(wax_id, created_at DESC) WHERE status = 'active';
CREATE INDEX idx_facts_confidence ON student_facts(wax_id, confidence DESC) WHERE status = 'active';
CREATE INDEX idx_facts_superseded_by ON student_facts(superseded_by) WHERE superseded_by IS NOT NULL;
-- Future vector index (add when embeddings are populated):
-- CREATE INDEX idx_facts_embedding ON student_facts USING hnsw (embedding vector_cosine_ops)
--   WHERE embedding IS NOT NULL;

-- student_episodes indexes  
CREATE INDEX idx_episodes_wax_id_recency ON student_episodes(wax_id, session_end DESC);
CREATE INDEX idx_episodes_wax_id_subjects ON student_episodes USING gin(subjects);
CREATE INDEX idx_episodes_wax_id_topics ON student_episodes USING gin(topics);
CREATE INDEX idx_episodes_session_id ON student_episodes(session_id);
-- Future vector index:
-- CREATE INDEX idx_episodes_embedding ON student_episodes USING hnsw (embedding vector_cosine_ops)
--   WHERE embedding IS NOT NULL;

-- contradiction indexes
CREATE INDEX idx_contradictions_wax_id ON memory_contradictions(wax_id, status);
CREATE INDEX idx_contradictions_fact_a ON memory_contradictions(fact_a_id);
CREATE INDEX idx_contradictions_fact_b ON memory_contradictions(fact_b_id);

-- confidence history indexes
CREATE INDEX idx_confidence_history_fact ON memory_confidence_history(fact_id, created_at DESC);
CREATE INDEX idx_confidence_history_wax ON memory_confidence_history(wax_id, created_at DESC);

-- retrieval log indexes
CREATE INDEX idx_retrieval_log_wax ON memory_retrieval_log(wax_id, created_at DESC);
CREATE INDEX idx_retrieval_log_request ON memory_retrieval_log(ai_request_id);
```

## 6. The Memory Taxonomy — Complete Category Reference

The memory taxonomy defines what categories of information WaxPrep stores about students. This is the most important design decision in the entire memory architecture. Get it wrong and the AI receives garbage. Get it right and the AI receives a coherent picture of who the student is.

### 6.1 Profile Facts (`fact_category = 'profile'`)

Durable biographical facts about the student.

**Fact keys and their semantics:**
- `exam_target`: Which examination the student is preparing for. Values: `WAEC`, `NECO`, `JAMB`, `BECE`, or combinations.
- `exam_year`: When the student plans to sit the exam. Value: year integer.
- `class_level`: Current school year. Values: `JSS1`, `JSS2`, `JSS3`, `SS1`, `SS2`, `SS3`.
- `preferred_name`: What the student likes to be called. Important for dignity and rapport.
- `school_type`: Federal Government College, State secondary, private — affects context.
- `language_preference`: Preferred communication style (not language — always English — but formality level, slang tolerance, etc.).

**Characteristics:** High stability. Low change frequency. High confidence after one direct statement. Never derived from inference in Stage 23 — always stated by the student or confirmed explicitly.

### 6.2 Academic Facts (`fact_category = 'academic'`)

Facts about the student's academic engagement and performance.

**Fact keys:**
- `strong_subjects`: Subjects the student demonstrates consistent strength in.
- `weak_subjects`: Subjects where the student consistently struggles.
- `study_schedule`: When the student typically studies (morning person, late night, weekends).
- `exam_subjects`: Which specific subjects the student is taking in their target exam.
- `preferred_explanation_style`: Whether the student responds better to step-by-step or conceptual explanations.

**Characteristics:** Medium stability. Requires multiple observations before high confidence. Can change as the student improves or encounters new difficulties.

### 6.3 Misconceptions (`fact_category = 'misconception'`)

This is one of the most educationally valuable categories. A misconception is a specific incorrect understanding that the student holds about a concept.

**Fact keys:**
- `misconception`: Each individual misconception is a separate fact record.
- `fact_value` contains: `{ concept: "Newton's Third Law", error: "Student believes larger objects exert more force on smaller ones", subject: "Physics", detected_turn: 42 }`

**Characteristics:** Created when the AI observes clear incorrect reasoning in a student's response. Should have lower initial confidence (needs multiple observations to confirm it is a stable misconception and not a one-time slip). Superseded when the student demonstrates correct understanding. This category must never be created from a single ambiguous statement — it requires clear evidence of incorrect conceptual understanding.

**The educational importance:** If WaxPrep knows a student has a persistent misconception about Newton's Third Law, every future physics session can factor this in. The AI can proactively address it, check for it, and celebrate when the student overcomes it. Without this category, WaxPrep treats every session as though the student has no history.

### 6.4 Preferences (`fact_category = 'preference'`)

How the student prefers to interact with WaxPrep specifically.

**Fact keys:**
- `explanation_depth`: Does the student prefer brief answers or detailed walkthroughs?
- `example_type`: Real-world examples, abstract examples, past exam-style examples?
- `feedback_style`: Direct correction or Socratic guidance?
- `session_pace`: Does the student engage in rapid-fire questions or take time to reflect?
- `topic_interest`: Topics the student finds particularly interesting (beyond curriculum).

**Characteristics:** Derived from behavioral observation over multiple sessions. Medium stability. More reliable with more evidence. The AI uses these to calibrate its teaching approach, but never as rigid rules — always as contextual guidance.

### 6.5 Learning Progress (`fact_category = 'progress'`)

Evidence of conceptual mastery or ongoing difficulty.

**Fact keys:**
- `mastered_concept`: A concept the student has demonstrably understood.
- `struggling_concept`: A concept the student has consistently had difficulty with across multiple sessions.
- `breakthrough`: A significant learning moment — something that clicked after being stuck.

**Characteristics:** Created from episodic memory consolidation (background job). High educational value. Lower initial confidence (one session's apparent mastery may not transfer to the next). Confidence increases as mastery is demonstrated consistently.

### 6.6 Session Behavioral Facts (`fact_category = 'behavioral'`)

Patterns in how the student behaves across sessions.

**Fact keys:**
- `typical_session_time`: When the student most often uses WaxPrep.
- `session_length_pattern`: Typical session duration (short bursts vs long study sessions).
- `engagement_pattern`: Engagement level trends (increasing, decreasing, stable).
- `response_time_pattern`: How quickly the student typically replies.

**Characteristics:** Derived entirely from system-observable data, not from AI inference or student statements. Low individual certainty, high aggregate certainty.

### 6.7 Future-Compatible Categories (Not Implemented, Architecture Ready)

The schema supports additional categories without modification:

- `assessment_result`: When WaxPrep adds assessment tools — scores, performance data.
- `parent_note`: When parent involvement features are added.
- `teacher_note`: When teacher collaboration features are added.
- `curriculum_alignment`: Which specific curriculum objectives the student has covered.
- `learning_gap`: Identified gaps in prerequisite knowledge.
- `emotional_state_pattern`: Long-term emotional engagement patterns (not transient mood).

## 7. The CRUD Architecture — Complete Operations

### 7.1 CREATE: Writing a New Memory

When the AI or a background process identifies a new fact about a student, the write operation must:

1. Check if a fact with this `(wax_id, fact_key, status='active')` already exists.
2. If NO existing active fact: insert a new record with `status='active'`.
3. If YES existing active fact: evaluate whether this new observation reinforces or contradicts the existing fact.
   - If it reinforces (same value): call the REINFORCE operation (Section 27.3).
   - If it contradicts (different value): call the SUPERSEDE or CONTRADICT operation depending on whether the new value clearly replaces the old one or creates a genuine conflict.

The write must always be wrapped in a database transaction to ensure atomicity. A fact that is written but whose confidence history entry fails to write creates an inconsistent state.

### 7.2 RETRIEVE: Reading Memory for Context Injection

The retrieve operation is the critical path for every AI call. It must be fast (under 20ms), accurate (return only this student's facts), and bounded (respect the token budget). Full specification in Stage 25 (Section 17).

### 7.3 REINFORCE: Increasing Confidence

When a new observation matches an existing active fact, the existing fact's confidence is increased. The old record is updated in place for the confidence field only (this is the one exception to append-only — confidence is a living metric, not a historical record). The confidence history table records the change.

**Confidence increase rules:** See Stage 26 (Section 22) for the complete confidence state machine.

### 7.4 SUPERSEDE: Replacing a Fact

When a new observation clearly replaces an old fact (the student changed schools, updated their exam target, corrected a previous statement), the supersession operation:

1. Sets the existing active fact's `status = 'superseded'`, `superseded_at = NOW()`, `valid_until = NOW()`.
2. Creates a NEW fact record with `status = 'active'`, `valid_from = NOW()`, `superseded_by = NULL`.
3. Sets the old record's `superseded_by = new_record.id`.
4. Records a confidence history entry for the old record (final confidence at time of supersession).

**Critical:** The old record is NEVER deleted. It is NEVER updated beyond setting its status and superseded_by pointer. It remains permanently available for audit and for understanding the history of the AI's beliefs about this student.

### 7.5 ARCHIVE: Reducing Context Load

Facts that have not been relevant for a long time (configurable: default 90 days of zero retrieval) can be archived. Archiving sets `status = 'archived'`. Archived facts are not included in standard context retrieval but remain permanently available for direct query.

Archiving is performed by a background consolidation job (Section 31). It is not performed inline during request processing.

### 7.6 DELETE (Soft Delete Only)

Hard deletion is never performed in the memory system except under regulatory deletion rights (NDPA Section 25, right to erasure). Even then, the preference is to set `status = 'deleted'` and `deleted_at = NOW()` rather than removing rows, unless the regulation explicitly requires data destruction.

When soft deleting: cascade the soft delete to all related confidence history records, all related contradiction records, and update any `superseded_by` pointers that referenced the deleted fact.

When hard deletion is legally required: remove the rows, remove associated indexes, and record the deletion in a separate compliance audit log (structure: `compliance_deletions` table with the wax_id, the categories deleted, the legal basis, the timestamp, and the operator who authorized it).

## 8. Student Isolation Architecture

This section specifies how WaxID isolation is enforced at every layer of the memory system. Isolation is not merely a query filter. It is a multi-layer guarantee.

### 8.1 Database Layer — Foreign Key Constraints

Every memory table has `wax_id UUID NOT NULL REFERENCES students(id)`. This means the database itself rejects any attempt to write a memory record without a valid WaxID. The reference to the `students` table means a memory record cannot be created for a WaxID that does not exist.

### 8.2 Application Layer — StudentMemoryAccess Class

A dedicated `StudentMemoryAccess` class (extending the pattern established by `StudentDataAccess` in Stage 12) wraps all memory operations. Every method on this class requires `waxId` at construction time and includes it in every query.

No code outside of `StudentMemoryAccess` should write or read from the memory tables directly. Every query goes through this class.

### 8.3 Context Injection Layer — Assertion Before Use

In the context assembler (Stage 18), before memory is injected into the context, assert that every retrieved memory record has `wax_id = currentWaxId`. This is a runtime defensive check, not a substitute for the database-level guarantee.

### 8.4 Audit Trail

Every retrieval is logged in `memory_retrieval_log` with the `wax_id` and the `ai_request_id`. If a cross-student contamination occurred (which the architecture prevents, but defense-in-depth requires logging), it would be detectable through this log.

## 9. Future Semantic Memory — Design Compatibility

The schema already includes the `embedding vector(1536)` column on both `student_facts` and `student_episodes`. This is intentional and important.

pgvector introduces a dedicated data type for storing dense vector data, allowing for efficient management of embeddings and other high-dimensional data directly within PostgreSQL tables. It supports various distance metrics for calculating vector similarity, including L2 (Euclidean) distance, inner product, and cosine distance. [Instaclustr](https://www.instaclustr.com/education/vector-database/pgvector-key-features-tutorial-and-pros-and-cons-2026-guide/)

When the future semantic retrieval stage is implemented:
1. Enable `pgvector` extension via a one-line migration (the `CREATE EXTENSION IF NOT EXISTS vector` is already in the Stage 22 migration above — it is a no-op if called again).
2. Generate embeddings for existing `student_facts` and `student_episodes` rows using an embedding model.
3. Populate the `embedding` column.
4. Create an HNSW index on the column.
5. Update the retrieval layer to support semantic similarity search.

This is a purely additive change. No existing columns change. No existing queries break. The `embedding` column is nullable — all queries that do not use embeddings ignore it completely.

---

# PART THREE: STAGE 23 — CORE MEMORY (PROFILE FACTS)

## 10. What Core Memory Is and Is Not

Core memory is the AI's knowledge of WHO the student is — stable, durable facts that do not need to be re-derived every session. A student should not need to tell WaxPrep they are preparing for WAEC every single time they open WhatsApp. WaxPrep should remember. The student should feel known.

Core memory is NOT a form. It is NOT an intake questionnaire. It is NOT fields the student fills in before using the tutor. Core memory emerges from conversation. The student mentions they are "doing my SS2" in passing — that is a core memory fact (`class_level: SS2`). The student asks about WAEC Biology — that implies `exam_target: WAEC` and possibly `exam_subjects: [Biology]`. The AI extracts these facts from natural conversation and stores them without the student feeling like they are being interrogated.

This extraction is performed by the AI itself, as a background tool call or a post-processing analysis. The infrastructure stores what the AI extracts. The AI decides what is worth extracting. Infrastructure does not decide.

## 11. Structured Fact Storage — Architecture Decision

The `fact_value` column uses `JSONB` (structured JSON within PostgreSQL). This is the correct choice among the available options.

**Key-value pairs** (simple `TEXT key, TEXT value`): Too rigid for complex values like `exam_subjects: ["Math", "Physics", "Chemistry"]`. Inadequate for structured evidence.

**Entity-Attribute-Value (EAV) tables** (three-column design, common in medical systems): Flexible but produces N-column data in an N×3 table shape, making complex queries painful. ORM frameworks hate EAV tables. Not recommended.

**Typed schemas** (separate columns for every possible fact): Requires a migration every time a new fact type is added. Pre-defines the set of things WaxPrep can know about a student. Inflexible.

**Pure JSON documents**: Loses the ability to query individual fact categories efficiently. Loses column-level validation. Harder to enforce the WaxID isolation invariant.

**JSONB hybrid (recommended):** The `fact_key` and `fact_category` are typed TEXT columns with query-optimized indexes. The `fact_value` is JSONB for flexibility. The `display_text` is a pre-computed human-readable string for context injection (avoiding expensive JSONB serialization at retrieval time). This gives WaxPrep typed, indexed, queryable categories with flexible value structures.

## 12. The First-Impression Problem

The most important architectural decision in Stage 23 is how to handle the very first time WaxPrep learns something about a student from a single statement.

A student says: "I'm preparing for WAEC next year." This is extremely clear. WaxPrep should write `exam_target: WAEC` with high confidence.

A student says: "I've been struggling with physics lately." This is much less specific. WaxPrep might infer `weak_subjects: [Physics]` but with lower confidence and only after verifying the topic continues across the session.

A student says: "Can you explain force?" This tells WaxPrep almost nothing durable. A student might ask about force because they are curious, not because physics is their weak subject.

**RECOMMENDATION: Confidence-gated writes.** The AI should only write a core memory fact when it has sufficient evidence within the session or the statement is sufficiently explicit. The confidence at write time reflects the strength of the initial evidence.

**Confidence at write time guidelines:**
- Explicit direct statement by student ("I'm in SS2", "I'm doing WAEC"): write at `confidence = 0.85`
- Strong contextual implication across multiple turns in the session: write at `confidence = 0.60`
- Single weak implication: do NOT write. Wait for corroboration in a future session.

This prevents the memory system from filling up with low-quality, barely-supported facts that the AI will then rely on in ways that create a confused or incorrect picture of the student.

## 13. Confidence Calibration — The Complete Model

Confidence is a numeric value from 0.000 to 1.000. It is NOT a probability in the strict statistical sense. It is a signal to the AI about how much weight to give this piece of information when reasoning.

**Scale interpretation:**
- `0.000 – 0.299`: Weak evidence. Barely supported. The AI should treat this with considerable skepticism and look for corroboration before acting on it.
- `0.300 – 0.499`: Moderate evidence. Some support. The AI should acknowledge uncertainty: "Based on what you've shared, it seems you might be preparing for WAEC — is that right?"
- `0.500 – 0.699`: Reasonable confidence. Supported by multiple consistent observations. The AI can use this without explicit hedging in most cases.
- `0.700 – 0.849`: High confidence. Well-supported by multiple direct statements or consistent behavioral evidence.
- `0.850 – 1.000`: Very high confidence. Explicitly confirmed by the student, or confirmed across many sessions. The AI can use this as established fact.

**Why NOT a 1-10 integer scale?** Integer scales create perverse incentives for rounding. A decimal between 0 and 1 maps naturally to the linguistic qualifiers AI systems use ("likely," "probably," "almost certainly"). It also makes gradual confidence changes natural — adding 0.05 to a confidence value feels meaningfully different from adding 0.5 to a 1-10 scale.

**Why NOT binary (known/unknown)?** Binary removes all nuance. The AI cannot distinguish between "the student mentioned this once in passing" and "the student has confirmed this five times across five different sessions." Both are "known" in a binary system. The difference is enormous for reasoning quality.

## 14. The Contradiction Problem — Belief Revision

When the AI writes a new fact that conflicts with an existing active fact, it must decide whether to supersede the old fact or flag a contradiction. This is not a trivial decision and it must never be made automatically without evidence.

**Case 1: Clear temporal update.** Student said "I'm in SS1" in March. Now in September, student says "I'm in SS2." This is not a contradiction — it is temporal progression. Create a supersession: mark the SS1 record as superseded, write SS2 as the new active record, set `valid_until = NOW()` on the old record.

**Case 2: Clear correction.** Student said "I'm at Government College Lagos." Now student says "Wait, sorry, I meant Government College Ibadan." This is a correction. Supersession applies. Note the `provenance` on the old record was `student_stated_initial` and the new one is `student_corrected`.

**Case 3: Genuine contradiction.** Student said "I hate mathematics" in session 3. In session 17, student says "I actually enjoy math, it's just the JAMB style questions I find hard." These are not contradictory — they are nuanced positions that coexist. But a simple system would see both and be confused. Here, the original fact should be superseded with a more refined version, and the contradiction log should note the evolution of the student's expressed relationship with mathematics.

**Case 4: Hard logical conflict.** Student's `exam_target` is recorded as `WAEC` with confidence 0.80. Student now says "I'm sitting NECO." These are two different exams. Did the student switch exams? Are they sitting both? This is a genuine ambiguity. Write a contradiction record. Do NOT automatically supersede. Allow the AI to naturally clarify in the next interaction. The AI's system context will include the contradiction: "Note: there is a conflict in my memory about this student's exam target — I should ask to clarify."

**The rule:** Infrastructure detects and records contradictions. The AI resolves them through conversation. Infrastructure never resolves contradictions silently.

Old fact closed: if the new observation clearly replaces the old fact, that is not a confidence problem anymore; it is a supersession. The old fact gets marked as no longer current, does not get deleted, and is not left to compete with the new one on equal footing. [Mem0](https://mem0.ai/blog/ai-memory-confidence-score-what-it-is-and-how-it-works)

## 15. Context Injection — How Many Facts Enter the Context

Not all stored facts belong in every context. Injecting all facts for every request is wasteful (token cost), potentially confusing (irrelevant information distracts the AI), and puts the AI in the position of having to reason about facts that have no bearing on the current question.

**Token budget for core memory facts:** 400 tokens maximum by default (configurable: `MEMORY_FACTS_TOKEN_BUDGET`). This accommodates approximately 6-8 well-stated facts.

**Fact selection priority:**
1. Include ALL facts in `fact_category = 'profile'` with `confidence >= 0.70` and `status = 'active'`. These are the most durable and universally relevant.
2. Include facts in `fact_category = 'misconception'` and `fact_category = 'progress'` with `confidence >= 0.60` and `status = 'active'`, ordered by `created_at DESC` (most recent first).
3. Include facts in `fact_category = 'preference'` with `confidence >= 0.65` and `status = 'active'`.
4. Stop when token budget is reached. Do not exceed the budget by including a "nearly full budget" fact.

**Deduplication:** If a retrieved fact is already visible in the current session's conversation history (the student just mentioned it this session), skip it. Do not repeat information the AI already has in working memory.

**Format for injection:** Use the `display_text` column, not the raw `fact_value` JSON. The `display_text` is pre-formatted for natural language context injection.

Example context injection block:
```
[Student Profile Memory — use this to personalize responses]
• Preparing for WAEC in 2027 (high confidence)
• Currently in SS2 at a Lagos state secondary school (high confidence)
• Studying Physics, Mathematics, Chemistry, English for WAEC (high confidence)
• Has shown recurring confusion about Newton's Third Law (moderate confidence — check for this)
• Responds well to step-by-step numerical examples rather than conceptual explanations (moderate confidence)
```

This block is approximately 85 tokens. It gives the AI everything it needs to understand who it is talking to without overwhelming the context window.

## 16. Hidden Architectural Concerns

### 16.1 Identity Stability — The Name Problem

Students may give different names across sessions. "Tunde" in one session, "Babatunde" in another, "TB" in another. All are the same person. The AI should use whatever name the student prefers in the current session. The memory system should store the name as stated, with the most-recently-stated name as the `active` record and older versions superseded.

WaxPrep should NEVER ask "What is your real name?" Memory of name should emerge from how the student introduces themselves or refers to themselves in conversation.

### 16.2 Exam Target Changes

Students change exam targets. A student might have been preparing for WAEC, then decide to focus on JAMB for university entry as SS3 approaches. The memory system handles this through supersession. But there is a subtle issue: subjects overlap between exams. If the student was studying `[Math, Physics, Chemistry]` for WAEC and switches to JAMB (which typically uses the same subjects), the `exam_subjects` fact may not need supersession — only the `exam_target` does. The AI should recognize this nuance naturally if the memory is structured correctly.

### 16.3 School Changes

Students in Nigeria sometimes change schools — particularly after JSS3 (when many move from junior to senior secondary, sometimes at a new school). The school name fact should be superseded when the student reports a change. But WaxPrep should never ask "Are you still at the same school?" — this is obtrusively surveillance-like. Let the student mention it naturally.

### 16.4 The Multiple Exam Problem

Some Nigerian students sit for both WAEC and NECO (they have the same timing window). The `exam_target` fact value should be an array: `["WAEC", "NECO"]` rather than a single string. The schema (using JSONB) accommodates this naturally.

---

# PART FOUR: STAGE 24 — EPISODIC MEMORY

## 17. What Episodic Memory Is — Cognitive Architecture Basis

Episodic memory is the autobiographical record of the student's journey with WaxPrep. It answers the question "what happened?" rather than "what is true?" A core fact says "this student struggles with Newton's Third Law." An episodic memory says "on the 14th of August, the student and WaxPrep worked through Newton's Third Law for 25 minutes. The student initially confused action-reaction pairs but had a breakthrough when the doorbell example was used. The session ended with the student correctly solving two problems independently."

The five properties that episodic memory must have, per the 2025 position paper "Episodic Memory is the Missing Piece for Long-Term LLM Agents," are: long-term storage (persistence beyond the session), explicit reasoning (the ability to reflect on memory content), single-shot learning (capturing information from single exposures without gradient updates), instance-specific memories (details unique to this occurrence), and contextual memories (who, when, where, why, bound to the content). [Atlan](https://atlan.com/know/episodic-memory-ai-agents/)

For WaxPrep specifically, episodic memory serves three educational functions:

First, continuity. When a student returns after a week away, the AI can see what was covered, what was achieved, and what was left unresolved. It greets the student with genuine context: "Last week you were working on Newton's Third Law — should we continue or try something different today?"

Second, pattern detection. Multiple episodes about physics struggles create a pattern. Multiple episodes about productive mathematics sessions create a different pattern. The AI reasons about these patterns without needing WaxPrep to compute them explicitly.

Third, learning trajectory. The sequence of episodes over months creates the student's learning trajectory. The AI can see growth: early episodes full of confusion in algebra, middle episodes showing mastery, later episodes moving to more advanced topics. This trajectory informs how the AI calibrates its expectations and encouragement.

## 18. Summary Strategies — The Critical Trade-off

There are three approaches to summarizing episodic content. The choice determines the quality of the AI's long-term memory.

### 18.1 End-of-Session Summaries

One summary is generated when a session closes (triggered by inactivity timeout or explicit goodbye). The summary covers the entire session.

Strengths: Clean boundary — one summary per session. Easy to implement. Predictable timing. The summary is generated once and stored permanently.

Weaknesses: If a session is very long (multiple topics covered), one summary may not capture all relevant detail within the token budget.

### 18.2 Rolling Summaries

A summary is updated incrementally as the session progresses — every N turns, a new "rolling" summary is generated that incorporates the previous summary plus the new turns.

Strengths: Captures long session content without losing early session detail. Always up-to-date even if the session never formally closes.

Weaknesses: Multiple AI calls per session for summary updates (cost). Summary quality depends on the quality of incremental updates, which can drift over many updates. More complex implementation.

### 18.3 Hierarchical Summaries

Multiple levels of summaries: turn-level notes, session-level summaries, week-level meta-summaries, month-level trajectories.

Strengths: Rich, multi-scale representation of learning history. Excellent for long-term pattern detection.

Weaknesses: High complexity. Multiple AI calls at multiple levels. Requires sophisticated retrieval to decide which level to use when. Over-engineering for Stage 24.

**RECOMMENDATION: End-of-Session Summaries for Stage 24.**

Write-on-summary waits for session end or a token threshold, then consolidates once. Everything downstream depends on the write path, and the write path is a policy, not a dump. [Substack](https://bhavishyapandit9.substack.com/p/ai-agent-memory)

The end-of-session approach is the correct starting point. It is clean, predictable, well-defined, and adequate for WaxPrep's session volumes at launch. Rolling summaries can be added later if multi-topic sessions create information loss. Hierarchical summaries can be added when the volume of episodic records makes individual session recall insufficient.

The summary generation must happen asynchronously in a background worker — never in the main request processing path.

## 19. Session Closure Detection — When Summaries Are Generated

Session closure is already handled by Stage 13's inactivity timeout (`SESSION_INACTIVITY_TIMEOUT_MS`). The challenge is triggering summary generation at the right moment.

**The Options:**

**Option A: Trigger on inactivity timeout detection.** When a new request arrives for a student and the session resolver detects that the PREVIOUS session has timed out (inactive for 30+ minutes), queue a summary generation job for the previous session before creating the new session.

**Option B: Dedicated background scheduler.** A cron-based BullMQ repeatable job runs every 15 minutes, queries for sessions where `last_activity_at < NOW() - INTERVAL '35 minutes'` and `status = 'active'` and no episode exists for the session yet, and queues summary generation for each found session.

**Option C: On explicit goodbye detection.** When the AI detects the student is saying goodbye (future tool call capability), trigger summary generation immediately.

**RECOMMENDATION: Option B — Background Scheduler as Primary, Option A as Supplement.**

The most common production pattern is consolidation in background daemons increasingly preferred over on-request consolidation to avoid latency spikes. [Atlan](https://atlan.com/know/episodic-memory-ai-agents/)

Option B has these advantages: it operates independently of student activity, handles sessions that end without any new student contact, processes sessions at a predictable time after they close (approximately 35–50 minutes after inactivity), and can be monitored as an independent operational system.

Option A as supplement: if a student starts a new session, the previous session's summary job should be queued immediately (before the new session processes) to ensure continuity. The background scheduler serves as the safety net.

**The BullMQ job configuration for session summarization:**
- Queue name: `memory-consolidation`
- Job name: `summarize-session`
- Priority: LOWER than AI tutor jobs (student interactions always take priority)
- Retry: 3 attempts with exponential backoff
- Timeout: 60 seconds (AI summarization can be slow)
- Deduplication: jobId = `summarize-session:${sessionId}` (prevents duplicate summaries for the same session)

## 20. The Summarization Prompt — What the AI Extracts

The summary is generated by calling the AI provider with the full session conversation and a specific summarization task. This is a separate AI call from the tutoring call — it has a different purpose and a different prompt.

**The summarization prompt instructs the AI to produce a structured JSON response containing:**
- `summary_text`: A natural language paragraph (3-5 sentences) describing what happened in the session, what was covered, and what the outcome was. This is the text injected into future contexts.
- `topics`: Array of specific topics discussed (e.g., `["Newton's Third Law", "Force diagrams", "action-reaction pairs"]`).
- `subjects`: Array of subjects (e.g., `["Physics"]`).
- `breakthroughs`: Array of things the student clearly understood by session end.
- `confusions`: Array of things that remained unclear or unresolved.
- `questions_asked`: Integer count.
- `student_mood`: The AI's assessment of the student's engagement and emotional state during the session.
- `new_facts_extracted`: Array of `{ fact_key, fact_category, fact_value, display_text, confidence, provenance }` objects — core facts that should be written to `student_facts`.

The `new_facts_extracted` field makes the summarization job dual-purpose: it generates the episode AND extracts any new core facts discovered during the session. This means the session's AI calls do not need to pause to write core memories mid-conversation — they are extracted in the background after the session ends.

**CRITICAL:** The summarization prompt must instruct the AI: "Extract only information that was clearly stated or clearly demonstrated. Do not infer or speculate. Do not record temporary emotional states as permanent personality traits. If the student mentioned something in passing once and it was not reinforced, do not record it as a high-confidence fact."

## 21. Episode Retrieval — How Episodic Memory Enters Context

Episodic memories are not injected wholesale into every context. They are selectively retrieved based on relevance and recency. The retrieval strategy for Stage 24 is recency-first (the most recent sessions are most likely to be relevant) with subject-based filtering (if the student is currently asking about Physics, retrieve recent Physics episodes).

**Token budget for episodic memory:** 600 tokens maximum by default (configurable: `MEMORY_EPISODES_TOKEN_BUDGET`). This accommodates summaries of 2-3 recent sessions at typical summary length.

**Selection algorithm (Stage 24, recency-first):**
1. Retrieve the 5 most recent episodes for this student (`ORDER BY session_end DESC LIMIT 5`).
2. Filter: remove any episode for the current session (already in working memory).
3. If the current student message mentions a specific subject, prioritize episodes where `subjects @> '["Physics"]'` (PostgreSQL JSONB containment operator).
4. Truncate to fit the token budget.

**Format for injection:**
```
[Recent Learning History — use to understand the student's journey]
Session (3 days ago, 42 minutes): Worked on Newton's Laws. Student initially confused 
about the Third Law but achieved breakthrough understanding using the doorbell analogy. 
Covered Newton's 1st and 2nd Laws successfully. Topics: force, inertia, action-reaction.

Session (1 week ago, 28 minutes): Introduced to Physics for the first time in WaxPrep.
Student was uncertain about what to study, eventually chose to focus on Mechanics.
Student shows high engagement when real-world examples are used.
```

This is approximately 120 tokens and gives the AI remarkable context for personalized tutoring.

---

# PART FIVE: STAGE 25 — MEMORY RETRIEVAL

## 22. The Retrieval Pipeline — Complete Architecture

Memory retrieval is the bridge between what is stored and what the AI receives. It must be fast, accurate, bounded, and deterministic. Every step in the pipeline must be explicit and auditable.

The complete retrieval pipeline executes in the `ContextAssembler` (Stage 18), extended to include memory retrieval, in this order:

```
Step 1: IDENTITY VERIFICATION
  Assert: waxId is valid and active
  Assert: student status = 'active' (not suspended/blocked)

Step 2: PARALLEL RETRIEVAL (run database queries concurrently)
  Query A: Retrieve active core facts (student_facts WHERE status='active' AND wax_id=$1)
  Query B: Retrieve recent episodes (student_episodes WHERE wax_id=$1 ORDER BY session_end DESC LIMIT 5)
  Both queries run concurrently using Promise.all()
  
Step 3: FILTERING
  Remove: facts with confidence < MEMORY_MINIMUM_CONFIDENCE (configurable, default 0.40)
  Remove: facts with status != 'active'
  Remove: episodes for the current session (already in working memory)
  Remove: soft-deleted records

Step 4: DEDUPLICATION
  Remove: facts whose display_text is substantially represented in the current session history
  Remove: facts that directly repeat information in the most recent episode retrieved
  Log: deduplication_count for observability

Step 5: RANKING AND SELECTION
  For core facts: sort by (fact_category priority) then by (confidence DESC) then by (created_at DESC)
  For episodes: sort by session_end DESC (most recent first, with subject-match prioritization)
  Select top facts until MEMORY_FACTS_TOKEN_BUDGET reached
  Select top episodes until MEMORY_EPISODES_TOKEN_BUDGET reached

Step 6: FORMAT
  Format core facts using display_text (not raw JSON)
  Format episodes using summary_text
  Assemble into the memory slot of the context (positioned after system prompt, before conversation history)

Step 7: LOG
  Write to memory_retrieval_log: waxId, aiRequestId, factsRetrieved, episodesRetrieved,
  tokenEstimate, retrievalStrategy, retrievalLatencyMs
```

Total expected latency: under 15ms for all steps (two parallel database queries plus lightweight in-memory operations).

## 23. Retrieval Ranking — The Strategy Decision

A system that scores well on accuracy but requires 26,000 tokens per query is not production viable. A system with low latency but poor recall is not useful. [Mem0](https://mem0.ai/blog/state-of-ai-agent-memory-2026)

There are three pure retrieval strategies and several hybrid approaches:

**Recency Ranking:** Most recently created or confirmed facts first. Most recent episodes first. Simple, fast, predictable.

Strengths: Low complexity. Always gives the AI the student's current state. Recent facts reflect who the student is NOW.
Weaknesses: A highly relevant fact from 6 months ago (a persistent misconception about Newton's Third Law) may rank behind a trivial recent fact (the student mentioned they had lunch).

**Importance Ranking:** Facts ranked by a computed importance score that considers confidence, evidence count, category priority, and a domain-specific relevance signal.

Strengths: Surfaces the most consequential memories regardless of age.
Weaknesses: "Importance" must be defined, which requires infrastructure to make educational judgments. Who decides that a misconception is more important than a preference? The AI should decide that — infrastructure should not.

**Semantic Ranking:** Facts ranked by embedding similarity to the current student message. What the student is asking about NOW determines what memories are most relevant.

Strengths: Contextually precise. The AI gets the memories most likely to be useful for the current query.
Weaknesses: Requires embeddings (not yet available in Stage 25). Vector search adds latency. Not available until a future embedding stage.

**Hybrid Ranking (Recency + Confidence):** Score = `(recency_weight × recency_score) + (confidence_weight × confidence)`. Configurable weights.

**RECOMMENDATION: Begin with Recency-First for Stage 25, with confidence as a secondary sort. Design for hybrid scoring in the future.**

The reasoning: at Stage 25, WaxPrep does not have enough historical data or behavioral evidence to calibrate importance weights. Recency is a reliable proxy for relevance in educational contexts — the most recent session's confusions are almost certainly relevant to the current session. Confidence is a reliable secondary signal — higher confidence facts are more trustworthy. The query is simple, fast, and correct for the current data volume. As WaxPrep accumulates months of student data, the retrieval layer can be updated to incorporate importance scoring and, eventually, semantic similarity — without changing the schema or the interface.

## 24. The Slot-Based Token Budget — Complete Specification

Token budgeting for memory extends Stage 18's slot model. The complete Stage 25 token budget:

```
TOTAL_CONTEXT_BUDGET = MODEL_CONTEXT_LIMIT - SAFETY_MARGIN(500)

SLOT ALLOCATIONS:
  SYSTEM_PROMPT_SLOT         = 1,200 tokens  (system prompt)
  RESPONSE_RESERVATION       = 1,024 tokens  (max output)
  
  MEMORY_FACTS_SLOT          = 400 tokens    (Stage 23 core facts — NEW)
  MEMORY_EPISODES_SLOT       = 600 tokens    (Stage 24 episodes — NEW)
  MEMORY_FUTURE_SLOT         = 400 tokens    (reserved for future memory types)
  
  FUTURE_TOOLS_SLOT          = 400 tokens    (tool definitions — future)
  FUTURE_RETRIEVAL_SLOT      = 1,200 tokens  (RAG retrieved knowledge — future)
  
  CURRENT_MESSAGE_SLOT       = 400 tokens    (current debounce window messages)
  SAFETY_MARGIN              = 500 tokens    (never touch this)
  
  HISTORY_BUDGET             = TOTAL - all above slots

For Claude Sonnet 4.6 (1M tokens):
  HISTORY_BUDGET ≈ 994,276 tokens (more than adequate)
```

**Token estimation for memory:** Use the same 3.5 chars/token heuristic from Stage 18. Apply to the formatted `display_text` of facts and the `summary_text` of episodes.

**Budget overflow handling:**
- If retrieved facts would exceed `MEMORY_FACTS_SLOT`: truncate to the highest-priority facts that fit, log the overflow.
- If retrieved episodes would exceed `MEMORY_EPISODES_SLOT`: use only the most recent episode that fits, log the overflow.
- Never exceed a slot's budget by even one token. The slot boundary is hard.

## 25. Deduplication — Preventing Redundant Context

Without deduplication, the AI receives:
- In the system prompt: general tutor identity (no student-specific info).
- In memory facts: "Student is preparing for WAEC."
- In the current session history (turn 3, student said): "I need help with my WAEC Chemistry."
- In the episode from yesterday: "Student confirmed they are preparing for WAEC Chemistry."

The AI now reads "WAEC" four times. This is mild cognitive noise. In worse cases, a persistent misconception about Newton's Third Law appears in both the memory facts AND in the most recent episode summary AND the student mentions it again in the current session — three instances of the same information, consuming tokens and potentially confusing the AI about which representation to rely on.

**Deduplication rules:**
1. If a fact's `display_text` is substantially contained within the current session's message history (using a simple string-contains check for key phrases), skip that fact.
2. If a fact's `fact_key` appears in the most recent episode's extracted facts metadata (logged at write time), mark it as "already in recent episode" and deprioritize (include only if token budget allows after episode is included).
3. The deduplication is lightweight and approximate. Exact semantic deduplication (embedding similarity) is a future enhancement. A simple heuristic (if the same fact_key is represented in multiple sources, inject only once from the highest-authority source) is sufficient for Stage 25.

## 26. Future Semantic Retrieval — Interface Compatibility

The retrieval pipeline is designed with an interface that admits semantic retrieval without changing the calling convention. Specifically:

The `StudentMemoryAccess.retrieveFactsForContext(waxId, sessionId, currentMessageText)` method already accepts `currentMessageText`. In Stage 25, this parameter is used only for lightweight subject-topic matching (does the message mention "physics"?). In a future semantic stage, this same parameter is passed to an embedding model to generate a query vector, and the retrieval switches from `ORDER BY created_at DESC` to `ORDER BY embedding <=> queryVector` (cosine similarity via pgvector).

The caller (the context assembler) does not change. The method signature does not change. The database schema does not change (the `embedding` column is already there). Only the query inside `StudentMemoryAccess` changes. This is the correct interface design for forward compatibility.

---

# PART SIX: STAGE 26 — CONFIDENCE, PROVENANCE & SUPERSESSION

## 27. The Epistemic Memory System — What It Means

Epistemic memory is about the AI knowing what it knows — and knowing how certain it should be about what it knows. This is qualitatively different from just storing facts. It is teaching the memory system to represent the reliability of its own contents.

The AGM belief revision framework provides mathematical guarantees for knowledge lifecycle. The Relevance postulate ensures minimal change during revision; Core-Retainment prevents unjustified deletion. Recent systems demonstrate the operational feasibility of these guarantees for agent memory, implementing AGM-compliant belief revision over graph-native memory architectures. [arxiv](https://arxiv.org/pdf/2606.17591)

For WaxPrep, epistemic memory serves one purpose: giving the AI the right level of confidence when it uses a stored fact in reasoning. If the AI is 90% confident that a student misunderstands Newton's Third Law, it should check for this proactively in every physics session. If it is 40% confident, it should notice whether the student's current behavior confirms or disconfirms the hypothesis before acting on it.

## 28. The Complete Provenance Taxonomy

Provenance records the origin of a memory — where it came from and through what process. Every fact must have a provenance value. No fact is ever written without provenance.

**The complete provenance taxonomy for WaxPrep:**

`student_stated_direct`: The student explicitly stated this fact in conversation. Example: "I'm preparing for WAEC." Highest trust — the student is reporting facts about themselves.

`student_stated_correction`: The student explicitly corrected a previous statement. Example: "Actually, I meant SS2, not SS1." High trust — explicit and intentional.

`student_stated_indirect`: The student implied the fact through a statement without saying it explicitly. Example: Student asks "what topics come up in JAMB Physics?" implies they are taking Physics in JAMB. Moderate trust — inference, not assertion.

`ai_inferred_from_behavior`: The AI observed behavioral patterns across the session that imply a fact. Example: Student consistently uses step-by-step examples effectively, implying they prefer this style. Lower trust — inference from behavior, not statement.

`ai_inferred_from_error`: The AI identified a likely misconception from a student's incorrect response. Example: Student said "the heavier object pushes harder" when discussing Newton's Third Law. Moderate trust for the existence of the misconception; requires confirmation to be high confidence.

`ai_inferred_cross_session`: The AI identified a pattern across multiple sessions. Example: The student consistently struggles more in the first 10 minutes of each session, suggesting a warm-up effect. Lower initial trust; increases with more sessions confirming the pattern.

`system_computed`: The fact was computed by the system from observable data. Example: `typical_session_time` computed from session timestamps. Trust depends on sample size.

`episode_extracted`: The fact was extracted by the AI during session summarization (background job). Moderate trust — extracted after the fact rather than in real-time.

`confirmed_by_repetition`: A previously stored fact was re-stated or re-demonstrated, increasing its confidence without changing its provenance category. This is not a primary provenance — it modifies the `evidence_count` field rather than creating a new record.

**Future provenance categories (not implemented, schema ready):**
- `parent_stated`: Information provided by a parent or guardian through a future parent portal.
- `teacher_stated`: Information provided by a registered teacher.
- `assessment_result`: Fact derived from a formal in-app assessment.
- `imported_from_report`: Data from external educational records (future feature).

## 29. The Confidence State Machine

There is not a formula that spits out a universal memory-confidence number the way a softmax spits out a class probability. But you can set up a small state machine that you run every time a new observation touches an existing memory. [Mem0](https://mem0.ai/blog/ai-memory-confidence-score-what-it-is-and-how-it-works)

WaxPrep's confidence state machine has six transitions:

**INITIALIZE:** When a fact is first written. Starting confidence is determined by provenance:
- `student_stated_direct`: Start at 0.80
- `student_stated_correction`: Start at 0.85
- `student_stated_indirect`: Start at 0.55
- `ai_inferred_from_behavior`: Start at 0.45
- `ai_inferred_from_error`: Start at 0.55
- `ai_inferred_cross_session`: Start at 0.35
- `system_computed`: Start at 0.65 (large sample) or 0.40 (small sample — fewer than 5 sessions)
- `episode_extracted`: Start at 0.60

**REINFORCE:** Confidence increases when a new observation matches the existing fact.

Increase amounts by provenance of the new observation:
- `student_stated_direct`: +0.10 (hard maximum: 0.95)
- `student_stated_indirect`: +0.05
- `ai_inferred_from_behavior`: +0.03
- `ai_inferred_from_error`: +0.05
- `episode_extracted` corroborating same fact across different session: +0.07
- `confirmed_by_repetition` (same session, same statement): +0.02

Maximum confidence ceiling: 0.95. A fact can never reach 1.0 — there is always some epistemic humility. A student who has stated the same thing 20 times is still not infallible.

**CONTRADICT:** Confidence decreases when a new observation conflicts with the existing fact.

Decrease amounts:
- `student_stated_direct` contradiction of existing fact: -0.30 (this is significant — the student is explicitly contradicting their own previous statement)
- `ai_inferred_from_error` showing the student does NOT have the misconception: -0.20
- `ai_inferred_from_behavior` inconsistent with the existing fact: -0.10

If confidence falls below 0.20, flag the fact for potential archiving. Write a contradiction record.

**SUPERSEDE:** The fact is replaced by a new version. The old fact's confidence at time of supersession is preserved in its record. The new fact starts at the provenance-appropriate initial confidence.

**DECAY:** Confidence decreases over time for certain fact categories when there is no new evidence. See Section 30 for decay policy.

**CONFIRM (External):** A future stage adds parent confirmation, teacher confirmation, or assessment result. These are strong positive evidence.

Every confidence transition produces a `memory_confidence_history` record. The history is append-only and permanent.

## 30. Confidence Decay — When and Why

Confidence scoring with time-decay, supersession, Ebbinghaus forgetting — the four-tier consolidation framework references this as a key design element. [arxiv](https://arxiv.org/pdf/2604.11364)

The central question: should the memory system automatically decrease confidence in stored facts over time, even without contradictory evidence? The answer is nuanced and depends on fact category.

**Category-based decay policy:**

`profile` facts (exam_target, class_level, school): NO DECAY. A student's WAEC exam target is as true tomorrow as it was the day it was stated, unless the student says otherwise. Decaying this fact would create the absurd situation where WaxPrep forgets which exam the student is preparing for simply because time has passed.

`academic` facts (strong_subjects, weak_subjects): MILD DECAY — 0.02 per 30 days of no corroborating evidence. A strength or weakness demonstrated 6 months ago may no longer hold if the student has been working hard. The AI should verify rather than assume, especially for subjects that have not come up recently.

`misconception` facts: DECAY — 0.05 per 30 days of no appearance of the misconception. If the student has not demonstrated the misconception in 60 days across multiple relevant sessions, it is reasonable to lower confidence that the misconception persists. This prevents WaxPrep from forever treating a corrected misconception as current.

`preference` facts: MILD DECAY — 0.02 per 60 days. Student preferences evolve. What worked 3 months ago may not be the best approach now.

`progress` facts (mastered_concept, struggling_concept): MODERATE DECAY — 0.03 per 30 days. Knowledge can be forgotten. A concept "mastered" 3 months ago may need review. Mild decay prompts the AI to gently check rather than assume the mastery still holds.

**Decay implementation:** A background job (separate from the summarization job, run weekly) queries all facts with `status = 'active'`, computes whether any decay should be applied based on the fact's category and the time since last evidence (`MAX(created_at, last_reinforced_at)`), applies the decay if applicable, and records the change in `memory_confidence_history` with `change_reason = 'DECAY'`.

Decay should NEVER reduce a fact's confidence below 0.20. Below 0.20, archive the fact instead (flag it for human or AI review if the archiving would delete something potentially important).

## 31. Supersession — The Complete Protocol

Supersession is the correct mechanism for handling facts that change over time. It is not the same as correction (which implies the original fact was wrong from the start). Supersession means "this was true then, but this is true now."

Example: A student was in SS1 when they first used WaxPrep. They are now in SS2. The original `class_level: SS1` fact was true. It is now superseded by `class_level: SS2`. Both facts are preserved permanently.

**Why permanent preservation matters:**
- The learning trajectory depends on knowing when the student was at each class level.
- Future evaluation systems can correlate which episode summaries correspond to which class level.
- Privacy compliance requires knowing what was held about a student and when — you cannot provide this audit trail if old facts are deleted.
- The AI can reason about transitions: "You mentioned you were in SS1 last year when we first talked about this topic. How does it feel revisiting it now that you're in SS2?"

**The supersession protocol in detail:**

When a write operation determines that a new value for `fact_key` should supersede the existing active value:

1. Begin a database transaction.
2. SELECT the current active fact with a row-level lock (`SELECT FOR UPDATE`).
3. UPDATE the current active fact: set `status = 'superseded'`, `superseded_at = NOW()`, `valid_until = NOW()`.
4. INSERT a new fact with: the new `fact_value`, `status = 'active'`, `valid_from = NOW()`, `superseded_by = NULL`, appropriate initial `confidence`.
5. UPDATE the old fact: set `superseded_by = new_fact.id`.
6. INSERT a `memory_confidence_history` record for the old fact at the moment of supersession.
7. Commit the transaction.

If any step fails, roll back the entire transaction. The old fact remains active. The failed supersession is logged at ERROR level.

## 32. Contradiction Detection — The Complete System

Contradiction detection is triggered every time a new fact is written that has the same `fact_key` as an existing active fact but a different `fact_value`.

**Detection algorithm:**

```
On write of new fact (wax_id, fact_key, fact_value):
  1. Query existing active facts with same (wax_id, fact_key)
  2. If NONE: write normally (no conflict)
  3. If FOUND with SAME fact_value: REINFORCE (update confidence, increment evidence_count)
  4. If FOUND with DIFFERENT fact_value:
       a. Compute conflict_type:
            - value_conflict: values are different but same type (SS1 vs SS2, WAEC vs NECO)
            - temporal_conflict: new value represents a future state (SS2 coming next year vs SS1 now)
            - logical_conflict: values are logically incompatible (strong subject listed as weak subject)
       b. Determine appropriate action:
            - If temporal progression is clear → SUPERSEDE (SS1 → SS2, old school → new school)
            - If correction is explicit (student said "wait, I made a mistake") → SUPERSEDE
            - If value is genuinely ambiguous (student seems to sit both WAEC and NECO) → 
                UPDATE existing fact to array value + REINFORCE
            - If genuine conflict → LOG contradiction, keep both as 'active', flag both for AI review
       c. Write to memory_contradictions table with:
            fact_a_id, fact_b_id, conflict_type, conflict_description, status='unresolved'
```

**How contradictions surface to the AI:**

Unresolved contradictions for a student are retrieved alongside core facts during context injection. They are presented in a special section of the context:

```
[Memory Conflicts — clarify naturally in conversation if appropriate]
• Conflict: exam target is recorded as both WAEC and NECO. May be sitting both.
  Clarify by asking naturally if relevant to the current topic.
```

The AI can then ask the student naturally: "I want to make sure I understand your exam situation — are you sitting both WAEC and NECO this year?" This is the AI resolving infrastructure-detected conflicts through conversation, not infrastructure making decisions.

---

# PART SEVEN: CROSS-CUTTING CONCERNS

## 33. Memory Consolidation — The Background Intelligence Layer

On timing: the most common production pattern is consolidation every N episodes, with background daemons increasingly preferred over on-request consolidation to avoid latency spikes. [Atlan](https://atlan.com/know/episodic-memory-ai-agents/)

Memory consolidation is inspired by biological sleep-based memory consolidation: the brain's process of moving information from short-term to long-term memory during sleep, strengthening important memories and allowing less important ones to fade. For WaxPrep, consolidation is a set of background processes that improve the quality of the memory system over time.

### 33.1 Episode-to-Fact Promotion

After a session is summarized (Stage 24), a consolidation job examines the extracted `new_facts_extracted` from the summary and writes them to `student_facts`. This is already part of the summarization job design.

### 33.2 Cross-Session Pattern Detection

A weekly background job analyzes patterns across multiple episodes for each student:
- If the same confusion appears in 3 or more episodes: create or reinforce a `struggling_concept` fact.
- If the same topic appears successfully in 3 or more episodes: create or reinforce a `mastered_concept` fact.
- If the same breakthrough type appears: reinforce the associated learning method preference.

This job runs at low priority and operates over the entire student history, not just recent sessions. It requires one AI call per student per week (cheap: a brief analysis of episode metadata). The AI reads the episode metadata (not the full session conversations — those can be very long) and produces consolidation judgments.

### 33.3 Confidence Decay Processing

The weekly decay job described in Section 30. Runs at the lowest priority of all background jobs. Can be run over multiple hours if student count is large.

### 33.4 Archiving Old Records

Superseded facts older than 12 months (configurable: `MEMORY_ARCHIVE_AGE_MONTHS`) are updated to `status = 'archived'`. Archived facts are excluded from standard retrieval queries but remain permanently in the database. This keeps the active working set small and queries fast without destroying historical information.

### 33.5 Contradiction Review

The weekly consolidation job also reviews `unresolved` contradictions older than 14 days. For each old unresolved contradiction, it provides context to the AI asking it to assess whether the contradiction is now resolvable given the episode history since the contradiction was first detected. If resolvable, the AI recommends a resolution (which the consolidation job applies). If not resolvable, the contradiction remains flagged.

## 34. Memory Indexing Strategy

The full indexing strategy for production performance across all memory tables:

**student_facts:**
- `(wax_id, status)` — Primary lookup for active facts by student.
- `(wax_id, fact_category, status)` — Category-filtered queries.
- `(wax_id, fact_key, status)` — Key-specific lookup (write-time conflict detection).
- `(wax_id, created_at DESC)` WHERE `status = 'active'` — Recency-first retrieval.
- `(wax_id, confidence DESC)` WHERE `status = 'active'` — Confidence-ranked retrieval.

**student_episodes:**
- `(wax_id, session_end DESC)` — Recency-first episode retrieval.
- `subjects` USING GIN — Subject-filtered episode retrieval.
- `topics` USING GIN — Topic-filtered episode retrieval.

**memory_contradictions:**
- `(wax_id, status)` — Unresolved contradictions for context injection.

**memory_confidence_history:**
- `(fact_id, created_at DESC)` — Full confidence history for a fact.

**Partitioning (for future scale):** When `student_episodes` exceeds 10 million rows, partition by `DATE_TRUNC('month', session_end)`. Monthly partitions keep retrieval queries against recent episodes fast without full table scans. At WaxPrep's initial scale, partitioning is unnecessary and adds complexity. Plan for it when the table exceeds 1 million rows.

## 35. Memory Observability — Metrics and Dashboards

Every memory operation should produce observable metrics. Without observability, you cannot answer: is the memory system working? Is it being used? Is it improving the AI's responses?

**Core metrics to track:**

**Write metrics:**
- `memory.fact.written` — Counter by `fact_category` and `provenance`.
- `memory.fact.reinforced` — Counter: how often existing facts are reinforced vs created new.
- `memory.fact.superseded` — Counter: how often facts are replaced.
- `memory.fact.contradiction_detected` — Counter: how often conflicts arise.
- `memory.episode.generated` — Counter: sessions that produced summaries.
- `memory.episode.failed` — Counter: sessions where summarization failed.

**Retrieval metrics:**
- `memory.retrieval.latency_ms` — Histogram of retrieval pipeline latency.
- `memory.retrieval.facts_count` — Histogram of facts retrieved per request.
- `memory.retrieval.episodes_count` — Histogram of episodes retrieved per request.
- `memory.retrieval.tokens_consumed` — Histogram of token budget consumed by memory.
- `memory.retrieval.deduplication_rate` — What fraction of retrieved memories are filtered out as duplicates.

**Quality metrics (future, requires evaluation stage):**
- `memory.fact.utilization_rate` — What fraction of injected facts lead to visible AI behavior change.
- `memory.episode.recall_accuracy` — When the AI references a past episode, was the reference accurate.

**Implementation:** These metrics are emitted as Pino structured log entries at INFO level. Railway's log streaming captures them. The logs can be queried to compute metrics. Full Prometheus/Grafana integration is a future operational enhancement — not needed at Stage 26.

**Dashboard (manual, via database queries):**

The following SQL queries provide the operational dashboard for the memory system:

```sql
-- Memory health by student (top 10 most memory-rich students)
SELECT wax_id, COUNT(*) facts, AVG(confidence) avg_confidence
FROM student_facts WHERE status = 'active'
GROUP BY wax_id ORDER BY facts DESC LIMIT 10;

-- Contradiction backlog
SELECT COUNT(*) FROM memory_contradictions WHERE status = 'unresolved';

-- Episode generation success rate (last 7 days)
SELECT summary_status, COUNT(*) FROM student_episodes
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY summary_status;

-- Average facts per student
SELECT AVG(fact_count) FROM (
  SELECT wax_id, COUNT(*) fact_count FROM student_facts WHERE status = 'active' GROUP BY wax_id
) sub;
```

## 36. Privacy Architecture — NDPA and Minor Data

WaxPrep's memory system processes deeply personal data about Nigerian minors — their academic struggles, their exam preparation, their misconceptions, their emotional states during study sessions. This requires careful privacy architecture.

### 36.1 NDPA Compliance Requirements

The Nigeria Data Protection Act 2023 establishes requirements that directly affect the memory architecture:

**Data minimization:** Store only what is necessary for the tutoring purpose. The memory system should not accumulate facts that do not serve educational quality. The `fact_category` taxonomy and the minimum confidence threshold for writing are the primary minimization mechanisms.

**Purpose limitation:** Memory collected for tutoring purposes must not be used for other purposes. The memory tables have no external read access beyond the tutor context assembler. Future features that would use memory data for different purposes (marketing, analytics sold to schools) would require separate NDPA legal basis and architecture.

**Data subject rights:** The student (and parent/guardian if student is a minor) can request:
- **Access:** All stored facts and episode summaries for the student. The system must be able to export a complete, human-readable report of all stored memory for any given WaxID.
- **Rectification:** Correction of inaccurate facts. Handled via the supersession mechanism — the incorrect fact is superseded, not erased.
- **Erasure:** Deletion of all stored data. The system must support a full memory wipe for any WaxID, executed by a privileged operation, which soft-deletes (or hard-deletes where the regulation specifically requires) all records associated with that WaxID.

### 36.2 Retention Periods

Memory records should not be retained indefinitely without purpose. Proposed retention policy:
- Active core facts: Retain while student is active and for 24 months after last session.
- Superseded core facts: Retain for 12 months after supersession, then archive (keep metadata, consider anonymizing content).
- Episode summaries: Retain for 24 months.
- Confidence history: Retain for 12 months, then purge (operational data).
- Contradiction records: Retain for 12 months after resolution.

These retention periods should be configurable as environment variables and enforced by weekly background jobs.

### 36.3 Memory Data Export

The system must implement a `StudentMemoryExport` function that, given a WaxID and appropriate authorization, produces a complete JSON export of all stored memory data. This export is the response to a data subject access request. The export includes:
- All active and superseded facts (with provenance and confidence history).
- All episode summaries.
- The complete confidence history for each fact.
- All detected contradictions and their resolution status.
- The retrieval log (aggregate: how often was memory retrieved, never the full conversation content).

### 36.4 The Memory Poisoning Threat

Memory poisoning and injection attacks show that persistent memory can steer later responses and actions across sessions. Temporal validity is therefore central: a memory item should record when it was created or updated, what evidence supported it, whether that evidence remains valid, and whether later observations superseded it. [arxiv](https://arxiv.org/pdf/2606.06240)

A malicious actor could attempt to poison WaxPrep's memory by sending carefully crafted messages designed to write false facts about a student. For example: repeatedly sending messages that imply false weaknesses to make the AI patronize the student, or sending messages that claim the student has already mastered topics they have not, to make the AI skip foundational content.

**Mitigations:**
- Minimum confidence threshold for writes: low-confidence inferences from single messages do not write to memory.
- The AI, not the student, decides what to write to memory. The student cannot directly write to the memory tables — only the AI's post-processing and summarization jobs can.
- Confidence growth is gradual: a single session cannot produce a highly confident memory entry about a sensitive topic (misconception, weakness).
- The contradiction detection system surfaces conflicts for AI review rather than silently overwriting.

## 37. Token Economics — How Memory Affects Cost

Memory adds tokens to every AI request. These tokens cost money. The token budget established in Stage 25 (Section 24) controls cost growth.

**Cost impact analysis at scale:**

Assuming Claude Sonnet 4.6 pricing (approximately $3.00 per million input tokens):

With NO memory (Stage 18 baseline):
- System prompt: ~600 tokens
- Session history (20 turns): ~4,000 tokens
- Current message: ~100 tokens
- Total input per request: ~4,700 tokens = ~$0.0141 per request

With Stage 25 memory (complete):
- System prompt: ~600 tokens
- Memory facts: ~300 tokens (within 400-token budget)
- Memory episodes: ~400 tokens (within 600-token budget)
- Session history: ~4,000 tokens
- Current message: ~100 tokens
- Total input per request: ~5,400 tokens = ~$0.0162 per request

The memory overhead is approximately **15% additional cost per request** ($0.0021 per request). At 10,000 messages per day, this is $21/day or approximately $630/month in additional memory-related token cost. This is the direct, quantifiable cost of memory. The benefit — students feeling known, the AI tutoring with context, improved educational outcomes — justifies this cost.

With prompt caching (Stage 15's Anthropic caching): the system prompt and stable memory facts can be cached, reducing effective cost. Memory facts that do not change between sessions (most profile facts) will be served from cache, effectively reducing the memory token cost to approximately 10% of its base rate.

**Cost control mechanisms:**
- `MEMORY_FACTS_TOKEN_BUDGET`: Caps total tokens consumed by core facts.
- `MEMORY_EPISODES_TOKEN_BUDGET`: Caps total tokens consumed by episode summaries.
- `MEMORY_MINIMUM_CONFIDENCE`: Prevents low-quality facts from being retrieved (quality control doubles as cost control).
- The deduplication step removes redundant facts that would waste tokens.

## 38. Failure Modes and Mitigations

Every system fails. The memory system's failure modes are particularly dangerous because they affect the AI's knowledge about students. A corrupted memory can cause the AI to give wrong advice, misidentify a student's needs, or reference facts that are incorrect.

### 38.1 Wrong Memory Retrieved

**Scenario:** A retrieval bug causes Student B's facts to appear in Student A's context.

**Mitigations:**
- Foreign key constraint on `wax_id` in all memory tables (database-level prevention).
- `StudentMemoryAccess` class with WaxID embedded at construction (application-level prevention).
- Runtime assertion in context assembler: every retrieved memory record must have `wax_id = currentWaxId`.
- `memory_retrieval_log` captures every retrieval for audit.

**If detected at runtime:** The context assembler assertion fails, an ERROR is logged, the memory slot in the context is left empty (the AI proceeds without memory rather than with wrong memory), and an alert is triggered.

### 38.2 Duplicate Memory

**Scenario:** The same fact is written twice (write operation ran twice due to a retry after a network blip).

**Mitigations:**
- Write operations check for existing active fact before inserting.
- The check-and-write is wrapped in a transaction with appropriate isolation.
- If a race condition somehow produces two active facts with the same `(wax_id, fact_key)`, the retrieval deduplication step removes duplicates before they reach the context.

**Detection:** A monitoring query that finds `(wax_id, fact_key, status='active')` combinations with count > 1. This should be zero — any non-zero result triggers an alert and manual investigation.

### 38.3 Corrupted Memory (Incorrect AI Extraction)

**Scenario:** The AI extracts a fact incorrectly from a conversation. Student said "My friend loves chemistry, but I'm not sure about it" and the AI writes `strong_subjects: [Chemistry]` for this student.

**Mitigations:**
- The summarization prompt explicitly instructs the AI to extract only clearly stated, clearly attributed facts about the student.
- Minimum confidence threshold for writes.
- The AI reasoning over the memory always reads the `provenance` field, which provides context for how certain to be.
- Low-confidence facts are marked as such in context injection, which guides the AI to verify rather than assume.

**Recovery:** When a student's behavior contradicts a stored fact, the confidence drops (CONTRADICT transition). Eventually the fact either gets superseded or drops below the retrieval threshold and is effectively invisible.

### 38.4 Context Overflow from Memory

**Scenario:** A long-established student has hundreds of active facts, consuming the entire memory token budget and leaving no room for recent episode summaries.

**Mitigations:**
- The slot-based token budget cap prevents any memory category from exceeding its allocation.
- Archiving of old, low-confidence facts keeps the active set small.
- The priority selection algorithm ensures profile facts (most universally relevant) are always included, with lower-priority categories filling the remaining budget.

### 38.5 Summarization Failure

**Scenario:** The background AI call for session summarization fails (provider error, timeout, model safety refusal).

**Mitigations:**
- BullMQ retries the summarization job 3 times with exponential backoff.
- If all retries fail, the session's `summary_status` is set to `'failed'` and the failure is logged.
- The session remains in the database with all its messages intact — a future retry can regenerate the summary.
- A daily background job identifies sessions with `summary_status = 'failed'` older than 24 hours and re-queues them.
- The student's tutoring is not interrupted — summarization failure affects future session memory, not the current session.

### 38.6 Memory Leak Across Students

**Scenario (catastrophic):** A bug in the context assembler injects memories from Student A into Student B's context. Student B's AI responses reference Student A's academic situation.

**Mitigations:**
- This is the most dangerous failure mode and has multiple layers of defense (all described in Section 8).
- If it occurs: IMMEDIATELY remove the affected student sessions from active processing, audit the memory retrieval log for both students to determine scope, notify affected students per the NDPA breach notification requirements.

---

# PART EIGHT: WHAT NOT TO BUILD

## 39. What Should Wait (Future Stages)

**Semantic retrieval (vector embeddings):** The schema is ready (the `embedding` column exists). The `pgvector` extension is enabled in the migration. But generating embeddings requires an embedding model API call for every memory write — additional latency and cost. The improvement in retrieval quality from semantic matching will be meaningful only when WaxPrep has enough students and memory entries that recency-first retrieval starts missing important but non-recent context. This is not an immediate concern. Implement semantic retrieval when retrieval quality analysis (from the observability metrics) shows that recency-first is missing relevant memories.

**Cross-session analysis dashboards:** Building a UI for visualizing a student's learning trajectory, misconception trends, and progress over time. This requires a frontend and is product development, not infrastructure. Build it when the data exists and stakeholders need to see it.

**Parent portal memory access:** Allowing parents to view their child's memory profile. Requires authentication, authorization, and UI. Requires NDPA consent design. Future feature.

**Teacher integration:** Allowing teachers to add notes about students to the memory system. Requires a new provenance category, a teacher authentication system, and UI. Future feature.

**Assessment integration:** Connecting formal assessment results (WAEC mock exam scores) to the memory system. Requires an assessment module. Future feature.

**Memory-based adaptive pacing:** Automatically adjusting the depth and speed of tutoring based on memory-derived progress signals. The AI already reasons about this from memory content — do not build infrastructure that replaces this reasoning with rules.

## 40. What Should Never Be Built

**Automated fact correction without provenance.** Never build a system that silently modifies or corrects memory facts without recording why, when, by what process. Every change to memory must produce an audit trail.

**Memory-based scoring or grading.** Using the memory system to produce official scores, grades, or assessments for students that are shared with schools or exam bodies. The memory system is a tutoring aid — it is not an assessment authority. Any scores in WaxPrep's memory are private, informal, and should be explicitly marked as AI observations, not official results.

**Shared memory across students.** Memory belongs to one student. Never build a feature where one student's memory informs another student's experience — not for "popular misconceptions" aggregation, not for "what topics are most commonly confused" analytics. Student data is private.

**Deterministic teaching rules derived from memory.** A rule like "if progress.mastered_concept contains 'Newton's First Law' then skip that topic" is hardcoded educational logic. Never build it. The AI reads the memory and decides whether to revisit or skip. Infrastructure never decides.

**Automatic memory editing by the AI mid-conversation.** The AI should not pause a tutoring conversation to issue memory update commands. Memory updates happen asynchronously (background jobs after session) or as deliberate tool calls in future stages. Real-time memory mutation in the middle of a tutoring exchange adds latency, complexity, and the risk of partial writes if the session crashes.

**A memory system that penalizes slow students.** Any design that uses memory to route "slow" students to lower-quality responses, simpler AI models, or reduced features. All students receive the same quality of tutoring. Memory improves personalization, not resource allocation.

## 41. Common Traps and Anti-Patterns

**The profile questionnaire trap:** Building a structured intake form that asks students to fill in their exam target, class, subjects, etc. before using WaxPrep. This feels efficient but is wrong. It makes the first interaction transactional instead of educational. It gets outdated immediately (students update facts naturally through conversation, but rarely think to update a form). The AI should learn about the student through tutoring, not through a form.

**The infinite memory accumulation trap:** Writing everything the AI thinks it knows to memory, producing thousands of low-confidence facts that overwhelm the context budget and dilute useful information. The minimum confidence threshold and the taxonomy discipline prevent this. Write only high-quality, educationally relevant facts.

**The stale confidence trap:** Writing facts with high initial confidence based on a single explicit statement, then never updating them. A student who said "I'm preparing for WAEC" in session 1 might change to NECO by session 20. If the confidence never changes, the AI will keep asserting WAEC with high confidence long after it is wrong. The supersession mechanism and the contradiction detection system prevent this — but only if the write path correctly identifies when a new statement conflicts with an existing one.

**The context-overflow trap:** Including all retrieved memories in the context regardless of token budget. This is prevented by the slot-based budget. But a common implementation error is checking the token budget AFTER assembling the memory string rather than BEFORE. Always check the budget before adding each item.

**The attribution confusion trap:** Retrieving an episode summary and presenting it to the AI in a way that makes it unclear whether the information is from the AI's own past reasoning or from the student's direct statements. The `provenance` field prevents this — the context injection format should always show the provenance: "Student stated" vs "AI observed."

---

# PART NINE: IMPLEMENTATION SPECIFICATIONS

## 42. Final Stage 22 Specification

**Purpose:** Establish the foundational database schema, migration infrastructure, and core data access classes for WaxPrep's persistent memory system.

**Dependencies:**
- Stage 3 (database infrastructure — migrations, connection pool).
- Stage 12 (WaxID and students table — memory tables reference it).
- Stage 13 (sessions table — episode summaries reference it).

**Architecture:**
Single PostgreSQL database (existing Railway/Supabase database). New tables: `student_facts`, `student_episodes`, `memory_retrieval_log`, `memory_contradictions`, `memory_confidence_history`. New database access class: `StudentMemoryAccess`. New migration: `005_memory_foundation.sql`.

**Required Files:**
- `infra/migrations/005_memory_foundation.sql` — complete schema as specified in Section 5.
- `src/memory/StudentMemoryAccess.js` — database access class with all CRUD methods.
- `src/memory/MemoryTaxonomy.js` — constants for fact categories, fact keys, provenance values, confidence thresholds.
- `src/memory/MemoryErrors.js` — memory-specific error classes.

**Database Changes:** As specified in Section 5 (full schema). Migration must include the `CREATE EXTENSION IF NOT EXISTS vector` command. Migration must be idempotent (IF NOT EXISTS for all CREATE statements).

**Testing Expectations:**
- Unit test: `StudentMemoryAccess.writeFact()` with a valid fact produces a new `student_facts` record with correct defaults.
- Unit test: `StudentMemoryAccess.writeFact()` with an existing active fact for the same `(wax_id, fact_key)` triggers the REINFORCE path.
- Unit test: Attempting to read a different student's facts from a `StudentMemoryAccess` instance returns zero results (WaxID isolation enforced by class constructor).
- Integration test: Full transaction: write fact → read fact → verify all fields.
- Integration test: Soft delete → verify deleted record is excluded from retrieval queries.

**Completion Criteria:**
- Migration `005` applies cleanly to a fresh database.
- `StudentMemoryAccess` wraps all memory operations — no direct memory table queries anywhere else in the codebase.
- All indexes created and verified via `EXPLAIN ANALYZE` on the primary query patterns.
- The `embedding vector(1536)` column exists and is nullable on both `student_facts` and `student_episodes`.
- `pgvector` extension is enabled.
- All tests pass.

## 43. Final Stage 23 Specification

**Purpose:** Implement the core fact write, retrieve, update, supersede, and context injection system that gives WaxPrep durable knowledge about who each student is.

**Dependencies:**
- Stage 22 (memory schema).
- Stage 17 (system prompt builder — context injection slot must be added).
- Stage 18 (context assembler — must be extended to include memory facts).

**Architecture:**
The `ContextAssembler` (Stage 18) is extended with a `memoryFacts` slot. A new `MemoryWriter` module receives AI-extracted facts and writes them using `StudentMemoryAccess`. The summarization job (Stage 24) is the primary caller of `MemoryWriter`. For Stage 23, a simple manual write path is also built for testing: the AI can emit a structured JSON block at the end of the session (an early version of the tool-calling pattern) that the worker parses and writes to memory.

**Required Files:**
- `src/memory/MemoryWriter.js` — writes facts using the full write protocol (conflict detection, supersession, confidence management).
- `src/memory/MemoryRetriever.js` — retrieves and formats facts for context injection.
- `src/memory/ConfidenceEngine.js` — state machine for confidence transitions (REINFORCE, CONTRADICT, SUPERSEDE, INITIALIZE).
- `src/memory/ProvenanceRegistry.js` — constants and helpers for provenance taxonomy.
- Updated `src/ai/context/ContextAssembler.js` — extended with memory facts retrieval and injection.

**Database Changes:**
None beyond Stage 22 schema. Stage 23 operates within the existing tables.

**Testing Expectations:**
- Unit test: `ConfidenceEngine.reinforce(currentConfidence, newEvidenceProvenance)` returns correct updated confidence.
- Unit test: `ConfidenceEngine.contradict(currentConfidence, newEvidenceProvenance)` decreases confidence correctly.
- Unit test: `MemoryWriter.writeFact()` with a conflicting fact_key triggers the SUPERSEDE path correctly (old fact gets `status = 'superseded'`, new fact gets `status = 'active'`).
- Unit test: Context injection respects the `MEMORY_FACTS_TOKEN_BUDGET` cap.
- Integration test: Write fact → retrieve for context → verify display_text appears in context output.
- Integration test: Write high-confidence fact + write contradicting fact → verify contradiction log entry created.

**Completion Criteria:**
- Core facts can be written (manually, via test script) and retrieved in the AI context.
- Confidence state machine all six transitions implemented and tested.
- Context injection includes a clearly formatted memory facts block.
- Token budget respected — no context overflow from memory facts.
- All superseded facts remain permanently in the database with correct `superseded_by` pointers.

## 44. Final Stage 24 Specification

**Purpose:** Implement end-of-session summarization using a background BullMQ job, producing structured episodic memories that capture the student's learning journey.

**Dependencies:**
- Stage 22 (memory schema — `student_episodes` table).
- Stage 23 (memory writer — summarization job writes extracted facts).
- Stage 15/16 (AI provider — summarization uses the AI provider abstraction).
- Stage 6 (BullMQ — background job infrastructure).

**Architecture:**
A new BullMQ queue (`memory-consolidation`) with a dedicated worker. A `SessionSummarizer` class that builds the summarization prompt, calls the AI provider, parses the structured response, writes the episode, and writes extracted facts. The session closure detection mechanism (Option B: background scheduler + Option A: on-new-session trigger) runs as a BullMQ repeatable job.

**Required Files:**
- `src/memory/SessionSummarizer.js` — orchestrates the full summarization process.
- `src/workers/consolidationWorker.js` — BullMQ worker processing memory-consolidation jobs.
- `src/ai/prompt/templates/session_summarization.v1.txt` — the summarization prompt template.
- `src/memory/EpisodeWriter.js` — writes `student_episodes` records.
- Updated `src/ai/context/ContextAssembler.js` — extended with episodic memory retrieval.
- New BullMQ repeatable job in the worker startup: `summarize-closed-sessions` every 15 minutes.

**Database Changes:**
None beyond Stage 22 schema.

**Testing Expectations:**
- Unit test: `SessionSummarizer` correctly parses the structured JSON from the AI summarization response.
- Unit test: Summary job is correctly deduplicated by jobId (same session does not produce two summary jobs).
- Integration test: Session closes (inactivity timeout) → background job fires → episode written → episode retrievable for context.
- Integration test: Summarization AI call failure → `summary_status = 'failed'` recorded → retry job queued.
- Manual test: Verify a generated summary correctly describes a test conversation.

**Completion Criteria:**
- Sessions produce summaries within 50 minutes of closing (background job + processing time).
- Summary includes all required fields (`summary_text`, `topics`, `subjects`, `breakthroughs`, `confusions`).
- Extracted facts are correctly written to `student_facts` by the summarization job.
- Failed summaries are retried and logged.
- Episode summaries appear in the AI context for subsequent sessions.

## 45. Final Stage 25 Specification

**Purpose:** Implement the complete memory retrieval pipeline, including parallel retrieval, filtering, ranking, deduplication, and token-budget-aware context injection for both core facts and episodic summaries.

**Dependencies:**
- Stage 23 (core facts available in database).
- Stage 24 (episodes available in database).
- Stage 18 (context assembler — Stage 25 extends it significantly).

**Architecture:**
The `ContextAssembler` is substantially refactored to support the full slot-based token budget model. A new `MemoryRetrievalPipeline` class encapsulates all retrieval logic: parallel database queries, filtering, ranking, deduplication, token estimation, and formatting. The `memory_retrieval_log` table is populated after every retrieval.

**Required Files:**
- `src/memory/MemoryRetrievalPipeline.js` — complete retrieval pipeline.
- `src/memory/MemoryFormatter.js` — formats retrieved memory into context injection text.
- `src/memory/MemoryDeduplicator.js` — deduplication logic.
- Updated `src/ai/context/ContextAssembler.js` — integrates MemoryRetrievalPipeline.
- New environment variables: `MEMORY_FACTS_TOKEN_BUDGET`, `MEMORY_EPISODES_TOKEN_BUDGET`, `MEMORY_MINIMUM_CONFIDENCE`, `MEMORY_RETRIEVAL_LATENCY_WARN_MS`.

**Database Changes:**
New index: verify all indexes from Stage 22 are created. Add `memory_retrieval_log` records for observability.

**Testing Expectations:**
- Unit test: Retrieval respects `MEMORY_FACTS_TOKEN_BUDGET` — never returns facts that would exceed the budget.
- Unit test: Deduplication correctly removes facts that appear in the current session history.
- Unit test: Parallel retrieval (Promise.all) completes faster than sequential.
- Integration test: Full retrieval pipeline executes under 15ms on a database with 100 facts for a student.
- Integration test: Retrieval log entry is written after every pipeline execution.
- Integration test: A student with no facts and no episodes produces empty memory slots (no errors).

**Completion Criteria:**
- Complete retrieval pipeline operational.
- Memory facts and episodes appear correctly formatted in AI context.
- Total retrieval latency under 15ms (measured via retrieval log).
- Token budget respected for both facts and episodes slots.
- Retrieval log capturing all retrieval events.
- The `currentMessageText` parameter accepted (for future semantic retrieval compatibility) even though not yet used for semantic matching.

## 46. Final Stage 26 Specification

**Purpose:** Implement the complete epistemic memory system: provenance tracking, the full confidence state machine, supersession protocol, contradiction detection and logging, confidence decay processing, and the contradiction surface mechanism for AI context.

**Dependencies:**
- Stage 22 (schema — `memory_contradictions`, `memory_confidence_history` tables).
- Stage 23 (MemoryWriter and ConfidenceEngine partially implemented — Stage 26 completes them).
- Stage 24 (summarization creates opportunities for contradiction detection).

**Architecture:**
The `ConfidenceEngine` is fully implemented with all six transitions. The `ContradictionDetector` is built as a separate module called by `MemoryWriter` on every write. The confidence decay background job is added to the `consolidationWorker`. The contradiction context injection is added to `MemoryRetrievalPipeline`.

**Required Files:**
- `src/memory/ConfidenceEngine.js` — complete state machine with all six transitions and full test coverage.
- `src/memory/ContradictionDetector.js` — detects conflicts on every write, writes to `memory_contradictions`.
- `src/memory/SupersessionProtocol.js` — complete supersession transaction implementation.
- `src/memory/ConfidenceDecayJob.js` — weekly decay processing logic.
- Updated `src/workers/consolidationWorker.js` — adds decay job to weekly schedule.
- Updated `src/memory/MemoryRetrievalPipeline.js` — adds contradiction context injection.
- New environment variables: `MEMORY_DECAY_INTERVAL_DAYS`, `MEMORY_ARCHIVE_AGE_MONTHS`, decay rates per category.

**Database Changes:**
None beyond Stage 22 schema.

**Testing Expectations:**
- Unit test: Every confidence state machine transition produces correct output and a `memory_confidence_history` record.
- Unit test: Decay applied correctly to each category — no decay for `profile`, correct rate for others.
- Unit test: Decay never reduces confidence below 0.20.
- Unit test: Supersession transaction correctly updates old record and creates new record atomically.
- Unit test: Contradiction detector correctly identifies each conflict_type.
- Integration test: Write a fact, write a contradicting fact → verify contradiction record created, both original facts still queryable.
- Integration test: Contradiction appears in context injection when `status = 'unresolved'`.
- Integration test: Confidence history is append-only — no history record is ever updated.

**Completion Criteria:**
- Full confidence state machine implemented with all six transitions.
- Every confidence change produces a `memory_confidence_history` record.
- Supersession protocol fully implemented and transactional.
- Contradiction detection runs on every write and correctly classifies conflicts.
- Contradictions surface in AI context with appropriate framing.
- Confidence decay background job operational.
- Complete provenance taxonomy implemented in `ProvenanceRegistry`.
- No fact is ever hard-deleted (soft delete only, with appropriate audit trail).

---

# PART TEN: ARCHITECTURAL DECISIONS — FINAL EXPLICIT ANSWERS

## 47. Every Major Decision, One Per Answer

**Decision 1: Append-only vs in-place updates**
Options: (a) update records in place, (b) append new records and mark old ones superseded. Recommendation: append-only for all substantive changes. Reasoning: preserves provenance, enables audit, prevents data decoherence, required for contradiction detection, required for temporal reasoning.

**Decision 2: JSON vs relational for fact values**
Options: (a) typed columns per fact type, (b) pure JSONB, (c) hybrid (typed key/category columns, JSONB value). Recommendation: hybrid. Reasoning: typed indexes on `fact_key` and `fact_category` enable efficient queries. JSONB `fact_value` handles variable content structure without migrations. Pre-computed `display_text` avoids JSONB serialization at retrieval time.

**Decision 3: Confidence scale**
Options: (a) binary known/unknown, (b) 1–10 integer, (c) 0–100 integer, (d) 0.000–1.000 decimal. Recommendation: 0.000–1.000 decimal (3 decimal places). Reasoning: maps naturally to linguistic qualifiers, supports gradual changes, universally understood by AI systems, compatible with probability-theoretic frameworks.

**Decision 4: Provenance model**
Options: (a) simple source tag (student/ai), (b) full taxonomy with 8+ provenance categories. Recommendation: full taxonomy with the 9 categories defined in Section 28. Reasoning: different provenance categories carry different trust implications. Collapsing them loses information the AI needs for calibrated reasoning.

**Decision 5: Retrieval ranking for Stage 25**
Options: (a) recency-first, (b) confidence-first, (c) importance-scored, (d) semantic similarity. Recommendation: recency-first with confidence as secondary sort. Reasoning: at this stage, WaxPrep does not have enough data to calibrate importance weights. Recency is the best proxy for relevance in educational contexts. Semantic similarity requires embeddings not yet implemented.

**Decision 6: Consolidation timing**
Options: (a) on-request (during AI call), (b) end-of-session (background job), (c) rolling (continuous). Recommendation: end-of-session background job as primary, supplemented by new-session trigger. Reasoning: background processing avoids latency in the critical path. End-of-session provides a clean boundary. Rolling summaries add complexity without sufficient benefit at this scale.

**Decision 7: Supersession strategy**
Options: (a) update in place, (b) soft-delete and replace, (c) append with status transition. Recommendation: append with status transition (status: 'superseded', superseded_by pointer). Reasoning: old fact permanently preserved for audit and AI reasoning about the student's history. Pointer enables following the chain of fact evolution.

**Decision 8: Indexing strategy**
Options: (a) index all columns, (b) index only primary lookup columns, (c) profile-based. Recommendation: composite indexes on all established query patterns as specified in Section 5. Reasoning: memory retrieval runs on every AI request — index misses become accumulated latency. Over-indexing slows writes but memory writes are infrequent compared to reads. The tradeoff favors read optimization.

**Decision 9: Token budgeting**
Options: (a) dynamic per-request budget, (b) static percentage of context, (c) fixed slot sizes. Recommendation: fixed named slots with configurable sizes from environment variables. Reasoning: predictable, testable, easy to tune. Named slots make the budget legible — you always know exactly why the memory budget is what it is.

**Decision 10: Privacy model**
Options: (a) store everything, handle deletion on request, (b) minimal storage with defined retention. Recommendation: minimal storage with defined retention periods and full NDPA deletion support. Reasoning: WaxPrep serves minors. The less stored, the less that can be misused, breached, or subject to complex regulatory treatment. Store only what serves educational quality.

**Decision 11: Single database vs split stack**
Options: (a) PostgreSQL only, (b) PostgreSQL + Redis for memory cache, (c) PostgreSQL + vector database. Recommendation: PostgreSQL only for Stages 22–26. Reasoning: no new infrastructure. ACID guarantees. pgvector is available when semantic retrieval is needed. Operational simplicity is critical for a solo founder.

**Decision 12: Memory write timing (when facts are extracted)**
Options: (a) real-time during tutoring session (AI flags facts mid-conversation), (b) post-session background extraction. Recommendation: post-session background extraction as primary. Reasoning: real-time extraction requires AI tool calls mid-conversation, adding latency and complexity. Post-session extraction produces better quality (the full session is available for analysis). The cost: facts from the current session are not available as memory within that same session — they are available in the next session. This is acceptable.

---

*This document constitutes the complete architectural blueprint for WaxPrep's persistent memory system, Stages 22 through 26. A senior AI engineer can implement all five stages using this document without additional research. Future stages (semantic search, assessment integration, parent portal, evaluation systems) extend this architecture without requiring redesign of any component specified above. The memory system this document describes is not the intelligence of WaxPrep — it is the infrastructure that gives the AI's intelligence continuity, context, and the evidence it needs to reason about students as individuals.*




Open in app
Sign up

Sign in

Search

Unknown user
Press enter or click to view image in full size

Brian Curry

Agentic Ai

Artificial Intelligence

The Memory Problem: Building Persistent, Queryable Memory for Production AI Agents
Brian James Curry
Brian James Curry

Follow
19 min read
·
Jun 27, 2026

Listen


Share

By Brian Curry | Vector1 Research

“An agent without memory is not an agent. It is a very expensive stateless function.”

Abstract
The dominant approach to AI agent memory in 2026 is wrong — not wrong in intent, but wrong in architecture. Most production systems treat memory as a retrieval problem: embed interactions, store them in a vector database, retrieve semantically similar chunks at query time. This works well enough for simple factual recall but fails systematically on the problems that matter most in production: temporal reasoning across long horizons, multi-hop relationship traversal, memory consolidation and forgetting, cross-agent memory synchronization, and the management of contradictory or outdated information.

This article presents a complete production architecture for agentic memory that goes beyond retrieval. Drawing on cognitive science’s taxonomy of memory types — episodic, semantic, procedural, and working — and building on the Memory-Node Encapsulation (MNE) data structure introduced in prior Vector1 Research work, we design a four-tier memory system that handles persistence, temporal indexing, consolidation, multi-scope access, and decay. We implement it with a concrete technology stack — Redis, Neo4j, Qdrant, and PostgreSQL — and provide full production code for the components that matter most. The result is a memory architecture that transforms agents from sophisticated stateless functions into systems capable of genuine long-horizon reasoning, relationship awareness, and accumulated expertise.

Keywords: Agentic AI, Memory Architecture, Episodic Memory, Semantic Memory, Memory-Node Encapsulation, MNE, Knowledge Graphs, Vector Retrieval, Multi-Agent Systems, Production AI, LangChain, LangGraph

I. Why Memory Is Still Broken
The state of agentic memory in mid-2026 is best understood by what the benchmarks reveal. The LoCoMo benchmark — 1,540 questions covering single-hop, multi-hop, open-domain, and temporal recall — shows that current systems perform well on single-hop factual recall and poorly on almost everything else. The LongMemEval benchmark, which covers multi-session recall, knowledge updates, and temporal reasoning, reveals a consistent pattern: as conversation history grows, performance degrades faster than context grows. Most systems that score well on accuracy require 26,000+ tokens per query — not production-viable.

Perhaps most damning: a December 2025 benchmark study found that a plain filesystem storing memories as markdown files scored 74% on standard memory tasks — beating dedicated vector-store memory libraries. When a folder of text files outperforms purpose-built memory infrastructure, the infrastructure has a design problem.

The root cause is a category error. Most memory systems are built by ML engineers who think about memory as a retrieval problem. The relevant discipline is actually cognitive architecture — how biological systems store, consolidate, retrieve, and forget information over time. The engineering failure is treating all memory as semantically equivalent and retrieval as the only operation that matters.

Human memory is not a vector database. It has structure that vector similarity cannot capture:

Episodic memory is time-indexed and contextual — not just what happened but when, where, and what else was happening. “The client called angry about the Q3 report three weeks before the contract renewal” is an episodic memory. Its retrieval should be triggered by context (client, contract, report), not just semantic similarity to a query.

Semantic memory is structured, relational, and atemporal — facts and relationships that persist independently of when they were learned. “Client A is in the healthcare vertical, headquartered in Boston, and reports to an IT steering committee” is semantic memory. It lives in a knowledge graph, not a vector index.

Procedural memory is task-knowledge — how to accomplish specific types of work. “When a client escalates a billing issue, always involve the VP of Finance in the first response” is procedural memory. It is triggered by situation type, not content similarity.

Working memory is the active context window — what the agent is currently reasoning about. It is fast, bounded, and temporary.

These memory types require different storage backends, different retrieval strategies, different update mechanisms, and different forgetting curves. Building a production memory system means engineering all four — and the connections between them.

II. The MNE Foundation
Before the full architecture, the core data structure. Memory-Node Encapsulation (MNE), introduced in prior Vector1 Research work, provides the atomic unit on which the entire production memory system is built.

An MNE node encapsulates a memory as a self-contained unit with four components:

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Optional
from enum import Enum
import uuid
import numpy as np
class MemoryType(Enum):
    EPISODIC   = "episodic"    # time-indexed events and interactions
    SEMANTIC   = "semantic"    # facts, relationships, domain knowledge
    PROCEDURAL = "procedural"  # task patterns and behavioral rules
    WORKING    = "working"     # active context, short-lived
class MemoryStatus(Enum):
    ACTIVE      = "active"
    CONSOLIDATED = "consolidated"  # moved from episodic → semantic
    DEPRECATED  = "deprecated"    # superseded by newer information
    ARCHIVED    = "archived"      # retained but low retrieval priority
@dataclass
class MNENode:
    """
    Memory-Node Encapsulation: the atomic unit of agentic memory.
    Each node represents a single memory — an event, a fact, a procedure,
    or a working context item — with full provenance, temporal indexing,
    relationship pointers, and a decay model.
    The four components:
    1. Content: the memory itself (text + structured metadata)
    2. Temporal: when it was created, last accessed, and how it decays
    3. Relational: connections to other nodes in the memory graph
    4. Epistemic: confidence, source quality, and contradiction flags
    """
    # Identity
    node_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    memory_type: MemoryType = MemoryType.EPISODIC
    status: MemoryStatus = MemoryStatus.ACTIVE
    # Content
    content: str = ""                          # natural language representation
    structured: dict[str, Any] = field(default_factory=dict)
    embedding: Optional[np.ndarray] = None     # dense vector for similarity search
    # Temporal
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_accessed: datetime = field(default_factory=datetime.utcnow)
    access_count: int = 0
    decay_rate: float = 0.01    # per day — episodic decays faster than semantic
    # Scope
    agent_id: Optional[str] = None    # which agent owns this memory
    session_id: Optional[str] = None  # which session created it
    user_id: Optional[str] = None     # which user it's associated with
    org_id: Optional[str] = None      # organizational scope
    # Relational
    parent_nodes: list[str] = field(default_factory=list)   # generalized from
    child_nodes: list[str] = field(default_factory=list)    # more specific than
    related_nodes: list[str] = field(default_factory=list)  # associated with
    # Epistemic
    confidence: float = 1.0          # 0-1 confidence in this memory
    source: str = ""                  # where this memory came from
    contradicts: list[str] = field(default_factory=list)  # conflicting node IDs
    def salience(self, current_time: datetime) -> float:
        """
        Computes current salience: how likely this memory is to be retrieved.
        Combines recency, access frequency, and confidence.
        Based on the Ebbinghaus forgetting curve, modified for digital systems:
        S(t) = confidence * access_boost * exp(-decay_rate * days_since_access)
        """
        days_since_access = (
            current_time - self.last_accessed
        ).total_seconds() / 86400
        # Access frequency boost (log scale — 10x accesses = 2x boost)
        access_boost = 1.0 + 0.5 * np.log1p(self.access_count)
        # Ebbinghaus-inspired decay
        recency_factor = np.exp(-self.decay_rate * days_since_access)
        return float(self.confidence * access_boost * recency_factor)
    def access(self) -> None:
        """Record an access — updates recency and count."""
        self.last_accessed = datetime.utcnow()
        self.access_count += 1
The salience() method is the core of the MNE design. Rather than treating all memories as equally retrievable, salience implements a computational forgetting curve — recent, frequently accessed, high-confidence memories are retrieved first. Old, rarely accessed memories fade unless periodically reinforced. This mirrors the neurological basis of human long-term memory retention and solves a real production problem: memory bloat. Without a forgetting mechanism, agent memory grows indefinitely and retrieval quality degrades.

The scope fields (agent_id, session_id, user_id, org_id) enable the multi-scope memory architecture that production systems require — the same memory infrastructure serving multiple agents, users, and organizational contexts simultaneously, with appropriate isolation.

III. The Four-Tier Production Architecture
The complete production architecture runs four storage tiers, each optimized for a specific memory type and access pattern:

┌─────────────────────────────────────────────────────────────────────┐
│  TIER 4: WORKING MEMORY                                             │
│  Redis (in-memory key-value)                                        │
│  Current session context · Active reasoning state · Tool results    │
│  TTL: session lifetime (minutes to hours)                           │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 3: EPISODIC MEMORY                                            │
│  Qdrant (vector database) + PostgreSQL (temporal index)             │
│  Interaction history · Events · Observations                        │
│  TTL: weeks to months (salience-gated archival)                     │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 2: SEMANTIC MEMORY                                            │
│  Neo4j (property graph)                                             │
│  Entities · Relationships · Facts · Domain Knowledge                │
│  TTL: indefinite (version-controlled updates)                       │
├─────────────────────────────────────────────────────────────────────┤
│  TIER 1: PROCEDURAL MEMORY                                          │
│  PostgreSQL (structured rules) + Qdrant (semantic matching)         │
│  Task patterns · Behavioral rules · Learned preferences            │
│  TTL: indefinite (reinforcement-updated)                            │
└─────────────────────────────────────────────────────────────────────┘
3.1 Technology Choices and Rationale
Redis for working memory — sub-millisecond access, TTL-native, supports complex data structures. The agent’s current reasoning state must be available in under 1ms; no other tier can meet this requirement.

Qdrant for episodic and procedural semantic search — the best production vector database for filtered similarity search. The must and should filter clauses allow scope-constrained retrieval (only memories from this user, only from the last 30 days) while maintaining vector similarity ranking.

PostgreSQL for temporal indexing and procedural rules — relational database with native timestamp indexing. Episodic memory is fundamentally a time-series problem; PostgreSQL’s partial indexes and timestamp range queries outperform vector databases for temporal access patterns.

Neo4j for semantic memory — property graphs are the correct data model for entity-relationship knowledge. The question “what do I know about Client A and everyone they’re connected to” is a graph traversal, not a vector similarity search. Neo4j’s Cypher query language handles multi-hop relationship traversal that would require multiple round-trips in a vector database.

3.2 The Memory Manager
The MemoryManager is the single interface through which agents interact with all four tiers:

import redis
import asyncpg
from qdrant_client import QdrantClient
from qdrant_client.models import Distance, VectorParams, PointStruct, Filter, FieldCondition, MatchValue
from neo4j import AsyncGraphDatabase
from sentence_transformers import SentenceTransformer
from datetime import datetime, timedelta
from typing import Optional
import json
import numpy as np
class MemoryManager:
    """
    Single interface for all four memory tiers.
    Handles:
    - Write routing: which tier(s) receive a new memory
    - Read orchestration: querying multiple tiers and merging results
    - Consolidation: promoting episodic → semantic as patterns emerge
    - Decay: archiving low-salience memories on a background schedule
    - Scope enforcement: isolating memories by agent, user, session, org
    Example:
        manager = MemoryManager(config)
        await manager.remember(node)                    # write
        results = await manager.recall("client issue")  # read
        await manager.consolidate()                     # background job
    """
    EMBEDDING_DIM = 768
    def __init__(self, config: dict):
        # Working memory: Redis
        self.redis = redis.Redis(
            host=config['redis']['host'],
            port=config['redis']['port'],
            decode_responses=False
        )
        # Episodic memory: Qdrant + PostgreSQL
        self.qdrant = QdrantClient(
            host=config['qdrant']['host'],
            port=config['qdrant']['port']
        )
        self._ensure_collections()
        # Semantic memory: Neo4j
        self.neo4j = AsyncGraphDatabase.driver(
            config['neo4j']['uri'],
            auth=(config['neo4j']['user'], config['neo4j']['password'])
        )
        # Embedding model
        self.embedder = SentenceTransformer('all-mpnet-base-v2')
    # ── Write ──────────────────────────────────────────────────────────
    async def remember(self, node: MNENode) -> str:
        """
        Write a memory node to the appropriate tier(s).
        Routing logic:
        - WORKING  → Redis only (TTL = session)
        - EPISODIC → Qdrant (vector) + PostgreSQL (temporal)
        - SEMANTIC → Neo4j (graph)
        - PROCEDURAL → PostgreSQL (rules) + Qdrant (semantic match)
        """
        # Generate embedding if not already set
        if node.embedding is None:
            node.embedding = self.embedder.encode(node.content)
        if node.memory_type == MemoryType.WORKING:
            await self._write_working(node)
        elif node.memory_type == MemoryType.EPISODIC:
            await self._write_episodic(node)
        elif node.memory_type == MemoryType.SEMANTIC:
            await self._write_semantic(node)
        elif node.memory_type == MemoryType.PROCEDURAL:
            await self._write_procedural(node)
        return node.node_id
    async def _write_episodic(self, node: MNENode) -> None:
        """Write episodic node to Qdrant + PostgreSQL."""
        # Qdrant: vector search index
        self.qdrant.upsert(
            collection_name="episodic",
            points=[PointStruct(
                id=node.node_id,
                vector=node.embedding.tolist(),
                payload={
                    "content": node.content,
                    "agent_id": node.agent_id,
                    "user_id": node.user_id,
                    "session_id": node.session_id,
                    "created_at": node.created_at.isoformat(),
                    "confidence": node.confidence,
                    "memory_type": node.memory_type.value,
                    "structured": json.dumps(node.structured)
                }
            )]
        )
        # PostgreSQL: temporal index for time-range queries
        async with self.pg_pool.acquire() as conn:
            await conn.execute("""
                INSERT INTO episodic_memories
                    (node_id, agent_id, user_id, session_id, content,
                     created_at, last_accessed, access_count, confidence,
                     decay_rate, structured, status)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                ON CONFLICT (node_id) DO UPDATE SET
                    last_accessed = EXCLUDED.last_accessed,
                    access_count = episodic_memories.access_count + 1
            """,
                node.node_id, node.agent_id, node.user_id,
                node.session_id, node.content, node.created_at,
                node.last_accessed, node.access_count, node.confidence,
                node.decay_rate, json.dumps(node.structured),
                node.status.value
            )
    async def _write_semantic(self, node: MNENode) -> None:
        """Write semantic node to Neo4j knowledge graph."""
        entity_type = node.structured.get("entity_type", "Concept")
        properties = {
            "node_id": node.node_id,
            "content": node.content,
            "confidence": node.confidence,
            "source": node.source,
            "created_at": node.created_at.isoformat(),
            **{k: v for k, v in node.structured.items()
               if isinstance(v, (str, int, float, bool))}
        }
        async with self.neo4j.session() as session:
            # Merge entity node
            await session.run(f"""
                MERGE (n:{entity_type} {{node_id: $node_id}})
                SET n += $properties
            """, node_id=node.node_id, properties=properties)
            # Create relationships to related nodes
            for related_id in node.related_nodes:
                rel_type = node.structured.get("relationship_type", "RELATED_TO")
                await session.run(f"""
                    MATCH (a {{node_id: $source_id}})
                    MATCH (b {{node_id: $target_id}})
                    MERGE (a)-[r:{rel_type}]->(b)
                    SET r.confidence = $confidence
                        r.created_at = $created_at
                """,
                    source_id=node.node_id,
                    target_id=related_id,
                    confidence=node.confidence,
                    created_at=node.created_at.isoformat()
                )
    # ── Read ───────────────────────────────────────────────────────────
    async def recall(
        self,
        query: str,
        memory_types: list[MemoryType] | None = None,
        agent_id: str | None = None,
        user_id: str | None = None,
        session_id: str | None = None,
        time_range_days: int | None = None,
        top_k: int = 10,
        min_salience: float = 0.1
    ) -> list[MNENode]:
        """
        Retrieve memories relevant to a query, across all applicable tiers.
        The recall pipeline:
        1. Embed the query
        2. Query each relevant tier with scope filters
        3. Merge and deduplicate results
        4. Re-rank by composite score: salience × semantic_similarity
        5. Return top_k results, update access counts
        """
        query_embedding = self.embedder.encode(query)
        memory_types = memory_types or [
            MemoryType.EPISODIC,
            MemoryType.SEMANTIC,
            MemoryType.PROCEDURAL
        ]
        results = []
        if MemoryType.EPISODIC in memory_types:
            episodic = await self._recall_episodic(
                query_embedding, agent_id, user_id, session_id,
                time_range_days, top_k * 2
            )
            results.extend(episodic)
        if MemoryType.SEMANTIC in memory_types:
            semantic = await self._recall_semantic(
                query, agent_id, top_k
            )
            results.extend(semantic)
        if MemoryType.PROCEDURAL in memory_types:
            procedural = await self._recall_procedural(
                query_embedding, agent_id, top_k
            )
            results.extend(procedural)
        # Deduplicate and rank
        seen = set()
        unique_results = []
        for node in results:
            if node.node_id not in seen:
                seen.add(node.node_id)
                unique_results.append(node)
        # Composite ranking: salience × cosine similarity
        now = datetime.utcnow()
        scored = []
        for node in unique_results:
            if node.embedding is not None:
                sim = float(np.dot(query_embedding, node.embedding) /
                           (np.linalg.norm(query_embedding) *
                            np.linalg.norm(node.embedding) + 1e-8))
            else:
                sim = 0.5
            sal = node.salience(now)
            if sal >= min_salience:
                scored.append((node, sal * sim))
        scored.sort(key=lambda x: x[1], reverse=True)
        top_results = [node for node, _ in scored[:top_k]]
        # Update access counts
        for node in top_results:
            node.access()
            await self._update_access(node)
        return top_results
    async def _recall_episodic(
        self,
        query_embedding: np.ndarray,
        agent_id: str | None,
        user_id: str | None,
        session_id: str | None,
        time_range_days: int | None,
        limit: int
    ) -> list[MNENode]:
        """Retrieve episodic memories from Qdrant with scope + time filters."""
        must_conditions = []
        if agent_id:
            must_conditions.append(
                FieldCondition(key="agent_id", match=MatchValue(value=agent_id))
            )
        if user_id:
            must_conditions.append(
                FieldCondition(key="user_id", match=MatchValue(value=user_id))
            )
        # Time range filter (last N days)
        if time_range_days:
            cutoff = (datetime.utcnow() - timedelta(days=time_range_days)).isoformat()
            must_conditions.append(
                FieldCondition(key="created_at", range={"gte": cutoff})
            )
        search_filter = Filter(must=must_conditions) if must_conditions else None
        hits = self.qdrant.search(
            collection_name="episodic",
            query_vector=query_embedding.tolist(),
            query_filter=search_filter,
            limit=limit,
            with_payload=True
        )
        nodes = []
        for hit in hits:
            payload = hit.payload
            node = MNENode(
                node_id=str(hit.id),
                memory_type=MemoryType.EPISODIC,
                content=payload.get("content", ""),
                agent_id=payload.get("agent_id"),
                user_id=payload.get("user_id"),
                session_id=payload.get("session_id"),
                confidence=payload.get("confidence", 1.0),
                created_at=datetime.fromisoformat(
                    payload.get("created_at", datetime.utcnow().isoformat())
                ),
                structured=json.loads(payload.get("structured", "{}")),
            )
            node.embedding = query_embedding  # approximate — recompute if needed
            nodes.append(node)
        return nodes
    async def _recall_semantic(
        self,
        query: str,
        agent_id: str | None,
        limit: int
    ) -> list[MNENode]:
        """Retrieve semantic memories from Neo4j using full-text + relationship traversal."""
        async with self.neo4j.session() as session:
            result = await session.run("""
                CALL db.index.fulltext.queryNodes('memory_content', $query)
                YIELD node, score
                WHERE ($agent_id IS NULL OR node.agent_id = $agent_id)
                  AND node.confidence >= 0.5
                RETURN node, score
                ORDER BY score DESC
                LIMIT $limit
            """, query=query, agent_id=agent_id, limit=limit)
            nodes = []
            async for record in result:
                props = dict(record["node"])
                node = MNENode(
                    node_id=props.get("node_id", ""),
                    memory_type=MemoryType.SEMANTIC,
                    content=props.get("content", ""),
                    confidence=props.get("confidence", 1.0),
                    source=props.get("source", ""),
                    structured={k: v for k, v in props.items()
                                if k not in ["node_id", "content",
                                             "confidence", "source"]}
                )
                nodes.append(node)
        return nodes
IV. Memory Consolidation: Episodic → Semantic
The most important — and most neglected — operation in production memory systems is consolidation: the process by which episodic memories (raw interaction history) are promoted into semantic memories (structured knowledge). Without consolidation, episodic memory grows without bound and semantic memory never reflects what the agent has actually learned.

Get Brian James Curry’s stories in your inbox
Join Medium for free to get updates from this writer.

Enter your email
Subscribe

Remember me for faster sign in

Biological consolidation happens during sleep. In production agents, it runs as a background job on a configurable schedule.

class MemoryConsolidator:
    """
    Promotes episodic memories into semantic knowledge through pattern detection.
    The consolidation pipeline:
    1. Cluster recent episodic memories by semantic similarity
    2. For each cluster above the density threshold, extract the common pattern
    3. Check if the pattern contradicts existing semantic memories
    4. If novel and consistent: create a new semantic MNE node
    5. If contradictory: flag both nodes for human review or update semantic
    6. Archive the consolidated episodic nodes (reduce salience, don't delete)
    Runs as a scheduled background task — typically nightly or hourly
    for high-volume agents.
    """
    def __init__(
        self,
        memory_manager: MemoryManager,
        llm_client,
        min_cluster_size: int = 3,
        similarity_threshold: float = 0.75
    ):
        self.mm = memory_manager
        self.llm = llm_client
        self.min_cluster_size = min_cluster_size
        self.sim_threshold = similarity_threshold
    async def consolidate(
        self,
        agent_id: str,
        lookback_days: int = 7
    ) -> dict:
        """
        Run the consolidation pipeline for a specific agent.
        Returns statistics on consolidation results.
        """
        # 1. Fetch recent episodic memories
        recent_episodic = await self._fetch_recent_episodic(
            agent_id, lookback_days
        )
        if len(recent_episodic) < self.min_cluster_size:
            return {"status": "skipped", "reason": "insufficient episodic memories"}
        # 2. Cluster by semantic similarity
        clusters = self._cluster_episodic(recent_episodic)
        consolidated_count = 0
        contradiction_count = 0
        for cluster in clusters:
            if len(cluster) < self.min_cluster_size:
                continue
            # 3. Extract semantic pattern from cluster
            pattern = await self._extract_pattern(cluster)
            if not pattern:
                continue
            # 4. Check for contradictions with existing semantic memory
            existing = await self.mm.recall(
                query=pattern['content'],
                memory_types=[MemoryType.SEMANTIC],
                agent_id=agent_id,
                top_k=3
            )
            contradiction = self._detect_contradiction(pattern, existing)
            if contradiction:
                # Flag for review rather than auto-updating
                await self._flag_contradiction(pattern, contradiction)
                contradiction_count += 1
            else:
                # Create new semantic memory node
                semantic_node = MNENode(
                    memory_type=MemoryType.SEMANTIC,
                    content=pattern['content'],
                    structured=pattern.get('structured', {}),
                    confidence=pattern.get('confidence', 0.8),
                    agent_id=agent_id,
                    source="consolidation",
                    parent_nodes=[n.node_id for n in cluster],
                    decay_rate=0.001  # semantic memory decays very slowly
                )
                await self.mm.remember(semantic_node)
                consolidated_count += 1
                # Archive source episodic nodes
                for episodic_node in cluster:
                    episodic_node.status = MemoryStatus.CONSOLIDATED
                    episodic_node.decay_rate *= 3.0  # accelerate decay post-consolidation
                    await self.mm._update_status(episodic_node)
        return {
            "status": "completed",
            "episodic_processed": len(recent_episodic),
            "clusters_found": len(clusters),
            "consolidated": consolidated_count,
            "contradictions_flagged": contradiction_count
        }
    async def _extract_pattern(self, cluster: list[MNENode]) -> dict | None:
        """
        Use LLM to extract the common semantic pattern from a cluster
        of episodic memories.
        """
        cluster_text = "\n\n".join([
            f"[{i+1}] {node.content}" for i, node in enumerate(cluster[:10])
        ])
        response = await self.llm.complete(f"""
        These are {len(cluster)} related interaction memories from an AI agent.
        Extract the core semantic pattern or fact they collectively establish.
        Memories:
        {cluster_text}
        Return JSON with:
        - "content": a single clear statement of the pattern/fact
        - "entity_type": the type of entity this is about (Person, Organization, Process, etc.)
        - "confidence": 0-1 confidence that this is a reliable pattern
        - "structured": key-value pairs of structured properties
        Return null if no clear pattern emerges.
        """)
        try:
            return json.loads(response.text)
        except (json.JSONDecodeError, AttributeError):
            return None
    def _cluster_episodic(
        self,
        nodes: list[MNENode]
    ) -> list[list[MNENode]]:
        """Cluster episodic nodes by embedding similarity."""
        if not nodes:
            return []
        embeddings = np.array([
            node.embedding for node in nodes
            if node.embedding is not None
        ])
        if len(embeddings) < 2:
            return [nodes]
        from sklearn.cluster import DBSCAN
        clustering = DBSCAN(
            eps=1 - self.sim_threshold,  # cosine distance threshold
            min_samples=self.min_cluster_size,
            metric='cosine'
        ).fit(embeddings)
        clusters = {}
        for i, label in enumerate(clustering.labels_):
            if label == -1:  # noise point
                continue
            clusters.setdefault(label, []).append(nodes[i])
        return list(clusters.values())
V. Multi-Agent Memory Synchronization
Production deployments rarely involve a single agent. A typical enterprise deployment has a coordinator agent, several specialist agents, and potentially user-facing agents — all needing access to a shared memory space with appropriate isolation.

The challenge is memory topology: which agents can read from which memory scopes, how writes propagate, and how conflicts between agents’ memories are resolved.

class MultiAgentMemoryBus:
    """
    Coordinates memory access across a multi-agent system.
    Memory visibility rules:
    - org_id scope:     visible to all agents in the organization
    - user_id scope:    visible to all agents serving this user
    - agent_id scope:   visible only to the specific agent
    - session_id scope: visible only within the current session
    Write propagation:
    - Agent writes to its own scope
    - Consolidation promotes to user or org scope based on generality
    - Coordinator agent can explicitly promote memories to wider scope
    """
    def __init__(self, memory_manager: MemoryManager):
        self.mm = memory_manager
        self._subscriptions: dict[str, list[callable]] = {}
    async def broadcast_memory(
        self,
        node: MNENode,
        target_scope: str,  # 'agent' | 'user' | 'org'
        source_agent_id: str
    ) -> None:
        """
        Broadcast a memory to a wider scope.
        Used when a specialist agent learns something that all agents should know.
        """
        broadcast_node = MNENode(
            memory_type=node.memory_type,
            content=node.content,
            structured=node.structured,
            confidence=node.confidence * 0.9,  # slight confidence reduction on broadcast
            source=f"broadcast_from:{source_agent_id}",
            parent_nodes=[node.node_id],
            decay_rate=node.decay_rate
        )
        if target_scope == 'org':
            broadcast_node.org_id = node.org_id
            broadcast_node.agent_id = None  # org-wide
        elif target_scope == 'user':
            broadcast_node.user_id = node.user_id
            broadcast_node.agent_id = None  # user-wide
        await self.mm.remember(broadcast_node)
        # Notify subscribed agents
        for callback in self._subscriptions.get(target_scope, []):
            await callback(broadcast_node)
    def subscribe(self, scope: str, callback: callable) -> None:
        """Subscribe an agent to memory broadcasts at a given scope."""
        self._subscriptions.setdefault(scope, []).append(callback)
    async def resolve_conflict(
        self,
        node_a: MNENode,
        node_b: MNENode,
        resolution_strategy: str = "confidence_weighted"
    ) -> MNENode:
        """
        Resolve conflicting memories from different agents.
        Strategies:
        - confidence_weighted: weight content by confidence scores
        - recency: prefer the more recent memory
        - authority: prefer the memory from the designated authoritative agent
        """
        if resolution_strategy == "confidence_weighted":
            if node_a.confidence >= node_b.confidence:
                winner = node_a
                loser = node_b
            else:
                winner = node_b
                loser = node_a
            # Mark loser as deprecated but don't delete
            loser.status = MemoryStatus.DEPRECATED
            loser.contradicts.append(winner.node_id)
            await self.mm._update_status(loser)
            return winner
        elif resolution_strategy == "recency":
            return node_a if node_a.created_at > node_b.created_at else node_b
        return node_a  # fallback
VI. The Production Memory Interface: Connecting to LangChain / LangGraph
The architecture above is framework-agnostic. Here is how to connect it to LangChain as a drop-in memory replacement:

from langchain.memory import BaseMemory
from langchain.schema import BaseMessage, HumanMessage, AIMessage
from typing import Dict, List, Any
class MNEMemory(BaseMemory):
    """
    LangChain-compatible memory class backed by the full MNE architecture.
    Replaces LangChain's built-in memory types with the four-tier
    MNE system. Drop-in replacement — existing LangChain chains and
    agents work without modification.
    Usage:
        memory = MNEMemory(
            memory_manager=manager,
            agent_id="sales_agent_001",
            user_id="user_abc",
            session_id="session_xyz"
        )
        chain = LLMChain(llm=llm, prompt=prompt, memory=memory)
    """
    memory_manager: Any  # MemoryManager instance
    agent_id: str
    user_id: str
    session_id: str
    memory_key: str = "chat_history"
    return_messages: bool = True
    class Config:
        arbitrary_types_allowed = True
    @property
    def memory_variables(self) -> List[str]:
        return [self.memory_key]
    def load_memory_variables(self, inputs: Dict[str, Any]) -> Dict[str, Any]:
        """
        Load relevant memories for the current input.
        Called by LangChain before each LLM invocation.
        """
        import asyncio
        query = inputs.get("input", inputs.get("question", ""))
        # Run async recall in sync context
        loop = asyncio.get_event_loop()
        memories = loop.run_until_complete(
            self.memory_manager.recall(
                query=query,
                agent_id=self.agent_id,
                user_id=self.user_id,
                session_id=self.session_id,
                top_k=8
            )
        )
        # Format as LangChain messages
        messages = []
        for mem in memories:
            if mem.structured.get("role") == "human":
                messages.append(HumanMessage(content=mem.content))
            else:
                messages.append(AIMessage(content=mem.content))
        return {self.memory_key: messages}
    def save_context(
        self,
        inputs: Dict[str, Any],
        outputs: Dict[str, str]
    ) -> None:
        """
        Save the current interaction to episodic memory.
        Called by LangChain after each LLM invocation.
        """
        import asyncio
        human_input = inputs.get("input", inputs.get("question", ""))
        ai_output = outputs.get("output", outputs.get("response", ""))
        loop = asyncio.get_event_loop()
        # Save human turn
        human_node = MNENode(
            memory_type=MemoryType.EPISODIC,
            content=human_input,
            agent_id=self.agent_id,
            user_id=self.user_id,
            session_id=self.session_id,
            structured={"role": "human"},
            decay_rate=0.02
        )
        loop.run_until_complete(self.memory_manager.remember(human_node))
        # Save AI turn
        ai_node = MNENode(
            memory_type=MemoryType.EPISODIC,
            content=ai_output,
            agent_id=self.agent_id,
            user_id=self.user_id,
            session_id=self.session_id,
            structured={"role": "ai"},
            decay_rate=0.02,
            parent_nodes=[human_node.node_id]
        )
        loop.run_until_complete(self.memory_manager.remember(ai_node))
    def clear(self) -> None:
        """Clear working memory for the current session."""
        self.memory_manager.redis.delete(f"working:{self.session_id}")
VII. Production Considerations
7.1 Memory Drift and Contradiction Management
The most insidious production failure mode is memory drift: the agent’s semantic memory accumulates contradictory or outdated facts without a mechanism to detect or resolve them. An agent that knew a client’s budget was $50K last quarter but has never updated that fact will confidently provide wrong information.

The solution is temporal versioning on all semantic memory nodes. Every update creates a new node version; the previous version is deprecated but retained for audit purposes. Contradiction detection runs as part of the write pipeline, not as a background job:

async def write_with_contradiction_check(
    self,
    new_node: MNENode,
    contradiction_threshold: float = 0.85
) -> tuple[str, list[str]]:
    """
    Write a memory node, checking for contradictions first.
    Returns the node_id and a list of contradicting node_ids if found.
    """
    # Find semantically similar existing memories
    similar = await self.recall(
        query=new_node.content,
        memory_types=[new_node.memory_type],
        agent_id=new_node.agent_id,
        top_k=5,
        min_salience=0.0  # check all, even low-salience
    )
    contradictions = []
    for existing in similar:
        if existing.embedding is not None and new_node.embedding is not None:
            sim = float(np.dot(new_node.embedding, existing.embedding) /
                       (np.linalg.norm(new_node.embedding) *
                        np.linalg.norm(existing.embedding) + 1e-8))
            # High similarity but different structured content = likely contradiction
            if sim > contradiction_threshold:
                if self._content_contradicts(new_node, existing):
                    contradictions.append(existing.node_id)
                    existing.contradicts.append(new_node.node_id)
                    await self._update_status(existing)
    new_node.contradicts = contradictions
    node_id = await self.remember(new_node)
    return node_id, contradictions
7.2 Benchmarking Your Memory System
Before shipping a production memory system, validate against the three standard benchmarks:

LoCoMo (1,540 questions, single-hop, multi-hop, temporal): target >85% accuracy
LongMemEval (500 questions, knowledge updates, multi-session): target >75% on knowledge update category specifically
BEAM (1M and 10M token scale): measure latency and token consumption alongside accuracy
The production viability test: if your system requires >5,000 tokens per query at P95, it is not production-viable regardless of accuracy. Optimize for the accuracy/token tradeoff explicitly.

7.3 Deployment Architecture
# docker-compose.yml for local development
services:
  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    command: redis-server --maxmemory 2gb --maxmemory-policy allkeys-lru
  qdrant:
    image: qdrant/qdrant:latest
    ports: ["6333:6333", "6334:6334"]
    volumes: ["./qdrant_storage:/qdrant/storage"]
  neo4j:
    image: neo4j:5-community
    ports: ["7474:7474", "7687:7687"]
    environment:
      NEO4J_AUTH: neo4j/canary_memory
      NEO4J_PLUGINS: '["apoc", "graph-data-science"]'
    volumes: ["./neo4j_data:/data"]
  postgres:
    image: postgres:16-alpine
    ports: ["5432:5432"]
    environment:
      POSTGRES_DB: agent_memory
      POSTGRES_USER: agent
      POSTGRES_PASSWORD: memory_pass
    volumes: ["./pg_data:/var/lib/postgresql/data"]
For production on Kubernetes, use managed services: Redis Cloud or Upstash for working memory, Qdrant Cloud for vector search, Neo4j AuraDB for the knowledge graph, and RDS PostgreSQL for temporal indexing.

VIII. Where MNE Goes Next
The architecture in this article represents the production layer of MNE. Several research directions extend it further:

Multimodal memory — extending MNENode to hold image, audio, and structured data embeddings alongside text. MemVerse (December 2025) demonstrated viable multimodal episodic memory; the MNE structure supports this extension natively through the structured dict.

Reinforcement-updated procedural memory — using agent outcome data to update the confidence weights of procedural memory nodes. Procedures that consistently produce good outcomes gain confidence; those associated with failures decay faster.

Cross-agent memory transfer — formalizing the protocol for agents to share memory graphs. The multi-agent bus described in Section V is a starting point; a full transfer protocol would include memory provenance attestation, conflict resolution across organizational boundaries, and privacy-preserving memory sharing.

Memory as fine-tuning signal — using high-salience, high-confidence MNE nodes as training signal for model fine-tuning. The memories an agent returns to most frequently represent the most important learned context; distilling that into model weights is a natural extension.

Getting Started
The MNE data structure and the MemoryManager described in this article are available as part of ongoing Vector1 Research open-source work:

# Coming soon
pip install mne-memory
The full architecture is currently in active development. Design discussions, issue tracking, and contribution opportunities are available at github.com/Bodhi8/mne.

For the original MNE specification and cognitive architecture foundations, see the Memory-Node Encapsulation paper on Medium.

References
Tulving, E. (1972). Episodic and semantic memory. In E. Tulving & W. Donaldson (Eds.), Organization of Memory. Academic Press. [Foundational memory taxonomy]
Chhikara, P. et al. (2025). Mem0: Building production-ready AI agents with scalable long-term memory. ECAI 2025. arXiv:2504.19413.
Xu, X. et al. (2025). A-Mem: Agentic memory for LLM agents. arXiv preprint.
Hu, Y. et al. (2025). A survey on the memory mechanism of large language model based agents. ACM TOIS.
Kinniment, M. et al. (2024). Evaluating language-model agents on realistic autonomous tasks. NeurIPS 2024.
Lewis, P. et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. NeurIPS 2020. [RAG foundations]
Jiang, D. et al. (2026). MAGMA: A multi-graph based agentic memory architecture. arXiv:2601.03236.
Huo, Y. et al. (2026). AtomMem: Learnable dynamic agentic memory with atomic memory operation. arXiv:2601.08323.
Vectorize.io. (2026, March). Best AI agent memory systems in 2026: 8 frameworks compared.
Mem0.ai. (2026, May). State of AI agent memory 2026: Benchmarks, architectures, and production gaps.
Ebbinghaus, H. (1885). Über das Gedächtnis [On Memory]. Duncker & Humblot. [Forgetting curve foundations]
Curry, B. (2024). Memory-Node Encapsulation (MNE): A revolutionary data structure for artificial episodic memory. Vector1 Research / Medium.
Curry, B. (2024–2026). Vector1 Research Series. Medium / vector1.ai.
About the Author

Brian Curry is a Kansas City–based AI researcher, data scientist, and founder of Vector1 Research, where he works at the intersection of cognitive AI architecture, production agent systems, and knowledge engineering. He is the creator of Memory-Node Encapsulation (MNE), Papilon, and MeaningFlow.

Connect: Medium · LinkedIn · vector1.ai · brian@vector1.ai

1


Brian Curry

Agentic Ai

Artificial Intelligence

1



Brian James Curry

Follow

Written by Brian James Curry
734 followers
·
18 following
Senior AI & Data Science Leader. Founder, Vector1 Research. Causal inference, agent systems, and AI strategy for the enterprise.

