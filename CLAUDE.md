# Team Health Dashboard

AI-powered engineering team health dashboard that pulls data from GitHub, Linear, and Slack APIs. Uses a deterministic scoring system for the health score and an LLM (Ollama or Anthropic) for narrative insights.

## Tech Stack

- **Next.js 16** (App Router) + TypeScript + React 19
- **Tailwind CSS** for styling
- **Recharts 3** for charts
- **Anthropic SDK** (`@anthropic-ai/sdk`) for AI analysis (optional)
- **Ollama** for free local LLM inference (default)
- **Octokit** for GitHub REST API
- **Raw GraphQL fetch** for Linear API (no SDK)
- **`@slack/web-api`** for Slack API
- **SQLite** (`better-sqlite3`) for health score snapshot persistence; integration data fetched on-demand

## Architecture

```
Browser (client components + useApiData hook)
  → Next.js API Routes (/api/*)
    → GitHub API | Linear GraphQL | Slack Web API
      → /api/health-summary:
          1. Fetches all configured sources
          2. Computes deterministic score (lib/scoring.ts)
          3. Passes score + data to LLM for insights/recommendations
      → /api/weekly-narrative:
          1. Fetches all configured sources
          2. LLM generates prose narrative
          3. Post-processing strips hallucinated references to disconnected sources
```

### Key Patterns

- **`useApiData<T>(url, refreshKey)`** — single generic hook for all API fetching. Returns `{ data, loading, error, notConfigured, setupHint, refetch }`.
- **`notConfigured` pattern** — API routes return `{ notConfigured: true }` when env vars are missing. Sections show setup placeholders describing what the section does and how to enable it.
- **`setupHint` pattern** — for "configured but unreachable" states (e.g. Ollama default but not running). Returns a helpful message instead of a 500 error.
- **`refreshKey` prop** — incremented by the RefreshButton in DashboardShell, passed to all sections to trigger re-fetch.
- **Deferred slider commits** — sliders use separate `sliderDays` (visual) and `committedDays` (triggers fetch) state to avoid API calls on every drag.
- **Pill-style button controls** — all selectors use button groups, not native `<select>` elements (avoids hydration mismatches with React 19).
- **Clickable metric cards** — summary metric cards (Open PRs, Active Issues, Stale PRs, Stalled Issues, Needs Review) scroll to their corresponding detail views when clicked.
- **Dual config system** — `process.env` (via `.env.local`) takes precedence over `.config.local.json` (via Settings UI). See `lib/config.ts`.

## Project Structure

```
src/
├── app/
│   ├── page.tsx, layout.tsx, globals.css
│   └── api/
│       ├── github/route.ts            # PR metrics (cycle time, reviews, stale PRs, open PRs)
│       ├── linear/route.ts            # Sprint/cycle metrics (velocity, workload, time-in-state)
│       ├── slack/route.ts             # Communication metrics
│       ├── config/route.ts            # GET config status / POST save config (Settings UI)
│       ├── dora/route.ts              # DORA metrics (deploy frequency, lead time, CFR, MTTR)
│       ├── health-summary/route.ts    # Deterministic score + AI insights
│       ├── weekly-narrative/route.ts  # AI narrative (prose)
│       ├── ai-prompt/route.ts         # GET prompt file for manual AI mode
│       └── ai-response/route.ts       # POST import AI response from manual mode
├── components/
│   ├── dashboard/     # DashboardShell, HealthSummaryCard, WeeklyNarrativeCard, MetricCard, RefreshButton, SettingsModal, ManualAIResponseModal
│   ├── github/        # GitHubSection, CycleTimeChart, ReviewBottlenecks, StalePRsList, OpenPRsList
│   ├── linear/        # LinearSection, VelocityChart, StalledIssuesList, WorkloadDistribution, TimeInState
│   ├── slack/         # SlackSection, ResponseTimeChart, ChannelActivityChart, OverloadIndicators
│   ├── dora/          # DORASection, DeployFrequencyChart, LeadTimeTrend, ChangeFailureChart, IncidentsList
│   └── ui/            # Card, Badge, Skeleton, ErrorState, Spinner, SectionHeader
├── hooks/useApiData.ts
├── lib/
│   ├── github.ts      # Octokit wrapper
│   ├── linear.ts      # Linear GraphQL client
│   ├── slack.ts       # Slack Web API wrapper
│   ├── claude.ts      # AI provider abstraction (Anthropic or Ollama) + prompt builders
│   ├── dora.ts        # DORA metrics (deployments, releases, incidents)
│   ├── scoring.ts     # Deterministic health score computation
│   ├── cache.ts       # Server-side cache with stale-on-error and TTL
│   ├── config.ts      # Dual config reader (env vars + .config.local.json)
│   └── utils.ts       # Date helpers (daysBetween, hoursBetween, daysAgo, getISOWeek)
└── types/
    ├── github.ts, linear.ts, slack.ts, dora.ts, metrics.ts, api.ts
```

