# Feature Landscape: Engineering Team Health Dashboards

**Domain:** Engineering team health / developer productivity dashboards
**Researched:** 2026-03-24
**Confidence note:** Web search unavailable. Analysis draws from training knowledge of LinearB, Sleuth, Jellyfish, Haystack, DX, Swarmia, Waydev, and Pluralsight Flow (all observed through August 2025 cutoff). Confidence is MEDIUM — competitive landscape patterns are well-established but specific feature parity claims should be verified against current product docs before roadmap commitments.

---

## Table Stakes

Features users expect from any engineering health dashboard. Missing = product feels incomplete or users abandon after first week.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Historical trending (score + metrics over time) | A snapshot tells you where you are; trends tell you if you're improving. Every serious competitor provides time-series views. Without it the dashboard is a point-in-time curiosity, not a tool you check weekly. | High | Requires persistence layer. Foundation for alerts. Currently the #1 gap. |
| Configurable date range / lookback | Different teams have different sprint cadences and planning horizons. Forcing one window makes data feel wrong. | Low | Already partially implemented (per-section sliders). Needs consistent application and saved preferences. |
| Score breakdown explaining why the score is what it is | Engineers and managers will distrust a score without transparency. Every product (LinearB, Sleuth, DX) provides signal-level drill-down. | Low | Deduction model is already deterministic. UI surface for "what cost us points" is the gap. |
| Team / sub-team filtering | Most orgs have multiple squads in one repo. Showing aggregate data across all teams obscures squad-level problems. Jellyfish and LinearB make this a first-class concept. | High | Requires mapping contributors (GitHub login, Linear assignee, Slack user) to team definitions. |
| Notifications / alerts when score degrades | Dashboards you check only when you remember provide little value. Push notification (email, Slack DM) when score drops to Warning or Critical turns the tool from reactive to proactive. | Medium | Depends on historical trending to detect change direction. |
| Empty states with guidance | When a filter returns no data or an integration is not configured, showing nothing erodes trust. Users assume the tool is broken. | Low | Straightforward UI work; critical for first-run experience. |
| Onboarding / setup wizard | API keys, org slugs, team IDs — the initial config is intimidating. LinearB, Swarmia, and DX all invest heavily in guided onboarding because drop-off is highest in first 10 minutes. | Medium | Step-by-step wizard + persistent completion checklist until fully configured. |
| Accessible, keyboard-navigable UI | Increasingly required by enterprise buyers. Charts need text equivalents. Without it the product is a liability for companies with accessibility policies. | Medium | ARIA labels, focus management, chart summaries. Not glamorous but blocks enterprise adoption. |

---

## Differentiators

