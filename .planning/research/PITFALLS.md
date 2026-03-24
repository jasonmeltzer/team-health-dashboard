# Domain Pitfalls

**Domain:** Engineering team health dashboard — adding persistence, caching, OAuth, notifications, export, accessibility, and onboarding to an existing Next.js 16 (App Router) application
**Researched:** 2026-03-24
**Confidence:** MEDIUM — based on existing codebase analysis and domain knowledge; web verification unavailable during this session

---

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or major regressions.

---

### Pitfall 1: SQLite in a Next.js API Route Causes Concurrency Corruption

**What goes wrong:** Adding SQLite via `better-sqlite3` (synchronous) or `@libsql/client` to an API route handler works fine in development but silently corrupts data or throws "database is locked" errors under concurrent requests. Next.js App Router can handle multiple simultaneous API calls, and SQLite WAL mode helps but does not eliminate this in all deployment targets.

**Why it happens:** SQLite is a single-writer database. When two requests (e.g., health summary snapshot write + historical read) hit the DB simultaneously, the synchronous driver blocks or the async driver receives SQLITE_BUSY. Production builds can also place the DB file in a read-only filesystem (Vercel, Docker images).

**Consequences:** Partial writes of health snapshots, corrupted trend data, or silent data loss. Trend charts show gaps or flatlines. Score history becomes unreliable.

**Prevention:**
- Use a singleton DB connection module and initialize it once on `globalThis` (same pattern as `cache.ts` already uses for the in-memory cache).
- Enable WAL mode: `db.pragma('journal_mode = WAL')` immediately after opening.
- Wrap all writes in transactions. Never write from multiple concurrent requests without a queue or mutex.
- For SQLite specifically: keep the DB file outside `public/`, outside the Next.js build output, and in a stable path (e.g., `./data/snapshots.db`).
- Consider JSON file persistence as a simpler alternative if write frequency is low (one snapshot per refresh cycle).

**Detection:** "database is locked" errors in server logs; trend data showing fewer data points than expected; intermittent 500 errors on health summary endpoint during rapid refresh.

**Phase:** Historical Trending (must be addressed before building the persistence layer)

---

### Pitfall 2: In-Memory Cache is Lost on Every Server Restart — Breaking Trend Continuity

**What goes wrong:** The existing `cache.ts` uses an in-memory `Map`. Adding historical trending by writing to this cache (rather than a durable store) means all historical data vanishes on every `npm run dev` restart, Next.js hot reload, or production deployment. Engineers assume trend data is accumulating; it silently resets.

**Why it happens:** `globalThis.__apiCache` survives Turbopack module reloads within a session, but not process restarts. The current design is explicitly documented as "swap InMemoryCacheStore for filesystem/Redis/SQLite later" — this swap must happen before trend data is meaningful.

**Consequences:** Trend charts always show a single data point (or a flat line) in practice. Engineers trust the chart; trends mislead.

**Prevention:**
- Do not store historical snapshots in the existing `CacheStore`. The `CacheStore` interface is designed for short-lived API response caching, not durable persistence.
- Introduce a separate `lib/snapshots.ts` module that writes to a durable store (SQLite or JSON file). Keep it structurally separate from `cache.ts`.
- Add a startup check: if the snapshot store contains 0 records, display a "Collecting trend data — check back after a few refreshes" state rather than an empty or misleading chart.

**Detection:** Trend chart has only 1 data point after running the server for hours; restarting the server resets the chart to 0 points.

**Phase:** Historical Trending

---

### Pitfall 3: OAuth Token Storage Without Encryption Exposes Integration Secrets

**What goes wrong:** Implementing OAuth for GitHub, Linear, or Slack and storing the resulting access tokens in `.config.local.json` (the existing config store) or in plaintext SQLite means tokens are as exposed as API keys typed manually — but OAuth access tokens typically have broader implicit permissions than users expect and may be harder to revoke.

**Why it happens:** The gap analysis explicitly flags this: "potential loss of functionality (e.g., GitHub PATs may have broader scope than OAuth tokens; bot vs user tokens in Slack behave differently), added complexity (client ID/secret registration, token refresh, encrypted storage)." The existing `saveConfig()` writes to a plaintext JSON file.

