# AgentDock P0 Implementation Plan

> **For agentic workers:** Use executing-plans task-by-task, with independent requesting-code-review before integration.

**Goal:** Run Mission Control locally with an authenticated Chinese observation panel over real AgentDock data.

**Architecture:** Read local task files without source writes; keep project mappings and timestamped observations in the Control Plane's SQLite database. Poll in a background collector independently of the browser. Reuse upstream authentication and UI styles; disable scheduler and unrelated mutating APIs in P0 mode.

**Tech Stack:** Next.js 16 / React 19 / TypeScript / better-sqlite3 / pnpm.

**Spec:** docs/control-plane/development-plan.md; approved 2026-10-11 research proposal.

## Global Constraints

- Independent repository and task worktree; no AgentDock Core modifications.
- Bind localhost only. No public endpoint, tunnel, or credential reuse.
- Seven actual source tasks initially; initial five project containers do not imply tasks exist.
- Preserve explicit unknown/offline/partial observations. Do not fabricate Agent identity or dependencies.
- No source write operations. Store mappings and observation history only in the ignored local database.

## Task CP-01

- [ ] Install frozen-lockfile dependencies and run relevant baseline tests.
- [ ] Inspect actual task shape and session capability using read-only access.
- [ ] Write node-environment adapter tests in src/lib/agentdock/*.test.ts: invalid JSON retains previous snapshot; invalid task ID cannot escape root; two projects keep identical-title tasks separate; source bytes remain unchanged; historical observations deduplicate unchanged payloads.
- [ ] Run `pnpm exec vitest run src/lib/agentdock` and observe failure before implementation.
- [ ] Implement reader and collector modules in src/lib/agentdock using `readFile` only on source, parameterized statements for local snapshots, and immutable source IDs.
- [ ] Add viewer-protected GET /api/agentdock and local project/mapping POST endpoints; return source status and observation timestamps.
- [ ] Add src/app/agentdock/page.tsx and focused components under src/components/agentdock; project cards, filtering, selected-task steps and history, manual local mapping, source status banner.
- [ ] Add scripts/control-plane/start.ps1 with loopback server, polling worker, ignored logs/PIDs and idempotent restart behavior.
- [ ] Run adapter tests, typecheck, production build, live HTTP authentication checks and browser verification.
- [ ] Request independent review, fix required findings, commit task branch, merge main, rerun tests and live checks, then mark DONE.

## Interface Contract

GET /api/agentdock returns `{source, projects, tasks, history}` where source includes transport, observedAt, status, warnings; tasks retain source ID and project binding provenance. POST /api/agentdock/projects and /bindings affect only local metadata. A task's own steps are an observed hierarchy, not inferred dependencies.

## Evidence

Record commands and results in docs/control-plane/status.md. Source task file hashes before/after must match. Browser must show actual task titles and source status, authenticated; unauthenticated API must return 401. No data returned as online proof merely because files can be read.
