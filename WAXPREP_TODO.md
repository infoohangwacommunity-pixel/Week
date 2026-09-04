# WAXPREP TODO

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

## COMPLETED WORK / NOTES

- 


## IMPORTANT

This document changes as the project develops.

The founder decides what should be researched or built next.

Do not invent additional work or expand the scope without explicit authorization.






the research to follow


Now I have the full picture. This is an enormous, serious technical brief. Let me research the most current production details before writing the comprehensive document.

I now have enough deep research across all critical technical domains. Let me write the comprehensive document — this will be extremely long as requested.

---

# WAXPREP — COMPLETE PRODUCTION-GRADE TECHNICAL RESEARCH DOCUMENT
## Stages 1 through 14 + Full Cross-Stage Architecture
### Principal Systems Architect / Senior Backend / AI Systems / Security / DevOps Lead
### Research Date: September 2026

---

# PREFACE: HOW TO READ THIS DOCUMENT

This document is structured strictly around Stages 1–14. Each stage follows a 25-point research template. After Stage 14, there is a comprehensive cross-stage architecture section (A through H). All claims are labeled with their confidence level:

- **[FACT]** — Verified from official documentation or confirmed production behavior
- **[BEST PRACTICE]** — Established production pattern with broad industry consensus
- **[RECOMMENDATION]** — Research-backed recommendation specific to WaxPrep
- **[TRADE-OFF]** — A decision with meaningful pros and cons, requiring judgment
- **[ASSUMPTION]** — Reasonable working assumption that should be verified
- **[UNKNOWN / NEEDS VERIFICATION]** — Explicitly uncertain; must be researched further before implementation

---

# STAGE 1 — PROJECT FOUNDATION

## 1. Purpose
To establish the professional Node.js repository structure, deployment pipeline, development tooling, and organizational conventions that every subsequent stage will depend on. This stage is the bedrock. Flaws here become systemic debt.

## 2. What the Original Plan Says
Research long-lived Node.js repository architecture, src/tests/docs/infra organization, package.json, dependency management, npm/pnpm/yarn trade-offs, Node.js runtime version strategy, GitHub repository setup, .gitignore, README, CONTRIBUTING, documentation structure, Railway deployment, Git branching for a solo developer, safe branch workflow, build/start commands, health endpoints, deployment behavior, deployment failures, rollback considerations, environment-based configuration, and avoidance of architecture debt without overengineering.

## 3. Deep Research Findings

**Repository Structure — JavaScript vs TypeScript**

**[TRADE-OFF]** The brief specifies Node.js / JavaScript as the primary language. This is a legitimate choice for a cost-conscious startup. Pure JavaScript avoids the compilation step, build tooling complexity, type declaration overhead, and the cognitive overhead of type system design. The trade-offs are real: without TypeScript, you lose compile-time safety, IDE inference, and self-documenting interfaces. For an AI-first tutoring system with complex data flows, untyped code accumulates silent bugs.

**[RECOMMENDATION]** Use plain JavaScript (ES2022+ via `.js` files with `"type": "module"` or CommonJS) consistently. However, invest heavily in JSDoc type annotations (`@param`, `@returns`, `@typedef`) to get IDE inference and documentation without a build step. If TypeScript is adopted later, JSDoc-annotated JavaScript can be migrated incrementally. Do not start with TypeScript if the team is not already fluent — the compilation layer, tsconfig complexity, and declaration management create real friction at startup speed.

**Node.js Version Strategy**

**[FACT]** Node.js releases LTS versions every October. As of 2026, Node.js 22.x is LTS (Active). Node.js 20.x is in Maintenance LTS. Node.js 18.x reached End-of-Life in April 2025. **[RECOMMENDATION]** Target Node.js 22.x LTS. Specify the engine exactly in `package.json`:

```json
"engines": {
  "node": ">=22.0.0 <23.0.0"
}
```

**[FACT]** Railway uses Railpack (formerly Nixpacks) to detect the Node.js version. If an `.nvmrc`, `.node-version`, or `engines.node` field is present, Railway respects it. Without one, Railway defaults to its bundled Node.js version which may not match your development environment. **[RECOMMENDATION]** Commit an `.nvmrc` file with the exact version string (e.g., `22.11.0`) and set `engines.node` in `package.json` to match.

**Package Manager Choice**

**[TRADE-OFF]**

- **npm**: Ships with Node.js. Zero extra install. Slowest of the three. `package-lock.json` is verbose but functional. Reproducible installs with `npm ci`. Best choice for minimal setup overhead on Railway.
- **pnpm**: Significantly faster than npm. Content-addressable store saves disk space. Stricter dependency isolation (phantom dependencies are blocked). `pnpm-lock.yaml` is the lockfile. Railway supports pnpm natively. Higher initial learning curve.
- **yarn (classic v1 or berry v4)**: yarn classic is battle-tested but maintenance-mode. yarn berry is significantly different and adds complexity (PnP mode can break ecosystem tools).

**[RECOMMENDATION]** Use **pnpm** for WaxPrep. The disk space savings matter on Railway (Railway bills for compute and storage). pnpm's strict phantom-dependency blocking will prevent a category of subtle production bugs. The learning overhead is minimal. Commit `pnpm-lock.yaml` to the repository.

**Repository Directory Organization**

**[BEST PRACTICE]** For a long-lived Node.js service, the following directory layout is widely established:

```
waxprep/
├── src/
│   ├── config/          # Configuration loading and validation
│   ├── db/              # Database client, migrations, queries
│   ├── queue/           # BullMQ setup, producers
│   ├── workers/         # BullMQ workers (separate entry points)
│   ├── webhook/         # WhatsApp webhook handler
│   ├── messaging/       # Outbound messaging, WhatsApp client
│   ├── ai/              # AI provider abstraction, context assembly
│   ├── identity/        # WaxID resolution, student identity
│   ├── session/         # Session management
│   ├── memory/          # Student memory/knowledge model
│   ├── tools/           # AI tool definitions and execution
│   ├── observability/   # Logging, correlation ID, metrics
│   ├── errors/          # Error taxonomy, global handlers
│   ├── middleware/       # Express middleware (security, validation)
│   ├── health/          # Health check endpoints
│   └── server.js        # Express app assembly
├── tests/
│   ├── unit/
│   ├── integration/
│   └── fixtures/
├── docs/
│   ├── architecture.md
│   ├── stages/
│   └── adr/             # Architecture Decision Records
├── infra/
│   ├── migrations/      # SQL migration files
│   └── scripts/         # One-off ops scripts
├── .env.example
├── .gitignore
├── .nvmrc
├── package.json
├── pnpm-lock.yaml
├── README.md
└── CONTRIBUTING.md
```

**[RECOMMENDATION]** Keep the worker entry point(s) separate from the HTTP server entry point. On Railway, the webhook service and the worker service may run as separate service instances. They share the same codebase but start differently via distinct `start` commands in `package.json`:

```json
"scripts": {
  "start": "node src/server.js",
  "start:worker": "node src/workers/aiWorker.js",
  "dev": "node --watch src/server.js",
  "dev:worker": "node --watch src/workers/aiWorker.js",
  "migrate": "node infra/scripts/migrate.js"
}
```

**Git Repository and Branching**

**[BEST PRACTICE]** For a solo developer:
- `main` branch is the production-ready branch. Always deployable.
- `dev` or `develop` branch is where active work accumulates.
- Feature branches from `dev`: `feat/stage-2-config`, `feat/stage-8-webhook`.
- Hotfix branches from `main` only: `hotfix/webhook-signature-fix`.
- Railway can be configured to auto-deploy from `main` on push.
- Never commit directly to `main` — always use pull requests, even as a solo developer. PRs force a review moment and create a deployment audit trail.

**[RECOMMENDATION]** Protect the `main` branch on GitHub: require at least one approval (you can approve your own PRs in solo GitHub repos), require status checks to pass (tests), and disallow force pushes. This prevents accidental breaking deployments.

**.gitignore**

**[FACT]** The following must be in `.gitignore` for a Node.js/Railway project:

```
node_modules/
.env
.env.local
.env.*.local
dist/
build/
*.log
.DS_Store
Thumbs.db
.pnpm-store/
coverage/
```

**Critical**: `.env` must always be gitignored. **Never** commit real secrets. The `.env.example` file is committed with placeholder values and serves as documentation of what variables are required.

**README and CONTRIBUTING**

**[RECOMMENDATION]** The README should cover: what WaxPrep is, local development setup (step-by-step), required environment variables (with reference to `.env.example`), how to run tests, how to run migrations, how to deploy to Railway, and the stage architecture overview.

**Railway Deployment Basics**

**[FACT]** Railway detects Node.js projects via Railpack. It automatically runs `pnpm install` or `npm install` based on the lockfile present. The `start` command from `package.json` is used to start the service. Railway injects environment variables at runtime. **[FACT]** Railway services get a public HTTPS URL automatically. Private networking between Railway services in the same project uses `.railway.internal` hostnames. **[RECOMMENDATION]** Do not expose the worker service publicly. Only the webhook service needs a public URL. Configure the worker service with no public networking.

**Health Endpoints**

**[RECOMMENDATION]** Implement `GET /health` returning `200 OK` with `{ "status": "ok" }` from Stage 1. This endpoint should not check external dependencies — it only proves the server is alive. Railway uses this for liveness probes. Full dependency health checking is in Stage 7.

## 4. Recommended Architecture
Single GitHub repository (monorepo-style). Two Railway services sharing the same codebase: one for the HTTP webhook server, one for the BullMQ worker. Shared `src/` directory. Separate entry points per `package.json` scripts. pnpm for package management. Node.js 22 LTS pinned in `.nvmrc` and `package.json`. Main and dev branches with branch protection.

## 5. Recommended Technologies/Options
- Runtime: Node.js 22.x LTS
- Package manager: pnpm
- Framework: Express.js (lightweight, widely understood, maximum ecosystem compatibility)
- Repository host: GitHub
- Deployment: Railway (Railpack auto-detection)

## 6. Alternatives Considered
- **Fastify** instead of Express: Fastify is faster and has better built-in TypeScript support and schema validation. **[TRADE-OFF]** For WhatsApp webhooks, raw body parsing is a hard requirement for HMAC signature verification. Both Express and Fastify support raw body capture, but Fastify's plugin model requires more upfront understanding. Express's simplicity and ecosystem breadth make it the safer default for a JavaScript startup.
- **TypeScript**: Valid choice, deferred by founder decision.
- **yarn**: Not recommended. yarn classic is maintenance-mode; yarn berry adds friction.

## 7. Trade-offs
- **pnpm strict isolation** may break packages that rely on phantom dependencies. Resolution: use `shamefullyHoist` in `.npmrc` as a targeted escape hatch.
- **Monorepo single-service codebase** vs two separate repositories: single repo simplifies deployment, code sharing, and migration management but means both services deploy when any file changes. **[RECOMMENDATION]** Accept this at startup scale — separate repos add operational complexity that is not justified yet.

## 8. Security Considerations
- Never commit secrets. `.env` is gitignored from day one.
- Branch protection prevents force pushes and direct commits to `main`.
- `package-lock.json` or `pnpm-lock.yaml` pins exact dependency versions — important for supply chain security.
- `pnpm audit` should be run in CI on every pull request.
- Add `.npmrc` with `audit=true` for pnpm.

## 9. Reliability Considerations
- Pinned Node.js version prevents runtime surprise upgrades.
- `pnpm ci` (equivalent: `pnpm install --frozen-lockfile`) in Railway builds ensures reproducible installs.
- Add `engines.node` in `package.json` so Railway and developers use the same version.

## 10. Scalability Considerations
At Stage 1, scalability is a future concern. The directory structure supports horizontal growth — new features go in new modules, new services get new entry points.

## 11. Railway Considerations
- **[FACT]** Railway uses Railpack, which inspects `package.json` scripts for the start command.
- Set `RAILWAY_ENVIRONMENT` as a Railway environment variable to distinguish `production` from `staging`.
- Railway provides automatic HTTPS — no certificate management needed.
- Railway restarts services on crash automatically — configure restart policy to "Always".
- Railway provides log streaming from stdout/stderr — use structured JSON logging (Stage 4) so logs are machine-readable.

## 12. Configuration Considerations
Stage 1 does not configure application behavior — only the infrastructure skeleton. `.env.example` should be created in Stage 1 and expanded in Stage 2. Every subsequent stage adds variables to it.

## 13. Edge Cases
- Railway build timeouts: pnpm is faster than npm, reducing risk.
- `node_modules` accidentally committed: prevented by `.gitignore`.
- Wrong Node.js version on Railway: prevented by `.nvmrc` and `engines.node`.

## 14. Failure Modes
- Deployment fails if `package.json` start script is missing or wrong.
- Service doesn't start if required env vars are missing and no startup validation exists (Stage 2 solves this).
- Railway health check fails if no health endpoint exists — Railway will restart endlessly.

