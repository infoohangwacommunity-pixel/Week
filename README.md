# WaxPrep

**AI-first WhatsApp tutoring platform for Nigerian secondary-school students** (WAEC, NECO, JAMB, BECE).

> The AI is the intelligence. The software is the infrastructure.

WaxPrep is not a curriculum database with a chatbot attached. It is an AI tutor with infrastructure built around it — memory, evidence, tools, retrieval, safety, and delivery — designed so the AI keeps full educational judgment. See [`WAXPREP_PHILOSOPHY.md`](./WAXPREP_PHILOSOPHY.md) (foundational, founder-controlled) and [`AGENTS.md`](./AGENTS.md) (coding-agent constitution) before contributing.

## Architecture (core loop)

```
Student ⇄ WhatsApp Cloud API
        ⇄ Webhook (signature verify → dedupe → rate limit)
        ⇄ BullMQ (debounced, durable; Postgres-backed recovery sweeper)
        ⇄ AI Worker (context assembly → tool loop → validation → chunked delivery)
        ⇄ Postgres (students, sessions, messages, memory, evidence, safety, audit)
```

Key paths:

| Path | Entry |
|---|---|
| HTTP server + webhook | `src/server.js`, `src/webhook/router.js` |
| Queue ingestion / debounce | `src/webhook/enqueue.js` |
| AI worker (production AI path) | `src/workers/aiWorker.js`, `src/workers/setup.js` |
| Orchestration (tool loop, fallback, validation) | `src/orchestration/AIOrchestrator.js` |
| Context assembly (history, memory, student model, conversation state) | `src/context/ContextAssembler.js` |
| System prompt (versioned templates) | `src/ai/prompt/SystemPromptBuilder.js`, `src/ai/prompt/templates/` |
| Tools (memory, evidence, retrieval, assessment, privacy) | `src/tools/` |
| WhatsApp delivery (chunking, retries, audit trail) | `src/messaging/outbound.js` |
| Safety (crisis classifier + deterministic protocol) | `src/safety/` |
| Privacy (consent, deletion, export — NDPA 2023) | `src/privacy/`, `src/tools/tools/privacyTool.js` |
| Database migrations | `infra/migrations/` |

## Runtime

- **Node.js 22** (exact minor range in `package.json`), **pnpm**
- **Railway** deployment: `pnpm start` runs migrations, starts the AI worker, then the webhook server
- Required environment variables are defined and validated in `src/config/index.js` (Zod) — check startup logs for the full list; never commit real secrets

## Development

```bash
pnpm install
pnpm run dev          # webhook server (watch mode)
pnpm run dev:worker   # AI worker (watch mode)
pnpm run migrate      # apply infra/migrations
pnpm run test:ci      # full vitest suite
pnpm run lint         # eslint (0 errors expected)
```

The test suite runs with permissive test defaults (`NODE_ENV=test`); no real API keys or databases are required.

## AI behavior contract (short version)

- **Infrastructure exposes state, evidence, tools, and boundaries.** It never scripts educational wording — no welcome scripts, no subject menus, no fixed interventions (philosophy §8–§10).
- **The tutor is honest by construction:** it cannot invent contact details or claim capabilities it lacks — privacy actions (consent, export, deletion) are real server-side tools scoped to the calling student.
- Responses are validated and WhatsApp-normalized before delivery; every AI call and tool call is persisted for observability.

For the full diagnosis-and-fix record that established this contract, see [`docs/SCRIPTED_BEHAVIOR_ROOT_CAUSE_AND_FIXES.md`](./docs/SCRIPTED_BEHAVIOR_ROOT_CAUSE_AND_FIXES.md).

## Git safety

`main` is protected by convention: no force-push, no history rewrites, no branch deletion. Work lands through reviewed fix/feature branches (see AGENTS.md §10–§14).
