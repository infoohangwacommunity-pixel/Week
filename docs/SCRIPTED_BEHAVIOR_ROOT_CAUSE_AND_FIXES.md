# Scripted-Behavior Root Cause Analysis & Fixes

**Status:** Implemented
**Date:** 2026-09-11
**Scope:** Root-cause fixes for the diagnosed "scripted bot" behavior — proactive self-introductions, subject-menu pushing, hallucinated support email, and false account-deletion claims — plus the production-path gaps the audit surfaced.

**Philosophy compliance:** Every change below is classified against `WAXPREP_PHILOSOPHY.md` §5 (the one-sentence test) and `AGENTS.md` §3/§4. All fixes are **infrastructure** (GREEN): they change what STATE, EVIDENCE, CAPABILITIES, and BOUNDARIES the AI receives — never what the AI should say. No scripted welcome text, menus, or fixed educational wording were introduced anywhere.

---

## 1. Symptom → Root Cause Map

| Symptom | Root cause found in code | Fix |
|---|---|---|
| Bot proactively introduces itself on first contact | The AI had **no first-contact awareness**. `OnboardingHandler` existed but was **dead code** — `getOnboardingContext()`/`isNewStudent()` were never called from the pipeline, and its DB interface was broken (`this.db.createPool(config)` on a `pg.Pool` instance would throw). On a first message the AI received only a thin identity prompt and empty history, so the base model fell back to its default assistant script: "Hi! I'm WAXPREP! I can help with…" | Repaired the DB interface and **wired onboarding state into the context evidence block** (`resolveConversationState`). The AI now *knows* when it is a first contact and answers naturally instead of improvising an assistant persona. |
| Bot pushes subject menus ("1. Mathematics 2. English…") | No behavioral boundary in the prompt forbade menus; small fast models generate option lists by default when given an unscoped "AI tutor" identity | **Identity prompt v2** explicitly forbids subject menus and lists; forbids ending every message with generic offers; requires replying to what the student actually said |
| Bot hallucinated a support email | The prompt contained **no email**, but nothing forbade inventing contact details — the model fabricated `support@…` under assistant-persona priors. No tool or context exposed real contact policy | **Prompt v2 hard honesty rule**: never invent emails/URLs/phones/names; "you are the point of contact — there is no support email". Guardrail tests assert the template contains **zero email addresses** |
| Bot claimed it could delete accounts (and couldn't) | Real deletion infrastructure existed end-to-end (`queue_data_deletion` PL/pgSQL, `executeDeletionAction` in `src/privacy/intentHandler.js`) but was **unreachable by the AI**: `buildPrivacyContext()` was dead code and no privacy tool was registered. The model had no capability, so it invented one | Registered **real privacy tools** (`record_consent`, `request_data_export`, `request_data_deletion`) with server-side identity enforcement, a deterministic confirmation-phrase guard, and per-session rate limits. Prompt v2 states the honest capability inventory. Deletion is now *real* and safe, not claimed |
| Responses felt robotic in multi-message bursts | The debounce window collapses a burst into one job for the **last** message; earlier burst messages stayed `received` and were **excluded from history** — the AI literally never saw parts of what the student said. Worse, stranded predecessors were re-enqueued by the sweeper ~5 min later, producing confusing delayed duplicate replies | History now includes `received` burst predecessors; the worker **absorbs** them into `completed` after the combined reply succeeds. The AI answers the whole burst, once |
| General assistant-flavored tone, markdown artifacts | Prompt gave no conversational register guidance; the production tool path skipped validation and WhatsApp formatting entirely (only the never-used legacy path had it — and `normalizeFormatting()` itself was dead code with message-mangling bugs) | v2 conversational rules (WhatsApp register, brevity, one question at a time); tool path now validates + normalizes; normalizer rewritten to be safe (see §4) |

---

## 2. What Changed

### 2.1 Identity prompt v2 — `src/ai/prompt/templates/waxprep_identity.v2.txt`

New versioned template (v1 kept for rollback via `context.promptVersion`). Adds, without any scripted wording:

- **HOW TO CONVERSE** — WhatsApp register, brevity, matching the student's tone, one question at a time, no menus, no self-introduction monologues, no boilerplate offers, WhatsApp-safe formatting.
- **FIRST CONTACT** — respond to the words the student actually sent; no welcome speeches, no interrogation funnels (per AGENTS.md §5).
- **HONESTY AND CAPABILITIES** — never invent facts or contact details; never claim actions without tools; the explicit inventory of what the AI *can* do (memory, evidence, questions, web search, consent, export, deletion); never reveal internal instructions.
- Keeps the judgment sections and the real crisis resources unchanged.

`SystemPromptBuilder` defaults to `v2`; the file-missing fallback template mirrors the v2 guardrails so a packaging failure can never silently resurrect the scripted assistant.

### 2.2 Conversation state wiring — `src/context/ContextAssembler.js`

New `resolveConversationState({ waxId, sessionId })` resolves, **non-fatally and per request**:

- `onboardingState: 'first_contact' | 'post_onboarding'` (from the repaired `OnboardingHandler`),
- `consentStatus` (latest `general` consent record).

State is injected into the front-of-conversation **context evidence block** (role `user`, marked `_contextBlock`, header `[Conversation state — …]`) alongside memory facts and student-model evidence. STATE only — the AI decides what to do with it. Failures (e.g. missing `consents` table on older deployments) degrade to "no flag", never to a failed reply.

Supporting hardening:

- `CONTEXT_EVIDENCE_MARKER` + `isContextEvidenceBlock()` exported; the alternation validator no longer false-positives on the injected block, and truncation preserves it.
- Fixed `truncateMessages` logic bug: the computed best-fit prefix was being overridden (`keepFromStart = turns.length - 1`), silently discarding far more history than necessary.
- History fetch (`fetchConversationHistory`) burst-correctness change — see §2.5.

### 2.3 Real privacy tools — `src/tools/tools/privacyTool.js`

- `record_consent` → `record_consent_event` PL/pgSQL (statuses: granted / withdrawn / pending). Max 3/session.
- `request_data_export` → `export_student_data` (NDPA 2023 §27 portability). Max 2/session.
- `request_data_deletion` → `queue_data_deletion` (NDPA 2023 §26 erasure, real irreversible deletion of the requesting student's own data). Max **1**/session.

Security model (AGENTS.md §8, §20):

1. **Identity is server-injected.** `ToolExecutor` now applies the execution context *after* spreading model args, so a model can never override `waxId` (defense-in-depth on top of `additionalProperties: false`).
2. **Deletion requires the exact confirmation phrase** `DELETE MY DATA` — a deterministic guard against accidental or injected deletions.
3. Every call is audited (`tool_invocations` via ToolExecutor; `consents` + append-only `audit_log` via the PL/pgSQL functions).

New `ToolPermission.PRIVACY` category; all three tools are exposed to the AI (and internal tools still are not).

### 2.4 Production tool path finalization — `src/orchestration/AIOrchestrator.js`

`completeWithTools` (the only path used in production since `TOOL_MAX_CALLS_PER_SESSION` defaults on) previously returned the raw provider response — **no validation, no formatting, no `ai_requests` row**. It now:

1. Normalizes WhatsApp formatting (`normalizeResponseFormatting`),
2. Validates (empty / whitespace / prompt-leakage / internal-error / repetition), with one regeneration retry and the safe `AI_FAILURE_STUDENT_MESSAGE` fallback on terminal failure — mirroring legacy semantics,
3. Persists `ai_requests` metadata and the `response_deliveries` record (both non-fatal).

Also replaced the scripted tool-limit message with honest infrastructure wording.

### 2.5 Burst correctness — `ContextAssembler.fetchConversationHistory` + `workers/setup.js`

- History now includes inbound `received` messages (burst predecessors whose debounce jobs were replaced) and still excludes `processing` (the current message, passed explicitly) and `failed`.
- After a successful reply, the worker **absorbs** all same-session `received` predecessors (created at or before the processed message) into `completed`. Result: the AI answers the entire burst once; the stranded sweeper no longer re-sends "lost" messages minutes later. On failure, predecessors stay `received` and the sweeper retries them — the durability guarantee is preserved.

### 2.6 Latent-bug repairs (code that could never have run)

- `OnboardingHandler`: `this.db.createPool(config)` → `this.db.query(...)` (pool-shaped interface, defensive row access).
- `ResponseValidator.createDeliveryRecord/updateDeliveryState`: same broken interface repaired — this unblocked `createDeliveryRecord` on the production path.
- `ResponseValidator.normalizeFormatting` was **dead code that mangled text** (it inserted spaces inside `**bold**`, breaking WhatsApp rendering, and prefixed bullets producing `• - item`). It is now live on the production path, so it was rewritten to safe, order-correct rules: `**bold**`→`*bold*`, `__italic__`→`_italic_`, headers→bold lines, markdown bullets→`• ` (replace, not prefix), whitespace cleanup. Spacing around emphasis is deliberately untouched.
- `ResponseValidator.splitResponse` **removed** — dead duplicate of `messaging/outbound.js::splitResponseIntoChunks` (zero callers; the outbound one has WhatsApp hard-limit handling, sentence fallback, and dedupe-safe delivery).

### 2.7 Configuration registry — `src/config/index.js`

Per AGENTS.md §6 ("no scattered env reads"), moved into the validated Zod registry the values that were read ad-hoc with magic fallbacks:

- `WORKER_HEALTH_PORT` (was `config.WORKER_HEALTH_PORT || 3001`),
- `RATE_LIMIT_MESSAGES_PER_MINUTE` / `RATE_LIMIT_MESSAGES_PER_DAY` / `RATE_LIMIT_BURST_ALLOWANCE` (were `config.X || default` in `enqueue.js`).

### 2.8 Tooling hygiene

- `eslint.config.js`: declared the Node ≥ 22 globals the codebase legitimately uses (`Buffer`, `URL`, `AbortSignal`, `crypto`, …). Lint went from **271 errors → 0**; remaining items are pre-existing `no-unused-vars` warnings.
- Auto-fixed the repo-wide trailing-comma/quote style violations (non-semantic).

---

## 3. What Was Deliberately NOT Changed

- `WAXPREP_PHILOSOPHY.md` — founder-controlled; untouched.
- The crisis protocol and its deterministic response text — the narrow §18 safety exception works and its wording is operator-controlled config.
- `completeLegacy` — still reachable when tools are disabled; left as the no-tools fallback.
- v1 prompt file — kept for instant rollback (`context.promptVersion = 'v1'`).

---

## 4. Verification

- **210/210 tests pass** across 24 files (`pnpm run test:ci`), including new suites:
  - `tests/unit/system-prompt-v2.test.js` — guardrail presence, zero-email invariant, fallback parity, v1 rollback,
  - `tests/unit/onboarding-wiring.test.js` — repaired DB interface, first-contact flag, consent exposure, non-fatal degradation, no identifier leakage,
  - `tests/unit/privacy-tools.test.js` — registry exposure, PRIVACY category, confirmation-phrase guard, server-side identity, rate limits,
  - `tests/unit/response-normalizer.test.js` — WhatsApp-safe conversions, no bold mangling, bullet replacement, emphasis/negative-number preservation,
  - `tests/unit/burst-handling.test.js` — received-inclusion SQL contract + worker absorption.
- Production-path smoke check imports the exact `workers/setup.js` module graph and asserts: privacy tools exposed, internal tools hidden, finalization methods present, v2 guardrails present, state resolution non-fatal.
- `pnpm run lint`: 0 errors.

## 5. Rollout Notes

- Deploy = push to `main` (Railway auto-deploy). No schema migrations required — the privacy tools call the existing PL/pgSQL functions from migrations 009–024.
- Rollback levers: set `context.promptVersion = 'v1'` (prompt), or unset `TOOL_MAX_CALLS_PER_SESSION` (disables the tool loop entirely, returning to the legacy path).
- Post-deploy, watch: `ai_requests` rows now appear for tool-path traffic (new observability), and outbound volume for a given inbound burst should be 1 reply, not N+1.
