# Team Health Dashboard

## What This Is

An AI-powered engineering team health dashboard that pulls data from GitHub, Linear, and Slack APIs. Uses a deterministic scoring system for the health score and an LLM (Ollama, Anthropic, or manual/clipboard mode) for narrative insights. Built with Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS, and Recharts.

## Core Value

Give engineering leaders a single view of team health — one score, backed by real data from the tools they already use — so problems surface before they become crises.

## Requirements

### Validated

- ✓ GitHub PR metrics (cycle time, reviews, stale PRs, open PRs) — existing
- ✓ Linear sprint/cycle metrics (velocity, workload, time-in-state) — existing
- ✓ Slack communication metrics (response times, channel activity, overload) — existing
- ✓ DORA metrics (deploy frequency, CFR, MTTR) — existing
- ✓ Deterministic health score (0-100, deduction model, rescaled per connected sources) — existing
- ✓ AI insights via Ollama, Anthropic, or Manual mode — existing
- ✓ Manual AI mode (export prompt, import response, smart quote normalization) — existing
- ✓ Settings UI with dual config system (env vars + .config.local.json) — existing
- ✓ Dark/light theme — existing
- ✓ Configurable lookback periods and stale thresholds — existing
- ✓ Clickable metric cards that scroll to detail views — existing
- ✓ Data freshness indicators on all sections — existing
- ✓ Loading states with stale-while-revalidate on metric cards — existing
- ✓ GitHub pagination (up to 500 PRs with early termination) — existing
- ✓ GitHub rate limit detection and UI state — existing
- ✓ CI/CD via GitHub Actions (test + build on push/PR) — existing
- ✓ Test suite (Vitest, scoring + utils coverage) — existing

### Active

- [ ] Historical trending — lightweight persistence (SQLite or JSON) to unlock trend-over-time views
- [ ] Server-side caching — ETags, stale-while-revalidate, rate-limit-aware stale data with banner
- [ ] Team-level views — filter by team, squad, or individual across all integrations
- [ ] Notifications/alerts — notify when score drops to Warning/Critical (depends on historical trending)
- [ ] Customizable scoring weights — let teams weight GitHub/Linear/Slack/DORA per their priorities
- [ ] Empty states — helpful messages when filters exclude all data
- [ ] Export/share — snapshot export (PDF, screenshot, Slack post) for standups/retros
- [ ] Keyboard navigation + accessibility — ARIA labels, keyboard nav, accessible charts
- [ ] Rate limit handling completion — retry/backoff logic, extend to Linear/Slack
- [ ] Slack verification — test with a live Slack workspace
- [ ] Slack team member filtering — optional team roster to scope metrics to specified members
- [ ] OAuth authentication — OAuth flows for GitHub, Linear, Slack alongside existing env var/config options
- [ ] Onboarding flow — step-by-step wizard for first-run setup + persistent checklist until fully configured

### Out of Scope

- Mobile app — web-first, responsive is sufficient
- Multi-tenant / user accounts — this is an internal team tool, no auth layer needed
- Real-time websockets — polling/refresh is sufficient for dashboard cadence
- Database-heavy architecture — lightweight persistence only (for trending); no ORM or migration framework

## Context

- Brownfield project with a working dashboard that covers GitHub, Linear, Slack, and DORA metrics
- Several gaps already identified and partially addressed (see gap list in memory)
- Slack integration is built but untested with a live workspace
- AI integration supports three modes: Ollama (free/local default), Anthropic (paid API), Manual (clipboard to any AI chat)
- No persistence layer — all data fetched on-demand. Historical trending requires adding one.
- The UI is getting complex with multiple integrations and AI options — onboarding needed to guide new users
- Rate limit handling is partial (GitHub only, detection without retry)

## Constraints

- **Tech stack**: Next.js 16 + React 19 + TypeScript + Tailwind — established, not changing
- **No heavy database**: Persistence for trending should be lightweight (SQLite, JSON files, or similar)
- **Backward compatible**: Existing env var configuration must continue to work; new features (OAuth, onboarding) are additive
- **Deterministic scoring**: Health score must never depend on LLM output

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Deterministic scoring separate from AI | Score must be reliable and reproducible | ✓ Good |
| Three AI provider modes | Flexibility — free local (Ollama), paid API (Anthropic), no-install (Manual) | ✓ Good |
| Dual config system (env + settings UI) | Developer convenience (env) + non-technical setup (UI) | ✓ Good |
| No database (current) | Simplicity for v1 | ⚠️ Revisit — historical trending requires persistence |
| .planning/ in .gitignore | Keep planning docs local-only | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd:transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-24 after initialization*
