# Team Health Dashboard

AI-powered engineering team health dashboard that aggregates metrics from GitHub, Linear, and Slack, computes a deterministic health score, and generates actionable weekly insights using an LLM.

> **Note:** The Slack integration and AI features (Ollama and Anthropic) have not yet been tested end-to-end.

## Why This Exists

Engineering teams generate enormous amounts of signal every day — pull requests opened and merged, issues moved through states, messages exchanged, deploys shipped — but that signal is scattered across GitHub, Linear, Slack, and CI/CD systems. No single tool gives you a unified, honest picture of how your team is actually doing.

Most engineering leaders resort to one of two extremes: they either rely on gut feel ("things seem slow this sprint"), or they drown in disconnected dashboards and manually stitch together a story from five browser tabs. Neither approach scales. Gut feel misses blind spots — a slowly growing review queue, a team member quietly drowning in WIP, a creeping cycle time trend that hasn't triggered any alarm yet. Manual dashboard assembly takes time nobody has and produces stale snapshots that are outdated by the time they reach a meeting.

**Team Health Dashboard exists to close that gap.** It pulls live data from the tools your team already uses — GitHub for code velocity, Linear for sprint execution, Slack for communication health — and synthesizes it into a single health score backed by specific, explainable signals. The score is deterministic: same data in, same score out, no black-box magic. When something is dragging the score down, you can see exactly which signals are contributing and by how many points.

On top of the deterministic score, an optional AI layer (Claude or a local Ollama model) generates narrative insights and recommendations in plain English — the kind of synthesis a team lead might write for a retrospective, but generated automatically from real data every time you load the dashboard.

### Who Is It For?

- **Engineering managers and team leads** who want a quick, honest pulse check without manually assembling metrics from multiple tools. Open the dashboard before standup, and you know where to focus the conversation.
- **Staff+ engineers and tech leads** who want to spot systemic issues — review bottlenecks, workload imbalances, velocity declines — before they become crises. The scoring thresholds are calibrated to catch problems early, while they're still cheap to fix.
- **Agile coaches and delivery managers** tracking team health across sprints. The Linear integration supports both cycle-based and continuous-flow teams, with velocity trends, flow efficiency, and time-in-state analysis.
- **Platform and DevOps teams** monitoring deployment health through DORA metrics — deployment frequency, lead time, change failure rate, and MTTR — correlated against actual incidents from GitHub issues and reverted PRs.
- **Anyone running a retrospective** who wants a data-backed conversation starter instead of vibes. The weekly AI narrative summarizes what happened, what's improving, and what needs attention.

### What Value Does It Provide?

**Early warning system.** The health score drops before problems become visible. A review queue backup, a cycle time spike, a workload imbalance — these show up as point deductions with specific numbers, not vague feelings. You see "Review queue: 8/10 PRs awaiting review (80%), -7 points" instead of "things feel backed up."

**Single pane of glass.** GitHub PR metrics, Linear sprint data, Slack communication patterns, and DORA deployment metrics — all in one place, scored against each other, with a unified health rating. No tab-switching, no mental model assembly.

**Deterministic, explainable scoring.** The health score is not an AI opinion. It's a transparent algorithm with published thresholds: stale PRs cost 2-8 points depending on count, cycle time costs 2-8 points depending on hours, workload imbalance costs 2-6 points depending on the max/median ratio. You can look at any score and understand exactly why it is what it is.

**AI-generated narrative.** The LLM doesn't compute the score — it reads the score and the underlying data and writes the kind of summary you'd write yourself if you had 20 minutes and all the data in front of you. Trends, patterns, specific recommendations, all in plain English.

**Zero infrastructure.** No database, no cron jobs, no data pipeline. Install, configure API tokens, and you have a live dashboard. Data is fetched on-demand from source APIs. Deploy it to Vercel in one command or run it locally.

**Incremental adoption.** Every integration is optional. Start with just GitHub. Add Linear when you're ready. Skip Slack if you don't need it. The dashboard gracefully degrades — unconfigured sections show helpful placeholders explaining what they'd provide and how to enable them. The health score automatically adjusts to only score against connected sources.

## What It Does