Features that are not universally expected but create meaningful competitive advantage and user loyalty when done well.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Customizable scoring weights | Teams weight what matters to them. A startup in hypergrowth cares more about deploy frequency; a maturing team cares more about review quality. LinearB and DX both offer weight customization. The insight surfaced from it is richer than fixed weights. | Medium | Config UI + weight storage. Score computation already supports per-signal weighting conceptually. |
| Export / share snapshots | Engineering leaders need to report health to non-technical stakeholders in standups, retros, QBRs. A one-click PDF export or Slack post removes the screenshot-and-paste workflow. Haystack and Sleuth both provide this. | Medium | PDF is hardest (puppeteer/wkhtmltopdf). Slack post via webhook is easiest. Consider starting with clipboard-friendly HTML rendering. |
| AI narrative insights (prose, not just numbers) | Competitors provide raw metrics; narrative context ("your review bottleneck worsened because two reviewers were OOO") is harder to replicate and more actionable. The three-provider AI system (Ollama/Anthropic/Manual) is a genuine differentiator — especially for teams that can't share data with cloud AI. | High (already built) | Manual mode (no API key, works with any AI chat) is unique in this space. |
| OAuth integration flows | Reduces setup friction dramatically. Users authenticate in one click rather than hunting for API keys and scopes. Swarmia and LinearB use OAuth exclusively. | High | Significant complexity tradeoff: token refresh, encrypted storage, scope limitations vs PATs. Already flagged as "needs evaluation" in backlog. |
| Deterministic, auditable scoring | Teams trust scores they can reproduce. LLM-generated scores feel arbitrary and fluctuate. The deduction model (100 minus penalties, explained per-signal) is genuinely differentiated — most AI-first competitors don't offer this. | Low (already built) | Protect this design choice; it's a trust foundation. |
| Slack team member roster scoping | Slack metrics often pollute team-level analysis with noise from adjacent channels and guest users. Filtering to a declared roster gives ops and platform teams accurate signal. | Low–Medium | Optional config: list of Slack user IDs or emails that define "the team." |
| Rate limit resilience with stale-data banner | Most self-hosted dashboards silently fail or show errors when hitting API limits. Surfacing stale data with a clear "rate limited, showing data from X hours ago" banner is trustworthy and professional. | Medium | Partially implemented (GitHub detection). Needs ETags, TTL cache, and stale banner across all integrations. |
| Server-side caching (stale-while-revalidate) | Re-fetching all APIs on every page load makes the dashboard slow and burns API quota. A short TTL cache (5–15 min) with background revalidation makes the dashboard feel instant. | Medium | In-memory or Redis. Must degrade gracefully under rate limits. |

---

## Anti-Features

Features to explicitly NOT build. Building them would consume roadmap capacity without proportional user value, or would compromise existing design decisions.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| LLM-generated health scores | Scores that depend on LLM output are non-deterministic: same data can yield different scores across refreshes. Users can't reproduce or audit them. DX and Jellyfish have faced criticism for opaque AI scoring. | Keep the deduction model. LLM's role is insight generation only, never scoring. |
| Real-time WebSocket streaming | Dashboard data (PRs, issues, deploys) changes on minute-to-hour cadence. Streaming adds infrastructure complexity with no perceptible benefit for this cadence. | Polling on refresh + stale-while-revalidate cache is sufficient. |
| Multi-tenant / user accounts / auth layer | This is a self-hosted internal tool. Adding accounts, sessions, and RBAC is a project of its own and changes the product category. | Keep it single-tenant. OAuth is for *integrations*, not user login. |
| Mobile app | The data density and chart interactivity require a desktop viewport. A responsive web UI that degrades gracefully is sufficient. | Ensure the web UI doesn't break below 768px, but don't build native mobile. |
| Custom metric builders (drag-and-drop query editor) | Engineering health has a well-understood signal set. A query builder adds UX complexity and support burden without adding more insight than the existing curated signals. | Provide scoring weight customization and team filtering instead — same configurability with less complexity. |
| Heavy database / ORM / migration framework | The project explicitly scopes persistence to "lightweight." Adding Postgres + Prisma + migrations changes the operational model and onboarding requirements dramatically. | SQLite via `better-sqlite3` or append-only JSON files. Keep it zero-infrastructure. |
| Bi-directional integrations (write back to GitHub/Linear) | Creating issues, closing PRs, or updating Linear items from the dashboard blurs responsibility and creates data integrity risks. | Read-only. Surface links to the originating tool for any action. |

---

## Feature Dependencies

```
Historical trending (persistence layer)
  → Notifications/alerts (needs stored snapshots to detect changes)
  → Score trend chart (needs time-series score data)
  → Metric trend overlays (needs time-series metric data)

Team/sub-team definitions (team roster config)
  → Team-level filtering in GitHub section
  → Team-level filtering in Linear section
  → Slack team member roster scoping
  → Per-team health scores

OAuth integration flows
  → Requires: Client ID/secret registration per integration
  → Enables: Simpler onboarding wizard (fewer manual steps)
  → Tradeoff evaluation required before building (see PROJECT.md)

Onboarding wizard
  → Benefits from: OAuth flows (fewer manual steps)
  → Can be built independently with env var / settings UI path
  → Empty states (informational): can be built independently

Server-side caching
  → Enables: stale-data banner under rate limits
  → Rate limit resilience completion depends on this

Customizable scoring weights
  → Depends on: nothing (can be built on existing score model)
  → Enhances: historical trending (weight changes should be versioned)
```

