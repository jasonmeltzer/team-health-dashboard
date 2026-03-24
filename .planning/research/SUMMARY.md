# Project Research Summary

**Project:** Team Health Dashboard — Milestone 2 Additions
**Domain:** Engineering team health / developer productivity dashboard (brownfield Next.js 16 App Router)
**Researched:** 2026-03-24
**Confidence:** MEDIUM

## Executive Summary

This milestone adds persistence, caching, OAuth, notifications, export, accessibility, and onboarding to an existing, well-structured stateless dashboard. The current system is clean: one-way data flow, no auth, no database, server-side in-memory caching, deterministic scoring. The additions are orthogonal — each concern has a distinct integration point and none require touching the existing data-fetching or scoring pipeline. The recommended approach is to build in strict dependency order: persistence first (it unblocks everything), then caching enhancements and notifications, then OAuth and onboarding, then export and accessibility as parallel workstreams. Minimal new dependencies are needed: `better-sqlite3` for persistence, `arctic` + `oslo` for OAuth, `html-to-image` + `jspdf` for export, and a handful of accessibility utilities.

The biggest risk is the persistence layer. Historical trending is both the highest-value missing feature (it's table stakes in every competing product) and the most pitfall-dense: SQLite write concurrency, cache/snapshot separation, schema versioning, and cold-start notification behavior all require careful design decisions before writing the first line of code. The schema must include `schemaVersion` and `activeSources` fields from day one, or trend charts become meaningless when integrations are added later. Notification logic must require a minimum of 2-3 snapshots before evaluating any alert condition to prevent alert fatigue on cold starts.

The project's two strongest existing differentiators — deterministic/auditable scoring and the three-provider AI system — must be protected throughout this milestone. LLM-generated scores are explicitly an anti-feature; this design choice has already earned trust from users and aligns with industry pushback against opaque AI scoring. OAuth is the one feature requiring an explicit go/no-go decision before implementation: PAT vs. OAuth token scope differences for the GitHub, Linear, and Slack APIs must be audited, or API calls will regress from 200 to 403 after migration.

## Key Findings

### Recommended Stack

The existing stack needs only targeted additions — no rewrites and no framework changes. For persistence, `better-sqlite3` v12.8.0 is the clear choice: synchronous API, zero extra processes, works in standard Next.js API routes, and matches the project's explicit "no heavy database" constraint. An ORM is not justified for a 1-2 table schema. For OAuth, `arctic` v3.7.0 with `oslo` v1.2.1 handles all three providers (GitHub, Linear, Slack) without the multi-user complexity of NextAuth/Auth.js. For export, `html-to-image` v1.11.13 (actively maintained, better SVG support than `html2canvas`) paired with `jspdf` v4.2.1 is the client-side path; server-side headless rendering (Puppeteer) is overkill for this tool. Accessibility tooling is `@axe-core/react` v4.11.1 (dev only) + `focus-trap-react` v12.0.0. Onboarding and form validation require no new libraries — extend the existing Settings Modal with wizard state and add `zod` v4.3.6 for server-side config validation.

**Core technologies:**
- `better-sqlite3` v12.8.0: SQLite persistence for score snapshots — synchronous, file-based, no extra process, works in Node.js API routes
- `arctic` v3.7.0 + `oslo` v1.2.1: OAuth 2.0 flows for GitHub/Linear/Slack — lightweight, no user-account model, PKCE support
- `html-to-image` v1.11.13 + `jspdf` v4.2.1: client-side PDF/screenshot export — captures live Recharts SVG, no server infrastructure
- `focus-trap-react` v12.0.0: keyboard focus management for existing modal components
- `@axe-core/react` v4.11.1: dev-time accessibility violation detection, zero production cost
- `zod` v4.3.6: server-side validation for Settings UI config fields
- Web Notifications API (browser native): in-app score-drop alerts, no library needed
- Extend `lib/cache.ts` with ETag support using Node.js built-in `crypto` — no new cache library

### Expected Features

Analysis of the competitive landscape (LinearB, Sleuth, Jellyfish, Haystack, DX, Swarmia) shows consistent table stakes that every product in this category provides. The project currently lacks three of the highest-priority ones.

**Must have (table stakes):**
- Historical score trending with 7d/30d/90d windows — universal across all competitors; without it the tool is a point-in-time curiosity, not a weekly habit
- Score breakdown explaining deductions — users distrust a score without transparency; the deterministic model is already built, the UI surface is the gap
- Notifications/alerts when score crosses Warning/Critical — required for the tool to be proactive rather than reactive; all major competitors include this
- Onboarding wizard — drop-off is highest in the first 10 minutes; API key + team ID configuration intimidates new users without guidance
- Empty states with setup guidance — a blank section reads as "broken"; informational placeholders already exist but coverage is incomplete

**Should have (competitive differentiators):**
- Customizable scoring weights — lets teams surface what matters most to them; DX and LinearB both offer this
- Export/share (PDF + Slack post) — engineering leaders need reporting artifacts; the Slack post is easiest to implement first
- Accessible, keyboard-navigable UI — increasingly required by enterprise buyers; charts need text equivalents
- Rate limit resilience with stale-data banner — professional trust signal; GitHub detection is partially done, needs ETags + cross-integration coverage
- Server-side caching (stale-while-revalidate) — makes the dashboard feel fast; the existing in-memory cache is the foundation

**Defer (v2+):**
- Team/sub-team filtering — high value for multi-squad orgs; complex contributor-mapping work; no dependency is unblocked by building this now
- OAuth authentication flows — high complexity, requires explicit scope audit before starting; PAT path works today
- Slack integration verification — testing/QA work; the integration exists but is untested with a real workspace
- Mobile-responsive layout — internal tool with data-dense charts; desktop is the target viewport

### Architecture Approach

The architecture research is unusually specific because it was grounded in the existing codebase. The new additions are designed as additive layers that do not disturb the stateless data-fetching pipeline. `lib/db.ts` is a singleton (following the same `globalThis` pattern as `cache.ts`) that owns all SQLite access. Historical snapshots are written inside the `health-summary` route handler, gated on `cached === false`, and read by a new `/api/health-history` route. OAuth tokens, after OAuth completion, are written to `.config.local.json` via the existing `saveConfig()` — making OAuth a setup mechanism, not a per-request auth mechanism. The `CacheStore` interface is already pluggable; a `SqliteCacheStore` can be swapped in without touching any consumer code.

**Major components:**
1. `lib/db.ts` — SQLite singleton, schema (`ensureSchema()`), queries for snapshots and history; WAL mode enabled on open; `import 'server-only'` guard to prevent Edge Runtime import
2. `/api/health-history` + `/api/snapshot` — read/write routes for the persistence layer; snapshot write triggered inside `health-summary` on fresh (non-cached) responses
3. `lib/session.ts` — stateless JWT cookie management (Jose) for OAuth state; token written to `.config.local.json` for persistence across sessions
4. `/api/auth/[provider]` routes — OAuth login/callback/logout; reuses `saveConfig()` so OAuth is additive to existing env-var config path
5. `lib/notify.ts` — score-drop detection and alert dispatch (Slack webhook or email); called from `/api/snapshot` after band-crossing check; requires minimum 2-3 stored snapshots before evaluating
6. `OnboardingWizard` component — first-run credential entry; reads `GET /api/config`, writes `POST /api/config`; dismissal stored in `localStorage`; does not replace the Settings Modal

### Critical Pitfalls

1. **SQLite write concurrency corruption** — Use a singleton connection module initialized on `globalThis`, enable WAL mode (`db.pragma('journal_mode = WAL')`), wrap writes in transactions. Never open the DB from multiple concurrent request handlers independently. Detection: "database is locked" in server logs.

2. **Historical snapshots written to the in-memory CacheStore** — The `CacheStore` is a short-lived API response cache that resets on process restart. Historical trend data must go to a separate durable module (`lib/snapshots.ts` or directly via `lib/db.ts`). The `manual:*` cache keys must remain isolated from snapshot storage. Detection: trend chart resets to 0 on every server restart.

3. **Snapshot schema changes break historical trend charts** — Every snapshot record must include `schemaVersion` and `activeSources` (which integrations were active). When a new integration is added, old snapshots become incomparable. The trend chart must filter to snapshots with matching `activeSources` or show a visual discontinuity marker. Detection: artificial score cliff on the day a new integration was configured.

4. **Notification logic fires on cold start** — When `previousScore` is null (no stored history), any current score appears as a massive drop. Require a minimum of 2-3 stored snapshots before evaluating alert conditions. Store "last alerted at" per alert type to prevent re-firing without a recovery cycle. Detection: alert fires immediately on first run with no prior data.

5. **OAuth scope regression vs. PATs** — GitHub, Linear, and Slack OAuth tokens may have narrower scopes than manually entered PATs, causing 403 errors on API calls that worked before. Audit all API endpoints and required scopes for each provider before writing any OAuth code. Keep env-var/Settings UI as fallback paths. Do not build OAuth until the scope matrix is documented and approved.

## Implications for Roadmap

Based on research, the dependency graph is clear and dictates phase order. The persistence layer is the critical path: it unblocks notifications, trend charts, and score history. OAuth is the most uncertain feature and should be deferred or treated as its own phase after a scope audit. Export and accessibility are independent workstreams that can be parallelized with later phases.

### Phase 1: Persistence Foundation
**Rationale:** Historical trending is table stakes (every competitor has it) and is the dependency for notifications, trend charts, and score comparison. It must come first. Schema design decisions made here (versioning, active-sources tracking) cannot be easily retrofitted later.
**Delivers:** SQLite singleton (`lib/db.ts`), snapshot write on fresh health-summary fetch, `/api/health-history` read route, score trend chart in the UI, "collecting trend data" empty state.
**Addresses:** Historical trending (table stakes), score trend chart, foundation for alerts.
**Avoids:** Pitfall 1 (WAL mode + singleton), Pitfall 2 (separate durable store from CacheStore), Pitfall 5 (schemaVersion + activeSources in schema), Pitfall 14 (snapshot keys isolated from manual:* cache keys).

### Phase 2: Caching Enhancement + Rate Limit Resilience
**Rationale:** Extends the existing `lib/cache.ts` with ETags and stale-data banner. Can share `lib/db.ts` from Phase 1 for the optional `SqliteCacheStore` swap. Independent of OAuth and notifications, low risk.
**Delivers:** ETag support on all API routes (derived from `cachedAt`), stale-data banner in UI, `SqliteCacheStore` as opt-in replacement for in-memory store.
**Uses:** Node.js built-in `crypto` for ETag hashing, existing `CacheStore` interface.
**Implements:** `SqliteCacheStore` swap (pluggable interface already in `lib/cache.ts`).
**Avoids:** Pitfall 7 (ETag derived from cachedAt, no Cache-Control max-age headers).

### Phase 3: Notifications + Alerts
**Rationale:** Depends on Phase 1 (needs stored snapshots to compute deltas). With a stable persistence layer, this is a pure addition — `lib/notify.ts` + alert dispatch. Band-crossing logic and cold-start guard must be designed carefully.
**Delivers:** `lib/notify.ts` (score-drop detection, Slack webhook dispatch, email dispatch), alert threshold configuration, "collecting baseline" UI indicator, notification config in Settings (boolean-flag only in GET /api/config).
**Addresses:** Notifications/alerts (table stakes), turns the tool from reactive to proactive.
**Avoids:** Pitfall 4 (minimum snapshot requirement), Pitfall 11 (no webhook URLs in GET /api/config), Pitfall 12 (route through TTL cache, no force-refresh polling).

### Phase 4: Onboarding Wizard + Empty States
**Rationale:** Independent of persistence and notifications. Reduces first-run drop-off. Can reference OAuth if it is complete, but does not depend on it — the wizard can use the env-var/settings path. Empty states are low-effort and high-trust-impact.
**Delivers:** `OnboardingWizard` component (GitHub → Linear → Slack → AI steps), dismissal via localStorage flag, completion state written to `.config.local.json`, improved empty states across all sections.
**Addresses:** Onboarding wizard (table stakes), empty states (table stakes).
**Avoids:** Pitfall 9 (reuses POST /api/config endpoint, pre-populates from GET /api/config, no parallel config write path).

### Phase 5: Customizable Scoring Weights
**Rationale:** Depends on Phase 1 (weight changes must be stored alongside snapshots for trend continuity). Standalone feature with no other external dependencies. A clear differentiator.
**Delivers:** Weight configuration UI in Settings Modal, per-signal weight sliders, updated scoring computation, weight fields stored with each snapshot, discontinuity markers in trend charts when weights change.
**Addresses:** Customizable scoring weights (differentiator).
**Avoids:** Pitfall 13 (weights stored per snapshot; trend chart shows discontinuity on weight change).

### Phase 6: OAuth Authentication
**Rationale:** The most uncertain feature. Requires an explicit scope audit before any code is written. After the audit, the implementation is straightforward: `arctic` + `oslo`, custom ~100-line callback handler, token written to `.config.local.json` via `saveConfig()`. OAuth is a setup-time convenience, not a per-request mechanism.
**Delivers:** `/api/auth/login|callback|logout` routes, "Connect via OAuth" buttons in Settings Modal and OnboardingWizard, token persistence via existing config system.
**Uses:** `arctic` v3.7.0, `oslo` v1.2.1, `lib/session.ts` (new).
**Avoids:** Pitfall 3 (scope audit before implementation), Pitfall 6 (verify org-scoped vs user-scoped data before sharing cache entries).
**Gate:** Do not start this phase until the GitHub/Linear/Slack scope matrix (PAT vs OAuth) is documented and approved.

### Phase 7: Export + Share
**Rationale:** Independent of all other phases. "Nice to have" reporting workflow for engineering leaders. Start with Slack post (simplest, reuses existing Slack client), then add PDF export. SVG rendering behavior with `html-to-image` should be validated in a spike before committing.
**Delivers:** Slack post export (structured text summary via `chat.postMessage`), PDF export button (`html-to-image` + `jspdf`), animation-disabled export mode for Recharts.
**Uses:** `html-to-image` v1.11.13, `jspdf` v4.2.1, existing `lib/slack.ts`.
**Avoids:** Pitfall 8 (disable Recharts animations during export; `isAnimationActive={false}` via context flag; spike SVG behavior before committing to client-side path).

### Phase 8: Accessibility
**Rationale:** Can be parallelized with other phases. Incremental work — start with highest-return items (aria-live regions, focus traps in modals) before tackling chart alternatives. `@axe-core/react` installs in dev and surfaces violations continuously throughout all other phases, making this a background concern.
**Delivers:** `@axe-core/react` dev-mode setup, `focus-trap-react` in SettingsModal and ManualAIResponseModal, `<button>` replacements for interactive `<div>` elements (metric cards, chart segments), visually-hidden `<table>` alternatives for Recharts SVG charts, `aria-live` regions for health score and loading states.
**Uses:** `@axe-core/react` v4.11.1 (dev), `focus-trap-react` v12.0.0.
**Avoids:** Pitfall 10 (tab-order audit first; prefer `<button>` over `tabIndex=0` + role="button"; no double-announcing).

### Phase Ordering Rationale

- Phases 1-3 are strictly ordered by dependency: persistence enables snapshots, snapshots enable notification deltas.
- Phase 4 (onboarding) is independent but benefits from Phase 6 (OAuth) being done — however, it should not be blocked by it. Build the env-var path in Phase 4; if OAuth ships later, the wizard gains a "Connect via OAuth" button.
- Phase 5 (custom weights) must follow Phase 1 because weight changes need to be stored per snapshot for trend continuity.
- Phase 6 (OAuth) is gated by a scope audit that should happen in parallel with Phase 1-2 development. If the audit completes favorably, Phase 6 can begin after Phase 4.
- Phases 7 and 8 are independent workstreams that can run in parallel with each other and with Phase 5+.

### Research Flags

Phases likely needing deeper research during planning:

- **Phase 6 (OAuth):** GitHub/Linear/Slack OAuth scope requirements vs. PAT capabilities must be audited against all API calls the dashboard currently makes. This is a prerequisite, not optional. The scope matrix needs explicit documentation before any implementation begins.
- **Phase 7 (Export):** `html-to-image` SVG behavior with Recharts has a known edge case (cross-origin SVG, ResizeObserver timing). A 1-2 hour spike is required before committing to the client-side export approach. If the spike fails, the fallback is server-side headless rendering — which introduces Puppeteer and process dependencies.

Phases with standard patterns (skip research-phase):

- **Phase 1 (Persistence):** `better-sqlite3` singleton + WAL mode is a well-documented Next.js pattern. Schema is trivial (1-2 tables). Architecture research already specifies the exact module boundaries.
- **Phase 2 (Caching):** ETag generation from `cachedAt` is a standard HTTP pattern. No novel decisions.
- **Phase 3 (Notifications):** Slack webhook dispatch is a one-call integration. Band-crossing logic is simple state comparison. The pitfall guards are fully specified in PITFALLS.md.
- **Phase 4 (Onboarding):** Extends existing Settings Modal with wizard state. No new libraries. Well-understood UI pattern.
- **Phase 5 (Scoring Weights):** Config UI + scoring formula modification. Architecture is additive. Main concern (snapshot versioning) is addressed in Phase 1 schema design.
- **Phase 8 (Accessibility):** Established patterns throughout. axe-core surfaces violations; fix them incrementally.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Most choices have verified npm versions; `better-sqlite3`, axe-core, focus-trap-react, and zod are mature and widely used. Arctic (MEDIUM) is the one library without Context7 verification. |
| Features | MEDIUM | Competitive landscape analysis based on training knowledge through August 2025; web search was unavailable. Core patterns (trending, alerts, export) are stable across the product category but specific feature parity claims for individual competitors should be verified before making competitive assertions. |
| Architecture | HIGH | Grounded in the existing codebase. Official Next.js App Router authentication docs were referenced. Module boundaries and data flows are specific and buildable as described. |
| Pitfalls | MEDIUM | SQLite concurrency, notification cold-start, and OAuth scope regression are well-established pitfalls with specific mitigations documented. Accessibility and export pitfalls draw from domain knowledge (WCAG, Recharts rendering lifecycle) without live doc verification in this session. |

**Overall confidence:** MEDIUM-HIGH. The architecture and stack choices are well-grounded; the feature prioritization is informed by competitive landscape knowledge with the caveat that web verification was unavailable.

### Gaps to Address

- **OAuth scope matrix:** Before Phase 6 begins, document which GitHub API endpoints the dashboard calls, whether they require `repo`, `read:org`, or other scopes, and whether OAuth App tokens (user tokens) or GitHub Apps installation tokens are the right model. Same analysis for Linear (personal vs. organization tokens) and Slack (bot vs. user token behavior for `conversations.history`).
- **`html-to-image` + Recharts SVG compatibility:** Validate in a spike during Phase 7 planning. If client-side export fails on SVG rendering, reassess whether a lightweight server-side path (e.g., a dedicated `/api/export` route calling a headless browser via Playwright) is justified.
- **Slack integration verification:** Slack is marked "untested" in the existing codebase. Before adding Slack-dependent features (Phase 3 Slack webhook alerts, Phase 7 Slack post export), a real workspace integration test should be completed. This should be tracked as a prerequisite, not a phase of its own.
- **`resend` email pricing:** If email notifications are in scope for Phase 3, verify Resend's free tier (100 emails/day) is sufficient before committing to the library. nodemailer is an acceptable fallback if the user already has SMTP credentials.

## Sources

### Primary (HIGH confidence)
- Next.js App Router Authentication docs (official, 2026-03-20): https://nextjs.org/docs/app/guides/authentication
- npm registry: version lookups for all packages (2026-03-24)
- Existing codebase: `src/lib/cache.ts`, `src/lib/config.ts`, `src/lib/scoring.ts`, `src/hooks/useApiData.ts`
- W3C Web Notifications API specification (stable standard)

### Secondary (MEDIUM confidence)
- CLAUDE.md: existing stack constraints and patterns, known constraints section
- PROJECT.md: explicit "no heavy database" constraint, out-of-scope list, 13-item gap analysis
- Training knowledge: LinearB, Sleuth, Jellyfish, Haystack, DX, Swarmia competitive feature landscape (through August 2025 cutoff)
- Domain knowledge: SQLite WAL mode behavior, Next.js App Router module singleton patterns, Recharts rendering lifecycle

### Tertiary (LOW confidence)
- Arctic v3.7.0 OAuth library: recommended but could not be verified via Context7 during this session — verify against official Arctic docs before implementing Phase 6
- Resend email pricing: training knowledge, not verified against current pricing page

---
*Research completed: 2026-03-24*
*Ready for roadmap: yes*
