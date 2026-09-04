# Contributing to WaxPrep

Thank you for your interest in contributing to WaxPrep! This document outlines the contribution process and coding standards.

## Code of Conduct

WaxPrep is committed to creating a welcoming and inclusive environment. We treat all contributors with respect and expect the same in return.

## How to Contribute

### 1. Understand the Project

Before making any changes, read:

1. [`WAXPREP_PHILOSOPHY.md`](./WAXPREP_PHILOSOPHY.md) - The founding architecture
2. [`AGENTS.md`](./AGENTS.md) - Agent governance
3. [`WAXPREP_TODO.md`](./WAXPREP_TODO.md) - Current research and priorities

### 2. Branch Structure

- **main**: Production-ready, always deployable
- **dev**: Active development accumulation point
- **feature/***: Feature branches from dev (e.g., `feature/stage-1-2-3-4`)
- **hotfix/***: Hotfix branches from main (e.g., `hotfix/webhook-fix`)

### 3. Git Safety

WaxPrep has suffered branch damage in the past. Follow these rules:

- **Never work directly on main** - always create a feature branch
- **Never force-push** to shared branches without explicit authorization
- **Never delete or rename branches** without asking
- **Always create a pull request** before merging, even as a solo developer
- **Record the starting commit SHA** before making large changes

### 4. Making Changes

1. Create a feature branch from `dev`:
   ```bash
   git checkout dev
   git checkout -b feature/your-feature-name
   ```

2. Make your changes in small, logical commits.

3. Test your changes thoroughly.

4. Review your own diff before submitting.

5. Create a pull request to `dev`.

6. Request review from the founder before merging.

### 5. Code Standards

- Use **ESLint** for code style
- Write **JSDoc** comments for all public functions
- Follow the **AI-first principle** - don't hardcode educational logic
- Use **configuration** for all runtime behavior
- Write **tests** for meaningful functionality
- Keep commits **small and atomic**

### 6. Documentation

- Update `WAXPREP_TODO.md` with completed work
- Create an ADR in `docs/adr/` for major architectural decisions
- Document new environment variables in `.env.example`

### 7. Testing

- Write unit tests for deterministic infrastructure
- Write integration tests for subsystem interactions
- Run `pnpm test:ci` before submitting

### 8. Commit Messages

Use conventional commits:

```
feat: add new feature
fix: fix a bug
docs: update documentation
refactor: refactor code (no behavior change)
test: add or update tests
chore: maintenance tasks
```

## What Not to Build

WaxPrep is focused on the core tutoring experience. Do NOT build:

- Dashboards or analytics interfaces
- Payment or billing systems
- Student export/export interfaces
- Complex administrative portals
- Business intelligence features

These are deferred to later stages.

## Questions?

If you're unsure about anything, ask! WaxPrep is a collaborative project, and communication is key.

## Thank You

Your contributions help make WaxPrep better for Nigerian students. Thank you for investing your time and energy in this project!
