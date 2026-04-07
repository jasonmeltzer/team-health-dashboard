---
phase: "05-shared-data-layer"
plan: "05"
subsystem: "ai-org-copilot + team-data-core"
tags: ["integration", "team-data-core", "shared-data", "sqlite", "ai-org-copilot"]
dependency_graph:
  requires: ["05-01", "05-02", "05-03", "05-04"]
  provides: ["ai-org-copilot consuming team-data-core", "INTEGRATION.md integration guide"]
  affects:
    - "/Users/jmeltzer/git/ai-org-copilot/src/lib/shared-data.ts"
    - "/Users/jmeltzer/git/ai-org-copilot/next.config.ts"
    - "/Users/jmeltzer/git/ai-org-copilot/package.json"
    - "/Users/jmeltzer/git/team-data-core/INTEGRATION.md"
tech_stack:
  added: ["team-data-core (file: dependency in ai-org-copilot)"]
  patterns:
    - "Mock team-data-core (not better-sqlite3) in shared-data tests after refactor"
    - "readSharedGitHubData/readSharedLinearData now accept repos[]/teamIds[] as first arg"
    - "TEAM_DATA_DB env var takes precedence over SHARED_DATA_DB_PATH (legacy alias)"
    - "Force-add .env.example because ai-org-copilot .gitignore has '.env*' pattern"
key_files:
  created:
    - "/Users/jmeltzer/git/ai-org-copilot/.env.example"
    - "/Users/jmeltzer/git/team-data-core/INTEGRATION.md"
  modified:
    - "/Users/jmeltzer/git/ai-org-copilot/package.json"
    - "/Users/jmeltzer/git/ai-org-copilot/next.config.ts"
    - "/Users/jmeltzer/git/ai-org-copilot/src/lib/shared-data.ts"
    - "/Users/jmeltzer/git/ai-org-copilot/src/lib/shared-data.test.ts"
    - "/Users/jmeltzer/git/ai-org-copilot/src/app/api/github/sync/route.ts"
    - "/Users/jmeltzer/git/ai-org-copilot/src/app/api/linear/sync/route.ts"
decisions:
  - "readSharedGitHubData and readSharedLinearData signatures changed from (dbPath) to (repos[], dbPath) — matches plan spec and makes filtering explicit"
  - "Route callers (github/sync, linear/sync) pass [] as repos/teamIds to read all data from shared DB"
  - "shared-data.test.ts rewrites to mock team-data-core instead of better-sqlite3 — old tests mocked internals that no longer exist"
  - ".env.example force-added (-f) because ai-org-copilot .gitignore has '.env*' pattern that catches example files"
  - "Team.repos set to [] in mapStoredTeamToTeam — repo mapping is app-specific, not in shared schema"
  - "Issue type derived from title heuristics in ai-org-copilot mapper — Linear has no built-in type field (same approach as existing linear/sync/route.ts)"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-06"
  tasks_completed: 1
  files_created: 2
  files_modified: 6
---

# Phase 05 Plan 05: ai-org-copilot Consumes team-data-core Summary

**One-liner:** Refactored ai-org-copilot shared-data.ts to delegate DB access to team-data-core typed query functions, eliminating raw better-sqlite3 usage; wrote consumer integration guide.

## What Was Built

### Task 1: ai-org-copilot wired to team-data-core

`ai-org-copilot/src/lib/shared-data.ts` was refactored from raw `better-sqlite3` SQL queries to typed team-data-core query functions.

**Before:**
- Opened `new Database(dbPath, { readonly: true })` directly
- Ran `SELECT * FROM pull_requests`, `SELECT * FROM reviews`, etc.
- Mapped `Record<string, unknown>` rows with manual snake_case/camelCase fallback logic
- `readSharedGitHubData(dbPath)` / `readSharedLinearData(dbPath)` — 1-arg signatures

**After:**
- Imports `readPRs`, `readReviewsForRepo`, `readDeployments`, `readLinearIssues`, `readLinearTeams` from `"team-data-core"`
- Maps `StoredPR`, `StoredReview`, `StoredDeployment`, `StoredLinearIssue`, `StoredLinearTeam` typed structs
- `readSharedGitHubData(repos[], dbPath)` / `readSharedLinearData(teamIds[], dbPath)` — 2-arg signatures
- No direct `better-sqlite3` import or raw SQL in shared-data.ts

**Key mapper implementations:**

- `mapStoredPRToPullRequest`: `id` = `row.id`, `repo` = `"${row.owner}/${row.repo}"`, `team` = `row.team ?? ""`
- `mapStoredReviewToReview`: direct field mapping (no snake/camel fallback needed)
- `mapStoredDeploymentToDeployment`: same owner+repo concatenation pattern
- `mapStoredIssueToIssue`: Linear `state_type` → app status, Linear priority integer → string enum, issue type from title heuristics
- `mapStoredTeamToTeam`: `repos: []` (app-specific mapping not in shared DB)