**Consequences:** Access tokens in source control if `.config.local.json` is accidentally committed (it is in `.gitignore` now, but this is a single line of defense). Token scope mismatch: GitHub OAuth Apps issue user tokens with only the scopes the user authorized, which may be narrower than what the dashboard's API calls require (e.g., `read:org` for listing team members).

**Prevention:**
- Before building OAuth: audit which GitHub API endpoints the dashboard currently calls and verify they work with OAuth user tokens vs. PATs. Document the required scopes.
- If tokens must be persisted to disk, encrypt them using a key derived from a server-side secret (e.g., an `ENCRYPTION_KEY` env var), not stored alongside the token.
- Implement token refresh for providers that issue short-lived tokens (Linear OAuth tokens expire; GitHub OAuth App tokens do not, but GitHub Apps installation tokens do).
- Keep env var / Settings UI config as the fallback — do not remove these paths. OAuth is an additive UX improvement, not a replacement.
- Do not build OAuth until the scope comparison (PAT vs OAuth) is explicitly documented and decided.

**Detection:** API calls start returning 403 after OAuth migration where they returned 200 with PATs; token file visible in `git status` output.

**Phase:** OAuth Authentication (requires explicit scope analysis before implementation)

---

### Pitfall 4: Notification "Score Drop" Logic Fires Constantly on Startup

**What goes wrong:** Notification logic compares the current score to the previous score. If historical data is absent (cold start, first run, data store wiped), `previousScore` is `null` or `0`, so any real score (e.g., 72) appears to be a massive improvement or drop. Alerts fire on startup with misleading content ("Score dropped to 72 from 0").

**Why it happens:** Notification logic needs at least two data points to compute a meaningful delta. This is trivially true but easy to skip when prototyping the feature.

**Consequences:** Alert fatigue — users receive spurious notifications on every server restart, first-time setup, or after data migration. They start ignoring or disabling notifications.

**Prevention:**
- Require a minimum of 2 stored snapshots before evaluating any alert conditions.
- Use a "steady-state" window: only alert if the score has been in the new band (Warning/Critical) for N consecutive snapshots (e.g., 2 or 3), not just one sample.
- Store the "last alerted at" timestamp per alert type. Do not re-fire the same alert until the score has recovered and dropped again.
- Show a UI indicator: "Alerts active — collecting baseline (N of 3 snapshots needed)" until the minimum is met.

**Detection:** Notification fires immediately on first run with no prior data; alerts repeat every refresh cycle without any actual score change.

**Phase:** Notifications/Alerts (depends on Historical Trending being stable first)

---

### Pitfall 5: Snapshot Schema Changes Break Historical Trend Charts

**What goes wrong:** The scoring model evolves (new signals added, weights adjusted, integration sources added). Old snapshots in the durable store were computed with the old model. When new signals are added, old snapshots lack those fields — the trend chart either crashes, shows gaps, or misleadingly compares old scores (computed without DORA, say) to new scores (computed with DORA).

**Why it happens:** Scoring is deterministic and parameterized by which integrations are connected. Adding a new source (e.g., fully activating Slack) changes the rescaling denominator. A score of 85 with GitHub-only is not the same as 85 with GitHub + Linear + Slack.

**Consequences:** Trend charts show an artificial score cliff or spike at the point a new integration was added. Historical comparisons become meaningless.

**Prevention:**
- Store the snapshot schema version alongside each record (e.g., `schemaVersion: 1`).
- Store which integrations were active when the snapshot was computed (e.g., `activeSources: ["github", "linear"]`). This is already tracked implicitly by the scoring logic.
- When rendering trend charts, either: (a) filter to snapshots with the same active sources, or (b) display a visual discontinuity marker when sources changed.
- Avoid migrating old snapshots to new schemas — it is safer to mark them as incompatible and let the chart exclude them with a note.
- Keep the snapshot store append-only. Never recompute historical scores.

**Detection:** Trend chart shows an abrupt score jump on the day a new integration was configured; chart crashes with "Cannot read property X of undefined" on old snapshot records.

**Phase:** Historical Trending (design the schema before writing the first snapshot)

---

## Moderate Pitfalls

---

### Pitfall 6: Server-Side Cache Key Doesn't Include OAuth Identity, Serving Wrong User's Data