## 15. Common Mistakes
- Committing `node_modules`
- Hardcoding the Node.js version in Railway settings (instead of `.nvmrc`)
- Not protecting `main` branch
- Starting with a `dist/` build step when not needed (pure JavaScript doesn't require compilation)
- Forgetting to add `"type": "module"` OR forgetting to use CommonJS consistently — mixing causes runtime errors

## 16. What Should NOT Be Hardcoded
- Node.js version in Railway settings (use `.nvmrc`)
- Port number (use `process.env.PORT || 3000`)
- Any service URL

## 17. What Should Remain Deterministic Infrastructure
- Directory structure conventions
- Git workflow rules
- Build commands
- Health endpoint existence

## 18. What Must Remain AI-Controlled
Nothing in Stage 1 touches AI.

## 19. Dependencies on Earlier Stages
None — this is Stage 1.

## 20. Effects on Later Stages Within 1–14
Every subsequent stage depends on this structure. Directory layout established here determines where Stage 2 config lives, where Stage 3 database module lives, etc.

## 21. Implementation Recommendations
1. Create the GitHub repository first.
2. Commit the directory skeleton with placeholder `index.js` files in each `src/` subdirectory.
3. Configure `.gitignore`, `.nvmrc`, `package.json`, `pnpm-lock.yaml`.
4. Add a minimal Express server with `GET /health` returning `200`.
5. Set up Railway project, connect to GitHub, deploy.
6. Verify Railway deploys successfully and the health endpoint responds.
7. Configure branch protection.

## 22. Testing Requirements
- At Stage 1: only a smoke test confirming `GET /health` returns `200`.
- Add test runner (Vitest or Jest) with a single passing test to validate CI infrastructure.

## 23. Completion Criteria
- Repository exists with protected `main` branch.
- `GET /health` returns `200`.
- Railway deployment succeeds from `main`.
- `.env.example` exists (empty).
- No secrets in git history.
- pnpm, correct Node.js version confirmed in Railway build logs.

## 24. Open Questions
- Will WaxPrep ever need multiple HTTP services (separate AI service, separate outbound service)? **[ASSUMPTION]** No — single Railway service for HTTP, single service for worker, at startup.
- Should ESLint and a style formatter (Prettier) be added in Stage 1? **[RECOMMENDATION]** Yes — add them in Stage 1 before any real code is written. Retrofitting linting is painful.

## 25. Research Confidence Level
**HIGH** — Standard Node.js project setup. Railway documentation is current and clear. No uncertainty in the core recommendations.

---

# STAGE 2 — CONFIGURATION & SECRETS MANAGEMENT

## 1. Purpose
To establish a validated, type-annotated, fail-fast configuration system that reads all runtime behavior from environment variables, validates them at startup, provides safe defaults where appropriate, and prevents any secret from reaching version control or logs.

## 2. What the Original Plan Says
Research 12-factor configuration, Node.js environment configuration, strict environment validation, startup validation, optional vs required environment variables, development vs production configuration, Railway variables, secret handling, secret rotation design, configuration schemas, type-safe configuration, configuration defaults, safe configuration bounds, feature flags, environment-specific behavior, configuration naming conventions, preventing secrets from logs, preventing secrets from Git, .env handling, .env.example, runtime configuration architecture, and how to make mutable runtime behavior configurable without creating configuration chaos.

## 3. Deep Research Findings

**The 12-Factor App — Configuration**

**[FACT]** Factor III of the 12-Factor App methodology states: Store config in the environment. Config is everything that varies between deployments (staging, production, local). Code does not. Environment variables are the canonical mechanism because they are language-agnostic, OS-standard, and can be injected by platforms like Railway without changing code.

**The Right Architecture for a Node.js Startup**

**[BEST PRACTICE]** The production-grade pattern for Node.js configuration is:

1. A single `src/config/index.js` module that is `require()`d once at application startup.
2. At startup, this module reads all environment variables, validates them, applies defaults where appropriate, and exports a frozen configuration object.
3. If any required variable is missing or invalid, the module throws a hard error before the server starts. This is the "fail fast" principle.
4. All other modules import from this config module — never from `process.env` directly.

This approach means:
- There is exactly one place where environment variables are read and validated.
- Any missing configuration is caught before the server starts serving traffic.
- The configuration is a plain JavaScript object that can be type-annotated, documented, and tested.
- There is no runtime `process.env.SOMETHING` scattered across 40 different files.

**Configuration Validation Libraries**

**[TRADE-OFF]**

- **Zod**: TypeScript-first schema validation. Excellent error messages. Can be used in JavaScript. Adds ~60KB to bundle but zero runtime overhead after startup validation. Schema is the documentation.
- **Joi**: Mature, pure-JavaScript validation. Very expressive. Slightly heavier than Zod. Good ecosystem.
- **envalid**: Purpose-built for environment variable validation. Lightweight. Less expressive than Zod for complex schemas.
- **Manual validation**: Write `if (!process.env.X) throw new Error('X is required')`. Works, but verbose and harder to document.

**[RECOMMENDATION]** Use **Zod** even in a JavaScript project. Zod can be used without TypeScript — the schemas serve as runtime validation and living documentation. The error messages clearly identify which variable is missing and why it failed validation.

**Configuration Naming Conventions**

**[BEST PRACTICE]** Use `SCREAMING_SNAKE_CASE` for environment variables. Group by service/concern with a prefix:

```
DATABASE_URL
REDIS_URL
WHATSAPP_VERIFY_TOKEN
WHATSAPP_APP_SECRET
WHATSAPP_PHONE_NUMBER_ID
WHATSAPP_API_VERSION
WHATSAPP_API_BASE_URL
AI_PRIMARY_PROVIDER
AI_PRIMARY_MODEL
AI_PRIMARY_API_KEY
AI_FALLBACK_PROVIDER
AI_FALLBACK_MODEL
AI_FALLBACK_API_KEY
AI_TIMEOUT_MS
AI_MAX_TOKENS
AI_TEMPERATURE
QUEUE_DEBOUNCE_WINDOW_MS
QUEUE_WORKER_CONCURRENCY
QUEUE_MAX_RETRIES
QUEUE_RETRY_DELAY_BASE_MS
QUEUE_RETRY_DELAY_MAX_MS
QUEUE_JOB_TIMEOUT_MS
RESPONSE_MAX_CHUNK_CHARS
RESPONSE_TYPING_INDICATOR_ENABLED
SESSION_INACTIVITY_TIMEOUT_MS
RATE_LIMIT_REQUESTS_PER_MINUTE
WEBHOOK_MAX_PAYLOAD_BYTES
LOG_LEVEL
PORT
NODE_ENV
PHONE_HMAC_SECRET
```

**Required vs Optional vs Defaulted**

**[BEST PRACTICE]** Classify every variable:

- **Required with no default**: Database URL, API keys, WhatsApp secrets. If missing, crash at startup.
- **Required with a safe default**: `PORT=3000`, `LOG_LEVEL=info`, `AI_TIMEOUT_MS=30000`, `QUEUE_MAX_RETRIES=3`. If missing, apply the default and log a warning.
- **Optional feature flags**: `RESPONSE_TYPING_INDICATOR_ENABLED=true`. If missing, apply a documented safe default.

**Secret Handling**

**[FACT]** Railway provides environment variables as secrets — they are encrypted at rest, never appear in Railway logs, and are injected into the process environment at runtime. **[BEST PRACTICE]** Secrets (API keys, HMAC secrets, database passwords) must:
- Never be committed to GitHub.
- Never appear in logs. The config module must redact secrets before logging the loaded configuration.
- Be set exclusively in Railway environment variables for production.
- Use `.env` file only for local development, which is gitignored.

**[RECOMMENDATION]** Add a `logSafeConfig()` function to the config module that returns the config with all secret fields replaced by `[REDACTED]`. Log this on startup for operational visibility without exposing secrets.

**Configuration Bounds and Validation**

**[RECOMMENDATION]** For numeric configuration values, validate not just presence and type but also safe bounds:

```javascript
// Example in Zod
QUEUE_DEBOUNCE_WINDOW_MS: z.coerce.number()
  .int()
  .min(500, 'Debounce window must be at least 500ms to prevent race conditions')
  .max(30000, 'Debounce window over 30 seconds degrades student experience')
  .default(3000)
```

This prevents accidental misconfiguration (setting debounce to `0` or `300000`) while allowing legitimate runtime tuning.

**Feature Flags**

**[RECOMMENDATION]** Boolean feature flags are environment variables with `true`/`false` string values, coerced to boolean:

```javascript
RESPONSE_TYPING_INDICATOR_ENABLED: z.enum(['true', 'false']).transform(v => v === 'true').default('true')
```

Feature flags go in Railway environment variables. Toggling a feature does not require a code deploy — only an environment variable change and a service restart.

**Preventing Secrets from Logs**

**[BEST PRACTICE]** The Pino logger (Stage 4) has a built-in `redact` array that scrubs specified key paths from log output. Configure this in the logger initialization with all known secret field names: `['config.AI_PRIMARY_API_KEY', 'config.WHATSAPP_APP_SECRET', 'config.PHONE_HMAC_SECRET', 'req.headers.authorization']`.

**Secret Rotation Design**

**[RECOMMENDATION]** Design for secret rotation from the beginning:
- All secrets are read from environment variables at startup, never cached beyond the process lifetime.
- Rotating a secret requires: updating the Railway environment variable, and restarting the service.
- Railway supports zero-downtime deploys — a service restart with a new env var is safe if the webhook handler is stateless (which it must be).
- **[UNKNOWN / NEEDS VERIFICATION]** Whether Railway supports live environment variable updates without a full redeploy. **[ASSUMPTION]** A service restart is required for new env vars to take effect.

**.env.example**

**[BEST PRACTICE]** The `.env.example` file documents every environment variable with its purpose, type, required/optional status, and example/default value. It is version-controlled and updated every time a new variable is added.

```bash
# === REQUIRED — No defaults ===
DATABASE_URL=postgresql://user:password@host:5432/waxprep

# === WHATSAPP ===
WHATSAPP_VERIFY_TOKEN=your-verify-token-here
WHATSAPP_APP_SECRET=your-meta-app-secret-here
WHATSAPP_PHONE_NUMBER_ID=your-phone-number-id
WHATSAPP_API_VERSION=v20.0
WHATSAPP_API_BASE_URL=https://graph.facebook.com

# === AI PROVIDER ===
AI_PRIMARY_PROVIDER=anthropic
AI_PRIMARY_MODEL=claude-sonnet-4-6
AI_PRIMARY_API_KEY=sk-ant-...
AI_TIMEOUT_MS=30000
AI_MAX_TOKENS=1024

# === QUEUE (BullMQ) ===
REDIS_URL=redis://localhost:6379
QUEUE_DEBOUNCE_WINDOW_MS=3000
QUEUE_WORKER_CONCURRENCY=5
QUEUE_MAX_RETRIES=3

# === RESPONSE DELIVERY ===
RESPONSE_MAX_CHUNK_CHARS=1000
RESPONSE_TYPING_INDICATOR_ENABLED=true

# === SESSION ===
SESSION_INACTIVITY_TIMEOUT_MS=1800000

# === IDENTITY ===
PHONE_HMAC_SECRET=your-secret-pepper-for-phone-hashing

# === RUNTIME ===
PORT=3000
NODE_ENV=development
LOG_LEVEL=info
```

## 4. Recommended Architecture
Single `src/config/index.js` module. Zod schema definition with `.parse(process.env)` at startup. Frozen configuration object exported. `logSafeConfig()` function. Startup validation that throws on first failure with clear error messages. All downstream modules import from `src/config/index.js`, never from `process.env`.

## 5. Recommended Technologies/Options
- **Zod** for schema validation and coercion.
- **dotenv** for loading `.env` in development only (guard: `if (process.env.NODE_ENV !== 'production') require('dotenv').config()`).
- **[RECOMMENDATION]** Use `dotenv` not as a hard dependency but loaded conditionally — Railway injects env vars directly; `dotenv` is only for local development.

## 6. Alternatives Considered
- **Joi**: Mature and well-documented, but Zod's coercion (`.coerce.number()`, `.coerce.boolean()`) is cleaner for environment variables, which are always strings.
- **convict**: Mozilla's config library supports multiple sources and environments, but adds abstraction that is not needed at this scale.

## 7. Trade-offs
- **Zod adds a dependency**: ~65KB. Justified by the validation, documentation, and coercion value. Can be removed later if project moves to TypeScript natively.
- **Fail-fast crashes the service on misconfiguration**: This is the correct behavior — a misconfigured service that silently continues will produce mysterious bugs. Prefer crashing loudly at startup over mysterious failures under load.

## 8. Security Considerations
- `PHONE_HMAC_SECRET` is a cryptographic secret used to pseudonymize phone numbers. It must be at least 32 bytes of entropy. Generated once and never rotated unless there is a security breach (rotation requires rehashing all stored phone hashes).
- `WHATSAPP_APP_SECRET` is used for HMAC-SHA256 signature verification. Must not appear in logs.
- All API keys must be validated at startup — if they're missing, crash before any request is served.

## 9. Reliability Considerations
Startup validation prevents silent deployment failures. If Railway deploys a new version with a missing env var, the service will crash immediately and Railway will report the failure, rather than serving degraded traffic.

## 10. Scalability Considerations
No scalability concern at this stage. Configuration is read at startup, not at runtime.

## 11. Railway Considerations
- **[FACT]** Railway supports environment variable groups (Shared Variables) that can be inherited by multiple services. Use this to share `DATABASE_URL`, `REDIS_URL`, and other shared variables between the webhook service and the worker service without duplicating them.
- Set Railway variables per environment: staging variables are separate from production variables.
- **[FACT]** Railway reference variables allow one service to reference another service's variable: `${{Postgres.DATABASE_URL}}`. Use these to avoid duplicating database URLs.

## 12. Configuration Considerations (Meta)
The configuration system itself must be simple enough to understand and maintain. **[RECOMMENDATION]** Keep the Zod schema in a single file under 200 lines. If it grows beyond that, split by domain (database config, AI config, queue config) into sub-schemas that are combined with `z.object({ db: dbSchema, ai: aiSchema, queue: queueSchema })`.

## 13. Edge Cases
- Environment variable set to empty string (`DATABASE_URL=""`): Zod `.min(1)` string validation catches this.
- Numeric variable set to `NaN` after coercion: Zod `.int()` or `.positive()` catches this.
- Boolean feature flag set to `"yes"` instead of `"true"`: Zod `.enum(['true', 'false'])` catches this.

## 14. Failure Modes
- Service crashes at startup with a clear Zod validation error identifying the missing/invalid variable. This is the correct behavior.
- Incorrect Railway variable scope (set on the wrong service): Zod catches this on startup.

## 15. Common Mistakes
- Reading `process.env.X` directly in business logic modules instead of importing from the config module.
- Not validating that string env vars are non-empty.
- Setting secrets in `process.env` inside tests and accidentally leaking them to CI logs.
- Using `parseInt()` without validating the result is not `NaN`.

## 16. What Should NOT Be Hardcoded
Everything in the `.env.example` above must not be hardcoded anywhere in application code.

## 17. What Should Remain Deterministic Infrastructure
- The config module structure itself — it always loads from environment at startup.
- The validation logic — validation rules are code, not configuration.
- Which variables are required vs optional — this is a code-level decision.

## 18. What Must Remain AI-Controlled
The values of AI behavioral parameters (temperature, max_tokens, system prompt) should be configurable via environment, but the AI's judgment on how to teach is not replaced by configuration.

## 19. Dependencies on Earlier Stages
Stage 1 establishes the directory where `src/config/` lives.

## 20. Effects on Later Stages Within 1–14
Every stage from 3 onwards imports from `src/config/index.js`. Stage 3 reads `DATABASE_URL`. Stage 6 reads `REDIS_URL`, `QUEUE_*`. Stage 8 reads `WHATSAPP_*`. Stage 11 reads `RESPONSE_*`. Stage 12 reads `PHONE_HMAC_SECRET`.

## 21. Implementation Recommendations
1. Install `zod` and `dotenv`.
2. Create `src/config/index.js` with the complete Zod schema.
3. Implement `logSafeConfig()`.
4. Add `require('./src/config')` as the first line of both `server.js` and `worker.js` — validation happens before anything else.
5. Update `.env.example` to include all defined variables.

## 22. Testing Requirements
- Unit test: config module throws with a clear error when a required variable is missing.
- Unit test: config module applies correct defaults when optional variables are absent.
- Unit test: config module rejects out-of-bound numeric values.
- Unit test: `logSafeConfig()` returns `[REDACTED]` for all secret fields.

## 23. Completion Criteria
- All variables from `.env.example` are in the Zod schema.
- Service crashes with a readable error when required variables are missing.
- No `process.env.X` references outside `src/config/index.js`.
- `logSafeConfig()` implemented and called on startup.

## 24. Open Questions
- Should configuration be validated at a per-request level (re-read env vars)? **[RECOMMENDATION]** No. Env vars are read once at startup. This is the standard pattern and correct behavior for Railway.

## 25. Research Confidence Level
**HIGH** — 12-factor app config is well-established. Zod is a mature library with strong production track record.

---

# STAGE 3 — DATABASE FOUNDATION

## 1. Purpose
To establish the PostgreSQL database layer: connection pooling, schema migration infrastructure, core table structure, query patterns, transaction management, and the data access patterns that all subsequent stages depend on.

## 2. What the Original Plan Says
Research PostgreSQL architecture, connection pooling, Node.js PostgreSQL clients, Supabase PostgreSQL, transaction management, isolation levels, migrations, migration safety, migration locking, migration rollback limitations, schema versioning, deployment-time migrations, indexes, constraints, foreign keys, unique constraints, soft deletion, timestamps, UUIDs, database connection failures, retry behavior, connection timeouts, query timeouts, transaction failures, concurrent writes, race conditions, database health checks, backup/recovery implications, future pgvector compatibility.

## 3. Deep Research Findings

**PostgreSQL Connection Model**

**[FACT]** PostgreSQL creates a new OS process for each client connection. Each connection consumes approximately 5–10 MB of RAM in addition to shared buffer overhead. This means PostgreSQL is not designed for thousands of concurrent connections — it is designed for dozens of active queries with efficient I/O. Attempting to increase `max_connections` beyond the server's capacity degrades performance through CPU context switching and lock contention.

**Connection Pooling Architecture**

**[FACT]** PostgreSQL has no built-in connection pooler as of PostgreSQL 17. An external pooler is mandatory for production Node.js workloads.

**[FACT]** Supabase replaced PgBouncer with **Supavisor** (open-source, Elixir-based) as its connection pooler in 2023. Supavisor supports multi-tenant pool isolation, prepared statements in transaction mode (unlike PgBouncer), and runs on port 6543 (vs PostgreSQL's direct 5432). **[RECOMMENDATION]** For WaxPrep on Supabase PostgreSQL, use the Supavisor-proxied connection string (port 6543, transaction mode) for all application queries. Use the direct connection string (port 5432) only for migrations.

**[BEST PRACTICE]** The recommended layered pooling for a Node.js service through PgBouncer/Supavisor:

- Application-level pool: **5–10 connections** per service instance. Small because Supavisor/PgBouncer multiplexes these across far fewer actual PostgreSQL backend connections.
- The external pooler handles multiplexing: many application connections → a small number of PostgreSQL server processes.
- Optimal PostgreSQL server pool size formula: `(CPU_cores × 2) + number_of_disk_spindles`. For a managed SSD-backed instance, this is roughly `(cores × 2) + 1`.

**[CRITICAL]** **Prepared statements in transaction mode**: PgBouncer in transaction mode breaks server-side prepared statements. Supavisor handles this better, but as a rule: when connecting through a pooler in transaction mode, set `prepare: false` in your PostgreSQL driver. The `pg` Node.js library's `Pool` supports this configuration.

**Node.js PostgreSQL Client Choice**

**[TRADE-OFF]**

- **`pg` (node-postgres)**: The original, battle-tested PostgreSQL driver for Node.js. Pure JavaScript. Supports both `Client` (single connection) and `Pool` (connection pool). No query builder — raw SQL. Maximum control, zero abstraction magic. The safest choice.
- **`postgres` (by Porsager)**: Modern, tagged-template-literal SQL library. More ergonomic than `pg`. Better TypeScript support. Less ecosystem adoption than `pg`.
- **`drizzle-orm`**: Schema-first ORM with SQL-like query builder. TypeScript-native. Generates migrations. Becoming popular in 2024–2026. Adds an abstraction layer but maintains close-to-SQL semantics.
- **`knex`**: SQL query builder (not a full ORM). Used for migrations and query construction. Works with `pg`.
- **Full ORMs (Sequelize, Prisma, TypeORM)**: Too much abstraction for a system that must have explicit, auditable data access patterns. Prisma's binary engine and migration model adds complexity and latency.

**[RECOMMENDATION]** Use **`pg`** with **raw SQL** for queries. Write SQL directly — it is readable, debuggable, and fast. Use a dedicated migration library for schema management. Avoid ORMs in a system where AI produces data that flows through complex multi-table operations. The data access layer for WaxPrep is complex enough that ORM abstractions add confusion, not clarity.

**Migration Strategy**

**[BEST PRACTICE]** Migrations must be:
- **Version-controlled in git** (in `infra/migrations/`).
- **Forward-only** by default. PostgreSQL DDL migrations are often not safely reversible (you can't un-add a column with data, you can't un-change a type without data loss).
- **Numbered sequentially**: `001_initial_schema.sql`, `002_add_waxid_table.sql`, etc.
- **Run exactly once** — the migration system tracks which migrations have run in a `schema_migrations` table.
- **Locking-aware**: Multiple instances of a service should not run migrations simultaneously. Use advisory locks or a `pg_try_advisory_lock` guard at the start of the migration runner.
- **Run at deployment time, before the new code starts serving traffic**.

**[RECOMMENDATION]** Use **`node-postgres-migrate`** or write a simple custom migration runner using `pg` directly. Keep it minimal: `SELECT pg_advisory_lock(?)`, read `schema_migrations` table, apply unapplied migrations in order, release lock. This avoids a heavy migration dependency.

**[BEST PRACTICE]** On Railway, run migrations in a pre-deploy hook or as a one-off command before deploying. **[ASSUMPTION]** Railway supports Railway "Deploy Hooks" — **[NEEDS VERIFICATION]** whether Railway's deploy lifecycle supports a separate migration step before traffic switches. Alternative: run migrations at service startup if the service is designed to be idempotent (migrations check if they've run before proceeding).

**PostgreSQL Schema Fundamentals for WaxPrep**

Core tables that Stage 3 should establish (minimal foundations; later stages add to this):

```sql
-- Schema migrations tracking
CREATE TABLE schema_migrations (
  version INTEGER PRIMARY KEY,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Students (WaxID) — Stage 12 will define the full schema
-- Placeholder in Stage 3 for foreign key targets
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

**UUID Strategy**

**[FACT]** PostgreSQL's `gen_random_uuid()` generates UUID v4 using `pgcrypto` (available by default in PostgreSQL 13+). UUIDs are safe as primary keys because:
- They are globally unique — no risk of collision across distributed services.
- They do not leak the insertion order (unlike sequential integers, which expose record count).
- They are not guessable (preventing ID enumeration attacks).

**[TRADE-OFF]** Sequential UUIDs (UUIDv7, using `pg_uuidv7` extension or application-generated) have better B-tree index performance because insertion order matches index order. Standard UUID v4 is random, causing index fragmentation under high-insert workloads. For WaxPrep's expected student volumes at startup, this is not a concern. **[RECOMMENDATION]** Use `gen_random_uuid()` (UUID v4) for now. Revisit UUID v7 when insert rates justify it.

**Timestamps**

**[FACT]** Always use `TIMESTAMPTZ` (timestamp with time zone), not `TIMESTAMP`. PostgreSQL stores `TIMESTAMPTZ` in UTC internally and converts to the session timezone on read. Using `TIMESTAMP` without timezone causes silent timezone-dependent bugs that are extremely difficult to debug. **[BEST PRACTICE]** All tables get `created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()` and `updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`.

**Soft Deletion**

**[RECOMMENDATION]** Use soft deletion (a `deleted_at TIMESTAMPTZ` column) for student records and messages. Hard deletion makes audit trails impossible. Soft deletion allows:
- Recovery from accidental deletion.
- Audit history retention.
- Future compliance requirements.

All queries on soft-deleted tables must include `WHERE deleted_at IS NULL`. **[RECOMMENDATION]** Create a view or use consistent query fragments — do not rely on developers to remember the `deleted_at` filter on every query.

**Isolation Levels**

**[FACT]** PostgreSQL's default isolation level is `READ COMMITTED`. For most WaxPrep operations, this is sufficient. `SERIALIZABLE` isolation is needed for operations where phantom reads or write skew would be catastrophic — for example, student session creation race conditions (Stage 13). **[RECOMMENDATION]** Use `READ COMMITTED` by default. Explicitly use `SERIALIZABLE` for student session creation and WaxID creation where a unique-insert race condition could create duplicate records.

**Connection Pool Configuration**

**[RECOMMENDATION]** Configure the `pg.Pool` in `src/db/index.js`:

```javascript
const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: config.DATABASE_POOL_MAX,        // e.g., 10 — comes from env
  idleTimeoutMillis: config.DATABASE_IDLE_TIMEOUT_MS,  // e.g., 30000
  connectionTimeoutMillis: config.DATABASE_CONNECTION_TIMEOUT_MS, // e.g., 5000
  statement_timeout: config.DATABASE_STATEMENT_TIMEOUT_MS,  // e.g., 30000
  ssl: config.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false
});
```

Note: **all** pool parameters come from config (Stage 2). None are hardcoded.

**[FACT]** The `pg.Pool` emits an `error` event when a background client encounters an error. If this event has no handler, Node.js crashes. **Always** add: `pool.on('error', (err) => logger.error({ err }, 'Unexpected pool client error'))`.

**pgvector Compatibility**

**[FACT]** Supabase PostgreSQL supports the `pgvector` extension for vector similarity search. Enabling it requires `CREATE EXTENSION IF NOT EXISTS vector;` in a migration. **[RECOMMENDATION]** Do not add `pgvector` in Stage 3. Reserve a note for future stages where semantic memory retrieval may require it. Keep the table schema compatible (no decisions that would block adding an `embedding vector(1536)` column later).

**Database Health Checks**

**[RECOMMENDATION]** Implement `SELECT 1` as the database liveness check in Stage 7. The health check should use a dedicated pool connection with a short timeout to avoid blocking the main pool.

**Query Timeouts**

**[RECOMMENDATION]** Set `statement_timeout` at the session level in the pool configuration. This prevents runaway queries from holding connections. The value should come from configuration, not be hardcoded. A reasonable default is 30 seconds for AI-related queries (which may involve large context assembly) and 5 seconds for simple lookups.

## 4. Recommended Architecture
`pg.Pool` connecting to Supabase PostgreSQL via Supavisor (port 6543) for application queries. Direct connection (port 5432) for migrations only. Custom lightweight migration runner with advisory locking. Raw SQL queries. No ORM.

## 5. Recommended Technologies/Options
- **`pg`** (node-postgres): Primary database driver.
- **Custom migration runner**: ~100 lines of JavaScript using `pg` directly.
- **Supabase PostgreSQL** with Supavisor as the connection pooler.

## 6. Alternatives Considered
- **Drizzle ORM**: Acceptable alternative to raw SQL. Closer to SQL than most ORMs. Would add a build step for schema inference. Deferred — raw SQL is simpler to audit.
- **PgBouncer standalone**: Not needed with Supabase (Supavisor is included).
- **Railway's built-in PostgreSQL**: **[TRADE-OFF]** Railway provisions PostgreSQL directly and it is simpler to set up. Supabase provides additional features (Supavisor pooling, built-in backups, Studio UI). **[RECOMMENDATION]** For WaxPrep, either works. Railway's built-in PostgreSQL is simpler for a cost-conscious startup. Supabase adds value if future features (Row Level Security, Auth, Storage) are anticipated.

## 7. Trade-offs
- **Raw SQL vs ORM**: Raw SQL requires more typing but is unambiguous, debuggable, and has no hidden query generation. ORMs save typing but can generate inefficient queries and obscure bugs.
- **Supabase vs Railway Postgres**: Supabase's Supavisor pooling is built-in. Railway Postgres requires running PgBouncer separately if needed.
- **UUID v4 vs UUID v7**: v7 has better index performance. v4 is available without extensions. Acceptable trade-off at startup volume.

## 8. Security Considerations
- The database password must never appear in logs. Use Railway's reference variables so the raw password is never directly visible.
- Use SSL (TLS) for all database connections in production: `ssl: { rejectUnauthorized: true }`.
- Use least-privilege database users: the application database user should not have `CREATE TABLE`, `DROP TABLE`, or `ALTER TABLE` permissions. Only the migration user needs DDL privileges.
- Row-level security (PostgreSQL RLS) can enforce student isolation at the database level. **[TRADE-OFF]** RLS adds safety but also complexity. **[RECOMMENDATION]** Enforce student isolation in application code (Stage 12) first. RLS is a defense-in-depth measure for later.

## 9. Reliability Considerations
- Connection pool exhaustion: monitor `pool.totalCount`, `pool.idleCount`, `pool.waitingCount`. Alert if `waitingCount > 0` persistently.
- Transaction rollback on error: all transactions in a `try/catch` with `ROLLBACK` in the catch block.
- Migration locking with advisory lock prevents concurrent migration runs.

## 10. Scalability Considerations
- Supavisor handles connection multiplexing — adding more service instances does not linearly increase PostgreSQL backend connections.
- Index design: every column used in `WHERE`, `JOIN ON`, or `ORDER BY` clauses should have an index. Over-indexing slows writes; under-indexing slows reads.

## 11. Railway Considerations
- **[FACT]** Railway PostgreSQL provides `DATABASE_URL` as a reference variable automatically.
- Railway PostgreSQL supports automated backups (daily) in the Pro tier.
- Run migrations before deploying the new service version — not in the startup of the running service. In Railway, this can be done via a pre-deploy command or a separate "migrate" service that runs once.

## 12. Configuration Considerations
All connection pool parameters must be environment variables:
- `DATABASE_URL` (required)
- `DATABASE_POOL_MAX` (default: 10)
- `DATABASE_IDLE_TIMEOUT_MS` (default: 30000)
- `DATABASE_CONNECTION_TIMEOUT_MS` (default: 5000)
- `DATABASE_STATEMENT_TIMEOUT_MS` (default: 30000)

## 13. Edge Cases
- Migration running on two instances simultaneously: advisory lock prevents this.
- Database unreachable at startup: service should fail fast with a clear error, not silently retry indefinitely.
- Pool exhaustion under load: set `connectionTimeoutMillis` so requests fail fast rather than hanging indefinitely.

## 14. Failure Modes
- Database connection failure: all dependent operations fail. Handled in Stage 5 (error handling) and Stage 7 (health checks).
- Runaway query holds connection: `statement_timeout` terminates it.
- Migration fails halfway: migration should be wrapped in a transaction where possible. DDL transactions are supported in PostgreSQL (unlike MySQL), so schema changes can be rolled back if the migration fails.

## 15. Common Mistakes
- Forgetting `pool.on('error', handler)` — causes unhandled rejection crashes.
- Using `TIMESTAMP` instead of `TIMESTAMPTZ`.
- Setting `DATABASE_POOL_MAX` to a very high number (e.g., 100) when Supavisor's PostgreSQL backend pool is much smaller.
- Not setting `prepare: false` when using Supavisor/PgBouncer in transaction mode.
- Running migrations in the application startup with no concurrency protection.

## 16. What Should NOT Be Hardcoded
Pool sizes, timeout values, the database URL, SSL mode decisions (should be `NODE_ENV`-aware via config).

## 17. What Should Remain Deterministic Infrastructure
All database operations, transaction management, migration tracking, advisory lock acquisition.

## 18. What Must Remain AI-Controlled
Nothing in Stage 3 is AI-facing.

## 19. Dependencies on Earlier Stages
Depends on Stage 1 (directory structure) and Stage 2 (config loading `DATABASE_URL` and pool parameters).

## 20. Effects on Later Stages Within 1–14
Every subsequent stage reads from and writes to the database established here. Migration infrastructure is used by Stages 12, 13, and 14 to add tables. Connection pool is used across all data access stages.

## 21. Implementation Recommendations
1. Install `pg`.
2. Create `src/db/index.js` with `pg.Pool` initialization.
3. Create `infra/migrations/001_initial_schema.sql` with `schema_migrations` table and `students` table placeholder.
4. Write a `src/db/migrate.js` migration runner with advisory lock.
5. Add `"migrate"` script to `package.json`.
6. Test connection at startup: run `SELECT 1` and log success/failure.

## 22. Testing Requirements
- Integration test: migration runner applies migrations in order.
- Integration test: migration runner is idempotent — running twice applies each migration only once.
- Integration test: pool connects to database successfully.
- Unit test: transaction rollback on error.

## 23. Completion Criteria
- Database connection established on startup.
- Migration runner works with advisory lock.
- `schema_migrations` table created.
- All pool parameters are configurable.
- No pool crash without error handler.

## 24. Open Questions
- Railway vs Supabase PostgreSQL: which to use? **[RECOMMENDATION]** Start with Railway's built-in PostgreSQL for simplicity. Migrate to Supabase later if its features are needed.
- pgvector: needed in later stages? **[ASSUMPTION]** Yes, for semantic memory search. Do not add yet.

## 25. Research Confidence Level
**HIGH** for connection pooling and raw SQL patterns. **MEDIUM** for Supavisor specifics (verify current Supabase documentation).

---

# STAGE 4 — LOGGING, OBSERVABILITY & TRACING FOUNDATION

## 1. Purpose
To establish structured JSON logging, correlation ID propagation through the entire async message lifecycle, log-level configuration, PII redaction, and the tracing foundation that allows a single student message to be followed from WhatsApp webhook to outbound response.

## 2. What the Original Plan Says
Research structured JSON logging, Node.js logging, correlation IDs, request IDs, message IDs, student IDs/WaxIDs, trace propagation, asynchronous trace propagation, queue trace propagation, worker trace propagation, AI request traceability, outbound response traceability, Railway log ingestion, log levels, sensitive-data protection in logs, PII minimization, debugging distributed asynchronous systems, basic metrics, latency measurement, error measurement.

## 3. Deep Research Findings

**Why console.log Fails in Production**

**[FACT]** `console.log` produces unstructured text strings. In production:
- You cannot filter by log level (all output is equal).
- You cannot search by field (student ID, message ID, session ID).
- You cannot correlate a single request across async boundary (webhook → queue → worker → AI → response).
- You cannot redact PII automatically.
- Railway's log aggregation works best with newline-delimited JSON (NDJSON).

**Pino — The Production Node.js Logger**

**[FACT]** Pino is widely established as the fastest production Node.js logger. Its key properties:
- Writes JSON to stdout by default — correct for containerized/Railway environments.
- ~5× faster than Winston with significantly lower CPU overhead.
- Built-in `redact` array to scrub sensitive fields from log output.
- `child()` loggers for per-module context (adds fields without re-creating the logger).
- Configurable log levels (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
- `pino-pretty` for human-readable output in development (never in production — it's slow).

**Configuration:**
```javascript
import pino from 'pino';
const logger = pino({
  level: config.LOG_LEVEL,  // from env
  formatters: {
    level(label) { return { level: label }; }  // string level instead of number
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  base: {
    env: config.NODE_ENV,
    service: 'waxprep-webhook',  // or 'waxprep-worker'
  },
  redact: [
    'config.AI_PRIMARY_API_KEY',
    'config.WHATSAPP_APP_SECRET',
    'config.PHONE_HMAC_SECRET',
    'req.headers.authorization',
    'student.phoneRaw',
    'payload.phone',
    '*.apiKey',
  ]
});
```

**Correlation IDs and Async Propagation**

**[FACT]** The fundamental problem of correlation IDs in Node.js: Node.js is single-threaded with an event loop. A single request can have many asynchronous continuations (awaited functions, setTimeout callbacks, EventEmitter handlers). Traditional languages use thread-local storage to carry request context across a thread's execution. Node.js has `AsyncLocalStorage` (stable since Node.js 16) as the equivalent.

**[FACT]** `AsyncLocalStorage` (from the Node.js built-in `node:async_hooks` module) automatically propagates a context object through `await`, `Promise.then()`, `setTimeout`, and `EventEmitter` callbacks within the same async chain. This enables correlation ID propagation without prop drilling.

**Architecture for WaxPrep Correlation:**

```javascript
// src/observability/context.js
import { AsyncLocalStorage } from 'node:async_hooks';

const als = new AsyncLocalStorage();

export function runWithContext(ctx, fn) {
  return als.run(ctx, fn);
}

export function getContext() {
  return als.getStore() ?? {};
}

export function getLogger() {
  const ctx = getContext();
  return logger.child(ctx);
}
```

Every HTTP request starts a context:
```javascript
// In webhook middleware
app.use((req, res, next) => {
  const correlationId = req.headers['x-correlation-id'] ?? randomUUID();
  runWithContext({ correlationId, service: 'webhook' }, next);
});
```

The `correlationId` flows through all synchronous and asynchronous code within that request.

**The Queue Boundary — Trace Propagation Challenge**

**[CRITICAL]** When a message is enqueued (Stage 6, BullMQ), the `AsyncLocalStorage` context does NOT automatically cross the queue boundary. A BullMQ job runs in a separate execution context — potentially in a separate process. The correlation ID must be **explicitly serialized into the job payload** and **restored at the worker**.

```javascript
// Producer (webhook handler)
const ctx = getContext();
await queue.add('process-message', {
  ...messagePayload,
  _trace: {
    correlationId: ctx.correlationId,
    waxId: ctx.waxId,
    messageId: ctx.messageId,
  }
});

// Worker (BullMQ job handler)
worker.on('job', (job) => {
  const { _trace, ...payload } = job.data;
  runWithContext(_trace, async () => {
    // All code here has the original correlationId
    const log = getLogger();  // includes correlationId, waxId, messageId
    await processMessage(payload);
  });
});
```

This is the key architectural insight: correlation IDs must be consciously propagated across every asynchronous boundary, including queue boundaries.

**WaxPrep Trace ID Hierarchy**

```
correlationId    — Generated at webhook entry, unique per HTTP request
  ↓
messageId        — The WhatsApp message ID (wamid.xxxx)
  ↓
sessionId        — The WaxPrep session ID (resolved in Stage 13)
  ↓
waxId            — The student's WaxID (resolved in Stage 12)
  ↓
aiRequestId      — Generated per AI provider call
  ↓
outboundChunkId  — Generated per outbound WhatsApp message chunk
```

Every log entry should include the relevant IDs for the depth at which it was logged. A log entry from the AI worker should include `correlationId`, `waxId`, `sessionId`, `aiRequestId`. A log entry from the outbound sender should include `correlationId`, `waxId`, `outboundChunkId`.

**Log Levels**

**[BEST PRACTICE]** Use log levels correctly:
- `TRACE`: Very verbose development debugging. Never in production.
- `DEBUG`: Moderate detail useful for diagnosing specific incidents. Toggle on/off via `LOG_LEVEL` env var without deploy.
- `INFO`: Normal operational events (message received, job enqueued, AI response received, message sent).
- `WARN`: Abnormal but handled conditions (retry attempt, fallback triggered, rate limit approaching).
- `ERROR`: Failures that affect a request or job (AI provider failed, database query failed, outbound send failed).
- `FATAL`: System-level failures that require immediate attention (database connection lost, worker crashed).

**[RECOMMENDATION]** Set `LOG_LEVEL=info` as the production default. Temporarily raise to `debug` for incident investigation by changing the Railway environment variable and restarting the service.

**PII and Sensitive Data in Logs**

**[CRITICAL]** The following must NEVER appear in logs:
- Raw phone numbers.
- Student names (if ever stored).
- Message content in structured log fields (log `messageType` and `messageLength`, not the actual text).
- AI prompt content in structured fields.
- API keys, secrets, tokens.

**[BEST PRACTICE]** Log message metadata, not message content. If debugging requires message content, add a feature flag (`DEBUG_LOG_MESSAGE_CONTENT=false`) that defaults to false and logs a warning if enabled in production.

**Basic Metrics**

**[RECOMMENDATION]** At Stage 4, implement lightweight in-process metrics without a metrics server:
- Log latency for webhook processing, queue enqueue time, AI response time, outbound delivery time.
- Log error counts per type.
- Log retry counts per job.

These appear as structured log fields that Railway's log aggregation can query. Full Prometheus/Grafana is not needed at startup.

**Railway Log Ingestion**

**[FACT]** Railway streams stdout/stderr from all services to its built-in log viewer. JSON lines (NDJSON) are readable in the Railway dashboard. Railway logs can be integrated with external log aggregators (Datadog, Logtail, etc.) via Railway's Log Drain feature. **[RECOMMENDATION]** Start with Railway's built-in log viewer. Add a log drain if log volume or incident investigation time justifies it.

## 4. Recommended Architecture
Pino logger configured at application start. `AsyncLocalStorage` for context propagation within HTTP requests. Explicit `_trace` field in BullMQ job payloads for cross-queue propagation. Child loggers per module. `redact` for PII fields.

## 5. Recommended Technologies/Options
- **`pino`**: Logger.
- **`pino-pretty`**: Development transport only (never production).
- **`node:async_hooks` AsyncLocalStorage**: Built-in, no dependencies.
- **`node:crypto` randomUUID()**: Built-in, generates correlation IDs.

## 6. Alternatives Considered
- **Winston**: Slower, more complex configuration, less ergonomic. Not recommended.
- **OpenTelemetry**: Full distributed tracing. Valid but heavyweight for a startup. **[RECOMMENDATION]** Implement correlation IDs manually first. OpenTelemetry can be retrofitted later.
- **Morgan**: HTTP request logging middleware. Works alongside Pino — log HTTP access with Pino-compatible output.

## 7. Trade-offs
- **Full OpenTelemetry vs manual correlation IDs**: OpenTelemetry gives trace visualization across services. Manual correlation IDs require grep-style log analysis. **[RECOMMENDATION]** Start manual — add OpenTelemetry when debugging time justifies it.
- **Logging message content for debugging vs PII risk**: Always prefer PII safety. Log metadata only.

## 8. Security Considerations
- PII in logs creates regulatory and reputational risk.
- Pino's `redact` array is the first line of defense.
- Developer discipline is the second line of defense — review for `console.log(message.body)` patterns in code review.
- Log access control: Railway logs should have access control (only authorized team members can view). Railway supports team-level access control.

## 9. Reliability Considerations
- Pino's async transport (using `pino.transport`) avoids blocking the event loop on log writes. Use it in production.
- If the log drain (external aggregator) is slow or down, Pino should not block the application. Use async transport with a buffer.

## 10. Scalability Considerations
- JSON logs are machine-parseable and enable efficient log aggregation queries.
- Structured log fields (waxId, messageId) enable filtering for a single student's message flow through thousands of log lines.

## 11. Railway Considerations
- Railway captures stdout/stderr from all services. Use `console.log` only through Pino (which writes to stdout).
- Log volume on Railway is billed or rate-limited above certain thresholds — ensure `LOG_LEVEL=info` in production (not `debug`).

## 12. Configuration Considerations
- `LOG_LEVEL` must be an environment variable. Default: `info`.
- `DEBUG_LOG_MESSAGE_CONTENT` feature flag. Default: `false`.

## 13. Edge Cases
- `AsyncLocalStorage` context not set (e.g., in a background timer): `getContext()` returns `{}`, `getLogger()` returns a logger without context fields. This is acceptable — add a fallback log note.
- Worker process crashes before the correlated log entry is flushed: Pino's async transport buffers — may lose the last few log lines. **[TRADE-OFF]** Pino's `pino.final()` function handles this for process exit.

## 14. Failure Modes
- Logger misconfigured with wrong `redact` paths: PII leaks into logs. Test `redact` paths in unit tests.
- Correlation ID not propagated across queue boundary: debugging becomes very difficult. Test this explicitly.

## 15. Common Mistakes
- Using `pino-pretty` in production (significant CPU overhead).
- Not propagating `_trace` into BullMQ job payloads.
- Logging raw message content anywhere.
- Using `console.log` directly in modules instead of `getLogger()`.
- Setting `LOG_LEVEL=trace` or `LOG_LEVEL=debug` in production and flooding Railway logs.

## 16. What Should NOT Be Hardcoded
`LOG_LEVEL`, `DEBUG_LOG_MESSAGE_CONTENT`, log drain configuration.

## 17. What Should Remain Deterministic Infrastructure
The logger setup, context propagation mechanism, redact configuration.

## 18. What Must Remain AI-Controlled
Nothing — logging is pure infrastructure.

## 19. Dependencies on Earlier Stages
Stage 2 for `LOG_LEVEL` config. Stage 1 for directory placement.

## 20. Effects on Later Stages Within 1–14
Every stage uses the logger via `getLogger()`. Stage 6 requires `_trace` propagation in job payloads. Stage 8 adds `waxId` and `messageId` to the context. Stage 11 adds `outboundChunkId`.

## 21. Implementation Recommendations
1. Install `pino`.
2. Create `src/observability/logger.js` (Pino instance).
3. Create `src/observability/context.js` (AsyncLocalStorage wrapper).
4. Create `src/observability/index.js` exporting both.
5. Add correlation ID middleware to Express.
6. Document the `_trace` propagation pattern.

## 22. Testing Requirements
- Unit test: logger redacts all defined sensitive fields.
- Unit test: `getContext()` returns the context set by `runWithContext()`.
- Unit test: `_trace` format matches what the worker expects.
- Integration test: a log entry at the worker level includes the `correlationId` from the webhook request.

## 23. Completion Criteria
- All log entries are JSON.
- `LOG_LEVEL` is configurable.
- Sensitive fields are redacted.
- `correlationId` appears in all log entries within a request context.
- `_trace` propagation documented and tested.

## 24. Open Questions
- Should WaxPrep add OpenTelemetry spans from the start? **[RECOMMENDATION]** No — add correlation IDs first, OpenTelemetry later if needed.

## 25. Research Confidence Level
**HIGH** for Pino and AsyncLocalStorage patterns. **HIGH** for queue trace propagation approach.

---

# STAGE 5 — ERROR HANDLING, RETRIES & RESILIENCE

## 1. Purpose
To establish a system-wide resilience architecture: global exception handling, error taxonomy, retry policies with exponential backoff and jitter, circuit breakers, dead-letter queues, graceful degradation, and the specific failure handling needed for WaxPrep's external dependencies (WhatsApp API, AI provider, database, Redis).

## 2. What the Original Plan Says
Research global exception handling, operational vs programmer errors, graceful degradation, retry policies, exponential backoff, jitter, retry budgets, retry storms, idempotent retries, circuit breakers, dead-letter queues, poison messages, failure classification, timeout handling, external API failures, database failures, AI failures, WhatsApp failures, partial failure, graceful student-facing responses, worker failure, process restart, deployment interruption.

## 3. Deep Research Findings

**Error Taxonomy — Node.js**

**[BEST PRACTICE]** In Node.js, errors divide into two critical categories:

**Operational errors**: Expected failures from the environment. The system should handle them gracefully.
- Network timeout connecting to AI provider.
- Database connection refused.
- WhatsApp API rate limit (429).
- Malformed incoming payload.
- Redis unavailable.

**Programmer errors**: Bugs in the application code.
- TypeError (accessing property of undefined).
- Unexpected undefined variable.
- Logic errors.

**[BEST PRACTICE]** Operational errors should be caught, logged, and handled. Programmer errors in production are serious — they should be logged as `fatal` and the process should crash (letting Railway restart it cleanly) rather than continue in an undefined state. An uncaught programmer error that doesn't crash the process leaves Node.js in an unknown state.

**[FACT]** Node.js has two global error hooks:
```javascript
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'UNCAUGHT EXCEPTION — crashing');
  process.exit(1);  // Railway restarts the service
});

