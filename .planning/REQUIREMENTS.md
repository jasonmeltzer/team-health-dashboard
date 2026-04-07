# Requirements: Team Health Dashboard

**Defined:** 2026-03-24
**Core Value:** Give engineering leaders a single view of team health — one score, backed by real data — so problems surface before they become crises.

## v1 Requirements

### Code Quality (PR #3 Follow-ups)

- [x] **QUAL-01**: extractJSON and normalizeQuotes are exported from claude.ts and imported (not duplicated) in ai-response/route.ts
- [x] **QUAL-02**: Force refresh parameter is parsed before the manual mode early return in weekly-narrative/route.ts, with explicit comment on behavior
- [x] **QUAL-03**: Manual mode cache reads check TTL instead of relying on 2x TTL cleanup timer
- [x] **QUAL-04**: Health summary response includes hasImport flag to distinguish "no import yet" from "imported with zero recommendations"
- [x] **QUAL-05**: Client-side cache does not serve stale manual mode stub after import and navigate-away/back
- [x] **QUAL-06**: Tests import real extractJSON/normalizeQuotes from claude.ts instead of reimplementing them

### Persistence & Data

- [x] **PERS-01**: Dashboard persists health score snapshots to SQLite on each fetch (not from cache hits)
- [x] **PERS-02**: User can view health score trend over time (line chart, configurable date range)
- [x] **PERS-03**: User can view per-signal metric trends over time
- [x] **PERS-04**: Server-side cache uses stale-while-revalidate with configurable TTL per integration
- [x] **PERS-05**: When rate-limited, dashboard shows stale cached data with a visible banner indicating data age and rate limit status
- [x] **PERS-06**: Rate limit detection and retry/backoff logic extended to Linear and Slack integrations

### Scoring

- [x] **SCOR-01**: User can customize scoring weights per integration (GitHub/Linear/Slack/DORA)
- [x] **SCOR-02**: Custom weights are persisted and applied consistently across refreshes
- [x] **SCOR-03**: User can see a breakdown of what signals cost points in the current score

### UX & Onboarding

- [x] **UX-01**: First-time user sees a step-by-step setup wizard guiding through each integration
- [x] **UX-02**: Dashboard shows a persistent setup checklist until all selected integrations are configured
- [x] **UX-03**: Components show helpful empty states with guidance when filters exclude all data or no data exists

### Sprint Scope Tracking

- [x] **SCOPE-01**: A "Scope Changes" card in the Linear section shows issues added after the sprint started, with who added them and when
- [x] **SCOPE-02**: Issues removed from the sprint are detected (via snapshot diffing) with who removed them, when, and where they went
- [x] **SCOPE-03**: Cycle issue lists are snapshotted in SQLite on each fetch — current, previous, and next cycles
- [x] **SCOPE-04**: Next-sprint snapshots are captured opportunistically before the sprint starts, providing a true day-1 baseline
- [x] **SCOPE-05**: When the dashboard is first opened mid-sprint without a prior snapshot, the UI indicates that earlier removals may not be tracked and shows issueCountHistory data to hint at untracked scope changes
- [x] **SCOPE-06**: Click-to-expand on any scope change shows detail: who, when, and destination

### Scope Churn Health Signal

- [x] **CHURN-01**: scoreLinear() includes a "Scope churn" signal (0-4 pts) with thresholds at >10%, >20%, >30% churn
- [x] **CHURN-02**: Churn signal uses maxPoints=0 in weekly/continuous mode (excluded from scoring denominator)
- [x] **CHURN-03**: Scope churn scoring has comprehensive test coverage (threshold boundaries, mode exclusion, null data, empty sprint)
- [x] **CHURN-04**: Rich AI prompts (Anthropic/Manual) include full scope churn section with per-change detail (actors, timing, destinations)
- [x] **CHURN-05**: Compact AI prompts (Ollama) include summary scope churn line (percentage, added/removed counts)
- [x] **CHURN-06**: Weekly narrative system prompts include framing guidance for churn severity levels (<10% positive, 10-20% neutral, >20% concern)
- [x] **CHURN-07**: Scope changes classified as carry-overs (from previous cycle within +/-12h of start) vs mid-sprint changes
- [x] **CHURN-08**: Churn scoring uses midSprintAdded + midSprintRemoved only — carry-overs excluded
- [x] **CHURN-09**: New "Scope carry-overs" signal (0-4 pts) scores carry-over volume in cycles mode, maxPoints=0 in weekly mode
- [x] **CHURN-10**: UI shows carry-overs and mid-sprint changes as separate groups; AI prompts include separate carry-over sections with framing guidance

### Shared Data Layer

