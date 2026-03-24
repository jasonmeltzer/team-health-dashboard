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
- **No database** — all data fetched on-demand

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
- **Manual AI mode** (`AI_PROVIDER=manual`): No API keys or local software needed. The dashboard exports a self-contained markdown prompt file (`GET /api/ai-prompt?type=health-summary|weekly-narrative`) that users paste into any AI chat (ChatGPT, Claude, Gemini, etc.). Users then import the AI's response via `POST /api/ai-response` or the UI import modal. The response is cached and rendered like any other provider's output.
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