## Health Score

The health score is **deterministic** — same data always produces the same score. It does NOT rely on the LLM.

Starts at 100, subtracts points for signals of trouble. Only scores against connected integrations. The final score is rescaled: `score = 100 - (totalDeductions / maxPossibleDeductions) * 100`.

### GitHub signals (max 30 pts)
- **Cycle time** (0-8): avg hours to merge. >72h = -8, >48h = -6, >24h = -4, >12h = -2
- **Stale PRs** (0-8): count of stale PRs. 4+ = -8, 3 = -6, 2 = -4, 1 = -2
- **Review queue** (0-7): % of open PRs needing review. >75% = -7, >50% = -6, >25% = -4, >10% = -2
- **Cycle time trend** (0-7): latest week vs average. >1.5× = -7, >1.25× = -4, >1.1× = -2

### Linear signals (max 30 pts)
- **Stalled issues** (0-6): issues with no update in 5+ days. 5+ = -6, 3-4 = -4, 2 = -3, 1 = -1
- **Workload imbalance** (0-6): max/median active count ratio. >2.5× = -6, >2× = -4, >1.5× = -2
- **Velocity trend** (0-6): latest vs average. <50% = -6, <75% = -4, <90% = -2
- **Flow efficiency** (0-4): % active work time. <15% = -4, <25% = -2, <40% = -1
- **WIP per person** (0-4): avg in-progress per person. >7 = -4, >5 = -2, >3 = -1
- **Long-running items** (0-4): % of active issues past p90. >20% = -4, >15% = -3, >10% = -2, >5% = -1

### Slack signals (max 20 pts)
- **Response time** (0-8): avg response minutes. >60m = -8, >30m = -6, >15m = -4, >5m = -2
- **Overloaded members** (0-6): count of overloaded. 3+ = -6, 2 = -4, 1 = -2
- **Response time trend** (0-6): latest vs average. >1.5× = -6, >1.25× = -4, >1.1× = -2

### DORA signals (max 20 pts)
- **Deploy frequency** (0-5): deploys per week. <0.25 = -5, <1 = -3, <2 = -1
- **Lead time** (0-5): avg hours (when available). >168h = -5, >72h = -3, >24h = -1. Currently not yet implemented; maxPoints is 0 when null.
- **Change failure rate** (0-5): percentage of deploys causing incidents. >15% = -5, >10% = -3, >5% = -1
- **MTTR** (0-5): mean time to recovery in hours. >168h = -5, >24h = -3, >4h = -1. maxPoints is 0 when null.

### Bands
- 80-100 = Healthy
- 60-79 = Warning
- 0-59 = Critical

The LLM only generates insights and recommendations based on the data + computed score. If the LLM fails or isn't configured, the score still works — deductions are shown as insights.

## GitHub Section

- **Data source**: `lib/github.ts` — paginates PRs (sorted by updated desc, capped at 500) stopping when PRs fall outside the lookback window, then reviews for up to 50 PRs via `Promise.allSettled`.
- **Configurable lookback period**: 7d / 14d / 30d (default) / 60d / 90d — controls how far back PR data goes.
- **Configurable stale threshold**: 3d / 5d / 7d (default) / 14d — defines when an open PR is considered stale.
- **Cycle Time Trend**: line chart by ISO week, shows avg hours to merge and avg hours to first review.
- **Review Bottlenecks**: stacked bar chart (pending amber + reviewed green) per reviewer. Click a bar to expand and see the actual PRs. Shows avg review wait time per reviewer. Displays "(last Xd)" label based on lookback period.
- **Open PRs**: full list of open PRs with author, reviewers, age, and draft status. Shows first 5 with "N more..." to expand. Open PRs and Needs Review metric cards both link here.
- **Stale PRs**: list of open PRs with no updates past the stale threshold. Shows author and reviewers.

## Linear Section

- **Data source**: `lib/linear.ts` — supports two modes: "cycles" (sprint-based) and "weekly" (continuous flow). Auto-detects if team uses cycles.
- **Configurable lookback**: slider from 7d to 180d (default 42d). In cycle mode, filters which cycles are available.
- **Velocity/Throughput**: bar chart showing completed issues/points per cycle or per week.
- **Time in State**: 6 tabbed views with global state filter toggles:
  - Summary: chart + table, click a row to see issues in that state with Linear links
  - Current WIP: active items sorted by age, amber highlighting for items > 2x average
  - Outliers: issues in p90+ tail grouped by state
  - By Assignee: heatmap table (assignee × state) with color intensity, click a cell to see issues
  - Flow Efficiency: percentage of time in active work vs total
  - Trends: lead time trend line chart
  - **Default**: only "started" states shown (In Progress, In Review); others hidden but toggleable
