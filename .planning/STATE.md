---
gsd_state_version: 1.0
milestone: v1.0
milestone_name: milestone
status: Phase complete — ready for verification
stopped_at: "Checkpoint: Task 2 awaiting user verification of both apps with shared data layer"
last_updated: "2026-04-07T02:03:55.183Z"
progress:
  total_phases: 10
  completed_phases: 8
  total_plans: 23
  completed_plans: 23
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-03-24)

**Core value:** Give engineering leaders a single view of team health — one score, backed by real data — so problems surface before they become crises.
**Current focus:** Phase 05 — shared-data-layer

## Current Position

Phase: 05 (shared-data-layer) — EXECUTING
Plan: 5 of 5

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: —
- Total execution time: —

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
| Phase 01 P02 | 2min | 2 tasks | 2 files |
| Phase 01 P01 | 2min | 2 tasks | 3 files |
| Phase 01.1 P01 | 5min | 2 tasks | 4 files |
| Phase 01.1 P02 | 2min | 2 tasks | 5 files |
| Phase 01.1 P03 | 25min | 2 tasks | 12 files |
| Phase 02 P01 | 2min | 2 tasks | 5 files |
| Phase 02 P02 | 3min | 2 tasks | 4 files |
| Phase 02 P03 | 5min | 2 tasks | 3 files |
| Phase 02 P04 | 7min | 3 tasks | 13 files |
| Phase 03 P01 | 5 | 2 tasks | 9 files |
| Phase 03 P02 | 10min | 2 tasks | 5 files |
| Phase 03 P03 | 15min | 2 tasks | 7 files |
| Phase 03.2-sprint-scope-tracking P01 | 4min | 2 tasks | 3 files |
| Phase 03.3-scope-churn-health-signal-ai-integration P02 | 5min | 2 tasks | 1 files |
| Phase 03.3-scope-churn-health-signal-ai-integration P01 | 2min | 2 tasks | 2 files |
| Phase 03.4-scope-change-carryover-classification P01 | 3min | 1 tasks | 4 files |
| Phase 03.4-scope-change-carryover-classification P02 | 5min | 2 tasks | 3 files |
| Phase 05-shared-data-layer P01 | 2 | 2 tasks | 10 files |
| Phase 05-shared-data-layer P02 | 5 | 2 tasks | 6 files |
| Phase 05-shared-data-layer P03 | 5 | 2 tasks | 7 files |
| Phase 05-shared-data-layer P04 | 25 | 2 tasks | 5 files |
| Phase 05 P05 | 25 | 1 tasks | 8 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Roadmap: QUAL-* go first per explicit user request; OAuth deferred to Phase 4 pending scope audit
- Roadmap: SCOR-03 (score breakdown) grouped with SCOR-01/02 in Phase 3 — it surfaces existing data, no new persistence needed
- Research: SQLite (better-sqlite3, WAL mode, singleton) is the correct persistence approach; no ORM
- [Phase 01]: TTL enforcement at read time rather than relying solely on 2x cleanup timer
- [Phase 01]: extractJSON now calls normalizeQuotes internally, giving all LLM response parsing smart quote normalization
- [Phase 01.1]: validateOllamaUrl rejects non-HTTP schemes only — no localhost/private IP restrictions (remote Ollama is legitimate)
- [Phase 01.1]: Linear null team falls back to buildContinuousMetrics, matching mode=weekly behavior
- [Phase 01.1]: CR-09: DORA incident fetch starts in parallel with deployment source waterfall; waterfall itself stays sequential by design
- [Phase 01.1]: Slack avgResponse returns 0 (not 1) when no non-zero response time entries exist
- [Phase 01.1]: FocusTrap wraps inner modal div with escapeDeactivates:false so existing Escape handlers remain in control
- [Phase 01.1]: suppressHydrationWarning narrowed from outer div to specific theme-toggle button element
- [Phase 02]: better-sqlite3 with WAL mode + busy_timeout=5000; singleton on globalThis.__db; writes wrapped in try/catch to never break health-summary response
- [Phase 02]: SWR serves stale immediately on expiry, revalidates in background via pendingBackgroundFetches dedup set
- [Phase 02]: getTTL reads CACHE_TTL_* from dual-config system (env vars take precedence over .config.local.json)
- [Phase 02]: XAxis tickFormatter uses arrow function without explicit TypeScript param type (Recharts constraint)
- [Phase 02]: Inline amber banners overlay stale data rather than replacing sections; full-page RateLimitState only when no cached data available
- [Phase 02]: RateLimitError from errors.ts replaces legacy GitHubRateLimitError/asRateLimitError pattern in all routes
- [Phase 03]: ScoreWeights multiplier applied to aggregation only, not raw deduction values — preserves correct per-signal display while affecting final score
- [Phase 03]: Score breakdown moved below HealthTrendChart to improve reading flow: score → trend → breakdown details
- [Phase 03]: useConfigStatus derives allUnconfigured (null=loading, true=all unconfigured, false=partial) to prevent layout flash during config fetch
- [Phase 03]: SetupBanner uses lazy useState initializer for localStorage reads to avoid SSR/hydration mismatch
- [Phase 03]: Section IDs placed on inner div inside Card for not-configured Treatment A state — Card component does not accept id prop
- [Phase 03]: DORASection Treatment B refactored from early-return to inline conditional — keeps header/controls visible per UX spec
- [Phase 03.2-sprint-scope-tracking]: Single-pass batch in fetchScopeChanges tracks issueId via batch index since IssueHistory entries have no issueId field
- [Phase 03.2-sprint-scope-tracking]: buildCycleMetrics made async to await fetchScopeChanges; silent snapshot writes for non-current cycles capture next-sprint baselines (D-15)
- [Phase 03.2-sprint-scope-tracking]: API route (linear/route.ts) required no changes — it already passes full LinearMetrics object which includes scopeChanges from Plan 01
- [Phase 03.2-sprint-scope-tracking]: MetricCard grid updated from sm:grid-cols-4 to sm:grid-cols-5 to accommodate 5th Scope Change card
- [Phase 03.3]: formatLinearRich() is the single insertion point for rich scope churn data — all four callers automatically receive it without changes to route files
- [Phase 03.3]: maxPoints=0 for weekly mode, null scopeChanges, empty sprint — follows DORA null-exclusion pattern
- [Phase 03.3]: issueCountNow used as churn denominator (not issueCountAtStart) — never null on cold start
- [Phase 03.4-scope-change-carryover-classification]: Carry-over detection uses fromCycleId + 12h window for history changes; window-only for snapshot changes; past cycles get carryOvers=0
- [Phase 03.4-scope-change-carryover-classification]: Carry-over signal maxPoints=0 in continuous mode, null scopeChanges, or empty sprint — follows DORA null-exclusion pattern
- [Phase 03.4-scope-change-carryover-classification]: ScopeChangesCard uses two independent collapsible sections: carry-overs collapsed by default (muted), mid-sprint expanded — de-emphasizes inherited backlog
- [Phase 03.4-scope-change-carryover-classification]: MetricCard shows midSprintAdded - midSprintRemoved net; trendLabel appends '(+N carried)' only when carryOvers > 0
- [Phase 05-shared-data-layer]: tsup outExtension used to produce .js (ESM) and .cjs (CJS) — default naming mismatched package.json exports
- [Phase 05-shared-data-layer]: All 6 shared tables in single initSchema call; no app-specific tables (cycle_snapshots, health_snapshots) in shared DB
- [Phase 05-shared-data-layer]: DB singleton on globalThis.__teamDataDb with TEAM_DATA_DB env var override; consistent with Phase 2 pattern
- [Phase 05-shared-data-layer]: additions/deletions default to 0 in fetchAndStorePRs — paginated list API does not include these fields; stored as 0 for future enrichment
- [Phase 05-shared-data-layer]: readReviewsForRepo uses JOIN query against pull_requests to filter by owner+repo — avoids denormalizing repo onto review rows
- [Phase 05-shared-data-layer]: Extracted IssueQueryResult interface from inline generic to resolve TS7022 implicit any in while-loop
- [Phase 05-shared-data-layer]: Deployment IDs prefixed with owner/repo#source-type for cross-repo uniqueness in shared deployments table
- [Phase 05-shared-data-layer]: caused_incident defaults to 0 in package; incident correlation stays in app-layer DORA logic
- [Phase 05-shared-data-layer]: serverExternalPackages is top-level in Next.js 16 (not under experimental); Turbopack rejects symlinks for packages outside project root — dist must be copied into node_modules directly
- [Phase 05-shared-data-layer]: requested_reviewers not in StoredPR schema; pendingPRs empty in refactored github.ts — review bottleneck pending bars show 0; follow-up: add requested_reviewers column to shared pull_requests table
- [Phase 05]: readSharedGitHubData/readSharedLinearData signatures changed from (dbPath) to (repos[], dbPath) for explicit filtering; route callers pass [] to read all repos
- [Phase 05]: Team.repos set to [] in mapStoredTeamToTeam — repo mapping is app-specific, not in shared schema

