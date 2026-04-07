---
phase: "05-shared-data-layer"
plan: "03"
subsystem: "team-data-core"
tags: ["linear", "graphql", "deployments", "octokit", "sqlite", "fetch-store-query", "shared-package"]
dependency_graph:
  requires: ["05-01", "05-02"]
  provides: ["Linear fetch/store/query module (fetchAndStoreLinearIssues, fetchAndStoreLinearCycles, upsertLinearIssues, upsertLinearCycles, upsertLinearTeam, readLinearIssues, readLinearCycles, readLinearTeams)", "Deployment fetch/store/query module (fetchAndStoreDeployments, upsertDeployments, readDeployments)"]
  affects: []
tech_stack:
  added: []
  patterns: ["cursor-based GraphQL pagination", "deployment source auto-detection waterfall (deployments -> releases -> merges)", "explicit TypeScript interface for while-loop query result to avoid TS7022 implicit any"]
key_files:
  created:
    - "/Users/jmeltzer/git/team-data-core/src/linear/fetch.ts"
    - "/Users/jmeltzer/git/team-data-core/src/linear/store.ts"
    - "/Users/jmeltzer/git/team-data-core/src/linear/query.ts"
    - "/Users/jmeltzer/git/team-data-core/src/linear/index.ts"
    - "/Users/jmeltzer/git/team-data-core/src/github/deployments.ts"
    - "/Users/jmeltzer/git/team-data-core/tests/linear.test.ts"
    - "/Users/jmeltzer/git/team-data-core/tests/deployments.test.ts"
  modified:
    - "/Users/jmeltzer/git/team-data-core/src/github/index.ts"
    - "/Users/jmeltzer/git/team-data-core/src/index.ts"
decisions:
  - "Extracted IssueQueryResult interface from inline generic type parameter — TypeScript TS7022 error occurs when a while-loop variable references a generic type in its own initializer; naming the interface separately resolves ambiguity"
  - "Deployment IDs prefixed with owner/repo and source type (e.g., myorg/myrepo#deploy-123) to ensure cross-repo uniqueness in the shared deployments table"
  - "fetchAndStoreDeployments keeps source auto-detection waterfall sequential by design — same rationale as dora.ts (must check each source before falling back)"
  - "caused_incident defaults to 0 in the package; correlating incidents to deployments is app-specific DORA logic that stays in team-health-dashboard"
metrics:
  duration_minutes: 5
  completed_date: "2026-04-07"
  tasks_completed: 2
  files_created: 7
---

# Phase 05 Plan 03: Linear Module + Deployment Module Summary

**One-liner:** Linear GraphQL fetch/store/query with cursor pagination and deployment auto-detection waterfall — credentials as parameters, 22 tests all passing, package feature-complete.

## What Was Built

The `src/linear/` module and `src/github/deployments.ts` complete the data access layer in `team-data-core`. The package now covers all three data sources (GitHub PRs, Linear, DORA/deployments).

### Files Created

```
team-data-core/
├── src/linear/
│   ├── fetch.ts      # fetchAndStoreLinearIssues (cursor pagination), fetchAndStoreLinearCycles (+ team upsert)
│   ├── store.ts      # upsertLinearIssues, upsertLinearCycles, upsertLinearTeam (batch INSERT OR REPLACE)
│   ├── query.ts      # readLinearIssues (team/lookback/stateType filters), readLinearCycles, readLinearTeams
│   └── index.ts      # barrel re-exports
├── src/github/
│   └── deployments.ts  # fetchAndStoreDeployments (auto-detection), upsertDeployments, readDeployments
└── tests/
    ├── linear.test.ts        # 6 tests
    └── deployments.test.ts   # 4 tests
```

### Linear Module

**`fetchAndStoreLinearIssues(apiKey, teamId, options)`**
- Cursor-based pagination via `issues(first: 100, after: $cursor, filter: { team, updatedAt: gte $since })`
- Maps GraphQL response fields to `StoredLinearIssue` (snake_case columns)
- `apiKey` passed as first parameter (not read from env/config)
- Returns `{ issueCount }`

**`fetchAndStoreLinearCycles(apiKey, teamId, options)`**
- Queries `team(id: $teamId) { id name key cycles { nodes { ... } } }`
- Upserts the team record alongside cycles (via `upsertLinearTeam`)
- Filters cycles by `endsAt >= since`
- Returns `{ cycleCount }`

**`readLinearIssues(teamId, options)`** — filters by `team_id`, optional `lookbackDays` on `updated_at`, optional `stateType`

**`readLinearCycles(teamId, options)`** — filters by `team_id`, optional `lookbackDays` on `ends_at`

**`readLinearTeams(dbPath?)`** — returns all teams ordered by name

### Deployment Module

**`fetchAndStoreDeployments(token, owner, repo, options)`**
- Source auto-detection waterfall: `deployments API → releases → merged PRs`
- `caused_incident` defaults to 0; app-layer DORA logic handles incident correlation
- Deployment IDs prefixed with `owner/repo#source-id` for cross-repo uniqueness

**`readDeployments(owner, repo, options)`** — filters by `owner`, `repo`, optional `lookbackDays` on `created_at`, optional `environment`

## Commits

| Repo | Hash | Message |
|------|------|---------|
| team-data-core | 8c7c8e6 | feat(05-03): implement Linear and deployment fetch/store/query modules |
| team-data-core | 87543fb | test(05-03): add Linear and deployment store/query tests |

## Test Results

```
Test Files  4 passed (4)
     Tests  22 passed (22)
  Duration  277ms
```

Tests cover: db.test.ts (6), github.test.ts (6), linear.test.ts (6), deployments.test.ts (4).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] TypeScript TS7022 implicit any in while-loop generic**
- **Found during:** Task 1 compilation
- **Issue:** TypeScript reported `error TS7022: 'data' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.` when calling `linearQuery<{ issues: { ... } }>()` inside a while loop — TypeScript's type inference breaks for complex generics when the variable is inside a loop body.
- **Fix:** Extracted the inline generic type into a named interface `IssueQueryResult` and used an explicit type annotation: `const page: IssueQueryResult = await linearQuery<IssueQueryResult>(...)`. Also renamed from `data` to `page` to avoid shadowing confusion.
- **Files modified:** `/Users/jmeltzer/git/team-data-core/src/linear/fetch.ts`
- **Commit:** 8c7c8e6

## Known Stubs

None. All stored fields are populated from real API data. `caused_incident` defaults to 0 by design (app-layer incident correlation stays in team-health-dashboard).

## Self-Check: PASSED

- `/Users/jmeltzer/git/team-data-core/src/linear/fetch.ts` — exists, contains `fetchAndStoreLinearIssues`, `apiKey: string` as first param, `linear.app/graphql`
- `/Users/jmeltzer/git/team-data-core/src/linear/store.ts` — exists, contains `INSERT OR REPLACE INTO linear_issues`
- `/Users/jmeltzer/git/team-data-core/src/linear/query.ts` — exists, contains `readLinearIssues`, `readLinearCycles`
- `/Users/jmeltzer/git/team-data-core/src/github/deployments.ts` — exists, contains `fetchAndStoreDeployments`, `token: string` as first param, `readDeployments`
- `/Users/jmeltzer/git/team-data-core/src/index.ts` — contains `fetchAndStoreLinearIssues`, `fetchAndStoreDeployments`
- `npx tsc --noEmit` — exits 0
- `npm test` — 22 tests pass (4 test files)
- `npm run build` — ESM + CJS + DTS all succeed