- **Active Issues metric card**: clicks to scroll to Time in State → Current WIP tab
- **Workload Distribution**: horizontal stacked bar per assignee. Click a bar to see assigned issues with Linear links. In cycle mode, single-select cycle picker lets you switch between cycles.
- **Stalled Issues**: issues with no updates for 5+ days, labeled "Xd no update". Metric card scrolls here.

## Slack Section

- Communication metrics: response times, channel activity, overload indicators.
- **Untested** — not yet verified with a real Slack workspace.

## DORA Section

- **Data source**: `lib/dora.ts` — fetches deployment data from GitHub (deployments API, releases, or merged PRs as fallback). Auto-detects source via "auto" mode.
- **Four DORA metrics**: deployment frequency, lead time for changes (not yet implemented), change failure rate, and mean time to recovery (MTTR).
- **Incident detection**: labeled issues (incident/hotfix/production-bug) + reverted PRs. Correlates incidents to deployments within a 24h window.
- **Trend chart**: weekly deployment frequency with success/failure breakdown.
- **Configurable lookback**: default 30 days.

## AI Integration

- **Three providers**: Ollama (default, free, local), Anthropic (paid API key), or Manual (any AI chat). Configured via `AI_PROVIDER` env var or auto-detected based on presence of `ANTHROPIC_API_KEY`.
- **Provider-aware prompts**: Anthropic and Manual mode use rich prompts with detailed per-item data (individual PRs, per-person stats, trend breakdowns). Ollama uses compact summary-level prompts with defensive parsing to accommodate smaller models.
- **Health Summary** (`/api/health-summary`): computes deterministic score first, then passes data + score to LLM for insights/recommendations only. Works without AI — falls back to score breakdown as insights.
- **Weekly Narrative** (`/api/weekly-narrative`): full trend data to LLM for prose summary. Post-processing strips hallucinated references to disconnected sources (local models ignore prompt instructions).
- **Manual AI mode** (`AI_PROVIDER=manual`): No API keys or local software needed. The dashboard exports a self-contained markdown prompt file (`GET /api/ai-prompt?type=health-summary|weekly-narrative`) that users upload to any AI chat (ChatGPT, Claude, Gemini, etc.). Prompts instruct the AI to create a dated response file (e.g., `health-insights-2026-03-24.json`). Users drag-and-drop or upload the response file via the import modal (or paste text as fallback). Smart quote normalization handles ChatGPT copy-paste artifacts. Imported responses are cached under `manual:*` keys (separate from AI-generated cache) and persist across refresh.
- **JSON mode**: health summary uses `response_format: { type: "json_object" }` with Ollama and temperature 0 for reliable structured output. Anthropic does not need JSON mode — it follows instructions reliably.
- Both endpoints gracefully degrade if some integrations aren't configured. Only connected source data is sent to the LLM.

## Settings UI

- Gear icon in the dashboard header opens a settings modal.
- Sidebar navigation: GitHub, Linear, Slack, AI sections.
- Each field has a `?` help popover with step-by-step instructions for getting the value.
- Saves to `.config.local.json` (gitignored). Environment variables (`.env.local`) take precedence.
- Config API: `GET /api/config` returns which integrations are configured (no secrets), `POST /api/config` saves values. Whitelisted keys only.

## Environment Variables

See `.env.example` for the full list. Two config paths:
1. **`.env.local`** — standard Next.js env vars, takes precedence
2. **Settings UI** → `.config.local.json` — fallback, no restart needed

Key variables:
- `PORT` — Dev server port (default 3000). **Must be a shell env var** (e.g. `PORT=3001 npm run dev`), not in `.env.local`, because Next.js binds the port before loading `.env.local`.
- `AI_PROVIDER` — `anthropic`, `ollama`, or `manual` (default: `ollama` if no `ANTHROPIC_API_KEY` set)
- `ANTHROPIC_API_KEY` — Claude API (only needed for `anthropic` provider)
- `OLLAMA_BASE_URL` — Ollama server URL (default `http://localhost:11434`)
- `OLLAMA_MODEL` — Ollama model name (default `llama3`)
- `GITHUB_TOKEN`, `GITHUB_ORG`, `GITHUB_REPO` — GitHub
- `LINEAR_API_KEY`, `LINEAR_TEAM_ID` — Linear
- `SLACK_BOT_TOKEN`, `SLACK_CHANNEL_IDS` — Slack

