# WAXPREP TODO

**Status:** Living Document  
**Owner:** Founder / David  
**Repository:** WaxPrep  
**Purpose:** Track current research, implementation tasks, unresolved questions, decisions, and future work.

---

## 1. PURPOSE OF THIS DOCUMENT

This is WaxPrep's living TODO and research workspace.

It is intentionally NOT a fixed development roadmap.

The WaxPrep Blueprint is the primary source for the overall system vision, architecture, principles, and long-term build direction.

This document exists for the practical work that happens while building:

- Things that need to be researched
- Things that need to be implemented
- Things that need to be verified
- Things that need to be tested
- Problems that need to be solved
- Decisions that need to be made
- Questions that are still unanswered
- Findings discovered during development
- Follow-up work created by new discoveries
- Features that are intentionally deferred
- Documentation that needs to be created or updated

The founder decides what should be researched and what should be worked on next.

An AI coding agent MUST NOT invent a development roadmap by treating this document as a fixed sequence.

---

# 2. HOW TO USE THIS DOCUMENT

This document is expected to change constantly.

Tasks may be:

- Added
- Removed
- Reordered
- Split into smaller tasks
- Combined
- Deferred
- Cancelled
- Reopened
- Marked complete

Completing a task does NOT mean the entire area of WaxPrep is permanently finished.

A completed item may later be reopened if new research, testing, architecture changes, or real-world behavior requires it.

Agents must therefore read the CURRENT state of this document rather than assuming that an old task list represents the complete project plan.

---

# 3. CURRENT WORK

Use this section for the work that is actively being considered or performed.

## Active Research

- [ ] Add current research item here.

## Active Implementation

- [ ] Add current implementation item here.

## Active Investigation

- [ ] Add current investigation/problem here.

## Active Decisions

- [ ] Add decision that currently needs to be made here.

---

# 4. RESEARCH WORKSPACE

The founder will decide what to research.

Do not automatically fill this section with generic AI, education, software, or startup research.

When research is requested, record it here.

For each research item, use this structure:

### Research Item

**Question / Topic:**

[Write the exact thing being researched.]

**Why it matters:**

[Explain why this research is relevant to WaxPrep.]

**Research:**

[PASTE OR WRITE RESEARCH RESULTS HERE]

**Important findings:**

- 
- 
- 

**Confirmed facts:**

- 
- 

**Uncertain / needs verification:**

- 
- 

**Possible implications for WaxPrep:**

- 
- 

**Decision required:**

- 

**Decision:**

- 

**Implementation follow-up:**

- [ ] 

---

# 5. RESEARCH STATUS

Research findings should be clearly separated from assumptions.

Use these labels when useful:

### CONFIRMED

Supported by reliable evidence, documentation, testing, or direct verification.

### PROPOSED

A possible approach that has not yet been validated.

### RECONSTRUCTED

An understanding inferred from existing code, documentation, behavior, or previous work.

### VERIFY

Something that may be correct but still requires confirmation.

### REJECTED

An approach that was investigated and intentionally not selected.

Agents must not silently convert a PROPOSED, RECONSTRUCTED, or VERIFY item into an architectural fact.

---

# 6. TODO LIST

## High Priority

- [ ] Add task here.
- [ ] Add task here.
- [ ] Add task here.

## Normal Priority

- [ ] Add task here.
- [ ] Add task here.

## Low Priority

- [ ] Add task here.
- [ ] Add task here.

---

# 7. BUGS / PROBLEMS

Record problems discovered during development.

### Problem

**Description:**

[Describe the problem.]

**Observed behavior:**

[What actually happened.]

**Expected behavior:**

[What should happen.]

**Likely cause:**

[If known.]

**Investigation:**

[What has been checked.]

**Resolution:**

[Leave empty until resolved.]

**Status:**

- [ ] Investigating
- [ ] Fix proposed
- [ ] Fix implemented
- [ ] Tested
- [ ] Closed

---

# 8. ARCHITECTURE QUESTIONS