**Updated callers:**
- `resolveDbPath` now checks `TEAM_DATA_DB` before `SHARED_DATA_DB_PATH`
- `resolveUseSharedData` returns true when `TEAM_DATA_DB` is set
- `github/sync/route.ts` and `linear/sync/route.ts` updated to call 2-arg signatures with `[]`

### Test suite rewritten

`shared-data.test.ts` rewrote from mocking `better-sqlite3` to mocking `team-data-core`:
- 37 tests pass
- New tests cover: multi-repo reads, invalid repo format skip, null team mapping, Linear state/priority mapping

### INTEGRATION.md written

`/Users/jmeltzer/git/team-data-core/INTEGRATION.md` covers:
- Getting Started: install (file dependency + node_modules copy for Turbopack), Next.js config, TEAM_DATA_DB env var
- Fetch path (write): `fetchAndStorePRs`, `fetchAndStoreDeployments`, `fetchAndStoreLinearIssues`, `fetchAndStoreLinearCycles` with code examples
- Read path (query): `readPRs`, `readReviewsForRepo`, `readDeployments`, `readLinearIssues`, `readLinearCycles`, `readLinearTeams` with code examples
- API Reference table for all exported functions
- Schema reference: all 6 tables with column names, types, and descriptions
- Architecture: shared vs app DB, credential handling, Turbopack symlink limitation, `caused_incident` app-managed pattern, DB singleton pattern

## Commits

| Repo | Hash | Message |
|------|------|---------|
| ai-org-copilot | 9568363 | feat(05-05): wire ai-org-copilot to team-data-core shared data layer |
| team-data-core | dcdf503 | docs(05-05): add INTEGRATION.md consumer guide for team-data-core |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Signature change required updates to existing callers and tests**
- **Found during:** Task 1 implementation
- **Issue:** The plan specified changing `readSharedGitHubData(dbPath)` to `readSharedGitHubData(repos[], dbPath)`. This was a breaking change to the existing callers (`github/sync/route.ts`, `linear/sync/route.ts`) and to the test file which mocked the old 1-arg signature.
- **Fix:** Updated both route files to pass `[]` as the repos/teamIds argument. Rewrote shared-data.test.ts to mock `team-data-core` instead of `better-sqlite3` (the internals changed completely).
- **Files modified:** `route.ts` x2, `shared-data.test.ts`
- **Commit:** 9568363

**2. [Rule 2 - Missing] .env.example blocked by .gitignore .env* pattern**
- **Found during:** Task 1 commit
- **Issue:** `ai-org-copilot/.gitignore` has `.env*` which caught `.env.example`. Staging failed.
- **Fix:** Used `git add -f .env.example` to force-add the template file (no secrets in it). This is correct behavior — `.env.example` is typically committed; the broad `.env*` pattern is a gitignore design choice to be overridden for example files.
- **Files modified:** `.env.example`, `.gitignore` unchanged
- **Commit:** 9568363

## Known Stubs

None — all data flows through typed team-data-core query functions. `Team.repos: []` is a documented limitation (app-specific mapping not in shared schema), not a stub.

## Task 2: Checkpoint (Awaiting Human Verification)

Task 2 is a `checkpoint:human-verify` gate. The automated pre-checks are complete:

| Check | Result |
|-------|--------|
| `npx tsc --noEmit` in ai-org-copilot | Exit 1, but only 5 pre-existing errors (db.ts Prisma, decisions/data.ts implicit any, provider-factory.test.ts) — 0 new errors |
| `npx tsc --noEmit` in team-health-dashboard | Exit 1, but only pre-existing errors in carryover-detection.test.ts — 0 new errors |
| 37 shared-data tests | All pass |

User verification of both running apps is required to complete Phase 5.

## Self-Check: PASSED

- `/Users/jmeltzer/git/ai-org-copilot/package.json` — contains `"team-data-core": "file:../team-data-core"`
- `/Users/jmeltzer/git/ai-org-copilot/src/lib/shared-data.ts` — contains `from "team-data-core"`, `readPRs(`, `readLinearIssues(`, does NOT contain `new Database(`
- `/Users/jmeltzer/git/ai-org-copilot/next.config.ts` — contains `serverExternalPackages`, `"team-data-core"`
- `/Users/jmeltzer/git/team-data-core/INTEGRATION.md` — contains `## Getting Started`, `## API Reference`, `## Schema`
- Commits 9568363 (ai-org-copilot), dcdf503 (team-data-core) — both exist