- **Deterministic health score** (0-100) with transparent, explainable deductions across all connected sources
- **AI-generated insights and recommendations** powered by Claude or a local Ollama model
- **GitHub PR metrics**: cycle time trends, review bottlenecks, stale PRs, open PR tracking
- **Linear sprint metrics**: velocity/throughput trends, stalled issues, workload distribution per assignee
- **Time-in-state deep dive** (7 tabbed views): summary stats, current WIP age, outlier issues, per-assignee heatmap, flow efficiency, lead time trends
- **DORA metrics**: deployment frequency, lead time for changes, change failure rate, MTTR — auto-detects GitHub Deployments, Releases, or merged PRs
- **Cycles / Weekly toggle**: supports both cycle-based sprints and continuous flow, switchable in the UI
- **Slack communication metrics**: response times, channel activity, overload detection
- **Weekly AI narrative**: a prose team health summary generated from all connected data
- **Dark mode** (default) and light mode ("Incorrect Mode") with smooth toggle
- **Data freshness timestamps** on every section
- **Rate limit detection** with countdown timers and graceful degradation
- **Graceful degradation**: unconfigured integrations show setup placeholders with instructions
- **In-app settings**: configure integrations from the dashboard UI (gear icon) — no `.env.local` editing required
- **Flexible AI support**: Ollama (free, local), Anthropic Claude API, or Manual mode (export prompts to any AI chat — no API key needed)

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| AI | Ollama (local, free), Claude API (Anthropic SDK), or Manual (any AI chat) |
| GitHub | Octokit (REST API) |
| Linear | GraphQL API (raw fetch) |
| Slack | @slack/web-api |

No database required. All data is fetched on-demand from APIs.

## Architecture

```
Browser (React client components)
    |
    v
Next.js API Routes (/api/*)
    |
    +-- /api/github ----------> GitHub REST API (Octokit, paginated)
    +-- /api/linear ----------> Linear GraphQL API
    +-- /api/slack -----------> Slack Web API
    +-- /api/dora -------------> GitHub Deployments / Releases / Merges
    +-- /api/health-summary --> Deterministic score + AI insights
    +-- /api/weekly-narrative > Full trend data + AI prose narrative
    +-- /api/config ----------> In-app settings (read/write)
```

Each section loads independently with its own loading/error states.

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed system documentation including data flow diagrams, the scoring algorithm, DORA metrics pipeline, and component hierarchy.

## Getting Started

### Prerequisites

