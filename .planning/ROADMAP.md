# Roadmap: Team Health Dashboard — Milestone 2

## Overview

This milestone adds durability, transparency, and ease of setup to an existing working dashboard. Starting with code quality cleanup from the prior PR review cycle, then building a persistence foundation that unlocks historical trending, then surfacing scoring controls and onboarding for new users, and finally closing out OAuth-based authentication as the most complex and scope-uncertain feature.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Code Quality** - Resolve six PR #3 follow-ups to leave the codebase clean before adding new features (completed 2026-03-25)
- [ ] **Phase 1.1: Code Review Fixes** - Fix all critical/high/medium issues from full-repo code review (INSERTED)
- [ ] **Phase 2: Persistence & Resilience** - Add SQLite snapshot storage, historical trend charts, caching improvements, and rate-limit resilience
- [ ] **Phase 3: Scoring Transparency & Onboarding** - Surface per-signal score breakdowns, customizable weights, and a first-run setup wizard
- [x] **Phase 4: OAuth & Slack Verification** - Add OAuth auth flows for all three integrations and verify Slack with a live workspace (completed 2026-04-18; live-workspace verification deferred to Backlog 999.4)
- [x] **Phase 5: Shared Data Layer** - Extract GitHub/Linear data fetching and SQLite storage into a reusable npm package for cross-project data sharing (completed 2026-04-07)

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
**Plans:** 2/2 plans complete
Plans:
- [x] 01-01-PLAN.md — Consolidate extractJSON/normalizeQuotes into claude.ts, update tests
- [x] 01-02-PLAN.md — Fix force-refresh, add TTL checks, add hasImport flag

### Phase 01.1: Code Review Fixes (INSERTED)

**Goal:** Fix all critical, high, and medium issues from the full-repo code review — SSRF in OLLAMA_BASE_URL, scoring median bug, Slack avgResponse operator precedence, cycle time trend grouping by merge week, Linear cache key mismatch, parseInt NaN validation, Linear null team guard, Slack users.list pagination, DORA parallel fetch, hydration mismatch, modal focus traps, keyboard accessibility for clickable elements, setTimeout cleanup, aria-label gaps, and AbortController in useApiData
**Requirements**: CR-01 through CR-15
**Depends on:** Phase 1
**Plans:** 3/3 plans complete

Plans:
- [x] 01.1-01-PLAN.md — Security and input validation (SSRF, parseInt NaN, Linear null team)
- [x] 01.1-02-PLAN.md — Logic and data bugs (median, Slack precedence, cycle time, cache key, pagination, DORA)
- [x] 01.1-03-PLAN.md — Frontend quality (AbortController, setTimeout cleanup, hydration, focus traps, keyboard a11y, aria-labels)

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
**Plans:** 4/4 plans complete
**UI hint**: yes

Plans:
- [x] 02-01-PLAN.md — SQLite foundation, snapshot writing, shared types/errors
- [x] 02-02-PLAN.md — SWR cache upgrade and configurable TTLs via Settings UI
- [x] 02-03-PLAN.md — Trends API route and health score trend chart
- [x] 02-04-PLAN.md — Rate-limit detection, stale data propagation, and per-section banners

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
**Plans:** 3/3 plans complete
**UI hint**: yes

Plans:
- [x] 03-01-PLAN.md — Scoring weights engine, config persistence, and breakdown UI enhancements
- [x] 03-02-PLAN.md — Onboarding components (WelcomeHero, SetupBanner, useConfigStatus, SettingsModal initialSection)
- [x] 03-03-PLAN.md — WeightSliders with live preview, rich empty states, and end-to-end verification

### Phase 03.3: Scope Churn Health Signal & AI Integration (INSERTED)

**Goal:** Score sprint discipline as a Linear health signal (0-4 pts, cycles mode only). Churn = (added + removed) / sprintSize with thresholds at 10%/20%/30%. Pass scope change data to AI prompt builders for health summary + weekly narrative commentary on sprint discipline. maxPoints = 0 in weekly mode (excluded from denominator). Churn measures total movement, not net.
**Requirements**: CHURN-01, CHURN-02, CHURN-03, CHURN-04, CHURN-05, CHURN-06
**Depends on:** Phase 3.2
**Plans:** 2/2 plans complete