process.on('unhandledRejection', (reason, promise) => {
  logger.fatal({ reason }, 'UNHANDLED REJECTION — crashing');
  process.exit(1);
});
```

**[RECOMMENDATION]** Always register both handlers. Log the error before crashing. `process.exit(1)` signals Railway that the service is unhealthy and needs a restart. Railway's "Always restart" policy handles recovery.

**BullMQ Retry Architecture**

**[FACT]** BullMQ has built-in retry support per job. Each job can be configured with:
```javascript
{
  attempts: config.QUEUE_MAX_RETRIES,  // e.g., 3
  backoff: {
    type: 'exponential',
    delay: config.QUEUE_RETRY_DELAY_BASE_MS  // e.g., 1000ms
  }
}
```

**[FACT]** BullMQ's `exponential` backoff doubles the delay on each attempt: `delay × 2^(attempt - 1)`. With `delay=1000` and `attempts=3`: attempt 1 after 1s, attempt 2 after 2s, attempt 3 after 4s. These values must come from configuration, not hardcoded.

**Jitter**

**[BEST PRACTICE]** Pure exponential backoff causes **retry storms**: when a service goes down and recovers, all retrying clients retry simultaneously (they all backed off for the same duration). Jitter adds randomness to stagger retries.

**[FACT]** BullMQ does not natively add jitter to its exponential backoff. **[RECOMMENDATION]** Add a custom `backoff.type` using a BullMQ custom backoff strategy that applies `Math.random()` jitter:

```javascript
const backoffDelay = (base, attempt) => {
  const exponential = base * Math.pow(2, attempt - 1);
  const jitter = Math.random() * exponential * 0.2;  // ±20% jitter
  return Math.min(exponential + jitter, config.QUEUE_RETRY_DELAY_MAX_MS);
};
```

**Idempotency**

**[CRITICAL]** Retries must be safe. If a job is retried because of a transient network error, the job must not cause duplicate side effects. This means:
- Database inserts should use `ON CONFLICT DO NOTHING` or `ON CONFLICT DO UPDATE` with idempotent data.
- WhatsApp message sends should check if a message with the same `outboundId` has already been sent.
- AI provider calls do not need idempotency (they produce different results each time — this is expected behavior for AI).

**Dead-Letter Queues**

**[FACT]** BullMQ automatically moves jobs to a `failed` state after all retry attempts are exhausted. Failed jobs remain in Redis and can be inspected. BullMQ does not have a built-in "dead-letter queue" as a separate queue — failed jobs are queryable via `queue.getJobs(['failed'])`. **[RECOMMENDATION]** Monitor failed jobs. Implement a periodic process that logs all jobs in the `failed` state so they can be investigated. Do not silently discard failed jobs.

**[RECOMMENDATION]** For jobs that fail permanently (e.g., student's WhatsApp number is invalid), send a student-facing error message before marking the job as dead-letter. The student should not simply receive silence.

**Circuit Breakers**

**[TRADE-OFF]** Circuit breakers prevent a failing external service from being hammered with retry requests. When the circuit is open (broken), requests fail immediately without calling the downstream service. This is important for AI provider failures — if the AI provider is down, retrying immediately wastes tokens and time.

**[RECOMMENDATION]** Use the `cockatiel` library for circuit breaker and retry policies in Node.js. `cockatiel` provides composable, configurable policies:

```javascript
import { Policy, ExponentialBackoff } from 'cockatiel';

const aiProviderPolicy = Policy
  .wrap(
    Policy.handleAll().circuitBreaker(
      config.CIRCUIT_BREAKER_DURATION_MS,  // open duration from config
      new ConsecutiveBreaker(config.CIRCUIT_BREAKER_THRESHOLD)  // failures before opening
    ),
    Policy.handleAll().retry().exponential(new ExponentialBackoff({
      initialDelay: config.QUEUE_RETRY_DELAY_BASE_MS,
      maxDelay: config.QUEUE_RETRY_DELAY_MAX_MS,
    }))
  );
```

All circuit breaker parameters come from configuration.

**Timeout Handling**

**[FACT]** Node.js `fetch()` (native in Node.js 18+) does not have a built-in timeout. **[BEST PRACTICE]** Always wrap external API calls with `AbortController` and `AbortSignal.timeout()`:

```javascript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), config.AI_TIMEOUT_MS);
try {
  const response = await fetch(url, { signal: controller.signal, ... });
} finally {
  clearTimeout(timeoutId);
}
```

**Graceful Degradation — Student-Facing**

**[RECOMMENDATION]** When the AI provider fails and all retries are exhausted, WaxPrep should send the student a graceful fallback message: a student-appropriate explanation that something went wrong and they should try again. This message should be configurable (not hardcoded) via an environment variable:

```
AI_FAILURE_STUDENT_MESSAGE=Sorry, I'm having a bit of trouble right now. Could you send your message again in a moment?
```

**[CRITICAL]** Do NOT expose technical error details to the student. Do NOT send no response (silence is worse than an error message).

**Graceful Shutdown**

**[FACT]** Railway sends a `SIGTERM` signal before terminating a service (e.g., during a new deployment). Node.js exits on `SIGTERM` by default. **[BEST PRACTICE]** Handle `SIGTERM` explicitly:

```javascript
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, beginning graceful shutdown');
  
  // Stop accepting new HTTP requests
  server.close(() => logger.info('HTTP server closed'));
  
  // Let in-flight BullMQ jobs finish (with a timeout)
  await worker.close(config.WORKER_SHUTDOWN_TIMEOUT_MS);
  
  // Close database pool
  await pool.end();
  
  // Close Redis connection
  await redis.disconnect();
  
  logger.info('Graceful shutdown complete');
  process.exit(0);
});
```

**[CRITICAL]** The `worker.close()` call is essential. Without it, a Railway deployment will interrupt in-flight AI jobs — potentially leaving a student's query partially processed. `worker.close()` stops accepting new jobs and waits for active jobs to complete before returning. The timeout prevents the shutdown from hanging indefinitely if a job is stuck.

`WORKER_SHUTDOWN_TIMEOUT_MS` must come from configuration. A reasonable default is 30,000ms (30 seconds), but should be at least as long as the expected maximum AI response time.

**Deployment Interruption**

**[FACT]** Railway uses a rolling deployment model: new instances start before old instances are terminated. The SIGTERM is sent to old instances while new instances are starting. This means:
- Old instances should finish processing current jobs before exiting (graceful shutdown).
- New instances should not start processing jobs until their health check passes.
- BullMQ jobs that were active when SIGTERM was received may be retried by the new instance if the old instance fails to complete them (BullMQ's stalled job detection handles this after a configurable stall timeout).

## 4. Recommended Architecture
Global `uncaughtException`/`unhandledRejection` handlers that crash and log. BullMQ job-level retry with configurable exponential backoff + jitter. `cockatiel` circuit breakers for AI provider and WhatsApp API. `AbortSignal.timeout()` for all external calls. Graceful `SIGTERM` handler. Student-facing fallback messages.

## 5. Recommended Technologies/Options
- **`cockatiel`**: Circuit breakers and retry policies.
- **`AbortSignal.timeout()`**: Built-in Node.js 18+ timeout.
- **BullMQ custom backoff**: Job-level retry with jitter.

## 6. Alternatives Considered
- **`opossum`**: Alternative circuit breaker library. Less composable than cockatiel.
- **`p-retry`**: Lightweight retry library. Less feature-rich than cockatiel.

## 7. Trade-offs
- **Process crash on programmer error vs recovery**: Crashing and restarting is safer than running in an undefined state. Railway's fast restart (typically under 5 seconds) makes this acceptable.
- **Circuit breaker complexity**: Adds configuration surface area. Justified for AI provider calls which can be slow and expensive to retry.

## 8. Security Considerations
- Error details must never reach the student or appear in HTTP responses in a way that reveals system internals.
- Log errors fully (for debugging) but return sanitized messages externally.

## 9. Reliability Considerations
- All external calls have timeouts.
- All retries have maximum attempt limits.
- All circuit breakers have configurable thresholds.
- Graceful shutdown prevents data loss during deployments.

## 10. Scalability Considerations
- Circuit breakers prevent retry storms from amplifying load on a recovering service.
- Jitter prevents coordinated retry bursts from multiple workers.

## 11. Railway Considerations
- Railway's "Always Restart" policy ensures the service recovers from crashes.
- `SIGTERM` is sent by Railway with a configurable grace period (default 30 seconds). If the process doesn't exit within the grace period, Railway sends `SIGKILL`.

## 12. Configuration Considerations
All retry counts, delays, timeouts, circuit breaker thresholds, and student-facing error messages must be configurable. Add to Stage 2's config schema:
- `QUEUE_MAX_RETRIES`
- `QUEUE_RETRY_DELAY_BASE_MS`
- `QUEUE_RETRY_DELAY_MAX_MS`
- `AI_TIMEOUT_MS`
- `CIRCUIT_BREAKER_THRESHOLD`
- `CIRCUIT_BREAKER_DURATION_MS`
- `WORKER_SHUTDOWN_TIMEOUT_MS`
- `AI_FAILURE_STUDENT_MESSAGE`

## 13. Edge Cases
- SIGTERM during the middle of a multi-chunk response: the shutdown timeout must be long enough to let the outbound queue drain.
- Circuit breaker open when a new job arrives: fail fast, move to retry/dead-letter.
- Database pool exhausted during error handling: error handler itself must not make unbounded database calls.

## 14. Failure Modes
- Retry loop exhausted → job moves to failed state → student receives fallback message.
- Circuit breaker open → requests fail fast → backpressure relief.
- SIGTERM received during graceful shutdown → `SIGKILL` after grace period → some jobs may be interrupted and requeued by BullMQ stalled-job detection.

## 15. Common Mistakes
- Not registering `unhandledRejection` handler — async errors silently swallowed.
- Hardcoding retry counts in the job definition.
- Not adding jitter to retry backoff.
- Setting `WORKER_SHUTDOWN_TIMEOUT_MS` too low (jobs interrupted) or too high (deployments hang).
- Sending technical error messages to students.

## 16. What Should NOT Be Hardcoded
Retry counts, delays, timeouts, circuit breaker thresholds, student error messages.

## 17. What Should Remain Deterministic Infrastructure
The error classification logic, the graceful shutdown sequence, the global error handler registration.

## 18. What Must Remain AI-Controlled
The AI's decision about whether a student query is answerable, how to respond to ambiguous queries. Error handling at the infrastructure level is deterministic; the AI's response when it does produce output is its own.

## 19. Dependencies on Earlier Stages
Stages 2 (config), 3 (database pool error handling), 4 (logger).

## 20. Effects on Later Stages Within 1–14
Stage 6 (BullMQ retries), Stage 8 (webhook error responses), Stage 11 (outbound retry), all AI calls in later stages use the resilience patterns established here.

## 21. Implementation Recommendations
1. Register global error handlers in `server.js` and `worker.js` (both entry points).
2. Install `cockatiel`.
3. Create `src/errors/` module with error classes (`OperationalError`, `ValidationError`, `AiProviderError`, `WhatsAppApiError`).
4. Create `src/errors/policies.js` with configurable circuit breaker and retry policies.
5. Implement SIGTERM handler in both entry points.
6. Test graceful shutdown with a long-running job.

## 22. Testing Requirements
- Unit test: `uncaughtException` handler logs and exits.
- Unit test: retry policy applies correct backoff sequence with jitter.
- Unit test: circuit breaker opens after threshold failures.
- Integration test: graceful shutdown completes all in-flight jobs within timeout.

## 23. Completion Criteria
- Global error handlers registered in both entry points.
- All external calls have timeouts.
- SIGTERM handler implemented.
- Circuit breaker configured for AI provider.
- Student fallback message configurable.

## 24. Open Questions
- Should the circuit breaker state be shared across workers (stored in Redis)? **[TRADE-OFF]** Shared circuit breaker state prevents all workers from hammering a failing service. But adds Redis dependency to the circuit breaker. **[RECOMMENDATION]** Start with per-process circuit breakers (simpler). Add Redis-backed shared circuit breakers if multiple workers are running simultaneously and the AI provider failure requires coordinated backoff.

## 25. Research Confidence Level
**HIGH** for retry and backoff patterns. **HIGH** for graceful shutdown. **MEDIUM** for circuit breaker library choice (verify `cockatiel` is actively maintained).

---

# STAGE 6 — QUEUE & ASYNCHRONOUS WORKER INFRASTRUCTURE

## 1. Purpose
To establish the BullMQ/Redis queue infrastructure that decouples webhook receipt from AI processing, implements per-student message ordering, handles message debouncing for rapid multi-message bursts, and provides reliable job processing with full lifecycle management.

## 2. What the Original Plan Says
Research Redis, BullMQ, queue architecture, worker architecture, producer/consumer patterns, job lifecycle, acknowledgement, retries, delayed jobs, idempotency, duplicate jobs, job locks, worker crashes, stalled jobs, concurrency, ordering, FIFO assumptions, per-student ordering, queue backpressure, graceful shutdown, deployment while jobs are processing, Redis failure, queue recovery, dead-letter handling, configurable message debouncing/batching, rapid student message handling.

## 3. Deep Research Findings

**Why Queues Are Mandatory**

**[FACT]** The WhatsApp webhook requires a `200 OK` response within a few seconds (typically 5 seconds or less per Meta documentation). AI processing takes 3–30+ seconds depending on context length and provider. If the webhook handler synchronously processes the AI request, it will time out and Meta will retry the webhook — causing duplicate processing.

**[BEST PRACTICE]** The correct architecture: the webhook handler receives the message, persists it, enqueues a job, and returns `200 OK` immediately. The AI processing happens asynchronously in a worker process.

**BullMQ Architecture**

**[FACT]** BullMQ is built on Redis. It uses Lua scripts for atomic operations (job state transitions are atomic). It provides:
- Job states: `waiting`, `active`, `completed`, `failed`, `delayed`
- Named queues
- Worker concurrency
- Delayed jobs (with configurable delay from now)
- Job deduplication via `jobId`
- Job priority
- Repeatable jobs (cron-based)
- `QueueScheduler` for stalled job detection

**[FACT]** BullMQ's job deduplication: when you add a job with a specific `jobId`, if a job with that ID already exists in `waiting` or `delayed` states, the new add is a no-op. This is the foundational mechanism for debouncing.

**Per-Student Ordering — The Concurrency Problem**

**[CRITICAL]** BullMQ processes jobs from a single queue concurrently (based on worker `concurrency` setting). With `concurrency=5`, up to 5 jobs process simultaneously. This creates a race condition for a single student's messages: if two messages from the same student are both in the queue, they may be processed in parallel, leading to:
- Two simultaneous AI calls for the same student.
- Two outbound messages in wrong or undefined order.
- AI context constructed from incomplete state (both jobs read history before either writes new messages).

**Solution Architecture — Per-Student Serialization**

**[BEST PRACTICE]** There are two patterns for per-student serialization:

**Option A: Per-student queue names**
Create a separate BullMQ queue per student: `student-jobs:waxId`. This guarantees ordering but creates potentially thousands of queues and their associated Redis keys.

**[TRADE-OFF]** Per-student queues: perfect ordering, but complex queue lifecycle management (when to create/delete queues), higher Redis memory usage.

**Option B: BullMQ Flows + Global Queue with Per-Student Job Groups**
Use a single queue with BullMQ's `group` feature. BullMQ Pro (paid) supports rate-limited groups. **[COST CONCERN]** BullMQ Pro is paid.

**Option C: Single queue + per-student Redis lock**
Use a single BullMQ queue. Before processing a student's job, acquire a Redis lock keyed on the student's WaxID. If the lock is already held, the job is requeued with a short delay.

```javascript
const lock = await redlock.acquire(`lock:student:${waxId}`, config.QUEUE_JOB_TIMEOUT_MS);
try {
  await processStudentMessage(job.data);
} finally {
  await lock.release();
}
```

**[RECOMMENDATION]** Use **Option C** with `redlock` for per-student serialization. Redlock is the standard distributed lock implementation for Redis. Single queue simplifies monitoring. The lock guarantees that only one AI job per student runs at a time.

**The Rapid Message Problem — Debouncing**

**[CRITICAL]** This is the most nuanced architecture challenge in the entire system. Consider:

```
16:31:01 — Student sends "Sir"
16:31:02 — Student sends "I don't understand"
16:31:03 — Student sends "this physics question"
16:31:04 — Student sends [image of physics problem]
```

Without debouncing: four separate AI calls, four responses. The first three responses are based on incomplete context. The student gets fragmented, irrelevant responses. This is a terrible user experience.

**The Correct Architecture — Debounce via Delayed Jobs with Supersession**

**[BEST PRACTICE]** When a new message arrives for student X:

1. The new message is **persisted immediately** to the database (message arrives in DB regardless of debounce).
2. Check if a pending debounce job already exists for student X.
3. If a pending job exists: **cancel/remove it** and create a new delayed job. The new job inherits the context of all accumulated messages.
4. If no pending job exists: create a new delayed job with the debounce window delay.
5. The delayed job, when it fires, fetches ALL unprocessed messages for the student in the debounce window and processes them together.

**Implementation via BullMQ:**

```javascript
// Every incoming message:
const jobId = `debounce:student:${waxId}`;

// Remove existing debounce job (if any)
const existingJob = await debounceQueue.getJob(jobId);
if (existingJob) {
  await existingJob.remove();
}