### Pending Todos

None yet.

### Roadmap Evolution

- Phase 5 added: Shared Data Layer — extract GitHub/Linear fetching + SQLite into reusable npm package for cross-project sharing
- Phase 01.1 inserted after Phase 1: Code Review Fixes (URGENT) — fix 15 issues from full-repo code review (SSRF, scoring bugs, accessibility, cache mismatches)
- Phase 03.3 inserted after Phase 3: Scope Churn Health Signal & AI Integration — promoted from backlog 999.3
- Phase 03.4 inserted after Phase 03.3: Scope Change Carry-Over Classification (URGENT) — distinguish cycle carry-overs from true mid-sprint scope creep, exclude from churn scoring
- Phase 6 added: Integration test app for team-data-core — minimal app to exercise full fetch-store-query cycle end-to-end

### Blockers/Concerns

- Phase 4 (OAuth): Requires GitHub/Linear/Slack scope audit (PAT vs OAuth token capabilities) before implementation. Do not start Phase 4 until scope matrix is documented.
- Phase 2: SQLite write concurrency must use WAL mode + singleton on `globalThis` — see research/SUMMARY.md pitfall #1.

### Quick Tasks Completed

| # | Description | Date | Commit | Directory |
|---|-------------|------|--------|-----------|
| 260406-nzr | Fix 4 code review issues from PR #13 | 2026-04-07 | fce357d | [260406-nzr-fix-4-code-review-issues-from-pr-13](./quick/260406-nzr-fix-4-code-review-issues-from-pr-13/) |

## Session Continuity

Last session: 2026-04-07T02:03:55.180Z
Stopped at: Checkpoint: Task 2 awaiting user verification of both apps with shared data layer
Resume file: None
