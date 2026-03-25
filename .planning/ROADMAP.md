# Roadmap: Team Health Dashboard — Milestone 2

## Overview

This milestone adds durability, transparency, and ease of setup to an existing working dashboard. Starting with code quality cleanup from the prior PR review cycle, then building a persistence foundation that unlocks historical trending, then surfacing scoring controls and onboarding for new users, and finally closing out OAuth-based authentication as the most complex and scope-uncertain feature.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Code Quality** - Resolve six PR #3 follow-ups to leave the codebase clean before adding new features
- [ ] **Phase 2: Persistence & Resilience** - Add SQLite snapshot storage, historical trend charts, caching improvements, and rate-limit resilience
- [ ] **Phase 3: Scoring Transparency & Onboarding** - Surface per-signal score breakdowns, customizable weights, and a first-run setup wizard
- [ ] **Phase 4: OAuth & Slack Verification** - Add OAuth auth flows for all three integrations and verify Slack with a live workspace
- [ ] **Phase 5: Shared Data Layer** - Extract GitHub/Linear data fetching and SQLite storage into a reusable npm package for cross-project data sharing

## Phase Details

### Phase 1: Code Quality
**Goal**: The manual AI mode implementation is internally consistent, tests cover real code paths, and the codebase is ready for new features
**Depends on**: Nothing (first phase)
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04, QUAL-05, QUAL-06
**Success Criteria** (what must be TRUE):
  1. `extractJSON` and `normalizeQuotes` are defined once in `claude.ts` and imported everywhere else — no duplicate implementations exist in the codebase
  2. Force-refresh behavior in `weekly-narrative` works correctly regardless of AI provider mode, with the logic order documented in a comment
  3. Manual mode cache reads enforce TTL at read time — stale entries are not served after navigating away and back
  4. Health summary response includes `hasImport` flag, allowing the client to distinguish "no import yet" from "import returned zero recommendations"
  5. Tests for smart quote normalization and JSON extraction import from `claude.ts` directly rather than reimplementing the functions
**Plans:** 2 plans
Plans:
- [ ] 01-01-PLAN.md — Consolidate extractJSON/normalizeQuotes into claude.ts, update tests
- [x] 01-02-PLAN.md — Fix force-refresh, add TTL checks, add hasImport flag

### Phase 2: Persistence & Resilience
**Goal**: Users can see how their team health score has changed over time, and the dashboard handles API limits gracefully with visible stale-data indicators
**Depends on**: Phase 1
**Requirements**: PERS-01, PERS-02, PERS-03, PERS-04, PERS-05, PERS-06
**Success Criteria** (what must be TRUE):
  1. User can view a health score trend line chart showing score history over a selectable date range (7d / 30d / 90d)
  2. User can view per-signal metric trends (e.g. cycle time over time, stalled issue count over time) alongside the overall score
  3. When the dashboard is rate-limited by GitHub, Linear, or Slack, it shows stale cached data with a visible banner stating the data age and that a rate limit is active
  4. Score snapshots are written to SQLite on fresh (non-cached) fetches, persisting across server restarts
  5. Server-side cache uses stale-while-revalidate with configurable TTL per integration
**Plans**: TBD
**UI hint**: yes

### Phase 3: Scoring Transparency & Onboarding
**Goal**: Users understand why their score is what it is, can tune it to their team's priorities, and new users can configure the dashboard without reading documentation
**Depends on**: Phase 2
**Requirements**: SCOR-01, SCOR-02, SCOR-03, UX-01, UX-02, UX-03
**Success Criteria** (what must be TRUE):
  1. User can see a breakdown of exactly which signals deducted points from the current score and by how much
  2. User can adjust scoring weights per integration (GitHub / Linear / Slack / DORA) and see the score recalculate immediately
  3. Custom weights persist across page reloads and server restarts
  4. First-time user is guided through a step-by-step setup wizard covering each integration — no reading of README required
  5. Sections with no data show informative empty states explaining what would appear and how to enable it
**Plans**: TBD
**UI hint**: yes

### Phase 4: OAuth & Slack Verification
**Goal**: Users can connect integrations via OAuth instead of manually managing API keys, and the Slack integration is confirmed working with a real workspace
**Depends on**: Phase 3
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06
**Success Criteria** (what must be TRUE):
  1. User can click "Connect via GitHub" in Settings (or the onboarding wizard) and complete OAuth without touching a PAT
  2. User can click "Connect via Linear" and "Connect via Slack" and complete OAuth for each
  3. OAuth tokens refresh automatically — user does not need to reconnect after token expiry
  4. Existing env var and `.config.local.json` auth paths continue to work unchanged alongside OAuth
  5. Slack integration returns real data from a verified live workspace with no errors
**Plans**: TBD

### Phase 5: Shared Data Layer
**Goal**: GitHub and Linear data fetching + SQLite storage are extracted into a reusable npm package that this project and other repos can depend on, with shared tables for common data (PRs, commits, issues) and per-app tables for application-specific data
**Depends on**: Phase 4
**Requirements**: TBD
**Success Criteria** (what must be TRUE):
  1. A separate npm package exists that handles GitHub and Linear API fetching and stores results in a local SQLite database
  2. Multiple projects can depend on the package and share the same fetched data without redundant API calls
  3. Apps that need different data granularity (e.g. commit-level vs PR-only) work correctly — apps use only the subset they need
  4. Per-app data that is not shared lives in app-specific tables alongside the shared tables (same DB or separate — TBD)
  5. This dashboard continues to work after the refactor, using the shared package instead of its own fetching/storage code
  6. Apps remain single-command to start after initial `npm install` — no separate database setup, no migration scripts, no background services
  7. **[Manual test — human needed]** All other apps that will consume the shared package are refactored to use it and verified working end-to-end before Phase 5 is considered complete
**Plans**: TBD
**Note**: Implementation requires examining other repos beyond this project. Linear storage in shared DB is TBD — may only be GitHub initially.

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Code Quality | 0/2 | Planning complete | - |
| 2. Persistence & Resilience | 0/? | Not started | - |
| 3. Scoring Transparency & Onboarding | 0/? | Not started | - |
| 4. OAuth & Slack Verification | 0/? | Not started | - |
| 5. Shared Data Layer | 0/? | Not started | - |
