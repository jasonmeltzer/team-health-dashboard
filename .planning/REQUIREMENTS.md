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

- [ ] **PERS-01**: Dashboard persists health score snapshots to SQLite on each fetch (not from cache hits)
- [ ] **PERS-02**: User can view health score trend over time (line chart, configurable date range)
- [ ] **PERS-03**: User can view per-signal metric trends over time
- [ ] **PERS-04**: Server-side cache uses stale-while-revalidate with configurable TTL per integration
- [ ] **PERS-05**: When rate-limited, dashboard shows stale cached data with a visible banner indicating data age and rate limit status
- [ ] **PERS-06**: Rate limit detection and retry/backoff logic extended to Linear and Slack integrations

### Scoring

- [ ] **SCOR-01**: User can customize scoring weights per integration (GitHub/Linear/Slack/DORA)
- [ ] **SCOR-02**: Custom weights are persisted and applied consistently across refreshes
- [ ] **SCOR-03**: User can see a breakdown of what signals cost points in the current score

### UX & Onboarding

- [ ] **UX-01**: First-time user sees a step-by-step setup wizard guiding through each integration
- [ ] **UX-02**: Dashboard shows a persistent setup checklist until all selected integrations are configured
- [ ] **UX-03**: Components show helpful empty states with guidance when filters exclude all data or no data exists

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
| PERS-01 | Phase 2 | Pending |
| PERS-02 | Phase 2 | Pending |
| PERS-03 | Phase 2 | Pending |
| PERS-04 | Phase 2 | Pending |
| PERS-05 | Phase 2 | Pending |
| PERS-06 | Phase 2 | Pending |
| SCOR-01 | Phase 3 | Pending |
| SCOR-02 | Phase 3 | Pending |
| SCOR-03 | Phase 3 | Pending |
| UX-01 | Phase 3 | Pending |
| UX-02 | Phase 3 | Pending |
| UX-03 | Phase 3 | Pending |
| INTG-01 | Phase 4 | Pending |
| INTG-02 | Phase 4 | Pending |
| INTG-03 | Phase 4 | Pending |
| INTG-04 | Phase 4 | Pending |
| INTG-05 | Phase 4 | Pending |
| INTG-06 | Phase 4 | Pending |

**Coverage:**
- v1 requirements: 24 total
- Mapped to phases: 24
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-24*
*Last updated: 2026-03-24 after roadmap creation*