Plans:
- [x] 03.3-01-PLAN.md — Scope churn scoring signal #7 in scoreLinear() with TDD test coverage
- [x] 03.3-02-PLAN.md — AI prompt integration (rich, compact, and narrative framing guidance)

### Phase 03.4: Scope Change Carry-Over Classification (INSERTED)

**Goal:** Classify scope changes as carry-over (from previous cycle, within +-12h of cycle start) vs true mid-sprint additions. Show carry-overs as a separate group in the UI. Exclude carry-overs from churn scoring so the health signal reflects actual sprint discipline, not inherited backlog.
**Requirements**: CHURN-07, CHURN-08, CHURN-09, CHURN-10
**Depends on:** Phase 03.3
**Plans:** 2/2 plans complete

Plans:
- [x] 03.4-01-PLAN.md — Types, carry-over detection, scoring updates (churn exclusion + new carry-over signal), tests
- [x] 03.4-02-PLAN.md — ScopeChangesCard two-section UI, MetricCard mid-sprint display, AI prompt carry-over sections

### Phase 3.1: Backlog Fixes — Radix Dialog + Linear Cache Keys (INSERTED)

**Goal:** Replace hand-rolled modal focus management with Radix Dialog for real focus trapping (GitHub #7), and normalize Linear cache key mode from `"cycles"` to `"auto"` in ai-prompt/ai-response routes to share cache entries with health-summary/weekly-narrative (GitHub #8).
**Depends on:** Phase 3
**Plans:** 1/1 (inline)

Plans:
- [x] Inline — Replace focus management in SettingsModal and ManualAIResponseModal with @radix-ui/react-dialog; change mode: "cycles" -> "auto" in ai-prompt and ai-response routes

### Phase 3.2: Sprint Scope Change Tracking (INSERTED)

**Goal:** Track and visualize sprint scope changes in the Linear section — issues added mid-sprint, issues removed, and who made each change. Opportunistically snapshot upcoming sprints before they start so removal tracking has a full baseline from day 1.
**Depends on:** Phase 3.1
**Requirements:** SCOPE-01, SCOPE-02, SCOPE-03, SCOPE-04, SCOPE-05, SCOPE-06
**Success Criteria** (what must be TRUE):
  1. A "Scope Changes" card in the Linear section shows issues added after the sprint started, with who added them and when
  2. Issues removed from the sprint are detected (via snapshot diffing) with who removed them, when, and where they went (another cycle or backlog)
  3. Cycle issue lists are snapshotted in SQLite on each fetch — current, previous, and next cycles
  4. Next-sprint snapshots are captured opportunistically before the sprint starts, providing a true day-1 baseline
  5. When the dashboard is first opened mid-sprint without a prior snapshot, the UI indicates that earlier removals may not be tracked and shows `issueCountHistory` data to hint at untracked scope changes
  6. Click-to-expand on any scope change shows detail: who, when, and destination
**Plans:** 2/2 plans complete

Plans:
- [x] 03.2-01-PLAN.md — Types, SQLite cycle snapshots, Linear IssueHistory fetch, scope change computation
- [x] 03.2-02-PLAN.md — ScopeChangesCard component, MetricCard integration, LinearSection wiring

### Phase 4: OAuth & Slack Verification
**Goal**: Users can connect integrations via OAuth instead of manually managing API keys, and the Slack integration is confirmed working with a real workspace
**Depends on**: Phase 5
**Requirements**: INTG-01, INTG-02, INTG-03, INTG-04, INTG-05, INTG-06
**Success Criteria** (what must be TRUE):
  1. User can click "Connect via GitHub" in Settings (or the onboarding wizard) and complete OAuth without touching a PAT
  2. User can click "Connect via Linear" and "Connect via Slack" and complete OAuth for each
  3. OAuth tokens refresh automatically — user does not need to reconnect after token expiry
  4. Existing env var and `.config.local.json` auth paths continue to work unchanged alongside OAuth
  5. Slack integration returns real data from a verified live workspace with no errors
**Plans:** 4/4 plans complete

Plans:
- [x] 04-01-PLAN.md — OAuth backend foundation (encryption, DB, Arctic providers, triple-layer config)
- [x] 04-02-PLAN.md — OAuth login and callback routes for GitHub, Linear, and Slack
- [x] 04-03-PLAN.md — Settings UI OAuth connected/disconnected states and WelcomeHero OAuth flow
- [x] 04-04-PLAN.md — Slack smoke tests, setup guide, README/ARCHITECTURE docs, PR (live-workspace verification deferred to Backlog 999.4)

### Phase 5: Shared Data Layer
**Goal**: GitHub and Linear data fetching + SQLite storage are extracted into a reusable npm package (team-data-core) that this project and other repos can depend on, with shared tables for common data (PRs, reviews, deployments, issues, cycles, teams) and per-app tables for application-specific data (health_snapshots, cycle_snapshots)
**Depends on**: Phase 03.4
**Requirements**: SDL-01, SDL-02, SDL-03, SDL-04, SDL-05, SDL-06, SDL-07, SDL-08
**Success Criteria** (what must be TRUE):
  1. A separate npm package (team-data-core) exists in its own git repo with GitHub, Linear, and DORA fetch/store/query functions
  2. Multiple projects can depend on the package and share the same fetched data without redundant API calls
  3. Shared DB at configurable path (default ~/.local/share/team-data/data.db) with WAL mode for concurrent access
  4. Per-app data (health_snapshots, cycle_snapshots) lives in app-specific DB, separate from shared DB
  5. This dashboard continues to work after the refactor, using the shared package for GitHub and DORA data
  6. ai-org-copilot reads from the shared DB via package query functions with updated column mappings
  7. Integration guide exists for future consumers
**Plans:** 5/5 plans complete

Plans:
- [x] 05-01-PLAN.md — Package foundation: repo init, types, DB singleton, schema, tsup build
- [x] 05-02-PLAN.md — GitHub fetch/store/query module + tests
- [x] 05-03-PLAN.md — Linear + DORA fetch/store/query modules + tests
- [x] 05-04-PLAN.md — Refactor team-health-dashboard to consume package (GitHub + DORA paths)
- [x] 05-05-PLAN.md — Wire ai-org-copilot, integration guide, end-to-end verification

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 1.1 -> 2 -> 3 -> 3.1 -> 3.2 -> 3.3 -> 03.4 -> 5 -> 4

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Code Quality | 2/2 | Complete   | 2026-03-25 |
| 1.1 Code Review Fixes (INSERTED) | 3/3 | Complete | 2026-03-27 |
| 2. Persistence & Resilience | 4/4 | Complete |  2026-03-29 |
| 3. Scoring Transparency & Onboarding | 3/3 | Complete | 2026-04-03 |
| 3.1 Backlog Fixes (INSERTED) | 1/1 | Complete | 2026-04-03 |
| 3.2 Sprint Scope Tracking (INSERTED) | 2/2 | Complete |  |
| 3.3 Scope Churn & AI (INSERTED) | 2/2 | Complete   | 2026-04-04 |
| 03.4 Carry-Over Classification (INSERTED) | 2/2 | Complete    | 2026-04-06 |
| 5. Shared Data Layer | 5/5 | Complete   | 2026-04-07 |
| 4. OAuth & Slack Verification | 4/4 | Complete | 2026-04-18 |

## Backlog

### Phase 999.4: Manual Slack live-workspace verification (deferred from Phase 04)

**Goal:** Perform the end-to-end live verification of Slack integration that was deferred during Phase 04 execution — connect a real Slack workspace via OAuth, confirm `fetchSlackMetrics` returns real data, exercise the `teamMemberFilter` roster scoping in a real workspace, and confirm `SlackSection` renders channel activity / response times / overload indicators correctly.

**Why deferred:** Phase 04-04 was executed autonomously (per user direction); smoke tests and docs shipped, but live-workspace confirmation requires user's Slack app + real channel IDs.

**Prerequisites (already shipped):**
- OAuth login/callback routes (04-02)
- SettingsModal OAuth UI + `teamMemberFilter` field (04-03)
- Smoke tests in `src/lib/slack.test.ts` (04-04)
- `docs/slack-setup.md` step-by-step guide (04-04)

**Success criteria:**
- Slack OAuth connect → token stored → `fetchSlackMetrics` returns non-empty metrics
- `teamMemberFilter` (set via Settings UI) correctly scopes response-time + overload calculations
- No console errors, no "not configured" fallback triggered
- `SlackSection` renders all three cards with non-zero live data

### Phase 6: Integration test app for team-data-core

**Goal:** [To be planned]
**Requirements**: TBD
**Depends on:** Phase 5
**Plans:** 0 plans

Plans:
- [ ] TBD (run /gsd:plan-phase 6 to break down)