Use this section for questions that could affect the system design.

Examples:

- Should this responsibility belong to infrastructure or the AI?
- Should this data be persisted?
- Should this operation be deterministic or AI-controlled?
- Should this capability be a tool?
- Where should this state live?
- What should happen when an external provider fails?
- What information does the AI actually need?
- Is this abstraction necessary yet?

### Architecture Question

**Question:**

[Write question.]

**Current understanding:**

[Write current understanding.]

**Research required:**

- [ ] 

**Options considered:**

1. 
2. 
3. 

**Decision:**

[Leave blank until decided.]

**Reason:**

[Why this decision was made.]

---

# 9. IMPLEMENTATION FOLLOW-UPS

Research often creates implementation work.

Record those tasks here rather than losing them inside research notes.

- [ ] 
- [ ] 
- [ ] 

---

# 10. DOCUMENTATION TODO

WaxPrep's system documentation belongs in the `docs/` directory.

When implementation changes the architecture, data model, interfaces, operational behavior, security model, or another meaningful system behavior, documentation should be created or updated.

Track documentation work here.

- [ ] Architecture documentation
- [ ] Data model documentation
- [ ] API/interface documentation
- [ ] AI orchestration documentation
- [ ] Memory documentation
- [ ] Tool documentation
- [ ] Security documentation
- [ ] Deployment/operations documentation
- [ ] Other documentation

Agents should not create documentation merely for the sake of creating files.

Documentation should explain something useful that another developer or agent would otherwise need to rediscover.

---

# 11. CONFIGURATION TODO

WaxPrep follows a configuration-over-code principle.

Configuration that can reasonably change between environments or deployments should not be hardcoded into application logic.

Production configuration belongs in Railway environment variables.

Local development configuration belongs in `.env`.

A non-secret `.env.example` should document required environment variables.

Secrets MUST NOT be committed to Git.

Examples of values that may belong in runtime configuration include:

- Provider selection
- Model selection
- API endpoints
- Timeouts
- Retry limits
- Queue settings
- Debounce windows
- Message limits
- Feature flags
- External service configuration
- Runtime behavior that is expected to change

Permanent architectural invariants do not need to become environment variables simply because they exist in code.

Do not create an unnecessarily large configuration system before it is needed.

The configuration system should grow with the real requirements of WaxPrep.

### Configuration Tasks

- [ ] Establish validated runtime configuration.
- [ ] Keep secrets outside Git.
- [ ] Maintain `.env.example`.
- [ ] Document newly introduced mutable configuration.
- [ ] Ensure Railway contains production configuration.
- [ ] Remove newly introduced hardcoded mutable configuration.

---

# 12. TESTING TODO

Record important testing work here.

- [ ] Unit tests
- [ ] Integration tests
- [ ] End-to-end tests
- [ ] Failure-path tests
- [ ] Queue/retry tests
- [ ] Identity/isolation tests
- [ ] AI output validation tests
- [ ] External-provider failure tests
- [ ] Security tests
- [ ] Regression tests

Testing requirements should be added as the system develops.

---

# 13. SECURITY / PRIVACY TODO

Security and privacy are ongoing responsibilities.

Record unresolved security or privacy work here.

- [ ] 
- [ ] 
- [ ] 

Core security protections required for the system to operate safely must not be postponed merely because broader privacy/compliance product work is deferred.

At the same time, do not invent unnecessary data-management features before they are actually part of the product scope.

---

# 14. DEFERRED WORK

This section is intentionally important.

Something being listed here means:

**DO NOT IMPLEMENT IT NOW.**

It is not necessarily rejected permanently.

The founder decides when deferred work becomes active.

## Explicitly Deferred Product Features

- [ ] Dashboard
- [ ] Student-data dashboard / administrative data UI
- [ ] Student data export functionality
- [ ] Payments
- [ ] Payment processing
- [ ] Cost-flow tracking
- [ ] Cost/spending observability
- [ ] Cost analytics
- [ ] Student-facing Terms & Conditions system

