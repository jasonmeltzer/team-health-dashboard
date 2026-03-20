# Team Health Dashboard

AI-powered engineering team health dashboard that aggregates metrics from GitHub, Linear, and Slack, then uses Claude to generate actionable weekly insights.

## What It Does

- **Overall health score** with AI-generated insights and recommendations
- **GitHub PR metrics**: cycle time trends, review bottlenecks, stale PRs
- **Linear sprint metrics**: velocity/throughput trends, stalled issues, workload distribution
- **Time-in-state deep dive** (tabbed): summary stats, current WIP age, outlier issues, per-assignee heatmap, flow efficiency, lead time trends
- **Cycles / Weekly toggle**: supports both cycle-based sprints and continuous flow, switchable in the UI
- **Slack communication metrics**: response times, channel activity, overload detection
- **Weekly AI narrative**: a concise team health summary written by Claude
- **Graceful degradation**: unconfigured integrations are hidden, not errored

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) + TypeScript |
| Styling | Tailwind CSS |
| Charts | Recharts |
| AI | Claude API (Anthropic SDK) |
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
    +-- /api/github ---------> GitHub REST API
    +-- /api/linear ---------> Linear GraphQL API
    +-- /api/slack ----------> Slack Web API
    +-- /api/health-summary -> Aggregates all 3 + Claude AI
    +-- /api/weekly-narrative -> Full trend data + Claude AI
```

Each section loads independently with its own loading/error states.

## Getting Started

### Prerequisites

- Node.js 18+
- API tokens for the services you want to connect (at least one required):
  - **GitHub**: [Personal access token](https://github.com/settings/tokens) with `repo` scope
  - **Linear**: [API key](https://linear.app/settings/api) (Settings > API > Personal API keys)
  - **Slack**: [Bot token](https://api.slack.com/apps) with `channels:history`, `channels:read`, `users:read` scopes
  - **Anthropic**: [API key](https://console.anthropic.com/) for Claude-powered analysis

### Install & Run

```bash
git clone https://github.com/jasonmeltzer/team-health-dashboard.git
cd team-health-dashboard
npm install
cp .env.example .env.local
# Edit .env.local with your API tokens
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (for AI features) | Anthropic API key for Claude |
| `GITHUB_TOKEN` | For GitHub section | Personal access token (repo scope) |
| `GITHUB_ORG` | For GitHub section | GitHub organization name |
| `GITHUB_REPO` | For GitHub section | Repository name to track |
| `LINEAR_API_KEY` | For Linear section | Linear personal API key |
| `LINEAR_TEAM_ID` | For Linear section | Linear team ID |
| `SLACK_BOT_TOKEN` | For Slack section | Slack Bot OAuth token |
| `SLACK_CHANNEL_IDS` | For Slack section | Comma-separated channel IDs |

The dashboard gracefully handles missing integrations. Configure only the services you use.

## Project Structure

```
src/
├── app/
│   ├── page.tsx                  # Dashboard page
│   └── api/                      # API route handlers
│       ├── github/route.ts
│       ├── linear/route.ts
│       ├── slack/route.ts
│       ├── health-summary/route.ts
│       └── weekly-narrative/route.ts
├── components/
│   ├── dashboard/                # Shell, health card, narrative, metrics
│   ├── github/                   # PR charts and tables
│   ├── linear/                   # Sprint charts, time-in-state, workload
│   ├── slack/                    # Communication charts
│   └── ui/                       # Shared primitives (Card, Badge, etc.)
├── hooks/
│   └── useApiData.ts             # Generic data fetching hook
├── lib/
│   ├── github.ts                 # GitHub API client
│   ├── linear.ts                 # Linear GraphQL client
│   ├── slack.ts                  # Slack API client
│   ├── claude.ts                 # Anthropic SDK + prompt builders
│   └── utils.ts                  # Shared utilities
└── types/                        # TypeScript type definitions
```

## Design Decisions

- **No database**: keeps deployment simple. All metrics are computed on each request from the source APIs.
- **No Linear SDK**: uses raw GraphQL fetch to keep dependencies minimal and queries transparent.
- **Client-side data fetching**: each dashboard section loads independently, so slower sources (Slack, Claude) don't block the page.
- **Claude Sonnet** for analysis: good balance of quality and speed for a dashboard context.
- **Graceful degradation**: each integration is optional. The AI summary works with whatever data sources are configured.

## Deploy

Deploy to any platform that supports Next.js:

- **Vercel**: `npx vercel` (zero-config)
- **Docker**: `npm run build && npm start`
- **Any Node.js host**: build and serve on port 3000

Set environment variables in your deployment platform's settings.

## Contributing

Contributions welcome! Some ideas for improvement:

- Add caching/rate limiting for API calls
- Support multiple repos/teams
- Add date range selector
- Persist historical data with SQLite
- Add email/Slack notifications for health drops

## License

MIT