// Add new debounce job, delayed by window
await debounceQueue.add('process-student-messages', {
  waxId,
  _trace: getContext(),
}, {
  jobId,  // deterministic ID = natural deduplication
  delay: config.QUEUE_DEBOUNCE_WINDOW_MS,  // from config, NOT hardcoded
});
```

The worker for this debounce queue:
```javascript
worker.process(async (job) => {
  const { waxId } = job.data;
  // Fetch all unprocessed messages for this student since last AI response
  const unprocessedMessages = await db.getUnprocessedMessagesForStudent(waxId);
  // Pass all messages as a batch to AI context assembly
  await aiOrchestrator.process(waxId, unprocessedMessages);
});
```

**[CRITICAL]** The debounce window (`QUEUE_DEBOUNCE_WINDOW_MS`) must be configurable. The value affects:
- Response latency (longer window = slower response)
- Message aggregation quality (longer window = more messages grouped)
- Student experience (too long = feels unresponsive)

Reasonable starting range: 1,500ms–5,000ms. The default should be researched and tuned with real student behavior. **[RECOMMENDATION]** Default to 2,500ms. Document the trade-off in `.env.example`.

**[FACT]** `existingJob.remove()` in BullMQ removes a job from `waiting` or `delayed` state. If the job has already moved to `active` state (processing started), it cannot be removed — the job will complete. This is acceptable: if processing has started, the job already has a reasonable context window. The new message will be processed in the next AI turn.

**Late-Arriving Messages**

**[EDGE CASE]** A student sends 4 messages. Messages 1, 2, 3 arrive at the webhook within the debounce window. Message 4 arrives 0.5 seconds late (network delay). The debounce job fires before message 4 arrives.

**[RECOMMENDATION]** The AI worker should check for any newly arrived messages in a short window after the debounce fires. Alternatively: messages 1, 2, 3 are processed together; message 4, arriving after the debounce job fires, creates a new debounce job. The AI context (Stage 9+) will include the first response, so the AI will see message 4 in context of the previous exchange. This is acceptable behavior.

**Image and Audio Mixed with Text**

**[FACT]** WhatsApp webhook delivers image and audio messages separately from text — each media item is a separate webhook event with its own `message.id`. When a student sends "this physics question" + [image], these arrive as two separate webhook events.

**[RECOMMENDATION]** The debounce architecture handles this naturally: all message types (text, image, audio) are persisted to the database when received. The debounce job aggregates all unprocessed messages of all types when it fires. The AI context assembly (Stage-level concern) handles the multi-modal content.

**Redis Failure**

**[FACT]** BullMQ is completely dependent on Redis. If Redis fails:
- No new jobs can be enqueued.
- No jobs can be processed.
- The webhook handler cannot enqueue — it will fail.

**[RECOMMENDATION]** Handle Redis connection failure in the webhook handler explicitly:
```javascript
try {
  await debounceQueue.add('process-student-messages', payload, opts);
} catch (err) {
  logger.error({ err }, 'Failed to enqueue message — Redis unavailable');
  // Return 500 so Meta retries the webhook
  // Meta will retry the webhook up to several times
  return res.status(500).json({ error: 'Queue unavailable' });
}
```

Returning `500` to Meta causes Meta to retry the webhook delivery (Meta retries failed webhooks). This ensures no messages are lost when Redis is temporarily unavailable.

**[TRADE-OFF]** Returning `500` to Meta creates webhook retry storms if Redis is down for more than a few minutes. **[MITIGATION]** Redis on Railway is highly available (managed service). Brief outages are rare. For a startup, this is an acceptable trade-off vs the complexity of a local message buffer.

**Stalled Jobs**

**[FACT]** BullMQ's stalled job detection: if a worker crashes while processing a job, the job's lock expires after `lockDuration` (default 30 seconds). BullMQ's `QueueScheduler` process detects stalled jobs and re-queues them for retry. **[RECOMMENDATION]** Run a `QueueScheduler` in the worker process. Without it, stalled jobs remain stuck.

**[FACT]** BullMQ v4+ has `QueueScheduler` built into `Worker` — it is no longer a separate class that needs instantiation. **[NEEDS VERIFICATION]** Confirm the current BullMQ version's approach — the API has changed between versions.

**Worker Concurrency**

**[RECOMMENDATION]** Set `concurrency` in the BullMQ worker to control how many jobs run simultaneously. This must be configurable:

```javascript
const worker = new Worker('debounce-queue', processor, {
  connection: redisConnection,
  concurrency: config.QUEUE_WORKER_CONCURRENCY,  // e.g., 5
});
```

With the per-student Redis lock, `concurrency=5` means up to 5 different students are processed simultaneously, but no single student has more than 1 active job. This is the correct behavior.

**Queue Backpressure**

**[RECOMMENDATION]** Monitor the queue depth (`await queue.getWaiting()`). If the queue is growing faster than it's being drained, either:
- Add more worker instances (horizontal scaling).
- Increase worker concurrency (if the AI provider supports it).
- Alert if queue depth exceeds a threshold (Stage 7 health checks).

## 4. Recommended Architecture
Single BullMQ queue for debounced student message processing. `delay + deterministic jobId` for debounce supersession. Per-student Redis lock (redlock) for serialization during processing. `_trace` field in all job payloads. Configurable `QUEUE_DEBOUNCE_WINDOW_MS`, `QUEUE_WORKER_CONCURRENCY`, `QUEUE_MAX_RETRIES`. Graceful worker shutdown via `worker.close()`.

## 5. Recommended Technologies/Options
- **`bullmq`**: Job queue on Redis.
- **`ioredis`**: Redis client for BullMQ (BullMQ requires ioredis-compatible client).
- **`redlock`**: Distributed lock implementation for per-student serialization.

## 6. Alternatives Considered
- **RabbitMQ**: Proper message broker with more routing features. Higher operational complexity. Overkill at startup scale.
- **AWS SQS**: Managed queue service. Not running on Railway. Adds external dependency.
- **Per-student queues**: Perfect ordering but complex lifecycle management.

## 7. Trade-offs
- **Redis dependency**: All queueing depends on Redis. Single point of failure. **Mitigation**: Railway Redis is managed and highly available.
- **Debounce removes in-flight jobs**: Cannot remove a job that's already active. **Mitigation**: Active jobs have a complete enough context. New messages from the same student after the job starts will be processed next turn.
- **Redlock**: Requires all Redis nodes to participate in lock. With a single Redis instance (not cluster), this is straightforward.

## 8. Security Considerations
- Job payloads stored in Redis must not contain raw phone numbers or sensitive student data.
- Include only WaxID (pseudonymized ID) and message IDs in job payloads. Full content is retrieved from the database.
- Redis should require authentication (`REDIS_URL` with password) in production.

## 9. Reliability Considerations
- Stalled job detection requires the `QueueScheduler` (or equivalent in current BullMQ version).
- Graceful shutdown (`worker.close()`) prevents job interruption during deployments.
- Job deduplication via `jobId` prevents duplicate debounce jobs.

## 10. Scalability Considerations
- BullMQ scales horizontally: add more worker instances sharing the same Redis queue.
- Redis can become a bottleneck at very high message rates. Redis Cluster may be needed at scale. **[ASSUMPTION]** Single Redis instance is sufficient for WaxPrep's startup user base.

## 11. Railway Considerations
- **[FACT]** Railway provides managed Redis as a service. Connect via `REDIS_URL` reference variable.
- Run the BullMQ worker as a separate Railway service with no public networking.
- The worker service uses `"start:worker": "node src/workers/aiWorker.js"` as its start command.

## 12. Configuration Considerations
- `REDIS_URL` (required)
- `QUEUE_DEBOUNCE_WINDOW_MS` (default: 2500)
- `QUEUE_WORKER_CONCURRENCY` (default: 5)
- `QUEUE_MAX_RETRIES` (default: 3)
- `QUEUE_RETRY_DELAY_BASE_MS` (default: 1000)
- `QUEUE_RETRY_DELAY_MAX_MS` (default: 30000)
- `QUEUE_JOB_TIMEOUT_MS` (default: 120000 — max time for an AI job)
- `QUEUE_LOCK_DURATION_MS` (default: 30000 — BullMQ job lock)

## 13. Edge Cases
- Student sends messages faster than debounce window can be reset: messages pile up in DB, debounce resets each time. Eventually the debounce fires and processes all accumulated messages together. Correct behavior.
- Two webhook events for the same message arrive simultaneously (duplicate delivery): the database `ON CONFLICT DO NOTHING` on `message_id` handles deduplication at the persistence layer. The debounce job sees only one record per unique message.
- Redis WRONGTYPE errors if queue data is corrupted: BullMQ's Lua scripts are designed to handle this. In extreme cases, a Redis flush and job replay may be needed.
- Large message: if a student sends a very large document, the job payload should contain only the message ID (retrieve from DB in the worker), not the full content (Redis has a maximum key size concern at extreme scale).

## 14. Failure Modes
- Redis unavailable: webhook returns 500, Meta retries.
- Worker crashes mid-job: stalled job detection requeues after lock expiry.
- Redlock acquisition fails (timeout): job fails and is retried.
- Debounce job fires while student is still typing: messages after the fire are processed in the next turn. Acceptable.

## 15. Common Mistakes
- Hardcoding `delay: 5000` in debounce job instead of using config.
- Not running QueueScheduler (stalled jobs never recovered).
- Not handling Redis connection failure in the webhook handler.
- Setting `concurrency` too high (more workers than AI provider concurrent connections supports).
- Storing sensitive data in job payloads (always use DB IDs instead).
- Not checking `existingJob` state before removing it (removing an active job is not possible).

## 16. What Should NOT Be Hardcoded
Debounce window, worker concurrency, retry counts, lock durations, job timeout.

## 17. What Should Remain Deterministic Infrastructure
The queue topology, job lifecycle management, deduplication logic, lock acquisition and release.

## 18. What Must Remain AI-Controlled
The AI worker's processing of the accumulated messages — which topics to address, how to respond, what pedagogical approach to take.

## 19. Dependencies on Earlier Stages
Stage 2 (config), Stage 3 (database for persisting messages), Stage 4 (trace propagation via `_trace` field), Stage 5 (retry policies, graceful shutdown).

## 20. Effects on Later Stages Within 1–14
Stage 8 (webhook hands off to this queue), Stage 10 (normalized messages enter this queue), Stage 11 (outbound queue uses similar patterns), Stage 13 (session is fetched/created in the worker).

## 21. Implementation Recommendations
1. Install `bullmq`, `ioredis`, `redlock`.
2. Create `src/queue/connection.js` (Redis connection singleton).
3. Create `src/queue/debounceQueue.js` (queue instance and producer).
4. Create `src/workers/aiWorker.js` (BullMQ worker).
5. Implement `enqueueStudentMessage()` in producer.
6. Implement per-student lock acquisition in worker.
7. Test debounce supersession manually.

## 22. Testing Requirements
- Unit test: calling `enqueueStudentMessage()` twice within the debounce window results in one queued job.
- Unit test: calling it after the debounce window creates a new job.
- Integration test: worker processes a job and acquires/releases lock correctly.
- Integration test: two concurrent workers compete for the same student lock — only one proceeds.
- Integration test: graceful shutdown completes active jobs within timeout.

## 23. Completion Criteria
- Debounce queue operational with configurable window.
- Worker processes jobs with per-student locking.
- Stalled job detection active.
- Graceful shutdown working.
- All parameters from configuration.

## 24. Open Questions
- Should WaxPrep have a separate queue for outbound message delivery? **[RECOMMENDATION]** Yes — Stage 11 establishes the outbound queue. The AI worker enqueues outbound jobs upon completing processing.
- BullMQ Pro for group rate limiting: assess when the startup has revenue and can afford the paid tier.

## 25. Research Confidence Level
**HIGH** for BullMQ fundamentals. **HIGH** for debounce architecture. **MEDIUM** for BullMQ v4+ API specifics (verify QueueScheduler behavior in current version).

---

# STAGE 7 — HEALTH CHECKS & BASIC MONITORING

## 1. Purpose
To implement meaningful health check endpoints that allow Railway to determine service liveness vs readiness, surface dependency failures, and support safe deployment and restart behavior.

## 2. What the Original Plan Says
Research liveness probes, readiness probes, dependency health, database health, Redis health, worker health, Railway health checks, deployment verification, graceful startup, graceful shutdown, unhealthy deployment behavior, restart behavior, health endpoint security.

## 3. Deep Research Findings

**Liveness vs Readiness — The Critical Distinction**

**[BEST PRACTICE]** Two fundamentally different health checks serve different purposes:

**Liveness probe (`GET /health`):**
- Question: "Is this process alive and not deadlocked?"
- Implementation: Return `200 OK` immediately. No dependency checks.
- Failure behavior: If this returns non-200, the container runtime (Railway) restarts the service.
- Should be: Instant, lightweight, always returns 200 unless the process is hanging.

**Readiness probe (`GET /ready`):**
- Question: "Is this service ready to accept traffic?"
- Implementation: Check all critical dependencies (database, Redis).
- Failure behavior: If this returns non-200, Railway's load balancer should not route traffic to this instance.
- Should be: Thorough, may take a few hundred milliseconds.

**[FACT]** Railway's health check system (as of 2026): Railway uses a health check URL to determine when a new deployment is ready to receive traffic. If the health check fails for a new deployment, Railway does not promote the new deployment and keeps the old one running. This is the deployment safety mechanism. **[NEEDS VERIFICATION]** Confirm whether Railway supports separate liveness vs readiness check URLs, or only a single health check URL. **[ASSUMPTION]** Railway uses a single configurable health check URL — use `/ready` as it is more thorough.

**Health Check Implementation**

```javascript
// GET /health — liveness only
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// GET /ready — readiness with dependency checks
router.get('/ready', async (req, res) => {
  const checks = {};
  let allHealthy = true;
  
  // Database check
  try {
    const start = Date.now();
    await pool.query('SELECT 1');
    checks.database = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.database = { status: 'error', message: err.message };
    allHealthy = false;
  }
  
  // Redis check
  try {
    const start = Date.now();
    await redis.ping();
    checks.redis = { status: 'ok', latencyMs: Date.now() - start };
  } catch (err) {
    checks.redis = { status: 'error', message: err.message };
    allHealthy = false;
  }
  
  const statusCode = allHealthy ? 200 : 503;
  res.status(statusCode).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
    timestamp: new Date().toISOString(),
  });
});
```

**Worker Health**

**[RECOMMENDATION]** The BullMQ worker service does not have an HTTP server for health checks by default. Two options:
1. Add a minimal HTTP server to the worker (just for `/health`) that returns 200 if the worker process is running.
2. Check worker health via Redis queue depth in the webhook service's `/ready` endpoint.

**[RECOMMENDATION]** Option 1: Add a minimal HTTP health server to the worker process. Railway needs a health check URL for both services. The worker's health endpoint simply returns `200 OK` and the queue depth:

```javascript
// In aiWorker.js, alongside the BullMQ worker
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', worker: 'running' }));
  } else {
    res.writeHead(404);
    res.end();
  }
});
healthServer.listen(config.WORKER_HEALTH_PORT || 3001);
```

**Railway Health Check Configuration**

**[FACT]** Railway allows configuring a health check path and timeout in service settings. Set this to `/ready` with a timeout appropriate for the database and Redis check latency (e.g., 10 seconds). Set the initial delay to allow the service to start (e.g., 10–30 seconds).

**Health Endpoint Security**

**[RECOMMENDATION]** Health endpoints should not be publicly documented but should not be locked behind authentication either — load balancers and monitoring systems need to access them without credentials. The information returned should be safe: `status: ok`, latencies, and error messages that don't reveal system internals. Never return stack traces, configuration values, or secrets in health responses.

**Startup Health Checks**

**[RECOMMENDATION]** Before the Express server starts accepting traffic (before `server.listen()`), run a startup health check:
```javascript
await verifyDatabaseConnection();
await verifyRedisConnection();
logger.info('All startup checks passed, starting server');
server.listen(config.PORT);
```

If startup checks fail, `process.exit(1)` before listening. Railway will retry the deployment.

## 4. Recommended Architecture
`GET /health` (liveness, instant) and `GET /ready` (readiness, checks DB and Redis) on the webhook service. Minimal health HTTP server on the worker service. Startup validation before `server.listen()`.

## 5. Recommended Technologies/Options
- Built-in `pg.query('SELECT 1')` for database health.
- `redis.ping()` for Redis health.
- Native `node:http` for worker health server (avoid adding Express to the worker).

## 6. Alternatives Considered
- **Terminus**: Node.js graceful shutdown and health check library. Adds value for graceful shutdown integration with health checks. **[RECOMMENDATION]** Consider adding in a future iteration but not required at Stage 7.

## 7. Trade-offs
- **Single health URL vs separate liveness/readiness**: Railway's single health check URL means we use `/ready` which is more thorough. The risk: if the database is temporarily slow, the health check fails and Railway may restart an otherwise healthy service.
- **Checking queue depth in health**: Useful signal but complex to threshold correctly.

## 8. Security Considerations
- Do not expose sensitive system information in health responses.
- Do not authenticate health endpoints (load balancers can't provide auth).
- Rate-limit health endpoints to prevent health endpoint abuse (though they're lightweight).

## 9. Reliability Considerations
- Health check timeout must be shorter than Railway's probe timeout.
- A slow `/ready` check (e.g., if the database is overloaded) should not block the health check indefinitely — add a timeout to `SELECT 1`.

## 10. Scalability Considerations
- Health checks add minimal load. `SELECT 1` is extremely fast.

## 11. Railway Considerations
- **[FACT]** Configure the health check path in Railway service settings.
- Railway's zero-downtime deployments depend on the new instance passing the health check before traffic is switched. If `/ready` fails, the deployment is rolled back.

## 12. Configuration Considerations
- `WORKER_HEALTH_PORT` (default: 3001)
- Health check timeout values should be consistent with Railway's probe timeout.

## 13. Edge Cases
- Database is healthy but Redis is down: `/ready` returns 503. Railway routes traffic away. This may cascade if all worker instances fail the check — Railway may restart the workers, which makes Redis unavailable briefly. **[MITIGATION]** Worker's health check should not include Redis if Redis being down is a known degraded mode.
- `/ready` check itself causes a database connection: ensure this uses a connection from the pool with a short timeout, not a new dedicated connection.

## 14. Failure Modes
- New deployment fails health check: Railway keeps old deployment running. Developer must investigate and fix.
- Health check times out: same as failure — Railway treats timeout as unhealthy.

## 15. Common Mistakes
- Making `/health` check dependencies (it becomes slow and causes unnecessary restarts).
- Forgetting to add the health server to the worker process.
- Setting health check timeout too short (Railway marks healthy services as unhealthy during brief DB load spikes).
- Leaking database error messages in health responses.

## 16. What Should NOT Be Hardcoded
Health check timeouts, worker health port.

## 17. What Should Remain Deterministic Infrastructure
The health check logic itself is deterministic.

## 18. What Must Remain AI-Controlled
Nothing — health checks are pure infrastructure.

## 19. Dependencies on Earlier Stages
Stage 3 (database pool), Stage 4 (logger), Stage 6 (Redis connection).

## 20. Effects on Later Stages Within 1–14
Railway deployment safety depends on Stage 7. Every new stage that adds a dependency should add a corresponding health check.

## 21. Implementation Recommendations
1. Create `src/health/` module with liveness and readiness handlers.
2. Mount in Express.
3. Add minimal HTTP server to worker.
4. Configure Railway health check paths.

## 22. Testing Requirements
- Integration test: `/ready` returns 200 when DB and Redis are connected.
- Integration test: `/ready` returns 503 when DB is disconnected.
- Unit test: `/health` always returns 200 regardless of dependency state.

## 23. Completion Criteria
- `/health` and `/ready` endpoints implemented on webhook service.
- Worker health endpoint implemented.
- Railway health check configured for both services.
- Startup validation before `server.listen()`.

## 24. Open Questions
- Should queue depth be included in the `/ready` response? **[RECOMMENDATION]** Include as informational but not as a health gate — a large queue does not mean the service is unhealthy.

## 25. Research Confidence Level
**HIGH** for health check patterns. **MEDIUM** for Railway's specific liveness/readiness probe configuration (verify current Railway documentation).

---

# STAGE 8 — WHATSAPP WEBHOOK ENDPOINT

## 1. Purpose
To implement the production-grade WhatsApp Cloud API webhook endpoint: verification challenge handling, incoming message reception, immediate `200 OK` response, message type routing, status event filtering, and the response delivery architecture (typing indicators, message chunking, sequential delivery) appropriate for WhatsApp's constraints.

## 2. What the Original Plan Says
Research WhatsApp Cloud API, webhook architecture, verification challenge, POST webhook payloads, all message types, status events, timestamps, message IDs, phone numbers, sender identifiers, webhook retries, delivery behavior, webhook response requirements, webhook timeout expectations, payload structure, versioning, API version changes, rate limits, production deployment considerations, typing indicators, response chunking, batching, sequential message delivery, configurable chunk sizes, response latency, partial response strategies.

## 3. Deep Research Findings

**WhatsApp Cloud API — Two Webhook Routes**

**[FACT]** Meta's webhook setup involves two HTTP methods to the same URL:

**1. GET — Verification Challenge (one-time setup)**
Meta sends `GET /?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=RANDOM_STRING`. The server must verify the token and return the `hub.challenge` value as the raw response body with HTTP 200.

**[CRITICAL]** Common mistake: wrapping the challenge in JSON (`{ "challenge": "abc" }`) — Meta expects the raw string `abc`, not JSON. Returning JSON causes verification to fail.

**[CRITICAL]** The GET verification request does NOT include `X-Hub-Signature-256`. The signature header is only on POST requests. Any code that checks the signature on GET requests will block the verification.

**2. POST — Message Events**
Meta sends message events as POST requests with:
- `Content-Type: application/json`
- `X-Hub-Signature-256: sha256=<hex>` — HMAC-SHA256 of the raw request body keyed with the App Secret.
- A JSON payload nested inside `entry[].changes[].value`.

**[CRITICAL]** The raw request body must be captured **before** any JSON parsing middleware. Express's `express.json()` consumes and discards the raw body. Use `express.raw({ type: 'application/json' })` to capture the raw body, then parse it manually for the webhook route.

**WhatsApp Payload Structure**

**[FACT]** A typical inbound text message payload:
```json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "WABA_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "15556789999",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "contacts": [{
          "profile": { "name": "Student Name" },
          "wa_id": "STUDENT_PHONE_NUMBER"
        }],
        "messages": [{
          "from": "STUDENT_PHONE_NUMBER",
          "id": "wamid.UNIQUE_MESSAGE_ID",
          "timestamp": "1680000000",
          "type": "text",
          "text": { "body": "Sir I don't understand" }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

**[FACT]** Status events (sent/delivered/read) have the same outer structure but `value.statuses` instead of `value.messages`. The webhook handler must filter these out early — they should not create AI processing jobs.

**[FACT]** The `from` field contains the student's phone number. The `id` field is the unique WhatsApp message ID. The `timestamp` field is a Unix timestamp (integer string).

**Message Types**

**[FACT]** Supported WhatsApp Cloud API message types in inbound webhooks:
- `text` — `.text.body`
- `image` — `.image.id`, `.image.mime_type`, `.image.sha256`, `.image.caption` (optional)
- `audio` — `.audio.id`, `.audio.mime_type`
- `video` — `.video.id`, `.video.mime_type`
- `document` — `.document.id`, `.document.filename`, `.document.mime_type`
- `location` — `.location.latitude`, `.location.longitude`, `.location.name` (optional)
- `interactive` — button replies, list replies
- `sticker` — `.sticker.id`
- `reaction` — `.reaction.message_id`, `.reaction.emoji`

**[RECOMMENDATION]** Handle `text`, `image`, and `audio` in Stages 8–10. Log and acknowledge (return 200) but don't process `video`, `document`, `location`, `sticker`, `reaction` in early stages. Never return non-200 for unsupported message types — Meta will retry aggressively.

**Webhook Timeout and Response Requirements**

**[FACT]** Meta's documentation: the webhook endpoint must respond within a few seconds. If the webhook doesn't respond within this window, Meta will retry the delivery. Multiple retries with long delays can result in duplicate message processing.

**[CRITICAL]** The webhook handler must return `200 OK` immediately after basic validation. All processing (AI, database, queue) happens asynchronously.

**Webhook Retries**

**[FACT]** Meta retries failed webhook deliveries (non-200 response or timeout). The retry schedule is not publicly documented in detail, but Meta has been observed retrying multiple times over several hours. This makes **idempotent message handling mandatory** — the same `message.id` may arrive multiple times. The handler must deduplicate by `message.id` before enqueuing.

**[FACT]** Each WhatsApp message has a globally unique ID (`wamid.xxxxx`). Use this as the idempotency key.

**WhatsApp API Versioning**

**[FACT]** Meta regularly releases new Graph API versions (e.g., v18.0, v19.0, v20.0). Older versions are deprecated with a 2-year support window. The API version is part of the URL: `https://graph.facebook.com/v20.0/...`. **[RECOMMENDATION]** Store the API version as a configurable variable (`WHATSAPP_API_VERSION`) so it can be updated without a code deploy.

**Rate Limits**

**[FACT]** WhatsApp Cloud API outbound rate limits:
- Default: 80 messages per second per phone number.
- Upgradeable to 1,000 MPS automatically if eligibility is met.
- **Per-user pair rate limit**: One message every 6 seconds to the same user (this is the relevant limit for WaxPrep — each student is one user).
- Error 130429 when throughput limit exceeded.

**[FACT]** As of October 2025, messaging limits (for outbound business-initiated conversations) apply at the Business Portfolio level, not per phone number. New businesses start at 250 conversations per 24 hours, scaling up automatically based on usage and quality.

**Typing Indicators**

**[FACT]** WhatsApp Cloud API supports typing indicators via the Messages API. To show a typing indicator:
1. Mark the student's inbound message as `read` (this removes the unread indicator).
2. Send a typing indicator with `typing_indicator.type: "text"`.

**[FACT]** The typing indicator auto-dismisses after 25 seconds. **[RECOMMENDATION]** Send the typing indicator immediately after the AI job starts processing (not at webhook receipt). This gives the most accurate UX — typing appears when WaxPrep is actually generating a response.

**[FACT]** The typing indicator API (as of 2026):
```javascript
await fetch(`${WHATSAPP_BASE_URL}/${PHONE_NUMBER_ID}/messages`, {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${ACCESS_TOKEN}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: inboundMessageId,
    typing_indicator: { type: 'text' }
  })
});
```
**[NEEDS VERIFICATION]** Verify the exact typing indicator API format against current Meta documentation — the API has changed between versions.

**Response Chunking — The WhatsApp Constraint**

**[CRITICAL]** WhatsApp has a practical character limit per message of approximately 4,096 characters. Long AI responses must be split into multiple sequential messages.

**[TRADE-OFF]** Splitting strategies:

1. **Hard character count**: Simple but splits mid-sentence, mid-word, mid-code-block. Poor UX.
2. **Semantic paragraph splitting**: Split on `\n\n` (paragraph boundary). Much better UX.
3. **Sentence splitting**: Split on sentence boundaries. Complex.
4. **Hybrid**: Split on paragraph boundaries, but if a paragraph exceeds the character limit, split on sentence boundaries within it.

**[RECOMMENDATION]** Implement a configurable semantic splitter:
- Maximum chunk size: `RESPONSE_MAX_CHUNK_CHARS` (default: 1000 — shorter than the 4096 limit for better UX).
- Primary split: paragraph boundaries (`\n\n`).
- Secondary split: sentences within a paragraph if it exceeds the chunk size.
- No split within a word or markdown code block.

The chunk size must be configurable. 4096 is the platform limit, not the right value for educational responses. Educational text in smaller chunks is more digestible for students.

**Sequential Delivery**

**[CRITICAL]** When sending multiple chunks, they must be sent sequentially with the API confirming delivery of chunk N before chunk N+1 is sent. Race conditions in sending can cause chunks to arrive out of order.

**[FACT]** WhatsApp does not guarantee delivery order if messages are sent simultaneously (in parallel). Always send chunks sequentially (await each send before starting the next).

**Outbound Queue**

**[RECOMMENDATION]** Rather than sending responses directly from the AI worker, enqueue each chunk into an outbound queue (Stage 11). The outbound queue worker sends chunks sequentially with appropriate delays between chunks (configurable) and handles retry on failure.

## 4. Recommended Architecture
GET handler returns raw challenge string. POST handler captures raw body, validates signature (Stage 9), normalizes payload (Stage 10), persists message (Stage 3), enqueues debounce job (Stage 6), returns `200 OK`. Typing indicator sent from the AI worker (Stage 11). Response chunking by semantic paragraph boundaries. Outbound queue for sequential chunk delivery.

## 5. Recommended Technologies/Options
- Native `fetch()` for WhatsApp API calls (Node.js 18+).
- `express.raw({ type: 'application/json' })` for raw body capture.

## 6. Alternatives Considered
- **Twilio WhatsApp API**: Twilio's wrapper around WhatsApp. Adds cost and a dependency. Not recommended — use WhatsApp Cloud API directly.

## 7. Trade-offs
- **Returning `200 OK` before processing**: The risk is that if queueing fails, the message is lost without the student knowing. **Mitigation**: If queue fails, the webhook can return 500 to trigger Meta's retry.
- **Typing indicator timing**: Sending it at webhook receipt gives immediate feedback. Sending it at AI start is more accurate. **Recommendation**: Send at AI start.

## 8. Security Considerations
- Raw body capture is essential for signature verification (Stage 9).
- The WhatsApp access token (`WHATSAPP_ACCESS_TOKEN`) must never appear in logs.
- Status events (delivered, read) should be acknowledged and discarded — they don't require AI processing.

## 9. Reliability Considerations
- Webhook must respond within a few seconds. Any delay → Meta retry → duplicate processing risk.
- Idempotent processing (by `message.id`) prevents duplicate AI calls.

## 10. Scalability Considerations
- **[FACT]** WhatsApp allows up to 80 MPS default. For WaxPrep's educational tutor use case, this is unlikely to be a concern in early stages.
- At scale, if webhook throughput becomes a bottleneck, the webhook service can be horizontally scaled (multiple instances behind a load balancer) since it is stateless.

## 11. Railway Considerations
- The webhook service must have a public HTTPS URL (Railway provides this automatically).
- **[FACT]** Railway provides HTTPS automatically with a valid certificate — Meta requires a valid HTTPS URL for webhooks.

## 12. Configuration Considerations
- `WHATSAPP_VERIFY_TOKEN` — verification token set in Meta app dashboard.
- `WHATSAPP_APP_SECRET` — used for HMAC signature verification.
- `WHATSAPP_PHONE_NUMBER_ID` — the business phone number ID.
- `WHATSAPP_ACCESS_TOKEN` — the API access token.
- `WHATSAPP_API_VERSION` — e.g., `v20.0`.
- `WHATSAPP_API_BASE_URL` — default: `https://graph.facebook.com`.
- `RESPONSE_MAX_CHUNK_CHARS` — default: 1000.
- `RESPONSE_CHUNK_DELAY_MS` — delay between sequential chunks (default: 500ms).
- `RESPONSE_TYPING_INDICATOR_ENABLED` — default: true.

## 13. Edge Cases
- Meta sends `GET` for webhook verification with no signature — must not check signature on GET.
- Meta sends a duplicate message (same `wamid`) — must deduplicate by message ID.
- Payload contains no `messages` field (e.g., status-only webhook) — must handle gracefully and return 200.
- Student sends a message type that's not yet supported (e.g., `sticker`) — log and return 200, do not trigger AI.

## 14. Failure Modes
- Webhook handler throws an unhandled error: Express catches it in the global error middleware, returns 500, Meta retries.
- Queue unavailable: webhook returns 500, Meta retries, message is not lost.
- WhatsApp API returns error on outbound send: retry via outbound queue (Stage 11).

## 15. Common Mistakes
- Returning JSON `{ "challenge": "abc" }` instead of raw string for verification.
- Checking signature on GET requests.
- Using `express.json()` before the webhook route (destroys raw body).
- Not deduplicating by `message.id`.
- Processing status events as student messages.

## 16. What Should NOT Be Hardcoded
API version, base URL, chunk size, chunk delay, access token, phone number ID.

## 17. What Should Remain Deterministic Infrastructure
Signature verification, payload validation, message deduplication logic, status event filtering.

## 18. What Must Remain AI-Controlled
The content of the response to the student — never prescribe what the AI says.

## 19. Dependencies on Earlier Stages
Stage 2 (config for all WhatsApp variables), Stage 3 (DB for message persistence), Stage 4 (logging), Stage 5 (error handling), Stage 6 (queue for handoff).

## 20. Effects on Later Stages Within 1–14
Stage 9 (security layer processes the raw body from this stage), Stage 10 (normalization processes the parsed payload), Stage 11 (outbound system delivers responses).

## 21. Implementation Recommendations
1. Create `src/webhook/router.js` with GET and POST handlers.
2. Create `src/messaging/whatsappClient.js` for outbound API calls.
3. Create `src/messaging/responseSplitter.js` for configurable chunking.
4. Mount webhook router in `src/server.js` with raw body middleware.

## 22. Testing Requirements
- Unit test: GET handler returns correct challenge string.
- Unit test: POST handler returns 200 immediately.
- Unit test: Status events are filtered and not processed.
- Unit test: Response splitter splits at paragraph boundaries within chunk limit.
- Unit test: Response splitter handles single-paragraph responses shorter than chunk limit.
- Integration test: Full message flow from POST to queue.

## 23. Completion Criteria
- GET verification passing in Meta developer console.
- POST events received and enqueued.
- Status events filtered.
- Response splitter tested with various input lengths.
- All configuration values from environment.

## 24. Open Questions
- What exact API version to use? **[RECOMMENDATION]** Use latest stable version (verify at `https://developers.facebook.com/docs/graph-api/changelog/`).
- Long-term access token vs system user token: **[BEST PRACTICE]** Use a System User permanent token, not a temporary page token. System User tokens don't expire.

## 25. Research Confidence Level
**HIGH** for webhook architecture. **HIGH** for message type handling. **MEDIUM** for typing indicator API (verify current format). **HIGH** for response chunking approach.

---

# STAGE 9 — WEBHOOK SECURITY & VERIFICATION

## 1. Purpose
To implement the complete security layer for the WhatsApp webhook: HMAC-SHA256 signature verification, timing-safe comparison, replay attack mitigation, request size limits, rate limiting, and abuse prevention.

## 2. What the Original Plan Says
Research Meta webhook verification, X-Hub-Signature-256, HMAC-SHA256, raw request body verification, timing-safe comparison, replay attacks, duplicate delivery, request authenticity, secret handling, timestamp validation, rate limiting, abuse prevention, malformed payloads, oversized payloads, logging security failures, IP verification considerations, security middleware architecture.

## 3. Deep Research Findings

**HMAC-SHA256 Signature Verification**

**[FACT]** For every POST request, Meta includes the header `X-Hub-Signature-256: sha256=<hex-encoded-hmac>`. The HMAC is computed as:
```
HMAC-SHA256(key=APP_SECRET, message=RAW_REQUEST_BODY)
```

**[CRITICAL]** The signature is computed on the **raw bytes** of the request body, **not** on the parsed JSON. If any middleware parses, re-serializes, or modifies the body before signature verification, the verification will fail. The raw body must be preserved from the moment the request arrives.

**[FACT]** Node.js's built-in `crypto` module provides HMAC:
```javascript
import { createHmac, timingSafeEqual } from 'node:crypto';

function verifyWebhookSignature(rawBody, signatureHeader, appSecret) {
  if (!signatureHeader?.startsWith('sha256=')) return false;
  
  const expectedSignature = `sha256=${
    createHmac('sha256', appSecret)
      .update(rawBody)
      .digest('hex')
  }`;
  
  const expectedBuf = Buffer.from(expectedSignature);
  const receivedBuf = Buffer.from(signatureHeader);
  
  // Buffers must be same length for timingSafeEqual
  if (expectedBuf.length !== receivedBuf.length) return false;
  
  return timingSafeEqual(expectedBuf, receivedBuf);
}
```

**[CRITICAL]** `timingSafeEqual` — Why it's mandatory:

A naive comparison (`expected === received`) is vulnerable to **timing attacks**. An attacker can measure how long the comparison takes: a longer time means more characters matched before the mismatch. By systematically varying the forged signature, an attacker can recover the correct signature one byte at a time. `timingSafeEqual` takes constant time regardless of where the strings differ, eliminating this vulnerability.

**[FACT]** `timingSafeEqual` requires both Buffers to be the same length. Always check length before calling it.

**Replay Attack Mitigation**

**[FACT]** Meta does not include a timestamp in the `X-Hub-Signature-256` signature. This means the signature itself is replay-resistant only against tampering (the signature covers the body). However, an attacker who captures a legitimate signed request can resend it later — a **replay attack**.

**[FACT]** Meta does not provide a timestamp in the signature header the way Stripe does (`t=1234567890,v1=abc...`). **[VERIFIED]** Meta's X-Hub-Signature-256 implementation is simpler than Stripe's — no timestamp component.

**[RECOMMENDATION]** Mitigate replay attacks via message ID idempotency: track processed `wamid` (WhatsApp message IDs) and reject duplicates. This is a functional duplicate filter, not a time-window filter, but it achieves the same protection: a replayed request has the same message ID and is rejected after first processing.

Store processed message IDs in:
- A Redis set with a TTL of `REPLAY_PROTECTION_TTL_MS` (e.g., 24 hours).
- Or in the PostgreSQL `messages` table with a unique constraint on `whatsapp_message_id`. An `ON CONFLICT DO NOTHING` insert is the idempotency mechanism.

**[RECOMMENDATION]** Use the PostgreSQL `ON CONFLICT DO NOTHING` approach as the primary replay protection mechanism — it uses the database that already exists, is durable, and scales with the data model.

**IP Verification**

**[FACT]** Meta publishes its IP ranges for webhook delivery. However, these ranges change and are not suitable as a primary security mechanism. **[RECOMMENDATION]** Do NOT rely on IP allowlisting as the primary security control. IP addresses can be spoofed and Meta's IP ranges change. Use HMAC signature verification as the sole cryptographic authenticity mechanism.

**Payload Size Limits**

**[RECOMMENDATION]** Limit the maximum payload size for the webhook endpoint. Meta's typical payload is well under 10KB. An attacker could send a large payload to exhaust memory or cause slow processing:

```javascript
app.use('/webhook', express.raw({ 
  type: 'application/json',
  limit: config.WEBHOOK_MAX_PAYLOAD_BYTES  // e.g., '100kb', from config
}));
```

**[CRITICAL]** The size limit must apply before the signature check. Express's raw body parser applies the size limit during body streaming — if the body exceeds the limit, Express rejects the request before the handler runs. Return 413 for oversized payloads.

**Rate Limiting**

**[RECOMMENDATION]** Add rate limiting to the webhook endpoint to prevent abuse:
- Limit by source IP: e.g., 1000 requests per minute per IP.
- Limit the total webhook request rate.

**[FACT]** However, Meta's webhook deliveries come from Meta's IP range. Rate limiting by IP may cause problems if Meta delivers from a shared IP pool that exceeds the rate limit. **[RECOMMENDATION]** Set the rate limit generously (e.g., 10,000 per minute per IP) to avoid blocking legitimate Meta deliveries. Rate limiting is primarily a defense against non-Meta attackers who have discovered the webhook URL.

Use `express-rate-limit` with a fast in-memory store (suitable for a single instance):
```javascript
import rateLimit from 'express-rate-limit';

const webhookRateLimit = rateLimit({
  windowMs: 60 * 1000,
  max: config.WEBHOOK_RATE_LIMIT_PER_MINUTE,
  message: 'Too many requests',
  standardHeaders: true,
});
```

**Security Middleware Order**

**[CRITICAL]** The security middleware must execute in this exact order:
1. Size limit (reject oversized payloads first — cheap).
2. Rate limit (reject rate-limited IPs — cheap).
3. Signature verification (reject unsigned/invalid requests — slightly more expensive).
4. Basic payload shape validation (is it a valid webhook structure?).
5. Message extraction and processing.

**Logging Security Failures**

**[BEST PRACTICE]** Log all security failures at `WARN` level with enough context to investigate:
- Source IP address.
- Request method and path.
- Whether the signature header was present.
- Whether the signature was malformed vs incorrect.
- Do NOT log the expected or received signature values (they could be used to reconstruct the secret).
- Do NOT log the app secret.

**Malformed Payloads**

**[RECOMMENDATION]** After signature verification, validate the JSON structure before processing:
- Is `entry` an array?
- Does each entry have `changes`?
- Is there a `messages` or `statuses` field?

Validation failures should log a warning and return `200 OK` (not 400 — returning 400 to Meta causes retries). Unknown structures should be logged and discarded, not forwarded to the AI.

## 4. Recommended Architecture
Security middleware chain: size limit → rate limit → raw body capture → HMAC verification → payload structure validation → processing. All implemented as Express middleware in `src/middleware/webhookSecurity.js`.

## 5. Recommended Technologies/Options
- **`node:crypto`** built-in: HMAC-SHA256 and timing-safe comparison.
- **`express-rate-limit`**: Rate limiting middleware.
- No third-party signature library needed — Node.js built-in is sufficient.

## 6. Alternatives Considered
- Third-party webhook security libraries: not needed — the standard pattern is straightforward with built-in Node.js crypto.

## 7. Trade-offs
- **Rate limiting generosity vs security**: Too strict blocks Meta. Too loose allows abuse. Set generously and monitor.
- **Payload size limit vs future media**: As WaxPrep adds media support (large file metadata), payload sizes may grow. Keep the limit configurable.

## 8. Security Considerations
- This entire stage is security — it is the primary defense against spoofed webhooks.
- `timingSafeEqual` is mandatory.
- App secret must never appear in logs.
- All security failures must be logged (for incident response) but not verbosely (not to aid attackers).

## 9. Reliability Considerations
- Signature verification adds ~1ms of computation per request — negligible.
- If the app secret changes (rotated), all in-flight signatures become invalid. Rotation requires coordinating the new secret in both Meta's app settings and Railway's environment variables simultaneously.

## 10. Scalability Considerations
- Security middleware is stateless and fast — it does not limit scalability.
- Rate limiting with an in-memory store does not work across multiple instances. For multi-instance deployments, use Redis-backed rate limiting (`rate-limit-redis`).

## 11. Railway Considerations
- Railway doesn't provide IP allowlisting at the platform level as a standard feature — the application must handle security.

## 12. Configuration Considerations
- `WHATSAPP_APP_SECRET` (required)
- `WEBHOOK_MAX_PAYLOAD_BYTES` (default: `102400` = 100KB)
- `WEBHOOK_RATE_LIMIT_PER_MINUTE` (default: 10000)

## 13. Edge Cases
- Meta sends the verification GET with no signature: correctly returns the challenge (no signature check on GET).
- Signature header missing: return 401 immediately.
- Signature header present but wrong format: return 401.
- Signature correct but payload is unparseable JSON: return 200 (not 400 — log and discard).

## 14. Failure Modes
- App secret misconfigured (wrong value): all webhooks fail signature verification, no messages processed. Detected immediately via logs. Fix: update Railway env var and restart.
- Rate limit too aggressive: Meta's webhooks blocked. Detected by Meta's webhook failure alerts. Fix: increase rate limit.

## 15. Common Mistakes
- Using `===` instead of `timingSafeEqual`.
- Checking signature on GET (breaks verification).
- Using the parsed JSON body for HMAC instead of raw bytes.
- Not setting a payload size limit.
- Returning 400 for malformed payloads (causes Meta to retry unnecessarily).

## 16. What Should NOT Be Hardcoded
App secret, payload size limit, rate limit.

## 17. What Should Remain Deterministic Infrastructure
The signature verification algorithm, timing-safe comparison, the security middleware order.

## 18. What Must Remain AI-Controlled
Nothing — security is pure deterministic infrastructure.

## 19. Dependencies on Earlier Stages
Stage 2 (config for secrets), Stage 4 (logging security failures), Stage 8 (raw body from webhook route).

## 20. Effects on Later Stages Within 1–14
Verified, signed requests proceed to Stage 10 normalization. Unsigned requests are rejected here.

## 21. Implementation Recommendations
1. Create `src/middleware/webhookSecurity.js`.
2. Implement `verifySignature(rawBody, header, secret)` function.
3. Implement payload size middleware.
4. Implement rate limiting middleware.
5. Mount all middleware in the correct order on the webhook route.
6. Write comprehensive tests for every security path.

## 22. Testing Requirements
- Unit test: correct HMAC with correct secret → returns true.
- Unit test: correct HMAC with wrong secret → returns false.
- Unit test: timing-safe comparison with different-length strings → returns false.
- Unit test: missing signature header → rejected.
- Unit test: malformed `sha256=` prefix → rejected.
- Integration test: POST with valid Meta-format signature → passes.
- Integration test: POST with tampered body → rejected.

## 23. Completion Criteria
- All POST requests without valid signatures are rejected with 401.
- GET verification works correctly.
- No signature values logged.
- All configuration values from environment.
- Timing-safe comparison used.

## 24. Open Questions
- Does Meta provide any webhook timestamp in 2026 that would enable time-window replay protection? **[NEEDS VERIFICATION]** Check current Meta documentation.

## 25. Research Confidence Level
**HIGH** — HMAC-SHA256 and timing-safe comparison are well-established. Meta's webhook security model is stable and documented.

---

# STAGE 10 — INCOMING MESSAGE NORMALIZATION & PROCESSING

## 1. Purpose
To transform the raw, deeply-nested WhatsApp webhook payload into a canonical internal message representation that downstream systems (queue, database, AI context) can rely on, regardless of WhatsApp message type.

## 2. What the Original Plan Says
Research canonical internal message schemas, normalization, schema validation, malformed payload handling, message type abstraction, idempotency, duplicate WhatsApp message IDs, webhook retries, event deduplication, status-event separation, media metadata, timestamps, sender identity, ordering, out-of-order delivery, message correlation, queue handoff.

## 3. Deep Research Findings

**Why Normalization is Critical**

**[FACT]** The WhatsApp payload structure:
- Is deeply nested (`entry[0].changes[0].value.messages[0]`).
- Changes shape depending on message type.
- Mixes different event types (messages and status updates) in the same payload.
- Is versioned — structure may evolve across API versions.

**[BEST PRACTICE]** Normalizing the raw payload into an internal canonical schema immediately after receipt means:
- Downstream code never needs to know about WhatsApp's payload structure.
- Adding a new message type requires changing only the normalization layer.
- All internal systems work with a consistent, validated representation.

**Canonical Internal Message Schema**

**[RECOMMENDATION]** Define an internal `InboundMessage` object:

```javascript
{
  // Identity
  messageId: 'wamid.HBgNODYx...', // WhatsApp message ID (for idempotency)
  waxId: null,                      // Resolved in Stage 12 (null at normalization time)
  phoneRaw: '447911123456',         // Raw sender phone number (E.164 format)
  
  // Metadata
  type: 'text',                     // 'text' | 'image' | 'audio' | 'video' | 'document' | 'location' | 'interactive' | 'unknown'
  timestamp: 1680000000,            // Unix timestamp from WhatsApp
  receivedAt: '2024-01-01T12:00:00.000Z', // ISO timestamp when our server received it
  
  // Content (type-specific)
  content: {
    // For text:
    text: 'Sir I don\'t understand',
    
    // For image:
    // mediaId: 'MEDIA_ID',
    // mimeType: 'image/jpeg',
    // sha256: 'abc...',
    // caption: 'optional caption',
    
    // For audio:
    // mediaId: 'MEDIA_ID',
    // mimeType: 'audio/ogg; codecs=opus',
    // voice: true,
    
    // For location:
    // latitude: 37.7749,
    // longitude: -122.4194,
    // name: 'Location name',
  },
  
  // Tracing
  correlationId: 'uuid',
  
  // Source metadata (useful for debugging)
  _raw: {
    phoneNumberId: 'PHONE_NUMBER_ID',
    displayPhone: '15556789999',
  }
}
```

**Normalization Function**

```javascript
function normalizeWebhookPayload(rawPayload) {
  const entry = rawPayload?.entry?.[0];
  const change = entry?.changes?.find(c => c.field === 'messages');
  if (!change) return { messages: [], statusEvents: [] };
  
  const value = change.value;
  
  // Separate status events from messages
  const statusEvents = (value.statuses ?? []).map(normalizeStatusEvent);
  const messages = (value.messages ?? []).map(msg => normalizeMessage(msg, value.metadata));
  
  return { messages, statusEvents };
}

function normalizeMessage(msg, metadata) {
  const base = {
    messageId: msg.id,
    phoneRaw: msg.from,
    type: msg.type ?? 'unknown',
    timestamp: parseInt(msg.timestamp, 10),
    receivedAt: new Date().toISOString(),
    _raw: { phoneNumberId: metadata.phone_number_id, displayPhone: metadata.display_phone_number }
  };
  
  const content = extractContent(msg);
  return { ...base, content };
}
```

**Idempotency and Deduplication**

**[CRITICAL]** The WhatsApp message ID (`wamid.xxx`) is globally unique. Use it as the idempotency key at the database level:

```sql
INSERT INTO inbound_messages (whatsapp_message_id, wax_id, type, content_json, received_at, timestamp)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (whatsapp_message_id) DO NOTHING;
```

If `ON CONFLICT DO NOTHING` results in 0 rows inserted, the message was a duplicate. The handler should return early without enqueuing a new debounce job.

**Out-of-Order Delivery**

**[FACT]** WhatsApp webhook delivery is not guaranteed to be in-order. Meta may deliver `message_b` before `message_a` if `message_a` was sent slightly earlier.

**[BEST PRACTICE]** Sort messages by `timestamp` within the debounce window before presenting them to the AI. The debounce architecture (Stage 6) already fetches all unprocessed messages and should sort by `timestamp ASC` when building the AI context.

**Status Event Handling**

**[RECOMMENDATION]** Status events (`sent`, `delivered`, `read`, `failed`) should be:
1. Parsed from the webhook payload.
2. Persisted to an `outbound_message_statuses` table (for audit and debugging).
3. Not enqueued for AI processing.

Status events inform WaxPrep whether its outbound messages reached the student — valuable operational data, not AI input.

**Unknown Message Types**

**[RECOMMENDATION]** For unsupported types (sticker, reaction, etc.):
1. Log the type as `unknown` at info level.
2. Persist a record with `type: 'unknown'` and no content.
3. Do not crash the handler.
4. Do not enqueue for AI processing.
5. Return `200 OK` to Meta.

This future-proofs the system: when WaxPrep adds support for a new message type, existing records are already in the database.

## 4. Recommended Architecture
`normalizeWebhookPayload()` transforms the raw payload. `extractContent()` dispatches by type. Normalized messages are persisted to the database (with conflict handling). Status events are separated and persisted separately. Only new (non-duplicate) messages with supported types trigger debounce queue additions.

## 5. Recommended Technologies/Options
- Pure JavaScript — no libraries needed for normalization.
- Zod for payload structure validation.

## 6. Alternatives Considered
- Using the raw WhatsApp payload directly in the AI context: creates tight coupling between AI prompts and Meta's payload structure. Changes in Meta's API version could break prompts. Not recommended.

## 7. Trade-offs
- **Storing `phoneRaw` in the database**: Stage 12 will address whether raw phone numbers should be stored. At normalization time, the phone is stored transiently in memory and immediately used to resolve the WaxID. Storing `phoneRaw` in the messages table is a privacy trade-off. **[RECOMMENDATION]** Only store the WaxID (after resolution), not the raw phone number, in long-term storage.
- **`_raw` field in the normalized object**: Useful for debugging but stores Meta's payload structure. Keep only for operational logs, not for long-term database storage.

## 8. Security Considerations
- The raw phone number from the normalized message should be used to resolve the WaxID immediately and then discarded from in-memory objects where possible.
- Normalization must not expose the raw payload to logs (which might contain student message content).

## 9. Reliability Considerations
- The normalization function must handle any Meta payload structure gracefully. Missing fields should result in `null` in the canonical object, not thrown exceptions.
- `entry?.[0]` optional chaining prevents crashes on empty payloads.

## 10. Scalability Considerations
- Normalization is pure in-memory transformation — negligible cost.

## 11. Railway Considerations
No Railway-specific concerns.

## 12. Configuration Considerations
No configuration needed for normalization logic itself.

## 13. Edge Cases
- `entry` is an empty array: `normalizeWebhookPayload` returns `{ messages: [], statusEvents: [] }`. Handler returns 200.
- `messages` and `statuses` are both absent: returns empty arrays. Handler returns 200.
- `timestamp` is not a valid integer string: `parseInt('', 10)` returns `NaN`. Catch this and use `Date.now() / 1000` as fallback.

## 14. Failure Modes
- Normalization throws an uncaught exception: caught by Express error middleware. Returns 500. Meta retries. The retry will succeed if the bug is fixed.
- Database persistence fails: webhook returns 500 to Meta. Meta retries. The retry will deduplicate correctly if the first insert succeeded.

## 15. Common Mistakes
- Not handling the case where `value.messages` is missing (status-only webhooks).
- Using `.text.body` without checking `msg.type === 'text'` first.
- Logging the full normalized message (may contain student message content).
- Storing the raw phone number in long-term database records.

## 16. What Should NOT Be Hardcoded
Message type definitions should be extensible. Supported types should be a configuration object, not a hard `if/else` chain.

## 17. What Should Remain Deterministic Infrastructure
The normalization logic is entirely deterministic.

## 18. What Must Remain AI-Controlled
The AI decides what to do with the normalized message content — the normalization layer never filters, summarizes, or interprets content.

## 19. Dependencies on Earlier Stages
Stage 3 (database for persistence), Stage 4 (logging), Stage 9 (post-security, pre-normalization).

## 20. Effects on Later Stages Within 1–14
Stage 12 (WaxID resolved from `phoneRaw`), Stage 13 (session resolved/created), Stage 14 (message stored in history), Stage 6 (debounce queue adds normalized message ID).

## 21. Implementation Recommendations
1. Create `src/webhook/normalizer.js`.
2. Create `src/webhook/validator.js` with Zod schema for basic payload structure.
3. Unit test normalization for each supported message type.
4. Unit test deduplication (duplicate `messageId` → no enqueue).

## 22. Testing Requirements
- Unit test: text message normalized correctly.
- Unit test: image message normalized correctly.
- Unit test: status event separated from messages.
- Unit test: empty `entry` array handled.
- Unit test: unknown message type normalized as `{ type: 'unknown' }`.
- Unit test: duplicate `messageId` → returns early.

## 23. Completion Criteria
- All supported message types produce valid canonical objects.
- Status events are separated.
- Duplicate messages are detected and not re-queued.
- No raw phone numbers in long-term storage.

## 24. Open Questions
- When should media be downloaded? **[RECOMMENDATION]** Not at normalization time. Download media lazily in the AI context assembly (when the AI actually needs the image/audio content).

## 25. Research Confidence Level
**HIGH** — Normalization is a well-understood pattern. WhatsApp payload structure is documented by Meta.

---

# STAGE 11 — OUTBOUND MESSAGING SYSTEM

## 1. Purpose
To implement the production-grade system for delivering AI-generated responses to students via WhatsApp: outbound queue, sequential chunk delivery, typing indicators, retry on failure, idempotent sends, configurable response splitting, and all relevant WhatsApp API constraints.

## 2. What the Original Plan Says
Research WhatsApp Cloud API outbound messaging, text message sending, rate limits, retries, delivery status, read status, sent status, failed messages, outbound queues, per-student ordering, concurrency, long responses, WhatsApp message limits, message splitting, chunk ordering, typing indicators, response batching, duplicate sends, idempotency, outbound failure recovery, configurable response delivery, splitting strategies.

## 3. Deep Research Findings

**The Outbound Queue Architecture**

**[BEST PRACTICE]** The AI worker should not send outbound messages directly. Instead:
1. AI worker completes generation.
2. AI worker splits the response into chunks.
3. AI worker enqueues each chunk as a separate job in an `outbound` BullMQ queue.
4. A dedicated `outboundWorker` processes the outbound queue sequentially per student.

This separation provides:
- Retry of individual failed chunks without re-running the AI.
- Per-student ordering of outbound chunks.
- Rate limit compliance (delay between chunks).
- Monitoring of outbound delivery separately from AI processing.

**WhatsApp Cloud API — Sending a Message**

**[FACT]** Outbound text message via WhatsApp Cloud API:
```javascript
await fetch(`${baseUrl}/${phoneNumberId}/messages`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    messaging_product: 'whatsapp',
    recipient_type: 'individual',
    to: studentPhoneNumber,  // E.164 format: '447911123456'
    type: 'text',
    text: {
      preview_url: false,
      body: chunkText,
    }
  })
});
```

**[FACT]** The response includes `messages[0].id` — the sent message ID. This should be stored for delivery status tracking.

**Sequential Delivery — Why it Matters**

**[CRITICAL]** If multiple chunks are sent concurrently (in parallel), WhatsApp does not guarantee delivery order. The student may receive chunks out of order. This makes parallel sending wrong for multi-chunk responses.

**[RECOMMENDATION]** The outbound worker for each student should process chunks with `concurrency: 1` (sequential). This can be achieved with a per-student lock (same redlock pattern as Stage 6) or by using BullMQ's queue `LIFO: false` with a per-student `jobGroup`.

**[RECOMMENDATION]** Add a configurable delay between sequential chunks:
```javascript
// After sending chunk N, wait before sending chunk N+1
await sleep(config.RESPONSE_CHUNK_DELAY_MS);  // e.g., 500ms
```

This prevents the student's WhatsApp from being flooded with messages arriving in rapid succession, which can cause display ordering issues.

**Response Splitting — Configurable Semantic Splitter**

**[CRITICAL]** The response splitter must be:
1. Configurable — chunk size from `RESPONSE_MAX_CHUNK_CHARS`.
2. Semantic — split at natural boundaries, not arbitrary character positions.
3. Safe — never split inside a word, URL, or markdown code block.
4. Platform-aware — respect WhatsApp's 4096 character hard limit.

**Algorithm**:
```javascript
function splitResponse(text, maxChunkChars) {
  if (text.length <= maxChunkChars) return [text];
  
  const chunks = [];
  const paragraphs = text.split(/\n\n+/);  // Split on double newline
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if (paragraph.length > maxChunkChars) {
      // Paragraph too long — split on sentences
      const sentences = splitIntoSentences(paragraph, maxChunkChars);
      for (const sentence of sentences) {
        if ((currentChunk + '\n\n' + sentence).length > maxChunkChars && currentChunk.length > 0) {
          chunks.push(currentChunk.trim());
          currentChunk = sentence;
        } else {
          currentChunk += (currentChunk ? '\n\n' : '') + sentence;
        }
      }
    } else {
      if ((currentChunk + '\n\n' + paragraph).length > maxChunkChars && currentChunk.length > 0) {
        chunks.push(currentChunk.trim());
        currentChunk = paragraph;
      } else {
        currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
      }
    }
  }
  
  if (currentChunk.length > 0) chunks.push(currentChunk.trim());
  return chunks;
}
```

**[RECOMMENDATION]** `RESPONSE_MAX_CHUNK_CHARS` should default to 1000, not 4096. Educational text in 1000-character segments is more readable on a mobile screen. The 4096 limit is the platform maximum, not the UX optimum.

**Idempotent Sends**

**[BEST PRACTICE]** Each outbound chunk should have a unique `outboundChunkId` generated before enqueueing:
```javascript
const outboundChunkId = `${sessionId}:${aiResponseId}:${chunkIndex}`;
```

Before sending, check if this `outboundChunkId` has already been marked as `sent` in the database. If it has, skip the send. This prevents duplicate sends on retry.

**Typing Indicators — Architecture**

**[BEST PRACTICE]** Send the typing indicator from the **AI worker**, immediately after the AI job starts processing — not from the webhook handler. This gives the most accurate UX: typing appears when the AI is actually generating.

```javascript
// In AI worker, after acquiring the student lock, before calling AI provider:
if (config.RESPONSE_TYPING_INDICATOR_ENABLED) {
  await whatsappClient.sendTypingIndicator(
    studentPhoneNumber,
    mostRecentInboundMessageId  // The wamid to mark as read
  );
}
// Then call AI provider...
```

**[FACT]** The typing indicator auto-dismisses after 25 seconds. If AI generation takes longer (possible for complex queries), the typing indicator will disappear and reappear. **[RECOMMENDATION]** For long AI responses, resend the typing indicator every 20 seconds during generation to maintain the visual indicator.

**WhatsApp Rate Limits for Outbound**

**[FACT]** Per-user pair rate limit: approximately one message every 6 seconds is the observed practical limit per-user conversation. **[RECOMMENDATION]** Set `RESPONSE_CHUNK_DELAY_MS` to at least 500ms (configurable) between chunks. This is fast enough to feel responsive and is well within rate limits.

**[FACT]** Error 130429 (`throughput rate limit`) occurs when sending more than 80 messages per second across all users. For WaxPrep at startup scale, this is unlikely to be reached.

**Failed Outbound Messages**

**[BEST PRACTICE]** Outbound send failures should be retried (BullMQ retry with exponential backoff). After all retries exhausted, log the failure and record the failed status in the database. The student's message was processed but the response couldn't be delivered — this needs to be tracked.

**[RECOMMENDATION]** After a failed response delivery, the next message from the student should trigger the AI to acknowledge that there was a delivery issue and offer to re-explain if needed. The AI context (Stage's later work) should include the delivery failure so the AI is aware.

**Delivery Status Webhooks**

**[FACT]** Every outbound message generates up to 3 status webhooks from Meta: `sent`, `delivered`, `read`. These arrive via the same webhook URL as inbound messages. The normalization layer (Stage 10) already separates them. Store them in `outbound_message_statuses` for operational visibility.

## 4. Recommended Architecture
AI worker → split response → enqueue chunks to outbound BullMQ queue → outbound worker sends sequentially per student (per-student lock) → delay between chunks → delivery status recorded.

## 5. Recommended Technologies/Options
- BullMQ (existing) for outbound queue.
- `ioredis` and `redlock` (existing) for per-student serialization.
- Native `fetch()` for WhatsApp API calls.

## 6. Alternatives Considered
- Sending directly from AI worker without an outbound queue: simpler but loses retry capability on chunk level, no rate limiting control, blocking the AI worker thread during delivery.

## 7. Trade-offs
- **Chunk delay**: Too short → WhatsApp ordering issues. Too long → feels slow. Default 500ms is a reasonable middle ground.
- **Chunk size**: Smaller chunks (500 chars) → more messages, cleaner reading. Larger chunks (2000 chars) → fewer messages, denser reading. Educational content typically reads better in medium chunks.

## 8. Security Considerations
- `studentPhoneNumber` used only for outbound sending. The WhatsApp API receives it but WaxPrep's logs should not record it.
- Access token must not appear in logs.

## 9. Reliability Considerations
- Per-chunk idempotency prevents duplicate sends on retry.
- Per-student sequential processing ensures ordering.
- Outbound worker has its own retry policy separate from AI worker.

## 10. Scalability Considerations
- At high volume, the outbound queue may become a bottleneck. Multiple outbound worker instances can process jobs concurrently for different students (same per-student lock pattern).

## 11. Railway Considerations
- The outbound worker can run in the same process as the AI worker (two BullMQ workers in one Node.js process) or as a separate service. **[RECOMMENDATION]** Start with both workers in one process. Separate if outbound becomes a bottleneck.

## 12. Configuration Considerations
- `RESPONSE_MAX_CHUNK_CHARS` (default: 1000)
- `RESPONSE_CHUNK_DELAY_MS` (default: 500)
- `RESPONSE_TYPING_INDICATOR_ENABLED` (default: true)
- `RESPONSE_TYPING_REFRESH_INTERVAL_MS` (default: 20000)

## 13. Edge Cases
- AI response is empty string: do not send any messages. Log a warning. This should never happen — validate AI output before splitting.
- AI response is a single character: send as-is (no splitting needed).
- AI response contains URLs that should not be split: ensure URL splitting is avoided in the splitter.
- Student's phone is invalid/blocked: WhatsApp API returns an error. Record failure, do not retry indefinitely.

## 14. Failure Modes
- WhatsApp API returns 429 (rate limit): retry with backoff. The per-student sequential queue automatically slows down.
- WhatsApp API returns 400 (invalid recipient): non-retriable error. Record as permanent failure.
- Network timeout sending chunk 2 of 3: chunk 2 is retried. Chunk 1 was already sent. Idempotent check ensures chunk 2 is not sent twice.

## 15. Common Mistakes
- Sending all chunks in parallel.
- Not adding delay between chunks.
- Splitting at hardcoded character positions instead of semantic boundaries.
- Not implementing per-chunk idempotency.
- Sending the typing indicator at webhook receipt instead of at AI start.

## 16. What Should NOT Be Hardcoded
Chunk size, chunk delay, typing indicator behavior, retry counts.

## 17. What Should Remain Deterministic Infrastructure
The splitting algorithm (semantic but deterministic), sequential delivery, idempotency checks.

## 18. What Must Remain AI-Controlled
The content of each chunk — WaxPrep's infrastructure splits and delivers what the AI generates; it does not modify or filter the content.

## 19. Dependencies on Earlier Stages
Stage 6 (BullMQ outbound queue), Stage 9 (WhatsApp client), Stage 3 (database for idempotency records).

## 20. Effects on Later Stages Within 1–14
Stage 14 (outbound messages recorded in history), Stage 13 (session state updated after response delivered).

## 21. Implementation Recommendations
1. Create `src/messaging/outboundQueue.js` (enqueue chunks).
2. Create `src/workers/outboundWorker.js` (sequential delivery per student).
3. Create `src/messaging/responseSplitter.js` (semantic splitter).
4. Create `src/messaging/whatsappClient.js` (API wrapper with idempotency).
5. Integrate typing indicator into AI worker flow.

## 22. Testing Requirements
- Unit test: splitter produces correct chunks for various input lengths.
- Unit test: splitter never produces chunks exceeding `RESPONSE_MAX_CHUNK_CHARS`.
- Unit test: splitter handles single short paragraph (no split needed).
- Unit test: splitter handles paragraph with very long sentence.
- Integration test: outbound worker sends chunks sequentially.
- Integration test: idempotent send does not duplicate delivery.

## 23. Completion Criteria
- Response splitter configurable and tested.
- Outbound queue operational.
- Sequential delivery verified.
- Typing indicator sent at correct point in flow.
- All config from environment.

## 24. Open Questions
- Should WaxPrep ever send multimedia responses (images, documents)? Not in current scope, but the outbound client should be designed to support it in the future.

## 25. Research Confidence Level
**HIGH** for outbound queue architecture. **HIGH** for WhatsApp API send mechanics. **MEDIUM** for per-user pair rate limit specifics (verify current Meta documentation).

---

# STAGE 12 — STUDENT IDENTITY FOUNDATION / WAXID

## 1. Purpose
To establish the complete student identity architecture: phone number pseudonymization, WaxID generation, identity resolution, student isolation guarantees, account states, and the authorization boundaries that ensure no student can ever access another student's data.

## 2. What the Original Plan Says
Research identity architecture for messaging applications, phone-number identity, internal immutable IDs, WaxID design, phone normalization, phone hashing, cryptographic hashing vs password hashing, bcrypt/Argon2/scrypt suitability, lookup strategies for hashed phone numbers, identity resolution, account claiming, PIN systems, verification codes, recovery, authentication, authorization, account states, deleted/blocked accounts, student isolation, multi-tenant database isolation, authorization boundaries, ID enumeration risks.

## 3. Deep Research Findings

**The Core Identity Problem**

The student's identity in WaxPrep is their WhatsApp phone number. This creates two competing requirements:
1. We need to identify a student deterministically (same phone → same student, every time).
2. We must not store raw phone numbers in long-term storage (privacy, data minimization).

**Hashing Strategy — The Critical Decision**

**[CRITICAL]** This is where most systems make a fundamental error. The choice of hashing algorithm determines whether lookup is possible.

**bcrypt, Argon2, scrypt** — these are password hashing algorithms. They are **deliberately non-deterministic**: every call to `bcrypt.hash(phone)` produces a different output because they include a random salt. This means:
- You CANNOT use bcrypt/Argon2/scrypt to look up a student by phone number.
- You would need to store all students, retrieve all records, and call `bcrypt.compare()` on each one — impossibly expensive at any scale.
- bcrypt has a 72-byte password limit — phone numbers are fine but this adds another constraint.

**[FACT]** bcrypt, Argon2, and scrypt are designed to be slow and non-deterministic — excellent for passwords (a human types them and you compare), terrible for lookup keys (you need to find a record by the value).

**SHA-256 alone** — Fast and deterministic, but:
- No secret key → an attacker with the database can compute SHA-256 of any phone number (trying all country codes and number formats) to reverse-match identities.
- Vulnerable to rainbow table attacks on phone numbers (there are only ~15 billion possible phone numbers worldwide).

**HMAC-SHA256 with a secret pepper** — The correct solution:

**[FACT]** HMAC-SHA256 (Hash-based Message Authentication Code) computes:
```
HMAC-SHA256(key=PHONE_HMAC_SECRET, message=normalizedPhone)
```

Properties:
- **Deterministic**: Same phone + same secret → same HMAC output every time. Lookup works.
- **Fast**: Microseconds per computation. Lookup is efficient.
- **Secret-keyed**: Without the `PHONE_HMAC_SECRET`, an attacker with the database cannot reverse phone numbers via brute force. The secret must be a randomly generated 32+ byte value.
- **Non-reversible**: The HMAC of a phone number cannot be reversed to the phone number.

**[RECOMMENDATION]** Use HMAC-SHA256 to pseudonymize phone numbers:

```javascript
import { createHmac } from 'node:crypto';

function hashPhone(normalizedPhone) {
  return createHmac('sha256', config.PHONE_HMAC_SECRET)
    .update(normalizedPhone)
    .digest('hex');
}
```

**Phone Normalization**

**[BEST PRACTICE]** Phone numbers from WhatsApp arrive in E.164 format without the `+` prefix (e.g., `447911123456` for UK `+44 7911 123456`). Always normalize before hashing:
1. Strip all non-numeric characters.
2. Ensure the number starts with the country code (WhatsApp provides this).
3. Canonicalize to a consistent format (no leading `+`, no spaces).

**The `libphonenumber-js`** library can parse and normalize phone numbers into E.164 format reliably. **[RECOMMENDATION]** Use it for normalization.

**WaxID Design**

**[RECOMMENDATION]** WaxID is an internal, immutable, opaque UUID (`gen_random_uuid()`) assigned to each student when they are first seen. Properties:
- UUID v4 — not guessable, not sequential.
- Generated by PostgreSQL at insert time.
- Never exposed to students or external systems (it is internal).
- Never changes for a student's lifetime.
- Used for all cross-table relationships.

**Identity Resolution Flow**

```javascript
async function resolveIdentity(rawPhone) {
  // 1. Normalize the phone number
  const normalizedPhone = normalizePhone(rawPhone);
  
  // 2. Hash to get the pseudonymous lookup key
  const phoneHash = hashPhone(normalizedPhone);
  
  // 3. Look up in database by hash
  const student = await db.query(
    'SELECT id, status FROM students WHERE phone_hash = $1 AND deleted_at IS NULL',
    [phoneHash]
  );
  
  if (student.rows.length > 0) {
    return { waxId: student.rows[0].id, isNew: false, status: student.rows[0].status };
  }
  
  // 4. New student — create WaxID
  const newStudent = await db.query(
    `INSERT INTO students (phone_hash, status, created_at, updated_at)
     VALUES ($1, 'active', NOW(), NOW())
     ON CONFLICT (phone_hash) DO UPDATE SET updated_at = NOW()
     RETURNING id, status`,
    [phoneHash]
  );
  
  return { waxId: newStudent.rows[0].id, isNew: true, status: 'active' };
}
```

**[CRITICAL]** The `ON CONFLICT DO UPDATE` (upsert) handles the race condition where two simultaneous messages from the same phone number both try to create a new student record. The first insert succeeds; the second conflicts and updates `updated_at`, returning the existing `id`.

**Account States**

**[RECOMMENDATION]** Students can have the following states:
- `active` — Normal student, can interact with WaxPrep.
- `suspended` — Temporarily suspended (e.g., abuse). Will receive a configured message.
- `blocked` — Permanently blocked.
- `deleted` — Soft-deleted. No interaction, no data returned.

State transitions are deterministic (admin-controlled). The AI should not be responsible for enforcing these states — the identity resolution layer rejects suspended/blocked students before the AI is invoked.

**Student Isolation — The Invariant**

**[CRITICAL]** This is the most important security guarantee in WaxPrep: Student A can never access Student B's data.

Architecture for enforcement:
1. **All database queries include the WaxID filter**: Every query that returns student-specific data includes `WHERE wax_id = $1`. This is the application-layer enforcement.
2. **All BullMQ jobs carry only the WaxID**: Workers receive the WaxID and query the database with it. They never receive another student's WaxID.
3. **The context assembly (later stages) constructs context only for the specific WaxID**: No cross-student context mixing.

**[RECOMMENDATION]** Create a `StudentDataAccess` class in the data layer that requires a `waxId` on every method:
```javascript
class StudentDataAccess {
  constructor(waxId) {
    this.waxId = waxId;
  }
  async getMessages(sessionId, limit) {
    return db.query(
      'SELECT * FROM messages WHERE wax_id = $1 AND session_id = $2 ORDER BY timestamp ASC LIMIT $3',
      [this.waxId, sessionId, limit]
    );
  }
  // All methods require this.waxId — no method can accidentally query another student
}
```

This architectural pattern makes it structurally hard to write a query that accidentally returns data for the wrong student.

**ID Enumeration Risk**

**[FACT]** Sequential integer IDs expose the system to enumeration attacks — an attacker can try IDs 1, 2, 3, ... to discover valid records. UUID v4 is not guessable and not enumerable. **[FACT]** WaxPrep does not expose internal IDs externally, so enumeration is not a current concern. But UUID v4 is the correct choice regardless.

**PIN System**

**[TRADE-OFF]** A PIN system adds a layer of authentication (student must know their PIN to access their history). This prevents someone who has access to a student's phone from accessing WaxPrep history without consent. However:
- PINs must be stored as hashes (Argon2id for PIN storage — adaptive, memory-hard).
- PIN recovery is difficult without additional contact information.
- PIN creation requires a step in the first-time user flow.

**[RECOMMENDATION]** For Stage 12, design the database schema to support a PIN (a `pin_hash` column using Argon2id, nullable). Do not implement the PIN flow yet — it requires a conversational onboarding flow that depends on AI (later stages). The column structure should be in place.

**Do NOT Store Raw Phone Numbers**

**[CRITICAL]** The raw phone number must never appear in the `students` table. It must never be logged (except transiently in memory during normalization/resolution). The `phone_hash` (HMAC-SHA256) is the only phone-related value stored in the database.

**[EXCEPTION]** WhatsApp requires the raw phone number for sending outbound messages. The phone number is retrieved in the WhatsApp client by looking up the student's record — but **do not cache it in the database**. The WhatsApp API receives it, but WaxPrep's long-term storage does not. **[RECOMMENDATION]** Store the phone number encrypted (AES-256-GCM with a separate key) in a dedicated `student_phones` table if it is needed for outbound, OR derive the phone from the WhatsApp webhook context (the sender phone is always available at message receipt time) without storing it.

**[TRADE-OFF]** This is a privacy trade-off. For the initial implementation, storing the encrypted phone is simpler for outbound delivery. Full pseudonymization (only phone_hash) requires passing the phone through the entire pipeline without storing it. **[RECOMMENDATION]** Start with storing the encrypted phone (AES-256-GCM) and evaluate privacy requirements carefully.

## 4. Recommended Architecture
Phone normalization with `libphonenumber-js`. HMAC-SHA256 pseudonymization with `PHONE_HMAC_SECRET` pepper. `students` table keyed on `phone_hash` with UUID WaxID. `StudentDataAccess` class enforcing WaxID scoping. Account states in `students.status`. PIN column in schema for future use.

## 5. Recommended Technologies/Options
- **`libphonenumber-js`**: Phone normalization.
- **`node:crypto` createHmac**: HMAC-SHA256.
- **Argon2id** (`argon2` npm package): For PIN hashing when implemented.

## 6. Alternatives Considered
- **bcrypt for phone hash**: Technically incorrect (non-deterministic), impossible to use for lookup.
- **Plain SHA-256**: No secret key — vulnerable to rainbow tables.
- **Store plain phone number**: Privacy risk, GDPR concern, not recommended.

## 7. Trade-offs
- **HMAC-SHA256 vs truly zero-knowledge architecture**: HMAC-SHA256 with a strong secret provides strong practical privacy. A truly zero-knowledge architecture (using homomorphic encryption or similar) is orders of magnitude more complex. HMAC-SHA256 is the right balance for a startup.
- **Phone encryption for outbound**: Adds a `PHONE_ENCRYPTION_KEY` secret and encryption/decryption overhead. Justified by privacy requirements.

## 8. Security Considerations
- `PHONE_HMAC_SECRET` must be generated with `openssl rand -hex 32`. Must never be changed (changing it invalidates all existing phone hashes and makes all student lookups fail).
- If `PHONE_HMAC_SECRET` is leaked, all phone hashes must be considered compromised. Rotate immediately (requires re-hashing all phone numbers — only possible if the original phones are available, which they won't be if only hashes are stored).
- The WaxID (UUID) is safe to include in logs — it does not reveal the student's phone.

## 9. Reliability Considerations
- The `ON CONFLICT` upsert handles race conditions in student creation.
- The students table should have an index on `phone_hash` for O(1) lookup.
- Account state checks should be fast — a simple `WHERE status = 'active'` index scan.

## 10. Scalability Considerations
- Phone hash lookup with a unique index is O(log n) in B-tree — effectively constant at any realistic student count.

## 11. Railway Considerations
No Railway-specific concerns beyond secure env var storage of `PHONE_HMAC_SECRET`.

## 12. Configuration Considerations
- `PHONE_HMAC_SECRET` (required, never rotated without a migration plan).
- `PHONE_ENCRYPTION_KEY` (required if phone is stored encrypted).

## 13. Edge Cases
- Phone number formatting variations: `+44 7911 123456` vs `447911123456` vs `07911123456` — normalization must produce the same canonical form for all. `libphonenumber-js` handles this.
- International numbers without country code: WhatsApp always provides the full E.164 number (with country code). This is not a concern for WhatsApp-originated numbers.
- Student changes phone number: a new WaxID is created. The old WaxID and its history remain. This is by design — phone number is the identity anchor.

## 14. Failure Modes
- `PHONE_HMAC_SECRET` not set: startup validation (Stage 2) catches this before any student is processed.
- Database unavailable during identity resolution: the webhook returns 500, Meta retries.
- Duplicate student creation race condition: `ON CONFLICT` resolves this.

## 15. Common Mistakes
- Using bcrypt for phone hashing (non-deterministic → can't look up).
- Using plain SHA-256 without a secret key (rainbow table vulnerable).
- Storing the raw phone number in the students table.
- Not adding a unique index on `phone_hash`.
- Allowing the WaxID to be passed in from external input (always generate internally).

## 16. What Should NOT Be Hardcoded
`PHONE_HMAC_SECRET`, hash algorithm specifics in the normalization function (if the algorithm ever needs to change, it should be a migration, not a code constant).

## 17. What Should Remain Deterministic Infrastructure
All identity resolution, account state enforcement, and student isolation enforcement is deterministic.

## 18. What Must Remain AI-Controlled
The AI responds differently to new vs returning students — but this judgment is the AI's, informed by context about whether the student is new (passed as a fact, not a directive).

## 19. Dependencies on Earlier Stages
Stage 2 (config for PHONE_HMAC_SECRET), Stage 3 (database).

## 20. Effects on Later Stages Within 1–14
Stage 13 (session requires a WaxID), Stage 14 (all messages keyed on WaxID), all AI processing uses WaxID as the student identifier.

## 21. Implementation Recommendations
1. Create `src/identity/phoneUtils.js` (normalization + hashing).
2. Create `src/identity/identityResolver.js` (resolution + upsert).
3. Create `src/identity/StudentDataAccess.js` (scoped data access).
4. Add `students` table migration.
5. Unit test: same phone in any format → same HMAC.
6. Integration test: identity resolution creates or returns consistent WaxID.

## 22. Testing Requirements
- Unit test: phone normalization handles international formats.
- Unit test: HMAC is deterministic (same input, same output).
- Unit test: different phones produce different HMACs.
- Unit test: student creation is idempotent (upsert).
- Unit test: `StudentDataAccess` queries always include `wax_id = $1`.

## 23. Completion Criteria
- Phone normalization and HMAC hashing working.
- Identity resolution creates and returns WaxIDs.
- Students table with phone_hash unique index.
- No raw phone numbers in the students table.
- Account states functional.

## 24. Open Questions
- PIN system: when to implement? **[RECOMMENDATION]** Implement in a later iteration after the core AI tutor is functional.
- Should WaxPrep support multiple devices per student (same number, different devices)? **[ASSUMPTION]** Yes — WhatsApp accounts are per-phone-number. One phone number = one WaxID regardless of device.

## 25. Research Confidence Level
**HIGH** — HMAC-SHA256 for deterministic pseudonymization is a well-established pattern. Phone normalization with libphonenumber-js is standard.

---

# STAGE 13 — SESSION & CONVERSATION MANAGEMENT

## 1. Purpose
To establish the session lifecycle infrastructure that provides the AI with reliable conversation containers: session creation, activation, inactivity-based closure, session threading, per-student concurrency safety, and the metadata the AI needs to understand temporal conversation structure — without imposing educational logic on the session model.

## 2. What the Original Plan Says
Research conversational sessions, session lifecycle, active/idle/closed states, inactivity timeouts, session ownership, conversation threading, concurrent messages, rapid messages, session race conditions, session creation races, transaction safety, session recovery, session archiving, context boundaries, conversation continuity, configurable timeout values.

## 3. Deep Research Findings

**What is a Session for WaxPrep?**

A session is a temporal grouping of conversation turns between WaxPrep and a student. It has an unambiguous start and end. The AI uses the session boundary to understand where the current conversation begins and what history is relevant.

**[CRITICAL]** The session is a **container** — pure infrastructure. It does not dictate:
- What subjects are covered.
- When the AI should start a new topic.
- When the conversation should end.
- What the AI says within a session.

The session only answers: "What time period does the current conversation span?" and "Which messages belong to this conversation?"

**Session States**

```
ACTIVE  — Student has sent at least one message and the session has not timed out
IDLE    — Last message was beyond the inactivity window but the session is still in the current day
CLOSED  — Session explicitly closed (inactivity timeout exceeded)
ARCHIVED — Historical, not returned in current context
```

**[RECOMMENDATION]** Keep it simple: `ACTIVE` and `CLOSED`. A new message arriving after the inactivity timeout creates a new session. The previous session's messages remain in history but are tagged with a different `session_id`.

**Session Inactivity Timeout**

**[CRITICAL]** The inactivity timeout defines when a period of silence becomes a session boundary. This is:
- **Configurable via environment variable** (`SESSION_INACTIVITY_TIMEOUT_MS`).
- **Not hardcoded** — different student behaviors, school schedules, and pedagogical philosophies require different values.
- **A reasonable default**: 30 minutes (1,800,000ms). After 30 minutes of silence, the next message starts a new session.

**Session Resolution Flow**

```javascript
async function resolveOrCreateSession(waxId) {
  // Look for an active session within the inactivity window
  const existing = await db.query(
    `SELECT id FROM sessions
     WHERE wax_id = $1
       AND status = 'active'
       AND last_activity_at > NOW() - INTERVAL '${config.SESSION_INACTIVITY_TIMEOUT_MS / 1000} seconds'
     ORDER BY created_at DESC
     LIMIT 1`,
    [waxId]
  );
  
  if (existing.rows.length > 0) {
    // Update last activity
    await db.query(
      'UPDATE sessions SET last_activity_at = NOW(), updated_at = NOW() WHERE id = $1',
      [existing.rows[0].id]
    );
    return { sessionId: existing.rows[0].id, isNew: false };
  }
  
  // Close any previous active sessions for this student
  await db.query(
    `UPDATE sessions SET status = 'closed', closed_at = NOW(), updated_at = NOW()
     WHERE wax_id = $1 AND status = 'active'`,
    [waxId]
  );
  
  // Create new session
  const newSession = await db.query(
    `INSERT INTO sessions (wax_id, status, created_at, updated_at, last_activity_at)
     VALUES ($1, 'active', NOW(), NOW(), NOW())
     RETURNING id`,
    [waxId]
  );
  
  return { sessionId: newSession.rows[0].id, isNew: true };
}
```

**Session Creation Race Conditions**

**[CRITICAL]** If two messages arrive near-simultaneously (rapid messages, Stage 6 architecture) and both try to create a session concurrently, you could end up with two sessions for the same student.

**[RECOMMENDATION]** The debounce architecture (Stage 6) already prevents this in most cases: the debounce job fires once and processes all accumulated messages together. Only one job per student runs at a time (per-student lock). Therefore, `resolveOrCreateSession` runs sequentially per student and race conditions are already mitigated.

**[DEFENSE IN DEPTH]** Additionally, add a unique constraint on `(wax_id, status)` where `status = 'active'` using a partial unique index:

```sql
CREATE UNIQUE INDEX unique_active_session_per_student
ON sessions (wax_id)
WHERE status = 'active';
```

This prevents two active sessions for the same student at the database level, regardless of application logic.

**Sessions Table Schema**

```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('active', 'closed')) DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  closed_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  
  -- Metadata for AI context (not educational decisions)
  message_count INTEGER NOT NULL DEFAULT 0,
  started_at_timezone TEXT  -- Optional: student's timezone if detectable
);

CREATE INDEX idx_sessions_wax_id_status ON sessions(wax_id, status);
CREATE INDEX idx_sessions_wax_id_created ON sessions(wax_id, created_at DESC);
CREATE UNIQUE INDEX unique_active_session_per_student ON sessions(wax_id) WHERE status = 'active';
```

**Do NOT Add Educational State to Sessions**

**[CRITICAL]** The sessions table must NOT contain:
- Current subject being studied.
- Learning objectives for this session.
- Teacher-prescribed activities for this session.
- Stage of learning the student is in.
- Any field that encodes a deterministic educational decision.

The AI determines the educational context by reading the message history. The session provides only temporal structure.

**Configurable Inactivity Timeout**

The timeout affects the AI context: a new session means the AI starts fresh, using the previous session as historical context. If the timeout is too long, students returning after a long break continue in an "old" session. If too short, students taking a brief pause get a confusingly fresh conversation.

**Session Recovery**

**[RECOMMENDATION]** If the AI worker crashes mid-session (job fails), the session remains `active` — it does not automatically close. The next message from the student will find the existing active session and continue from where things left off. The failed message is retried (Stage 5). This is the correct behavior.

**Session Archiving**

**[RECOMMENDATION]** Do not automatically archive old closed sessions. Keep all sessions and their messages in the same tables. Use pagination when retrieving historical context (Stage 14 handles this). Archiving is a data management concern for when the database grows large — not relevant at startup scale.

## 4. Recommended Architecture
`sessions` table with `active/closed` states. `resolveOrCreateSession()` function with upsert and partial unique index. Configurable inactivity timeout from environment. Session run within the per-student lock (Stage 6) to prevent race conditions.

## 5. Recommended Technologies/Options
- `pg` for database operations.
- PostgreSQL partial unique index for session uniqueness guarantee.

## 6. Alternatives Considered
- **Redis for session state**: Faster reads but adds complexity. The session is accessed once per message — PostgreSQL is fast enough.
- **Complex session state machine**: Adds educational logic to the session model. **Explicitly rejected** per the Newborn AI philosophy.

## 7. Trade-offs
- **Session timeout too short vs too long**: A configurable default of 30 minutes is a reasonable starting point. Research real student behavior (do students take 5-minute breaks? 2-hour breaks?) and adjust.
- **Partial unique index**: Prevents duplicate active sessions at the DB level, but PostgreSQL partial unique indexes have edge cases in concurrent transactions. The per-student lock (Stage 6) makes this a defense-in-depth measure.

## 8. Security Considerations
- Session IDs are UUIDs — not guessable.
- The session `id` is an internal identifier only. It is not exposed to the student or external systems.
- All session queries must include `wax_id` to prevent cross-student access.

## 9. Reliability Considerations
- Session resolution must be atomic. Using a transaction for the close-existing/create-new pair prevents partial updates.
- If the session update fails, the message is not lost — it's retried via BullMQ.

## 10. Scalability Considerations
- Index on `(wax_id, status)` ensures session lookup is O(log n) not O(n).
- At startup scale, no concern.

## 11. Railway Considerations
No Railway-specific concerns.

## 12. Configuration Considerations
- `SESSION_INACTIVITY_TIMEOUT_MS` (default: 1800000 = 30 minutes)

## 13. Edge Cases
- Student sends a message exactly at the inactivity boundary: the threshold comparison is inclusive (`>` vs `>=`). Pick one and document it. The exact boundary rarely matters.
- Student sends a message after weeks of absence: the previous session is closed, a new session is created. The AI context will include a summary of previous sessions (Stage 14 AI context design) to give the AI continuity.

## 14. Failure Modes
- Session creation fails (database error): the job fails and is retried. Next retry creates the session successfully.
- Both session lookup and creation return nothing (edge case in concurrent transactions): the worker should retry session resolution once before failing.

## 15. Common Mistakes
- Adding educational state to the sessions table.
- Not using the partial unique index (allowing multiple active sessions per student).
- Running session resolution outside the per-student lock (race conditions).
- Hardcoding the inactivity timeout.
- Closing sessions too aggressively (students lose context from brief pauses).

## 16. What Should NOT Be Hardcoded
Inactivity timeout, session state definitions (should be extensible).

## 17. What Should Remain Deterministic Infrastructure
Session creation, session lookup, session close, timeout calculation.

## 18. What Must Remain AI-Controlled
What the AI does when it detects a new session (greet? ask what subject? continue from previous?). The session infrastructure merely provides the temporal boundary.

## 19. Dependencies on Earlier Stages
Stage 3 (database), Stage 12 (WaxID for session association), Stage 6 (per-student lock that wraps session resolution).

## 20. Effects on Later Stages Within 1–14
Stage 14 (messages keyed on session_id), AI context assembly (uses session boundaries to define context window).

## 21. Implementation Recommendations
1. Create `infra/migrations/002_sessions.sql` with the sessions table.
2. Create `src/session/sessionManager.js` with `resolveOrCreateSession()`.
3. Call `resolveOrCreateSession()` at the start of every AI worker job.
4. Test race conditions with concurrent workers.

## 22. Testing Requirements
- Unit test: within inactivity window → returns existing session.
- Unit test: beyond inactivity window → closes old session, creates new.
- Unit test: first message → creates session.
- Integration test: concurrent identity resolution doesn't create two active sessions (partial unique index).

## 23. Completion Criteria
- Sessions created/resolved correctly.
- Inactivity timeout configurable.
- Partial unique index preventing duplicate active sessions.
- No educational state in the sessions schema.

## 24. Open Questions
- Should closed sessions be soft-deleted after a certain age? **[RECOMMENDATION]** No — keep for historical context. Revisit when database storage becomes a cost concern.

## 25. Research Confidence Level
**HIGH** — Session management is well-understood. Partial unique index is a PostgreSQL-standard feature.

---

# STAGE 14 — MESSAGE PERSISTENCE & HISTORY

## 1. Purpose
To design and implement the message persistence layer: the schema for inbound and outbound messages, indexing for fast retrieval, the query that returns the correct conversation history for the AI, pagination for long histories, idempotent writes, privacy-conscious data design, and prevention of all data integrity problems.

## 2. What the Original Plan Says
Research message persistence, relational message schemas, inbound/outbound message models, message IDs, WaxID ownership, session ownership, timestamps, message ordering, indexes, retrieval performance, message history, pagination, context retrieval, soft deletion, audit requirements, privacy, data minimization, message retention considerations, database growth, archiving, concurrent writes, idempotent persistence, outbound/inbound correlation, AI model metadata, processing status, failed processing records.

## 3. Deep Research Findings

**Message Schema Design**

**[BEST PRACTICE]** Use a single `messages` table with a `direction` field, not separate `inbound_messages` and `outbound_messages` tables. This simplifies queries for "all messages in this session" and avoids complex UNION queries in the AI context assembly.

```sql
CREATE TABLE messages (
  -- Identity
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wax_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  
  -- Source and direction
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  
  -- WhatsApp identifiers (for idempotency and correlation)
  whatsapp_message_id TEXT UNIQUE,  -- NULL for outbound before confirmation
  outbound_chunk_id TEXT UNIQUE,    -- WaxPrep-generated ID for outbound chunks
  
  -- Content
  type TEXT NOT NULL,               -- 'text', 'image', 'audio', 'video', 'document', 'unknown'
  content_json JSONB,               -- Structured content: { text: '...' } or { mediaId: '...', ... }
  
  -- Processing
  processing_status TEXT NOT NULL DEFAULT 'received'
    CHECK (processing_status IN ('received', 'queued', 'processing', 'processed', 'failed', 'sent', 'delivered', 'read')),
  processing_error TEXT,            -- Error message if failed
  processed_at TIMESTAMPTZ,
  
  -- Timestamps (ordering and display)
  whatsapp_timestamp TIMESTAMPTZ,   -- From WhatsApp (inbound) or sent time (outbound)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ,           -- Soft delete
  
  -- AI metadata (outbound only)
  ai_provider TEXT,                 -- Which AI provider generated this response
  ai_model TEXT,                    -- Which model was used
  ai_request_id TEXT,               -- Provider's request ID for debugging
  token_count INTEGER,              -- Approximate token count (for cost tracking later)
  
  -- Context assembly metadata
  chunk_index INTEGER,              -- For multi-chunk responses: 0, 1, 2...
  total_chunks INTEGER,             -- Total chunks in this response
  parent_message_id UUID REFERENCES messages(id)  -- Inbound message this is a response to
);

-- Indexes for performance
CREATE INDEX idx_messages_wax_session ON messages(wax_id, session_id, created_at ASC);
CREATE INDEX idx_messages_session_created ON messages(session_id, created_at ASC);
CREATE INDEX idx_messages_processing_status ON messages(processing_status) WHERE processing_status IN ('received', 'queued', 'processing');
CREATE INDEX idx_messages_wax_id ON messages(wax_id, created_at DESC);
```

**Idempotent Message Persistence**

**[CRITICAL]** Inbound messages must be idempotent — same `whatsapp_message_id` cannot be inserted twice:

```sql
-- Covered by the UNIQUE constraint on whatsapp_message_id
INSERT INTO messages (wax_id, session_id, direction, whatsapp_message_id, type, content_json, ...)
VALUES ($1, $2, 'inbound', $3, $4, $5, ...)
ON CONFLICT (whatsapp_message_id) DO NOTHING;
```

Outbound messages use `outbound_chunk_id` (WaxPrep-generated) for idempotency:
```sql
INSERT INTO messages (..., outbound_chunk_id, ...)
VALUES (...)
ON CONFLICT (outbound_chunk_id) DO UPDATE SET processing_status = 'sent', updated_at = NOW();
```

**The Critical AI Context Query**

This is the query that answers: "Give the AI the correct recent conversation history for this student and this session."

```sql
-- Get messages for AI context assembly
SELECT 
  direction,
  type,
  content_json,
  whatsapp_timestamp,
  created_at,
  ai_model,
  chunk_index,
  total_chunks
FROM messages
WHERE wax_id = $1          -- CRITICAL: always scope to student
  AND session_id = $2      -- CRITICAL: scope to session
  AND deleted_at IS NULL
  AND processing_status != 'failed'  -- Exclude failed processing attempts
ORDER BY created_at ASC
LIMIT $3;                  -- Configurable limit: e.g., 100 messages
```

**[CRITICAL]** This query must ALWAYS include `wax_id = $1`. Never query messages by `session_id` alone — session IDs are not secret and a bug could return another student's session data.

**[RECOMMENDATION]** The message limit for AI context assembly should be configurable (`AI_CONTEXT_MAX_MESSAGES`), not hardcoded. The limit prevents very long sessions from sending too many tokens to the AI.

**Preventing Cross-Student History Leakage**

**[CRITICAL]** The most dangerous failure mode in WaxPrep is returning Student A's messages to the AI when processing Student B's request. Prevention:

1. **Always include `wax_id` in the WHERE clause**.
2. **The `StudentDataAccess` class (Stage 12) enforces this structurally** — you can only call `getMessages(sessionId)` through an instance scoped to a specific `waxId`.
3. **Database-level row ownership**: every `messages` row has a `wax_id` foreign key. This is the structural defense.
4. **Session isolation**: sessions are also scoped to `wax_id`. A `session_id` without a `wax_id` check is still safe because the session itself is owned by a student, but defense-in-depth requires both filters.

**Context Retrieval for Long Conversations**

**[RECOMMENDATION]** For very long sessions (hundreds of messages), returning all messages to the AI would exceed the AI provider's context window. Design the context assembly (a concern of the AI layer, later development) to:
1. Fetch the last N messages (recent context).
2. Optionally retrieve a session summary (not implemented in Stage 14, but the schema should support it via a `session_summary` column on `sessions`).

The message retrieval is paginated and limited at the database level. The AI context assembly layer decides how many messages to include.

**Message Content — JSONB vs Individual Columns**

**[TRADE-OFF]**
- **Individual columns** (`content_text`, `content_media_id`, etc.): type-safe, indexed per field. Requires schema migration for new content fields.
- **JSONB**: Flexible, schema-less for the content structure. Can be indexed with GIN indexes. Easier to add new content types.

**[RECOMMENDATION]** Use **JSONB** for `content_json`. The content structure varies significantly by message type, and new message types will be added as WaxPrep evolves. JSONB allows this without migrations. The outer message type (`type` column) is a typed text column with a check constraint — JSONB is only for the type-specific payload.

**AI Metadata**

**[RECOMMENDATION]** Store `ai_provider`, `ai_model`, and `ai_request_id` on outbound messages. This enables:
- Debugging: which provider generated this specific response?
- Future cost analysis (when that stage is added): which model was used most?
- A/B testing: comparing response quality between providers/models.

**Processing Status Lifecycle**

```
Inbound message:
received → queued → processing → processed | failed

Outbound message:
sent → delivered → read | failed
```

The `processing_status` field allows WaxPrep to answer: "Has this message been processed yet?" — which is critical for the debounce architecture (fetch all unprocessed inbound messages for this student in the current window).

**Data Minimization and Retention**

**[BEST PRACTICE]** Store the minimum necessary data:
- Do not store raw phone numbers in messages (use wax_id foreign key).
- Do not store the AI's full system prompt in messages (it's in code/config, not per-message).
- Do not store the full conversation context sent to the AI (it's reconstructed from the database on each call).

**Message Retention**

**[TRADE-OFF]** How long should messages be kept?
- Keeping all messages: maximum context for the AI, complete audit trail. Higher database storage costs over time.
- Automatic deletion after N days: reduces costs but loses educational history. May violate student expectations of continuity.

**[RECOMMENDATION]** Keep all messages indefinitely for now. Implement soft deletion. Add a `retention_days` configuration option for future use when database size becomes a concern.

**Database Growth**

**[FACT]** Message volume grows linearly with student usage. At 100 messages per student per day and 1000 students, that's 100,000 messages per day. Each message row is approximately 500 bytes on average. That's ~50MB per day. This is manageable for several years without special archiving.

**[RECOMMENDATION]** Add JSONB compression (PostgreSQL 14+ supports ZSTD compression). Add table partitioning if message volume justifies it (not at startup scale).

**Outbound/Inbound Correlation**

**[RECOMMENDATION]** The `parent_message_id` field on outbound messages references the inbound message that triggered the AI response. This allows answering: "Which AI response was generated in response to this student message?" — useful for debugging and potential future feedback mechanisms.

**Failed Processing Records**

**[RECOMMENDATION]** When a job fails permanently (all retries exhausted), update the inbound message's `processing_status` to `'failed'` and set `processing_error` to a human-readable description. This creates a complete operational record without losing the message.

## 4. Recommended Architecture
Single `messages` table with `direction`, `type`, `content_json` (JSONB), `processing_status`, and AI metadata columns. Indexes on `(wax_id, session_id, created_at)` and `processing_status`. Idempotent inserts via UNIQUE constraints. `StudentDataAccess` enforcing `wax_id` scoping on all queries. Configurable message limit for AI context.

## 5. Recommended Technologies/Options
- `pg` with raw SQL.
- PostgreSQL JSONB for flexible content storage.
- PostgreSQL UNIQUE constraints for idempotency.

## 6. Alternatives Considered
- **Separate inbound/outbound tables**: Simpler individual schemas but complex UNION queries for AI context. Not recommended.
- **Message queue persistence (Redis-only)**: Not durable across Redis failures. Messages must be in PostgreSQL.

## 7. Trade-offs
- **JSONB vs typed columns**: JSONB is flexible but less indexed than typed columns. Acceptable for content that is returned to the AI as text, not used in complex SQL filters.
- **Single messages table vs partitioning**: Partitioning by `wax_id` or `created_at` improves query performance at scale. Add partitioning when the table exceeds tens of millions of rows.

## 8. Security Considerations
- `wax_id` on every row is the student isolation anchor.
- Never query without `wax_id = $1` in the WHERE clause.
- `content_json` may contain student message text — logs should not include this field.

## 9. Reliability Considerations
- UNIQUE constraints prevent duplicate message persistence.
- `ON CONFLICT DO NOTHING` ensures idempotent retry safety.
- Indexes prevent full table scans on large message tables.

## 10. Scalability Considerations
- Composite index on `(wax_id, session_id, created_at)` is the critical performance index for AI context assembly queries.
- JSONB content with GIN indexing can support content-based search if needed in future.

## 11. Railway Considerations
- Railway PostgreSQL storage should be monitored as message volume grows.
- Consider enabling PostgreSQL table compression for the messages table in later stages.

## 12. Configuration Considerations
- `AI_CONTEXT_MAX_MESSAGES` (default: 100) — limits messages fetched for context assembly.
- `MESSAGE_RETENTION_DAYS` (default: undefined/unlimited) — for future retention implementation.

## 13. Edge Cases
- Very long session (student messages for 8 hours): `LIMIT` on context query handles this.
- Message with no content (some WhatsApp event types): `content_json = null` is valid.
- Outbound chunk delivery confirmed out of order: `processing_status` updates are idempotent.
- Session deleted mid-conversation: `ON DELETE CASCADE` on `session_id` foreign key removes associated messages. **[TRADE-OFF]** Cascade delete might be too aggressive. **[RECOMMENDATION]** Use soft deletion only — never hard delete sessions or messages.

## 14. Failure Modes
- Insert fails due to database error: job retries. On second attempt, `ON CONFLICT DO NOTHING` ensures no duplicate.
- Wrong `session_id` attached to a message (race condition in session resolution): the per-student lock prevents this.
- Cross-student leakage via missing `wax_id` filter: structural defense via `StudentDataAccess`.

## 15. Common Mistakes
- Querying messages by `session_id` without `wax_id` filter.
- Not indexing on `(wax_id, session_id, created_at)`.
- Hardcoding the AI context message limit.
- Storing raw phone numbers or secrets in `content_json`.
- Forgetting `deleted_at IS NULL` in queries (returning soft-deleted messages).

## 16. What Should NOT Be Hardcoded
AI context message limit, message retention period, chunk size (handled at outbound level).

## 17. What Should Remain Deterministic Infrastructure
Message persistence, idempotency checks, ordering queries, processing status updates.

## 18. What Must Remain AI-Controlled
Which messages the AI pays attention to, how the AI interprets the conversation history. The infrastructure provides all available messages — the AI's context window and attention mechanism determine relevance.

## 19. Dependencies on Earlier Stages
Stage 3 (database), Stage 12 (wax_id), Stage 13 (session_id), Stage 10 (normalized message content), Stage 11 (outbound messages).

## 20. Effects on Later Stages Within 1–14
Stage 14 is the final data layer stage within scope. It directly enables AI context assembly in the AI orchestration work that follows beyond Stage 14.

## 21. Implementation Recommendations
1. Create `infra/migrations/003_messages.sql` with the messages table.
2. Create `src/db/messageRepository.js` with all message queries.
3. Ensure all queries go through `StudentDataAccess` (wax_id scoped).
4. Add indexes for all query patterns.
5. Test idempotent inserts.
6. Test the AI context retrieval query for performance.

## 22. Testing Requirements
- Unit test: inserting the same `whatsapp_message_id` twice → second insert is no-op.
- Unit test: AI context query returns messages in `created_at ASC` order.
- Unit test: AI context query respects `deleted_at IS NULL`.
- Unit test: AI context query always includes `wax_id` filter.
- Integration test: message insert and retrieval round-trip.
- Integration test: processing status updates work correctly.

## 23. Completion Criteria
- Messages table with all required columns and indexes.
- Idempotent inserts via UNIQUE constraints.
- AI context retrieval query working with configurable limit.
- All queries scoped to `wax_id`.
- No raw phone numbers in content.

## 24. Open Questions
- Should messages be partitioned by date for performance? **[RECOMMENDATION]** Not at startup. Plan for it when the table exceeds 10M rows.
- Should AI-generated summaries of past sessions be stored in the sessions table? **[RECOMMENDATION]** Yes — add a `session_summary TEXT` column to `sessions` in the migration. The AI can populate it (via a tool call) when a session closes.

## 25. Research Confidence Level
**HIGH** — Message persistence and relational schema design is well-understood. PostgreSQL JSONB is production-proven.

---

# CROSS-STAGE FINAL ARCHITECTURE

---

## A. COMPLETE SYSTEM ARCHITECTURE

```
[STUDENT]
    │
    │  WhatsApp message
    ▼
[WHATSAPP / META SERVERS]
    │
    │  HTTPS POST to Railway webhook URL
    │  X-Hub-Signature-256 header
    ▼
[RAILWAY — WEBHOOK SERVICE]
    │
    │  ┌──────────────────────────────────────────────────┐
    │  │  Stage 7: Health endpoints (/health, /ready)     │
    │  │  Stage 9: Size limit → Rate limit → HMAC verify  │
    │  │  Stage 8: GET verification challenge handler     │
    │  │  Stage 10: Payload normalization & dedup         │
    │  │  Stage 12: Phone → WaxID resolution              │
    │  │  Stage 14: Inbound message persistence           │
    │  │  Stage 6: Debounce job enqueue → Redis           │
    │  │  Stage 4: Logging + correlation ID               │
    │  │  Stage 2: Configuration validation               │
    │  │  Stage 1: Express server, Node.js 22 LTS         │
    │  └──────────────────────────────────────────────────┘
    │
    │  200 OK (immediate)
    ▼
[META WEBHOOK SERVER] ← Delivery acknowledged
    
    │  (meanwhile, asynchronously)
    ▼
[RAILWAY — REDIS (BullMQ)]
    │  Debounce queue: job delayed by QUEUE_DEBOUNCE_WINDOW_MS
    │  Job ID = "debounce:student:{waxId}" (supersession)
    ▼
[RAILWAY — WORKER SERVICE]
    │
    │  ┌────────────────────────────────────────────────────────┐
    │  │  Stage 6: Per-student Redlock acquisition              │
    │  │  Stage 13: Session resolve or create                   │
    │  │  Stage 14: Fetch unprocessed messages for context       │
    │  │  Stage 11: Send typing indicator via WhatsApp API      │
    │  │  [AI/Context Assembly — beyond Stage 14 scope]:        │
    │  │    - Context window construction                        │
    │  │    - Student model / knowledge state                    │
    │  │    - Tool definitions                                   │
    │  │    - System prompt assembly                             │
    │  │    - AI provider call (provider-agnostic)               │
    │  │    - Response validation                                │
    │  │  Stage 5: Circuit breaker + retry + timeout            │
    │  │  Stage 14: Outbound message persistence                │
    │  │  Stage 11: Enqueue outbound chunks to outbound queue   │
    │  │  Stage 6: Release Redlock                              │
    │  │  Stage 4: Full trace logging with correlationId        │
    │  └────────────────────────────────────────────────────────┘
    │
    ▼
[RAILWAY — REDIS (BullMQ Outbound Queue)]
    │
    ▼
[OUTBOUND WORKER (in same Worker Service)]
    │
    │  ┌────────────────────────────────────────────────────────┐
    │  │  Stage 11: Per-student lock for sequential delivery    │
    │  │  Stage 11: Send chunk N via WhatsApp API               │
    │  │  Stage 11: Update processing_status to 'sent'         │
    │  │  Stage 11: Wait RESPONSE_CHUNK_DELAY_MS                │
    │  │  Stage 11: Send chunk N+1...                           │
    │  │  Stage 5: Retry on failure with exponential backoff   │
    │  └────────────────────────────────────────────────────────┘
    │
    │  HTTPS POST to WhatsApp Cloud API
    ▼
[WHATSAPP CLOUD API]
    │
    │  Message delivered
    ▼
[STUDENT'S WHATSAPP]
    
    │  (status webhooks: sent, delivered, read)
    ▼
[RAILWAY — WEBHOOK SERVICE]
    │  Stage 10: Status events separated and persisted
    ▼
[POSTGRESQL — OUTBOUND_MESSAGE_STATUSES TABLE]
```

---

## B. DATA FLOW — Single Student Message

```
1.  Student types "I don't understand this question" → WhatsApp

2.  WhatsApp sends POST to https://waxprep-webhook.railway.app/webhook
    Headers: X-Hub-Signature-256: sha256=abc123...
    Body: { "entry": [{ "changes": [{ "value": { "messages": [{ 
            "from": "447911123456",
            "id": "wamid.HBgN...",
            "type": "text",
            "text": { "body": "I don't understand this question" }
    }}]}}]}]}

3.  Express receives with express.raw() — raw body captured

4.  Stage 9 security middleware:
    - Size check: 512 bytes < 100KB ✓
    - Rate limit: IP 5 req/min ✓  
    - HMAC-SHA256 verify(rawBody, header, APP_SECRET) → timingSafeEqual ✓
    - Continue

5.  Stage 10 normalization:
    normalizeWebhookPayload(rawPayload) →
    {
      messageId: "wamid.HBgN...",
      phoneRaw: "447911123456",
      type: "text",
      timestamp: 1680000000,
      content: { text: "I don't understand this question" }
    }

6.  Stage 12 identity resolution:
    normalizePhone("447911123456") → "447911123456"
    hashPhone("447911123456", PHONE_HMAC_SECRET) → "a7f8b2c..."
    SELECT FROM students WHERE phone_hash = "a7f8b2c..." → { waxId: "uuid-abc" }
    (or INSERT if new student)

7.  Stage 14 message persistence:
    INSERT INTO messages (wax_id, whatsapp_message_id, direction, type, content_json, processing_status)
    VALUES ("uuid-abc", "wamid.HBgN...", "inbound", "text", {"text": "..."}, "received")
    ON CONFLICT (whatsapp_message_id) DO NOTHING
    (Returns 0 rows if duplicate — detected, no further processing)

8.  Stage 6 debounce enqueue:
    jobId = "debounce:student:uuid-abc"
    existingJob = await queue.getJob(jobId)
    if existingJob: await existingJob.remove()
    await queue.add("process-messages", 
      { waxId: "uuid-abc", _trace: { correlationId, messageId } },
      { jobId, delay: 2500 }
    )

9.  Stage 8 webhook handler:
    return res.status(200).json({ message: "received" })
    ← Total time in webhook handler: ~50ms

10. [2500ms later — debounce fires]

11. Stage 6 BullMQ worker picks up job "debounce:student:uuid-abc"

12. Stage 6: acquire Redlock("lock:student:uuid-abc", 120000ms)
    → Lock acquired

13. Stage 4: runWithContext({ correlationId, waxId: "uuid-abc" })
    → All subsequent logs include correlationId and waxId

14. Stage 13: resolveOrCreateSession("uuid-abc")
    → Returns { sessionId: "sess-xyz", isNew: false }
    → Updates sessions.last_activity_at

15. Stage 14: getUnprocessedMessages("uuid-abc", "sess-xyz")
    SELECT * FROM messages WHERE wax_id = "uuid-abc" 
    AND processing_status = "received" ORDER BY created_at ASC
    → [{ text: "I don't understand this question" }]
    
    UPDATE messages SET processing_status = "processing" WHERE id = ...

16. Stage 11: sendTypingIndicator("447911123456", "wamid.HBgN...")
    → POST to WhatsApp API
    → Student sees "typing..."

17. [AI Context Assembly — beyond Stage 14]:
    - Fetch last 100 messages for context window
    - Assemble system prompt (student model, session info, tools)
    - Call AI provider (provider-agnostic)
    - Receive response: "Let me help you understand! Looking at your question..."
    - Validate response

18. Stage 11 response splitting:
    splitResponse(aiText, RESPONSE_MAX_CHUNK_CHARS) 
    → ["Let me help you understand! ...", "In physics, ..."]

19. Stage 14 outbound persistence:
    INSERT INTO messages (wax_id, session_id, direction, type, content_json, 
      ai_provider, ai_model, chunk_index, outbound_chunk_id, processing_status)
    VALUES (..., "outbound", "text", {"text": "Let me help..."}, "anthropic", 
      "claude-sonnet-4-6", 0, "sess-xyz:ai-001:0", "sent")

20. Stage 6: enqueue chunks to outbound queue
    await outboundQueue.add("send-chunk", { chunkId: "sess-xyz:ai-001:0", ... })
    await outboundQueue.add("send-chunk", { chunkId: "sess-xyz:ai-001:1", ... })

21. Stage 6: release Redlock("lock:student:uuid-abc")

22. Stage 6: outbound worker picks up chunk 0
    Per-student lock acquired for outbound
    POST to WhatsApp API: chunk 0
    → Student receives: "Let me help you understand! ..."
    Wait RESPONSE_CHUNK_DELAY_MS (500ms)
    POST to WhatsApp API: chunk 1
    → Student receives: "In physics, ..."
    Release per-student lock

23. [Status webhooks arrive]:
    Meta sends POST to webhook: delivered, then read events
    Stage 10: normalized as status events
    UPDATE messages SET processing_status = "delivered"/"read" WHERE outbound_chunk_id = ...
```

---

## C. RAPID-MESSAGE FLOW

**Scenario**: Student sends 4 messages in 4 seconds.

```
16:31:01.000 — "Sir" → webhook → normalized → persisted → debounce job {id: "debounce:uuid-abc", delay: 2500ms}

16:31:02.000 — "I don't understand" → webhook → normalized → persisted
              debounce job exists → REMOVED
              new debounce job {id: "debounce:uuid-abc", delay: 2500ms from now}

16:31:03.000 — "this physics question" → webhook → normalized → persisted
              debounce job exists → REMOVED
              new debounce job {id: "debounce:uuid-abc", delay: 2500ms from now}

16:31:04.000 — [image of physics problem] → webhook → normalized → persisted
              debounce job exists → REMOVED
              new debounce job {id: "debounce:uuid-abc", delay: 2500ms from now}

16:31:06.500 — Debounce fires (2500ms after last message)
              
              Worker picks up job
              Acquires Redlock("lock:student:uuid-abc")
              
              Session resolved (existing active session)
              
              getUnprocessedMessages("uuid-abc") →
              [
                { type: "text", content: { text: "Sir" }, timestamp: 16:31:01 },
                { type: "text", content: { text: "I don't understand" }, timestamp: 16:31:02 },
                { type: "text", content: { text: "this physics question" }, timestamp: 16:31:03 },
                { type: "image", content: { mediaId: "IMG-123" }, timestamp: 16:31:04 }
              ]
              — Sorted by timestamp ASC —
              
              All 4 messages sent to AI as ONE coherent request:
              "Student sent 4 messages: 'Sir', 'I don't understand', 
               'this physics question', [attached image of physics problem]"
              
              AI produces ONE coherent response addressing all 4 messages
              
              Student receives ONE relevant, contextualized response
              (not 4 fragmented responses to each message)
```

**Key insight**: Only ONE AI call. Only ONE set of outbound responses. Messages arrive as a coherent multi-part query. The AI has full context.

---

## D. FAILURE FLOW

### D.1 — WhatsApp API Outbound Failure
```
Outbound worker attempts to send chunk → WhatsApp API returns 429
→ BullMQ retry with exponential backoff (1s, 2s, 4s... up to QUEUE_RETRY_DELAY_MAX_MS)
→ idempotent: outbound_chunk_id is unique, no duplicate sends
→ If retries exhausted: mark message as failed
→ Record processing_error in messages table
→ [Future]: Alert / student recovery message on next contact
```

### D.2 — Duplicate Webhook Delivery
```
Meta delivers wamid.HBgN... for the second time (retry)
→ Stage 10 normalization: extracts message ID
→ Stage 14 persistence: INSERT ON CONFLICT (whatsapp_message_id) DO NOTHING
→ Returns 0 rows inserted → detected as duplicate
→ No debounce job enqueued
→ 200 OK returned to Meta
→ No duplicate AI processing
```

### D.3 — Database Failure During Webhook Processing
```
POST arrives → security passes → normalization passes
→ DB insert fails (connection error)
→ Express error middleware catches
→ Returns 500 to Meta
→ Meta retries the webhook (multiple times, over minutes)
→ Database recovers
→ Meta's retry is processed successfully
→ No message lost
```

### D.4 — Redis Failure
```
Webhook arrives → DB persistence succeeds
→ debounceQueue.add() throws (Redis unavailable)
→ Webhook handler catches in try/catch
→ Returns 500 to Meta
→ Meta retries
→ Meanwhile: messages are safely in PostgreSQL
→ Redis recovers → next Meta retry → debounce job enqueued → processed
→ No messages lost (they're in PostgreSQL)
```

### D.5 — AI Provider Timeout
```
Worker acquires lock, fetches messages, sends typing indicator
→ AI API call times out after AI_TIMEOUT_MS
→ cockatiel circuit breaker records failure
→ BullMQ job fails → retry with backoff
→ After QUEUE_MAX_RETRIES: job moves to failed state
→ messages.processing_status → "failed"
→ messages.processing_error → "AI provider timeout after 30000ms"
→ Student receives AI_FAILURE_STUDENT_MESSAGE (configurable)
→ Typing indicator auto-dismisses after 25s
→ If circuit breaker threshold reached: breaker opens
   → Subsequent jobs fail immediately (fast-fail, no AI calls)
   → After CIRCUIT_BREAKER_DURATION_MS: breaker half-opens, allows one test request
   → If test succeeds: breaker closes, normal operation resumes
```

### D.6 — Worker Crashes Mid-Job
```
Worker acquires lock, starts AI processing
→ Worker process crashes (OOM, unhandled error, SIGKILL)
→ BullMQ job lock expires after QUEUE_LOCK_DURATION_MS (30s)
→ QueueScheduler detects stalled job
→ Job requeued for retry
→ Railway restarts the worker service (restart policy: always)
→ New worker instance picks up the stalled job
→ Session is still active in PostgreSQL
→ Unprocessed messages are still in PostgreSQL (processing_status = "processing")
→ Worker processes messages → resets to "processed"
→ Normal operation resumes
→ Student may experience a longer-than-normal delay
→ No data loss
```

### D.7 — Railway Restarts During Active Processing
```
SIGTERM sent to old Railway service instance (new deployment)
→ SIGTERM handler fires
→ HTTP server stops accepting new requests
→ worker.close(WORKER_SHUTDOWN_TIMEOUT_MS) called
   → Stops accepting new BullMQ jobs
   → Waits for active job to complete (up to WORKER_SHUTDOWN_TIMEOUT_MS)
   → If job completes within timeout: graceful exit (process.exit(0))
   → If job exceeds timeout: Railway sends SIGKILL after grace period
     → Job's lock expires → detected as stalled → requeued by new instance
→ New Railway service instance starts
→ Passes health checks
→ Begins processing jobs
→ Minimal disruption for students (possible retry delay)
```

### D.8 — Deployment During Active Processing (Rolling Deploy)
```
New Railway deployment starts
→ New instance starts, passes /ready health check
→ Railway routes traffic to new instance (webhook handled by new)
→ Old instance receives SIGTERM
→ Old instance: completes in-flight AI job or stalls gracefully
→ New instance processes next messages (same session, same Redis, same PostgreSQL)
→ Students experience no gap in service
→ Deployed code version is updated transparently
```

---

## E. CONFIGURATION MAP

| Variable | Purpose | Railway? | .env? | Required? | Default | Validate |
|---|---|---|---|---|---|---|
| `NODE_ENV` | Environment | ✓ | ✓ | Yes | — | enum: development/production |
| `PORT` | HTTP listen port | ✓ | ✓ | No | 3000 | int, 1-65535 |
| `LOG_LEVEL` | Pino log level | ✓ | ✓ | No | info | enum |
| `DATABASE_URL` | PostgreSQL connection | ✓ ref var | dev only | Yes | — | non-empty string |
| `DATABASE_POOL_MAX` | Max pool connections | ✓ | ✓ | No | 10 | int, 1-100 |
| `DATABASE_IDLE_TIMEOUT_MS` | Pool idle timeout | ✓ | ✓ | No | 30000 | int, min 1000 |
| `DATABASE_CONNECTION_TIMEOUT_MS` | Pool connect timeout | ✓ | ✓ | No | 5000 | int, min 500 |
| `DATABASE_STATEMENT_TIMEOUT_MS` | Query timeout | ✓ | ✓ | No | 30000 | int |
| `REDIS_URL` | Redis connection | ✓ ref var | dev only | Yes | — | non-empty string |
| `WHATSAPP_VERIFY_TOKEN` | Webhook verify token | ✓ | dev only | Yes | — | non-empty string |
| `WHATSAPP_APP_SECRET` | Webhook HMAC secret | ✓ | dev only | Yes | — | min 16 chars |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta phone number ID | ✓ | ✓ | Yes | — | non-empty string |
| `WHATSAPP_ACCESS_TOKEN` | Meta API access token | ✓ | dev only | Yes | — | non-empty string |
| `WHATSAPP_API_VERSION` | Graph API version | ✓ | ✓ | No | v20.0 | pattern: /^v\d+\.\d+$/ |
| `WHATSAPP_API_BASE_URL` | Graph API base URL | ✓ | ✓ | No | https://graph.facebook.com | URL |
| `WEBHOOK_MAX_PAYLOAD_BYTES` | Max webhook body size | ✓ | ✓ | No | 102400 | int, min 1024 |
| `WEBHOOK_RATE_LIMIT_PER_MINUTE` | Rate limit threshold | ✓ | ✓ | No | 10000 | int, min 1 |
| `PHONE_HMAC_SECRET` | Phone pseudonymization key | ✓ | dev only | Yes | — | min 32 chars |
| `AI_PRIMARY_PROVIDER` | AI provider name | ✓ | ✓ | Yes | — | non-empty string |
| `AI_PRIMARY_MODEL` | AI model identifier | ✓ | ✓ | Yes | — | non-empty string |
| `AI_PRIMARY_API_KEY` | AI provider API key | ✓ | dev only | Yes | — | non-empty string |
| `AI_FALLBACK_PROVIDER` | Fallback AI provider | ✓ | ✓ | No | — | string |
| `AI_FALLBACK_MODEL` | Fallback AI model | ✓ | ✓ | No | — | string |
| `AI_FALLBACK_API_KEY` | Fallback provider key | ✓ | dev only | No | — | string |
| `AI_TIMEOUT_MS` | AI call timeout | ✓ | ✓ | No | 30000 | int, 5000-120000 |
| `AI_MAX_TOKENS` | Max response tokens | ✓ | ✓ | No | 1024 | int, 100-8192 |
| `AI_CONTEXT_MAX_MESSAGES` | Messages for AI context | ✓ | ✓ | No | 100 | int, 10-500 |
| `AI_FAILURE_STUDENT_MESSAGE` | Fallback error message | ✓ | ✓ | No | (default) | non-empty string |
| `QUEUE_DEBOUNCE_WINDOW_MS` | Rapid message debounce | ✓ | ✓ | No | 2500 | int, 500-30000 |
| `QUEUE_WORKER_CONCURRENCY` | Worker concurrency | ✓ | ✓ | No | 5 | int, 1-50 |
| `QUEUE_MAX_RETRIES` | Job retry attempts | ✓ | ✓ | No | 3 | int, 0-10 |
| `QUEUE_RETRY_DELAY_BASE_MS` | Backoff base delay | ✓ | ✓ | No | 1000 | int, 100-60000 |
| `QUEUE_RETRY_DELAY_MAX_MS` | Backoff max delay | ✓ | ✓ | No | 30000 | int |
| `QUEUE_JOB_TIMEOUT_MS` | Max job processing time | ✓ | ✓ | No | 120000 | int, 30000-600000 |
| `QUEUE_LOCK_DURATION_MS` | BullMQ job lock | ✓ | ✓ | No | 30000 | int |
| `RESPONSE_MAX_CHUNK_CHARS` | Max chars per WA message | ✓ | ✓ | No | 1000 | int, 100-4096 |
| `RESPONSE_CHUNK_DELAY_MS` | Delay between chunks | ✓ | ✓ | No | 500 | int, 0-10000 |
| `RESPONSE_TYPING_INDICATOR_ENABLED` | Show typing indicator | ✓ | ✓ | No | true | boolean |
| `RESPONSE_TYPING_REFRESH_INTERVAL_MS` | Retype indicator interval | ✓ | ✓ | No | 20000 | int |
| `SESSION_INACTIVITY_TIMEOUT_MS` | Session timeout | ✓ | ✓ | No | 1800000 | int, 60000-86400000 |
| `CIRCUIT_BREAKER_THRESHOLD` | Failures before open | ✓ | ✓ | No | 5 | int, 1-100 |
| `CIRCUIT_BREAKER_DURATION_MS` | Open breaker duration | ✓ | ✓ | No | 30000 | int |
| `WORKER_SHUTDOWN_TIMEOUT_MS` | Graceful shutdown wait | ✓ | ✓ | No | 30000 | int |
| `WORKER_HEALTH_PORT` | Worker health HTTP port | ✓ | ✓ | No | 3001 | int |
| `DEBUG_LOG_MESSAGE_CONTENT` | Log message text (dev) | ✓ | ✓ | No | false | boolean |

**True architectural invariants (should remain code constants, NOT env vars)**:
- WhatsApp's 4096-character hard message limit (platform constraint).
- Typing indicator 25-second auto-dismiss (platform constraint).
- HMAC-SHA256 as the hashing algorithm (architectural decision).
- UUID v4 for internal IDs (architectural decision).
- `ON CONFLICT DO NOTHING` idempotency pattern (architectural invariant).

---

## F. SECURITY MODEL

### Webhook Authenticity
**[FACT]** Every POST from Meta includes `X-Hub-Signature-256: sha256=<hex>` computed via HMAC-SHA256 of the raw body with the App Secret. WaxPrep verifies this using `timingSafeEqual` before any processing. Unauthenticated requests are rejected with 401.

GET verification requests are handled separately — no signature on GET, only verify token matching.

### Identity and Authentication
Students are identified by their WhatsApp phone number (a phone number IS a WhatsApp identity). There is no separate login system — the WhatsApp protocol guarantees that the sender of a message is the owner of that phone number (Meta enforces this). WaxPrep treats the phone number as the authentication credential.

### Authorization
All data access is scoped to the WaxID resolved from the authenticated phone number. The `StudentDataAccess` class enforces this structurally. Every database query includes `WHERE wax_id = $1`.

### WaxID Isolation
WaxIDs are UUID v4 — not sequential, not guessable. They are never returned to students or external systems. Each student's data is partitioned by `wax_id` at the database level. Cross-student queries are architecturally prevented by the `StudentDataAccess` pattern.

### Database Isolation
- Single PostgreSQL database with no Row Level Security (for now).
- Application-level isolation via mandatory `wax_id` filter.
- Defense-in-depth via `StudentDataAccess` class that wraps all queries.
- The database user for the application has only SELECT/INSERT/UPDATE/DELETE privileges — no DDL.

### Secrets Management
- All secrets in Railway environment variables (encrypted at rest).
- Secrets never committed to GitHub.
- `PHONE_HMAC_SECRET` — if leaked, phone hashes are compromised. Treat as the highest sensitivity secret.
- `WHATSAPP_APP_SECRET` — if leaked, anyone can forge webhook deliveries.
- `AI_*_API_KEY` — if leaked, unauthorized AI calls can be made.
- Pino `redact` array prevents secrets from appearing in logs.

### Replay Protection
- WhatsApp message IDs (`wamid`) are globally unique per Meta.
- `UNIQUE (whatsapp_message_id)` constraint in the messages table.
- `ON CONFLICT DO NOTHING` idempotency in message persistence.
- Replayed webhooks are detected and silently discarded.

### Idempotency
Every mutable operation has an idempotency mechanism:
- Inbound message insert: `UNIQUE (whatsapp_message_id)`.
- Student creation: `ON CONFLICT (phone_hash) DO UPDATE`.
- Session creation: partial unique index on `(wax_id) WHERE status = 'active'`.
- Outbound chunk send: `UNIQUE (outbound_chunk_id)`.
- BullMQ job enqueue: deterministic `jobId` prevents duplicate debounce jobs.

### Abuse Prevention
- Payload size limit (100KB default).
- Rate limiting per IP (10,000 req/min default — generous enough for Meta, protective against non-Meta).
- Signature verification blocks all non-Meta requests before processing.
- Suspended/blocked student accounts are checked at identity resolution.

### Logging Privacy
- Raw phone numbers never logged.
- Message content never logged in structured fields.
- API keys never logged.
- `DEBUG_LOG_MESSAGE_CONTENT` flag (default: false) required to see message text in logs.
- WaxIDs are safe to log — they are pseudonymous internal IDs.

---

## G. AI VS INFRASTRUCTURE BOUNDARY

### 🟢 GREEN — Deterministic Infrastructure (AI does not control these)

- Webhook HTTP server and routing.
- HMAC-SHA256 signature verification.
- Timing-safe comparison.
- Rate limiting and size limiting.
- Payload normalization and schema validation.
- Message deduplication by `whatsapp_message_id`.
- Status event filtering (status events do not go to AI).
- Phone normalization and HMAC pseudonymization.
- WaxID generation and resolution.
- Account state enforcement (suspended/blocked students rejected before AI).
- Session creation and timeout logic.
- BullMQ job lifecycle, retries, and backoff.
- Message debouncing and aggregation.
- Per-student concurrency control (Redlock).
- Database operations and transactions.
- Message persistence and status tracking.
- Response splitting (deterministic algorithm, configurable parameters).
- Outbound delivery sequencing and retry.
- Typing indicator sending.
- Health checks and monitoring.
- Configuration loading and validation.
- Logging and trace propagation.
- Graceful shutdown.
- Error taxonomy and circuit breaking.

### 🟡 YELLOW — Areas Requiring Careful Architecture (AI/infrastructure boundary)

- **Context window composition**: Infrastructure provides all available messages; but the AI context assembly code (beyond Stage 14) must make decisions about how many messages to include, whether to summarize, what system prompt to use. These decisions should come from configurable parameters + AI judgment, not hardcoded rules.
- **Session boundary interpretation**: Infrastructure defines when a session starts and ends (timeout-based). The AI decides how to handle new sessions (greet the student? continue from last topic? ask what they need?). The infrastructure should pass "is_new_session: true/false" and let the AI decide behavior.
- **Response length**: Infrastructure enforces the platform character limit. Within that limit, the AI decides how much to write. Do not impose arbitrary maximum response lengths on the AI beyond what the platform requires.
- **Message type routing**: Infrastructure determines which message types are supported (text, image, audio). The AI decides what to do with each type (analyze the image, transcribe audio, read text).
- **Tool definition and availability**: Infrastructure defines what tools exist (web search, calculator, etc.). The AI decides when to use them. The infrastructure executes them deterministically and returns results to the AI.

### 🔴 RED — Must Remain AI-Controlled (Infrastructure must not hardcode these)

- What subject or topic to address.
- How to explain a concept.
- What pedagogical approach to use (Socratic method, worked examples, hints).
- Whether to praise, redirect, encourage, or challenge a student.
- What the correct answer to a question is.
- How much detail to include.
- Whether to ask the student a question or provide an explanation.
- When to introduce a new topic vs continue with the current one.
- Whether the student has understood something.
- What the student's knowledge gaps are (the AI observes these from conversation).
- How to respond to a student who seems frustrated or confused.
- What memory or knowledge about the student is relevant for the current interaction.
- Whether to use formal or informal language.
- How to structure a multi-part explanation.
- When the student is ready to move on.
- What to do when a student's question is ambiguous.
- How to handle off-topic or non-educational messages.

**The Newborn AI Invariant**: Infrastructure provides the AI with identity, context, memory, tools, communication channels, and evidence. Everything else — all educational judgment — belongs to the AI. Do not replace AI judgment with deterministic rules, scoring systems, or hardcoded educational decision trees.

---

## H. PRODUCTION RISKS — Highest-Risk Architectural Mistakes

Listed in order of severity and likelihood:

### RISK 1: Cross-Student Data Leakage (CRITICAL)
**The mistake**: Querying messages or sessions by `session_id` without including `wax_id` in the WHERE clause. A bug where the wrong student's session ID is passed to a database query returns another student's private conversation history to the AI.

**Prevention**: `StudentDataAccess` class with WaxID required on every method. Code review checklist: every query on student-specific tables must include `WHERE wax_id = $1`. Never query by `session_id` alone.

### RISK 2: Raw Phone Number Storage or Leakage (HIGH)
**The mistake**: Accidentally logging the raw phone number, storing it in the messages table, or including it in BullMQ job payloads.

**Prevention**: Phone is hashed immediately upon receipt. Only `wax_id` flows through the system. Pino `redact` configuration. Unit tests verifying no phone in logged output.

### RISK 3: Missing Signature Verification (HIGH)
**The mistake**: Not implementing `timingSafeEqual`, or checking signature on GET requests, or not capturing the raw body before JSON parsing middleware.

**Prevention**: Security middleware applied before all other processing. Test with a forged webhook and verify it's rejected. Never parse the body before verifying the signature.

### RISK 4: Hardcoded Educational Logic (HIGH)
**The mistake**: Adding code like `if (student_gets_wrong_answer_3_times) { explain_from_scratch() }` or `if (session_message_count > 20) { end_session_and_quiz() }`. This replaces AI judgment with rigid rules.

**Prevention**: The Newborn AI philosophy. Code review checklist: any `if` statement involving student performance, topic, learning stage, or educational decision requires justification. If in doubt, make it the AI's decision.

### RISK 5: Debounce Not Working Correctly (HIGH)
**The mistake**: Rapid messages producing multiple AI jobs, resulting in the student receiving multiple fragmented responses or the AI seeing incomplete context.

**Prevention**: Extensive integration tests for the debounce architecture. Test the exact scenario: 4 messages in 4 seconds → 1 job → 1 AI call → 1 response.

### RISK 6: No Graceful Shutdown (MEDIUM-HIGH)
**The mistake**: Not handling SIGTERM, causing Railway deployments to interrupt in-flight AI jobs. Students receive no response to messages that were being processed at deploy time.

**Prevention**: SIGTERM handler with `worker.close(timeout)`. Test by deploying while a job is running. Verify the job completes.

### RISK 7: Hardcoded Configuration Values (MEDIUM)
**The mistake**: `delay: 5000` or `concurrency: 5` hardcoded in job definitions or worker setup. Makes it impossible to tune the system without code changes.

**Prevention**: Stage 2 configuration system. Every numeric parameter has a named env var. Code review checklist: no numeric literals in queue configuration or AI parameters.

### RISK 8: AI Provider Lock-In (MEDIUM)
**The mistake**: Calling `anthropic.messages.create()` directly in the AI worker with Anthropic-specific parameters scattered throughout the codebase. Switching providers requires rewriting dozens of files.

**Prevention**: Provider-agnostic AI interface (one function: `callAI(provider, model, messages, options)`). Provider name and model from configuration. SDK calls isolated in `src/ai/providers/`.

### RISK 9: No Idempotent Message Persistence (MEDIUM)
**The mistake**: Not handling `ON CONFLICT` on `whatsapp_message_id`. When Meta retries a webhook, the same message is persisted twice, potentially triggering two AI responses.

**Prevention**: UNIQUE constraint on `whatsapp_message_id`. `ON CONFLICT DO NOTHING` in all inserts. Test with duplicate webhook delivery.

### RISK 10: Secrets in Git (MEDIUM — immediate and irrecoverable)
**The mistake**: Committing `.env` with real API keys, or hardcoding API keys in JavaScript files. Once committed, secrets are in git history forever — even after removal from the current branch.

**Prevention**: `.gitignore` for `.env` from day one. Pre-commit hook checking for common secret patterns. Branch protection preventing direct commits to main. Use `gitleaks` or `truffleHog` to scan for accidental commits.

### RISK 11: Redis as Single Point of Failure Without Graceful Handling (MEDIUM)
**The mistake**: If Redis fails and the webhook handler doesn't catch the queue enqueue error, the handler may return 200 but the job was never enqueued — message silently lost.

**Prevention**: Always wrap `queue.add()` in try/catch. Return 500 to Meta if enqueue fails. Test Redis failure scenario.

### RISK 12: Outbound Messages Out of Order (MEDIUM)
**The mistake**: Sending response chunks in parallel, causing them to arrive in the student's WhatsApp in unpredictable order.

**Prevention**: Sequential chunk sending with per-student lock. Configurable delay between chunks. Test with a 3-chunk response.

### RISK 13: Typing Indicator Not Dismissed (LOW-MEDIUM)
**The mistake**: Sending the typing indicator but then the AI job fails without sending any response. The typing indicator auto-dismisses after 25 seconds, but this is a poor user experience.

**Prevention**: Always send a fallback response (`AI_FAILURE_STUDENT_MESSAGE`) when the AI job fails permanently. The fallback message dismisses the typing indicator.

### RISK 14: Session Timeout Too Short or Too Long (LOW-MEDIUM)
**The mistake**: Hardcoding a session timeout that doesn't match real student behavior. Students who take 5-minute breaks get new sessions; students who leave for an hour continue in an old session.

**Prevention**: `SESSION_INACTIVITY_TIMEOUT_MS` is configurable. Monitor session patterns after launch and tune. Default of 30 minutes is a reasonable starting point.

---

# FINAL SYNTHESIS

## The 14 Stages as a Complete System

WaxPrep's architecture across Stages 1–14 forms a coherent, layered system where each stage provides a specific capability that the next stage depends on:

**Foundation (1–5)**: Node.js project structure → Config system → PostgreSQL → Logging → Error resilience.

**Async Infrastructure (6–7)**: Queue/worker/debounce architecture → Health monitoring.

**WhatsApp Layer (8–11)**: Webhook endpoint → Security → Normalization → Outbound delivery.

**Student Identity Layer (12–13)**: Phone pseudonymization → Session management.

**Data Layer (14)**: Message persistence and history retrieval.

**What comes after Stage 14** (not in scope of this research, but built on this foundation): AI context assembly, student knowledge model, tool integration (web search, calculator, image analysis), memory systems, response validation, and the full AI orchestration layer that is the intelligence of WaxPrep.

The architecture built across these 14 stages does exactly what the Newborn AI philosophy requires: it gives the AI **identity** (WaxID, Stage 12), **memory** (message history, Stage 14), **context** (session structure, Stage 13), **communication** (WhatsApp webhook and outbound, Stages 8–11), **persistence** (PostgreSQL, Stage 3), **reliability** (error handling, Stage 5), **observability** (logging, Stage 4), and **safety** (security, Stage 9) — while leaving every educational decision entirely to the AI.

The infrastructure does not teach. The infrastructure does not know what physics is. The infrastructure does not know whether a student is struggling. The AI knows these things. The infrastructure makes it possible for the AI to know them and act on them reliably, safely, and at scale.

---

*End of WAXPREP Technical Research Document — Stages 1 through 14*
*Research confidence: HIGH across all stages. Specific verification required for: Railway liveness/readiness probe configuration, WhatsApp typing indicator API format in current version (2026), BullMQ v4+ QueueScheduler API, Supavisor vs Railway PostgreSQL comparison.*