## Known Constraints

- GitHub paginates PRs up to 500 (capped via `MAX_PRS`), stopping early when PRs fall outside the lookback window.
- Review data is fetched for up to 50 PRs per request.
- Recharts Tooltip `formatter` must use `(value) => [...]` without explicit parameter types (type incompatibility).
- Recharts `activeLabel` is `string | number`, must be cast with `String()`.
- Always use explicit pixel heights on `ResponsiveContainer` (not `height="100%"`) and `minWidth={0}` to avoid width/height warnings.
- React hooks must be called before any conditional early returns (Rules of Hooks). The LinearSection component has multiple early returns — all hooks are declared at the top.
- Local LLMs (Ollama/llama3) frequently ignore prompt instructions. The codebase compensates with: JSON mode for structured output, temperature 0 for consistency, post-processing to strip hallucinated content, and deterministic scoring that doesn't depend on the LLM.
- Slack and AI (Ollama/Anthropic) features have not been fully tested with live integrations.

<!-- GSD:project-start source:PROJECT.md -->
## Project

**Team Health Dashboard**

An AI-powered engineering team health dashboard that pulls data from GitHub, Linear, and Slack APIs. Uses a deterministic scoring system for the health score and an LLM (Ollama, Anthropic, or manual/clipboard mode) for narrative insights. Built with Next.js 16 (App Router), TypeScript, React 19, Tailwind CSS, and Recharts.

**Core Value:** Give engineering leaders a single view of team health — one score, backed by real data from the tools they already use — so problems surface before they become crises.

### Constraints

- **Tech stack**: Next.js 16 + React 19 + TypeScript + Tailwind — established, not changing
- **No heavy database**: Persistence for trending should be lightweight (SQLite, JSON files, or similar)
- **Backward compatible**: Existing env var configuration must continue to work; new features (OAuth, onboarding) are additive
- **Deterministic scoring**: Health score must never depend on LLM output
<!-- GSD:project-end -->

<!-- GSD:stack-start source:research/STACK.md -->
## Technology Stack