These items belong toward the later part of the overall WaxPrep development journey.

Agents must not introduce them early simply because they are common features in other products.

If a dependency genuinely requires discussion of one of these areas, document the dependency and stop before implementing the deferred feature.

---

# 15. FEATURES THAT SHOULD NOT BE ADDED BY ASSUMPTION

An agent must not add a feature simply because it seems useful, conventional, or common in another AI tutor.

Examples include:

- Dashboards
- Analytics systems
- Payment systems
- Cost tracking
- Student export systems
- Administrative reporting
- Fixed learning paths
- Fixed lesson scripts
- Hardcoded curriculum
- Rigid teaching modes
- Forced learning styles
- Unrequested gamification
- Unrequested notification systems
- Unrequested background learning schedules
- Unrequested multi-agent systems

If a feature is not required by the current task, Blueprint, philosophy, or an explicit founder instruction, do not silently add it.

---

# 16. COMPLETED WORK

Use this section as a lightweight record of completed work.

Do not turn it into a massive changelog.

For significant completed work:

- [x] Task / feature
- [x] Task / feature
- [x] Task / feature

For detailed implementation history, use Git history and appropriate documentation under `docs/`.

---

# 17. REOPENED WORK

Sometimes something previously marked complete needs to be revisited.

Record it here when useful.

### Reopened Item

**Original task:**

[Task]

**Why it was reopened:**

[Reason]

**New information:**

[Information]

**New action:**

- [ ] 

---

# 18. CANCELLED WORK

If a planned task is intentionally abandoned, record it rather than silently deleting the history.

### Cancelled Item

**Task:**

[Task]

**Reason:**

[Why it was cancelled.]

**Replacement, if any:**

[Replacement]

---

# 19. FOUNDER DECISIONS

Important product or architecture decisions can be recorded here when they do not belong in a dedicated technical document.

### Decision

**Date:**

[YYYY-MM-DD]

**Decision:**

[Decision]

**Reason:**

[Reason]

**Impact:**

[Impact]

**Status:**

- [ ] Active
- [ ] Superseded

When a decision materially changes the architecture, create or update the appropriate documentation under `docs/`.

---

# 20. AGENT HANDOFF NOTES

Use this section when an agent needs to leave useful context for the next agent.

### Current State

[What is currently true.]

### Work Completed

[What was completed.]

### Work Remaining

[What remains.]

### Known Problems

[Known problems.]

### Important Decisions

[Decisions the next agent must know.]

### Next Suggested Action

[Only a suggestion. The founder remains the authority on what happens next.]

---

# 21. SCOPE GUARDRAIL

WaxPrep is being built incrementally.

The existence of this TODO document does not authorize an agent to expand the project.

The current scope is determined by:

1. Explicit founder instructions
2. `WAXPREP_PHILOSOPHY.md`
3. The WaxPrep Blueprint
4. Current, explicitly authorized work in this document
5. Existing architecture and documentation

An agent must not treat generic best practices as permission to add unrelated systems.

In particular, the following remain explicitly outside the current build scope unless the founder changes that decision:

- Dashboard
- Student-data dashboard/UI
- Student data export
- Payments
- Cost-flow tracking
- Cost observability
- Cost analytics
- Student-facing Terms & Conditions system

These are intentionally deferred and should remain near the end of the project's practical backlog.

---

# 22. IMPORTANT RULE

This document is a living workspace, not a contract with the past.

The founder may change the order, remove tasks, add tasks, replace approaches, or completely change direction.

Agents must follow the current instruction rather than attempting to preserve an outdated TODO structure.

When there is uncertainty:

**Stop. Explain the uncertainty. Ask the founder.**

Do not guess.
Do not silently expand scope.
Do not silently remove work.
Do not silently change architecture.
Do not treat an old TODO item as permanent.

---

# 23. CURRENT NEXT ACTION

**Founder decides what goes here.**

- [ ] 

---

# END OF WAXPREP TODO