**What goes wrong:** The current `buildCacheKey` function creates keys from source name + parameters (lookback days, stale threshold, etc.). If OAuth is added and different users authenticate with different tokens, the same cache key can return User A's data to User B.

**Why it happens:** The existing cache is designed for a single-user, single-config deployment (internal tool, no auth layer). OAuth implicitly introduces multiple identities into what was a single-identity system.

**Consequences:** User B sees User A's team health data. Less severe in a small internal team context, but still a correctness bug.

**Prevention:**
- If OAuth users share the same underlying GitHub org/repo/team, the data is the same for all users — safe to share a cache. Verify this is always true before assuming it.
- If per-user scoping is needed, add a `userId` or `tokenHash` component to cache keys.
- Consider whether OAuth is even the right model for this tool. The gap analysis notes it is an "internal team tool, no auth layer needed" — OAuth may introduce complexity that exceeds the UX benefit for the target use case.

**Detection:** Two browser sessions with different OAuth tokens show identical data when they should differ.

**Phase:** OAuth Authentication

---

### Pitfall 7: ETag / HTTP Caching Conflicts with the Existing In-Memory Cache Layer

**What goes wrong:** Adding `ETag` or `Cache-Control` headers to Next.js API routes while the existing `getOrFetch` in-memory cache is also active creates two independent TTL systems that can diverge. The client gets a 304 Not Modified from the HTTP layer but the in-memory cache has refreshed data. Or the in-memory cache expires and refetches, but the client still sends its cached ETag and gets a stale 304.

**Why it happens:** The current architecture uses in-memory caching entirely server-side (no HTTP cache headers are currently set). Adding HTTP-layer caching is a separate concern and requires coordination.

**Prevention:**
- If adding ETags, derive them from `cachedAt` timestamp in the `GetOrFetchResult`: `ETag: "\"${result.cachedAt}\""`. This ensures the ETag changes exactly when the server's data changes.
- Set `Cache-Control: no-store` on endpoints that return sensitive data (access tokens, personal metrics) even if they are normally cached.
- Do not add `Cache-Control: max-age` headers unless you are willing to accept browser-cached responses bypassing the RefreshButton. The existing pattern (client fetches fresh, server returns from cache) is correct for a dashboard with an explicit refresh action.

**Detection:** RefreshButton click produces no data change in the UI even though new data is available; browser DevTools shows 304 responses where 200 is expected.

**Phase:** Server-side Caching Enhancement

---

### Pitfall 8: PDF/Screenshot Export Breaks on Dynamic Chart Rendering

**What goes wrong:** Recharts renders SVG/Canvas elements client-side. When triggering a screenshot or PDF export (via `html2canvas`, `puppeteer`, or the browser Print API), charts frequently appear blank, show partial renders, or exhibit styling inconsistencies because the export captures DOM state before Recharts has finished drawing.

**Why it happens:** Recharts uses `ResizeObserver` to determine chart dimensions and renders asynchronously. `html2canvas` takes a snapshot synchronously; if called before charts have completed their animation or resize cycle, the SVG viewBox is empty or sized incorrectly.

**Prevention:**
- Use `puppeteer` or Playwright headless render (server-side) rather than client-side `html2canvas` for reliable exports. Headless browsers wait for the paint cycle.
- If client-side export is required, disable Recharts animations for the export render pass and wait for all charts to emit their `onAnimationEnd` callbacks before capturing.
- Add `isAnimationActive={false}` to all chart components during export mode (use a context flag).
- For Slack post export, prefer a structured text/JSON summary over a screenshot — it is more reliable and accessible.

**Detection:** Exported PDF has white boxes where charts should appear; screenshot shows only the skeleton/loading state of charts.

**Phase:** Export/Share

---

### Pitfall 9: Onboarding Wizard Diverges from Settings Modal State

**What goes wrong:** The onboarding wizard and the Settings Modal both write configuration. If they maintain separate state or use different save paths, a user who partially completes the wizard then opens Settings sees stale values (or vice versa). Worse: completing the wizard may overwrite Settings UI values the user set manually.

**Why it happens:** The existing `saveConfig()` in `lib/config.ts` merges values, so partial writes are safe. But if the onboarding wizard holds in-flight form state locally and the Settings Modal reads from the server (`GET /api/config`), they can show conflicting values between saves.