- Node.js 18+
- API tokens for the services you want to connect (at least one required):
  - **GitHub**: [Personal access token](https://github.com/settings/tokens) with `repo` scope
  - **Linear**: [API key](https://linear.app/settings/api) (Settings > API > Personal API keys)
  - **Slack**: [Bot token](https://api.slack.com/apps) with `channels:history`, `channels:read`, `users:read` scopes
- For AI features (optional): **Ollama** (free, local), an **Anthropic** API key, or **Manual** mode (no setup — use any AI chat)

### Install & Run

```bash
git clone https://github.com/jasonmeltzer/team-health-dashboard.git
cd team-health-dashboard
npm install
npm run dev
```

Open [http://localhost:5555](http://localhost:5555). Click the gear icon to configure your integrations from the UI.

Alternatively, copy `.env.example` to `.env.local` and fill in your values — env vars take precedence over the in-app settings.

## Configuration

There are two ways to configure integrations:

1. **Settings UI** (recommended): Click the gear icon in the dashboard header. Config is stored in `.config.local.json` (gitignored).
2. **Environment variables**: Set values in `.env.local` or your deployment platform. These take precedence over the settings UI.

### Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_PROVIDER` | No | `ollama` (default), `anthropic`, or `manual` |
| `ANTHROPIC_API_KEY` | For Anthropic AI | Anthropic API key for Claude |
| `OLLAMA_BASE_URL` | No | Ollama server URL (default: `http://localhost:11434`) |
| `OLLAMA_MODEL` | No | Ollama model name (default: `llama3`) |
| `GITHUB_TOKEN` | For GitHub section | Personal access token (repo scope) |
| `GITHUB_ORG` | For GitHub section | GitHub organization name |
| `GITHUB_REPO` | For GitHub section | Repository name to track |
| `LINEAR_API_KEY` | For Linear section | Linear personal API key |
| `LINEAR_TEAM_ID` | For Linear section | Linear team ID |
| `SLACK_BOT_TOKEN` | For Slack section | Slack Bot OAuth token |
| `SLACK_CHANNEL_IDS` | For Slack section | Comma-separated channel IDs |
| `DORA_DEPLOYMENT_SOURCE` | No | `auto` (default), `deployments`, `releases`, or `merges` |
| `DORA_ENVIRONMENT` | No | Filter deployments by environment (e.g., `production`) |
| `DORA_INCIDENT_LABELS` | No | Comma-separated issue labels (default: `incident,hotfix,production-bug`) |
| `PORT` | No | Dev server port (default: 5555). Must be a shell env var, not in `.env.local` |

The dashboard gracefully handles missing integrations — unconfigured sections show placeholders explaining what they provide and how to enable them.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                        # Dashboard page
│   ├── layout.tsx                      # Root layout with ThemeProvider
│   └── api/                            # API route handlers
│       ├── github/route.ts             # PR metrics
│       ├── linear/route.ts             # Sprint/cycle metrics
│       ├── slack/route.ts              # Communication metrics
│       ├── dora/route.ts               # DORA metrics
│       ├── health-summary/route.ts     # Deterministic score + AI insights
│       ├── weekly-narrative/route.ts   # AI prose narrative
│       └── config/route.ts             # Settings read/write
├── components/
│   ├── ThemeProvider.tsx                # Dark/light mode context
│   ├── dashboard/                      # Shell, health card, narrative, metric cards, settings
│   ├── github/                         # PR charts, review bottlenecks, stale/open lists
│   ├── linear/                         # Velocity, workload, time-in-state (7 tabs), stalled
│   ├── dora/                           # Deploy frequency, lead time, incidents, history
│   ├── slack/                          # Response time, channel activity, overload
│   └── ui/                             # Card, Badge, Skeleton, Spinner, ErrorState, RateLimitState
├── hooks/
│   └── useApiData.ts                   # Generic data fetching hook
├── lib/
│   ├── github.ts                       # GitHub API client (Octokit, paginated)
│   ├── linear.ts                       # Linear GraphQL client
│   ├── slack.ts                        # Slack API client
│   ├── dora.ts                         # DORA metrics (deployments, incidents, correlation)
│   ├── claude.ts                       # AI provider abstraction (Ollama, Anthropic, or Manual)
│   ├── scoring.ts                      # Deterministic health score computation
│   ├── config.ts                       # Dual config reader (env vars + .config.local.json)
│   ├── utils.ts                        # Date helpers, rate limit error handling
│   └── __tests__/                      # Vitest unit tests
└── types/                              # TypeScript type definitions
```

## Design Decisions

- **No database**: keeps deployment simple. All metrics are computed on each request from the source APIs.
- **No Linear SDK**: uses raw GraphQL fetch to keep dependencies minimal and queries transparent.
- **Client-side data fetching**: each dashboard section loads independently, so slower sources (Slack, Claude) don't block the page.
- **Pluggable AI**: defaults to Ollama (free, local). Anthropic/Claude is available for higher quality with richer prompts. Manual mode lets you use any AI chat (ChatGPT, Claude, Gemini) with no API key — download a prompt file, upload it to any AI, then drag-and-drop the AI's response file back into the dashboard.
- **Two config paths**: settings UI for quick setup, env vars for deployment. Env vars always take precedence.
- **Graceful degradation**: each integration is optional. Unconfigured sections show helpful placeholders. The AI summary works with whatever data sources are configured.

## Deploy

Deploy to any platform that supports Next.js:

- **Vercel**: `npx vercel` (zero-config)
- **Docker**: `npm run build && npm start`
- **Any Node.js host**: build and serve on port 5555

Set environment variables in your deployment platform's settings.

## Contributing

Contributions welcome! See [ARCHITECTURE.md](ARCHITECTURE.md) for system internals. Some areas for improvement:

- **Caching** — every page load re-fetches all APIs; stale-while-revalidate with a cache layer would reduce API pressure
- **Historical trending** — a lightweight persistence layer (SQLite, JSON file) would unlock trend-over-time views
- **Team-level filtering** — support for multiple repos/teams/squads
- **Notifications** — alert when the health score drops to Warning or Critical
- **Slack team filtering** — track only specified team members, not all channel participants
- ~~**Accessibility** — ARIA labels, keyboard navigation, screen reader support~~ *(done — focus traps, keyboard nav, aria-labels added in Phase 01.1)*

## License

MIT