## Persistence — Historical Trending
### Recommended: `better-sqlite3` v12.8.0
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-sqlite3` | 12.8.0 | Store daily health score snapshots for trend charts | Synchronous, zero-latency, file-based. No separate process. Perfect for a single-server local tool. Native Node.js bindings — works in Next.js API routes (not Edge Runtime). |
| `@types/better-sqlite3` | 7.6.13 | TypeScript types | Official types package. |
## Server-Side Caching
### Recommended: In-memory module-level cache (already exists at `lib/cache.ts`)
- ETags for HTTP-level caching
- Rate-limit-aware stale data serving with a UI banner
## OAuth Authentication
### Recommended: Arctic v3.7.0 + custom session handling
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `arctic` | 3.7.0 | OAuth 2.0 provider abstractions (GitHub, Linear, Slack) | Lightweight (no framework coupling), handles PKCE, state, token exchange. Supports all three providers this project needs. Works with any framework including Next.js App Router. |
| `oslo` | 1.2.1 | Cryptographic utilities (CSRF tokens, session IDs) | Companion to Arctic. Provides `generateState()`, `generateCodeVerifier()`, secure random bytes. From the same author. |
## Notifications / Alerts
### Recommended: Browser Notifications API (no library) + optional Resend v6.9.4
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `resend` | 6.9.4 | Transactional email for score-drop alerts | Minimal API surface, excellent TypeScript types, free tier (100 emails/day). Integrates in one function call from a Next.js API route. |
## Export / PDF Generation
### Recommended: `html-to-image` v1.11.13 for screenshots + `jspdf` v4.2.1 for PDF wrapping
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `html-to-image` | 1.11.13 | Capture dashboard sections as PNG/JPEG | Client-side, no server process needed. Works with SVG charts (Recharts). More actively maintained than `html2canvas` (last release 2021). |
| `jspdf` | 4.2.1 | Wrap captured images into a PDF | Lightweight, client-side. Combine with `html-to-image` output to produce a PDF export. |
## Accessibility
### Recommended: `axe-core` v4.11.1 (dev only) + `focus-trap-react` v12.0.0 + Radix UI primitives
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@axe-core/react` | 4.11.1 | Dev-time accessibility violation logging in browser console | Zero production cost. Catches common ARIA issues during development. Run only in `development` env. |
| `focus-trap-react` | 12.0.0 | Trap keyboard focus in modals (Settings, ManualAI) | The project already has modal components. Keyboard users must not be able to tab outside an open modal. `focus-trap-react` handles this with one wrapper component. |
| `@radix-ui/react-dialog` | 1.1.15 | Accessible modal primitive (optional replacement) | If refactoring existing modals, Radix Dialog handles focus trap, ARIA roles, and keyboard dismissal out of the box. Trade-off: migration cost. Add only when touching a specific modal. |
## Onboarding Wizard
### Recommended: No new library — extend existing Settings UI with wizard state machine
## Form Validation (for Settings UI and Onboarding)
### Recommended: `zod` v4.3.6 (already familiar pattern, no `react-hook-form` needed)
| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `zod` | 4.3.6 | Validate config values (URLs, API key formats, OAuth tokens) before saving | Zod v4 is faster than v3, same API. Use for server-side validation in `/api/config`. |
## Rate Limiting / Retry Logic
### Recommended: No library — implement exponential backoff in `lib/github.ts`, `lib/linear.ts`, `lib/slack.ts`
## Summary: What to Install
# Persistence
# OAuth (if OAuth milestone is being built)
# Export
# Accessibility (dev only)
# Accessibility (production — keyboard traps)
# Validation (server-side only)
# Email notifications (optional, only if email alerts are in scope)
## Alternatives Considered
| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Persistence | `better-sqlite3` | Drizzle + SQLite | ORM overhead for 1-2 table schema |
| Persistence | `better-sqlite3` | JSON files | Race conditions with concurrent API routes |
| OAuth | Arctic | NextAuth v5 | Multi-user auth framework; project has no user accounts |
| OAuth | Arctic | Passport.js | Express-centric, poor App Router ergonomics |
| PDF | `html-to-image` + `jspdf` | `@react-pdf/renderer` | Requires parallel component tree, high maintenance burden |
| PDF | `html-to-image` + `jspdf` | Puppeteer | 300MB headless browser, server infrastructure requirement |
| Screenshot | `html-to-image` | `html2canvas` | Last updated 2021, poor SVG support |
| Notifications | Web Notifications API | Push + service worker | PWA complexity unwarranted for internal tool |
| Onboarding | Extend Settings modal | react-joyride | Tooltip tours are wrong UX for credential-entry onboarding |
| Accessibility | axe-core + focus-trap | @headlessui/react | High migration cost to retrofit existing components |
| Caching | Extend `lib/cache.ts` | Redis | Separate process, overkill for local single-server tool |
| Form validation | `zod` | `react-hook-form` | Over-engineering for a small settings form |
## Confidence Assessment
| Area | Confidence | Rationale |
|------|------------|-----------|
| `better-sqlite3` for persistence | HIGH | Mature library, standard for Next.js local persistence, version verified from npm |
| Arctic for OAuth | MEDIUM | Version verified, well-known in Next.js ecosystem. Could not verify via Context7. |
| `html-to-image` over `html2canvas` | MEDIUM | Maintenance comparison based on known release history; SVG behavior with Recharts should be spiked |
| Web Notifications API | HIGH | W3C standard, stable, no library dependency |
| Resend for email | MEDIUM | Well-regarded library, version verified, pricing tier not confirmed |
| `focus-trap-react` | HIGH | Standard accessible modal pattern, version verified |
| `@axe-core/react` | HIGH | Industry standard dev-time accessibility testing, version verified |
| `zod` v4 | HIGH | Version verified, widely used, backward-compatible API from v3 |
| "No library" onboarding | HIGH | Based on existing code structure analysis |
## Sources
- npm registry: version lookups for all packages (2026-03-24)
- CLAUDE.md: existing stack constraints and patterns
- PROJECT.md: explicit "no heavy database" and "out of scope" constraints
- W3C Web Notifications API specification (stable standard)
- Training knowledge for library maturity/ecosystem status (flagged where MEDIUM confidence)
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## Phase Completion Checklist (MANDATORY)

Every phase — no exceptions — MUST follow this sequence:

1. **Branch first**: Create a feature branch (e.g., `feature/phase-N-description`) before writing any code. Never work on main.
2. **Update docs**: Before the final commit, update `README.md` and `ARCHITECTURE.md` to reflect any changes from the phase (new features, routes, components, config, scoring, etc.).
3. **Create a PR**: Push the branch (with user permission) and open a pull request via `gh pr create`.
4. **Run code review**: Invoke the `code-review` skill against the PR before considering the phase complete.

Do NOT skip any of these steps. Do NOT mark a phase as complete until all four are done.

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd:quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd:debug` for investigation and bug fixing
- `/gsd:execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd:profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