**Prevention:**
- Make the onboarding wizard use the same `POST /api/config` endpoint as the Settings Modal — do not introduce a new config write path.
- On each wizard step, call `GET /api/config` to pre-populate fields with any existing configuration (the user may have set env vars or used Settings previously).
- The wizard should be a view mode of the settings system, not a parallel system. Reuse Settings UI field components where possible.
- Store onboarding progress (which steps are complete) as a separate, non-sensitive flag (e.g., in `localStorage` or a dedicated `ONBOARDING_COMPLETE` key in `.config.local.json`) so it does not interfere with integration credentials.

**Detection:** Completing the onboarding wizard clears a GitHub token that was set via the Settings Modal; wizard shows empty fields for values that were saved via env vars.

**Phase:** Onboarding Flow

---

### Pitfall 10: Accessibility Retrofitting Breaks Existing Keyboard Navigation and Focus Management

**What goes wrong:** Adding ARIA labels and `role` attributes to components retroactively can cause screen readers to announce duplicate or contradictory information. Adding `tabIndex` attributes to clickable `<div>` elements (the metric cards, bar chart segments) creates focus traps or breaks the natural tab order of the dashboard.

**Why it happens:** The dashboard uses many custom interactive elements: clickable metric cards that scroll to sections, Review Bottleneck bar segments that expand detail, Workload Distribution bars that show issue lists. These are `<div>` or SVG elements with `onClick` handlers — they work visually but are invisible to screen readers and keyboard users.

**Consequences:** Screen readers announce charts as meaningless "group" elements; keyboard-only users cannot reach chart interaction points; adding `tabIndex=0` to all interactive divs creates a tab order that visits 50+ elements before reaching the first text content.

**Prevention:**
- Start accessibility work with a focus traversal audit: map which elements are interactive and in what order a keyboard user would encounter them.
- Prefer replacing interactive `<div>` elements with `<button>` elements — they are keyboard-focusable and announced correctly by default, with no `tabIndex` management needed.
- For charts (Recharts SVGs), add a data table alternative below each chart (visually hidden with `sr-only`) rather than trying to make SVG elements fully navigable.
- Add `aria-live="polite"` regions for dynamic content (health score, loading states) before adding labels elsewhere — this gives the highest accessibility return per effort.
- Do not add `role="button"` + `tabIndex=0` to elements that are already wrapped in a real `<button>` (double-announcing).

**Detection:** Screen reader announces "button button Open PRs" (double announce); Tab key skips the health score value and goes directly to a chart tooltip.

**Phase:** Accessibility

---

## Minor Pitfalls

---

### Pitfall 11: Notification Channel Config Added to Settings UI Leaks Webhook URLs

**What goes wrong:** When adding notification configuration (Slack webhook URL, email address) to the Settings Modal, these values are saved to `.config.local.json` and returned by `GET /api/config`. The config status endpoint currently returns only boolean presence flags (not secret values), but if this contract is loosened, webhook URLs or email addresses become visible in browser network traffic.

**Prevention:**
- The `GET /api/config` endpoint must never return secret values — only boolean flags. This is the existing contract; do not break it when adding notification config keys.
- Treat notification channel URLs/addresses as secrets in the same category as API keys.

**Phase:** Notifications/Alerts

---

### Pitfall 12: Historical Snapshot Polling Amplifies Upstream API Rate Limits

**What goes wrong:** If the notification system polls the health score on a fixed interval (e.g., every 5 minutes via a cron job or `setInterval`), it bypasses the existing `force=false` cache behavior and may trigger upstream API calls on every poll cycle. With multiple integrations (GitHub, Linear, Slack, DORA), each poll can fire 4+ API calls.

**Prevention:**
- The notification/snapshot system should reuse the existing `getOrFetch` TTL cache — never call `fetchSourceData()` with `force=true` on a schedule.
- Trigger snapshots on user-initiated refresh events, not on a background poll. The dashboard is a point-in-time tool; polling adds rate limit pressure for marginal value.
- If background polling is needed, make the interval configurable and default to no less than 30 minutes.

**Phase:** Notifications/Alerts, Historical Trending

---

### Pitfall 13: Customizable Scoring Weights Invalidate Historical Comparisons

