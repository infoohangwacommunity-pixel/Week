# ADR 001: Memory System Architecture (Stages 22-26)
**Status:** Accepted  **Date:** 2026-09-05  **Authors:** AI Coding Agent

## Context
WaxPrep requires a robust memory system to enable the AI tutor to remember students across sessions.

## Decision
We implement a PostgreSQL-based memory system with:
- **Relational-first approach** using existing PostgreSQL infrastructure
- **Append-only architecture** - no hard deletes, supersession for updates
- **WaxID isolation** - enforced at database level via foreign keys
- **Future-proof** - embedding columns for future semantic search (pgvector)

## Tables
- **student_facts**: Core profile facts with confidence tracking
- **student_episodes**: Session summaries with metadata
- **memory_contradictions**: Track conflicting facts
- **memory_confidence_history**: Append-only confidence changes
- **memory_retrieval_log**: Observability for retrieval

## Consequences
- Production-ready relational schema with full ACID guarantees
- Zero new infrastructure required (uses existing PostgreSQL)
- Forward-compatible with pgvector for future semantic search
- Strong WaxID isolation at database level
- Append-only design prevents data decoherence

## Implementation
- Migration: `infra/migrations/005_memory_foundation.sql`
- Core classes: `src/memory/StudentMemoryAccess.js`, `MemoryWriter.js`, `MemoryRetriever.js`