---

## MVP Recommendation for This Milestone

The active backlog (from PROJECT.md) lists 13 features. Priority order based on dependencies, user impact, and build effort:

**Build first (blocks other features or highest trust impact):**
1. **Historical trending** — foundation for alerts, unlocks the most user value. Required before notifications.
2. **Server-side caching + stale banner** — makes the existing dashboard feel professional. Low risk, high trust impact.
3. **Empty states** — small effort, eliminates "is this broken?" confusion during onboarding.

**Build second (high independent value):**
4. **Onboarding wizard** — reduces drop-off for new users; can be built without OAuth.
5. **Customizable scoring weights** — differentiator; standalone feature, no dependencies.
6. **Notifications/alerts** — fast follow after historical trending; turns the tool from reactive to proactive.

**Build third (meaningful but more complex):**
7. **Team-level views** — high value for multi-squad orgs; complex data-mapping work.
8. **Export/share** — valuable for reporting; Slack webhook is the easiest starting point.
9. **Accessibility** — important for enterprise adoption; can be tackled incrementally.

**Evaluate separately (high complexity or dependencies need resolution first):**
10. **OAuth authentication** — tradeoffs not yet evaluated (scope vs PAT, encrypted storage). Build only after explicit decision.
11. **Slack verification** — testing/QA work, not a feature build.
12. **Slack team member filtering** — good value but dependent on Slack being verified first.
13. **Rate limit completion (Linear/Slack)** — once caching is in place, this is more straightforward.

---

## Competitive Landscape Notes

**LinearB** (MEDIUM confidence): Focuses on "developer experience" metrics. Offers team-level views, goal-setting, branching strategy analysis. Strong historical trending with configurable benchmarks (industry vs internal). Heavy SaaS — not self-hostable.

**Sleuth** (MEDIUM confidence): DORA-focused. Strong deployment frequency and lead time tracking. Change failure rate and MTTR are first-class. Integrates deeply with GitHub, Jira, PagerDuty. Has Slack notifications as table stakes.

**Jellyfish** (MEDIUM confidence): Investment intelligence angle — maps engineering work to business outcomes. Strong team/squad filtering. Expensive enterprise tier. Not directly comparable for self-hosted use.

**Haystack** (MEDIUM confidence): Developer-facing metrics emphasis. PR cycle time, review depth, focus time. Export capabilities. Team filtering is standard.

**DX** (MEDIUM confidence): Survey + metrics hybrid. Combines developer sentiment (surveys) with hard metrics. Customizable weights are a key feature. Strong on score transparency.

**Swarmia** (MEDIUM confidence): GitHub-native. Strong PR review metrics and working agreement tracking. OAuth-first onboarding. Notifications via Slack are table stakes in the product.

**Common patterns across all competitors:**
- Historical trending with 7d/30d/90d windows is universal
- Team/squad filtering is expected beyond the smallest orgs
- Slack notifications on score thresholds are present in every product
- Export (PDF or shareable link) is present in all products priced above free tier
- Score transparency (what caused the score) is increasingly expected as teams got burned by opaque AI scoring

---

## Sources

Analysis based on training knowledge (LinearB, Sleuth, Jellyfish, Haystack, DX, Swarmia, Waydev, Pluralsight Flow) through August 2025 cutoff. Web search was unavailable at research time.

Confidence rating: MEDIUM. Core competitive patterns (trending, team filtering, notifications, export) are stable and well-established across this product category. Specific feature parity claims for individual products may be stale — verify against current product documentation before making competitive claims.

Internal source: PROJECT.md gap analysis (2026-03-21) and CLAUDE.md architecture documentation.