- [x] **SDL-01**: Standalone npm package (team-data-core) exists in its own git repo with types, DB singleton, and schema for 6 shared tables
- [x] **SDL-02**: Package includes GitHub PR fetch/store/query functions with Octokit-based pagination
- [x] **SDL-03**: Package includes Linear issue/cycle/team fetch/store/query functions with GraphQL cursor pagination
- [x] **SDL-04**: Package includes deployment fetch/store/query functions with source auto-detection (deployments/releases/merges)
- [x] **SDL-05**: Package has unit tests covering DB creation, store/query roundtrips, upsert idempotency, and filtering
- [ ] **SDL-06**: team-health-dashboard refactored to use package for GitHub and DORA data (API route interfaces unchanged)
- [ ] **SDL-07**: ai-org-copilot updated to read from shared DB via package query functions with correctly mapped columns
- [ ] **SDL-08**: Integration guide exists documenting setup, API reference, and schema for future consumers

### Integration

- [ ] **INTG-01**: User can authenticate GitHub via OAuth instead of manually copying a PAT
- [ ] **INTG-02**: User can authenticate Linear via OAuth instead of manually copying an API key
- [ ] **INTG-03**: User can authenticate Slack via OAuth instead of manually copying a bot token
- [ ] **INTG-04**: OAuth tokens are stored securely and refresh automatically
- [ ] **INTG-05**: Existing env var and .config.local.json auth paths continue to work alongside OAuth
- [ ] **INTG-06**: Slack integration is verified working with a live Slack workspace

## v2 Requirements

### Export & Sharing

- **EXP-01**: User can export a dashboard snapshot as PDF
- **EXP-02**: User can share a health summary to Slack via webhook
- **EXP-03**: User can copy a clipboard-friendly summary for standups/retros

### Accessibility

- **A11Y-01**: All interactive elements have ARIA labels and keyboard navigation
- **A11Y-02**: Charts have text summaries for screen readers
- **A11Y-03**: Focus management follows WAI-ARIA patterns

### Team Filtering

- **TEAM-01**: User can define team rosters (mapping contributors to squads)
- **TEAM-02**: User can filter all sections by team/squad
- **TEAM-03**: User can scope Slack metrics to a declared team member roster

## Out of Scope

| Feature | Reason |
|---------|--------|
| LLM-generated health scores | Scores must stay deterministic and auditable |
| Real-time WebSocket streaming | Dashboard data changes on hour cadence; polling is sufficient |
| Multi-tenant / user accounts | Internal team tool, no auth layer needed |
| Mobile app | Web-first; responsive layout is sufficient |
| Custom metric query builder | Scoring weights + team filtering provide configurability with less complexity |
| Heavy database / ORM | Lightweight SQLite only; no Postgres/Prisma/migrations |
| Bi-directional integrations | Read-only; link to originating tool for actions |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| QUAL-01 | Phase 1 | Complete |
| QUAL-02 | Phase 1 | Complete |
| QUAL-03 | Phase 1 | Complete |
| QUAL-04 | Phase 1 | Complete |
| QUAL-05 | Phase 1 | Complete |
| QUAL-06 | Phase 1 | Complete |
| PERS-01 | Phase 2 | Complete |
| PERS-02 | Phase 2 | Complete |
| PERS-03 | Phase 2 | Complete |
| PERS-04 | Phase 2 | Complete |
| PERS-05 | Phase 2 | Complete |
| PERS-06 | Phase 2 | Complete |
| SCOR-01 | Phase 3 | Complete |
| SCOR-02 | Phase 3 | Complete |
| SCOR-03 | Phase 3 | Complete |
| UX-01 | Phase 3 | Complete |
| UX-02 | Phase 3 | Complete |
| UX-03 | Phase 3 | Complete |
| SCOPE-01 | Phase 3.2 | Complete |
| SCOPE-02 | Phase 3.2 | Complete |
| SCOPE-03 | Phase 3.2 | Complete |
| SCOPE-04 | Phase 3.2 | Complete |
| SCOPE-05 | Phase 3.2 | Complete |
| SCOPE-06 | Phase 3.2 | Complete |
| CHURN-01 | Phase 3.3 | Complete |
| CHURN-02 | Phase 3.3 | Complete |
| CHURN-03 | Phase 3.3 | Complete |
| CHURN-04 | Phase 3.3 | Complete |
| CHURN-05 | Phase 3.3 | Complete |
| CHURN-06 | Phase 3.3 | Complete |
| CHURN-07 | Phase 3.4 | Complete |
| CHURN-08 | Phase 3.4 | Complete |
| CHURN-09 | Phase 3.4 | Complete |
| CHURN-10 | Phase 3.4 | Complete |
| SDL-01 | Phase 5 | Complete |
| SDL-02 | Phase 5 | Complete |
| SDL-03 | Phase 5 | Complete |
| SDL-04 | Phase 5 | Complete |
| SDL-05 | Phase 5 | Complete |
| SDL-06 | Phase 5 | Pending |
| SDL-07 | Phase 5 | Pending |
| SDL-08 | Phase 5 | Pending |
| INTG-01 | Phase 4 | Pending |
| INTG-02 | Phase 4 | Pending |
| INTG-03 | Phase 4 | Pending |
| INTG-04 | Phase 4 | Pending |
| INTG-05 | Phase 4 | Pending |
| INTG-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 48 total
- Mapped to phases: 48
- Unmapped: 0

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-04-06 after Phase 5 planning*