**What goes wrong:** If a user changes scoring weights (e.g., doubles the weight of GitHub signals), all historical scores become incomparable to the new configuration. A score of 72 computed last week with default weights means something different than 72 computed today with custom weights.

**Prevention:**
- Store the scoring weights that were active when each snapshot was computed alongside the snapshot record.
- When rendering trend charts, group snapshots by weight configuration and display a discontinuity marker when weights changed.
- Consider showing trend charts in terms of "deduction breakdown by category" (raw deduction points) rather than the rescaled 0-100 score — this is more robust to weight changes.

**Phase:** Customizable Scoring Weights (should come after Historical Trending is stable)

---

### Pitfall 14: Manual AI Mode Cache Keys Collide with Historical Snapshot Keys

**What goes wrong:** The existing manual AI mode uses `manual:health-summary` and `manual:weekly-narrative` as cache keys in the in-memory `CacheStore`. If historical snapshots are keyed with a similar `snapshot:*` prefix in the same store, a clear-cache operation (e.g., user hits Refresh) could purge both in-flight AI responses and historical data.

**Prevention:**
- Keep historical snapshots in a separate durable store (`lib/snapshots.ts`), not in the `CacheStore`. The `CacheStore` is short-lived by design. This is consistent with Pitfall 2.
- The `manual:*` keys in `CacheStore` are intentionally short-lived (survive page refresh, not server restart) — this is correct behavior and should remain isolated from durable persistence.

**Phase:** Historical Trending

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|----------------|------------|
| Historical Trending (persistence layer) | SQLite write concurrency corruption (Pitfall 1) | Singleton connection + WAL mode + transactions |
| Historical Trending (persistence layer) | In-memory cache used instead of durable store (Pitfall 2) | Separate `lib/snapshots.ts` module, never write to `CacheStore` |
| Historical Trending (schema design) | Schema changes invalidate old snapshots (Pitfall 5) | Include `schemaVersion` + `activeSources` in every record |
| Notifications/Alerts | Alerts fire on cold start / zero baseline (Pitfall 4) | Require minimum 2–3 snapshots before evaluating alert conditions |
| Notifications/Alerts | Poll-triggered API rate limit amplification (Pitfall 12) | Route through TTL cache, no background force-refresh |
| Notifications/Alerts | Notification config leaks webhook URLs via config endpoint (Pitfall 11) | Config endpoint returns boolean flags only — no secret values |
| OAuth Authentication | Scope regression vs. PATs (Pitfall 3) | Audit required API scopes before writing any OAuth code |
| OAuth Authentication | Cache serves wrong user's data (Pitfall 6) | Verify data is org-scoped (not user-scoped) before sharing cache entries |
| Server-side Caching | ETag conflicts with in-memory cache (Pitfall 7) | Derive ETags from `cachedAt`; avoid `Cache-Control: max-age` |
| Export/Share | Recharts renders blank in screenshot (Pitfall 8) | Use headless render or disable animations during export |
| Onboarding Flow | Wizard diverges from Settings Modal state (Pitfall 9) | Reuse existing `POST /api/config` endpoint; pre-populate from `GET /api/config` |
| Accessibility | Retrofitting breaks focus order or double-announces (Pitfall 10) | Audit tab order first; replace `<div onClick>` with `<button>` |
| Customizable Weights | Weight changes invalidate historical trends (Pitfall 13) | Store weights with each snapshot; show discontinuity markers |
| All persistence work | `manual:*` cache keys collide with snapshot keys (Pitfall 14) | Keep snapshots in a separate durable store, never in `CacheStore` |

---

## Sources

- Codebase analysis: `src/lib/cache.ts`, `src/lib/config.ts`, `src/lib/scoring.ts`, `src/app/api/health-summary/route.ts`
- Project context: `.planning/PROJECT.md`, `CLAUDE.md`
- Gap analysis: project memory `project_dashboard_gaps.md`
- Domain knowledge: Next.js App Router behavior (module singleton patterns, API route concurrency), SQLite WAL mode, OAuth token scope requirements for GitHub/Linear/Slack, Recharts rendering lifecycle, WCAG 2.1 accessibility patterns (MEDIUM confidence — training data, not verified against live docs in this session)
