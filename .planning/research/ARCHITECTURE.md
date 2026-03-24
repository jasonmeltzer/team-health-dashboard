# Architecture Patterns

**Domain:** Engineering team health dashboard (brownfield Next.js 16 App Router)
**Researched:** 2026-03-24
**Confidence:** HIGH (official Next.js docs + existing codebase analysis)

---

## Context: What Already Exists

The current system is a stateless, read-only dashboard. No auth, no database, no sessions. All data flows in one direction: browser triggers API routes, API routes call third-party APIs, responses are cached in-process and returned. This is clean and must not be disrupted.

The new milestone adds **four orthogonal concerns** that each have distinct integration points:

| Concern | Touches | Does NOT touch |
|---------|---------|----------------|
| Persistence (SQLite) | New `lib/db.ts` + new API routes | Existing data-fetching routes |
| Enhanced caching | Existing `lib/cache.ts` (swap store) | Client components |
| OAuth | New routes + `lib/session.ts` | Scoring, AI, config system |
| Notifications | New `lib/notify.ts` + cron/scheduled route | Existing data routes |
| Onboarding | New UI component tree | Existing dashboard sections |

---

## Recommended Architecture

### Layered Diagram

```
Browser (Client Components)
  │
  ├── useApiData hook (existing) — no change
  ├── OnboardingWizard (new) — reads /api/config, writes via settings flow
  ├── NotificationBanner (new) — reads /api/health-history for score deltas
  │
  └── Next.js API Routes
        │
        ├── /api/github, /api/linear, /api/slack, /api/dora  ← unchanged
        ├── /api/health-summary, /api/weekly-narrative        ← unchanged
        ├── /api/config (GET/POST)                            ← unchanged
        │
        ├── /api/health-history (GET)     NEW — reads SQLite, returns score timeline
        ├── /api/snapshot (POST)          NEW — writes health score snapshot to SQLite
        ├── /api/auth/[provider]          NEW — OAuth callback handler
        ├── /api/auth/login               NEW — redirects to provider
        ├── /api/auth/logout              NEW — clears session cookie
        │
        └── lib/
              ├── cache.ts (existing)    ← swap InMemoryCacheStore for SQLiteCacheStore
              ├── config.ts (existing)   ← unchanged
              ├── db.ts                  NEW — better-sqlite3 singleton
              ├── session.ts             NEW — JWT cookie management (Jose)
              └── notify.ts             NEW — score-drop detection + alert dispatch
```

---

## Component Boundaries

### lib/db.ts — SQLite Singleton

Single responsibility: owns the database file, schema, and all queries. No business logic.

```
lib/db.ts
  - createDb(): Database          opens/creates .data/health.db
  - ensureSchema(db): void        idempotent CREATE TABLE IF NOT EXISTS
  - insertSnapshot(db, row): void
  - queryHistory(db, opts): Row[]
  - deleteOldSnapshots(db): void  prune > 90 days
```

**Why better-sqlite3 over alternatives:**
- Synchronous API — no async/await friction inside Next.js Route Handlers
- Zero native dependencies beyond the binary (ships prebuilt)
- Reads/writes a single `.data/health.db` file — trivially gitignored, trivially backed up
- No migration framework needed at this scale — `CREATE TABLE IF NOT EXISTS` is sufficient

**Why not a JSON file:**
- No atomic writes — concurrent requests can corrupt the file
- No query capability — trending requires range queries by timestamp

**Why not Postgres/Turso/Libsql:**
- Project constraint: no heavy database. SQLite on local filesystem matches "lightweight persistence" requirement exactly.
- Turso adds network latency and an account dependency for what is a local-first tool.

### lib/session.ts — JWT Cookie Sessions (stateless)

```
lib/session.ts
  - createSession(payload): sets httpOnly cookie with Jose JWT
  - readSession(req): SessionPayload | null
  - deleteSession(): clears cookie
```

**Why stateless JWT cookies, not database sessions:**
- No multi-user login, no session revocation needed — this is a single-operator internal tool
- Stateless means no sessions table in SQLite, fewer moving parts
- Jose is Edge Runtime compatible; iron-session is the simpler alternative if Jose feels heavyweight

**Session payload structure:**
```typescript
type SessionPayload = {
  provider: "github" | "linear" | "slack"
  accessToken: string          // encrypted in the JWT
  expiresAt: number            // Unix timestamp
}
```

The session stores the OAuth access token for the connected provider. On OAuth completion, the token is also written to `.config.local.json` via existing `saveConfig()` — this makes OAuth additive to the existing env-var config path.

### /api/auth/* — OAuth Flow Routes

```
/api/auth/login?provider=github
  → Generates PKCE state, stores in cookie, redirects to provider

/api/auth/callback/github
  → Validates state, exchanges code for token
  → Calls saveConfig({ GITHUB_TOKEN: token })   ← reuses existing config layer
  → Creates session cookie
  → Redirects to /

/api/auth/logout
  → Deletes session cookie
  → Does NOT clear .config.local.json (token persists for next session)
```

**Critical design decision:** OAuth completion writes the token to `.config.local.json` via `saveConfig()`. This means OAuth is a setup mechanism, not a per-request auth mechanism. After first OAuth, the token persists — the user does not need to re-OAuth on every visit. This preserves backward compatibility (env vars still work, settings UI still works).

**Why not next-auth / Auth.js:**
- Project is a single-operator internal tool, not a multi-user app
- next-auth requires a database adapter for OAuth token persistence
- The existing config system already handles token storage — next-auth would duplicate it
- Custom OAuth flow is ~100 lines and avoids a large dependency with frequent breaking changes

### /api/health-history — Persistence Read Route

```
GET /api/health-history?days=30
  → queries db.queryHistory({ days: 30 })
  → returns { data: [{ date, score, breakdown }] }
```

This is a standard `getOrFetch`-wrapped route returning historical score data for the trend chart.

### /api/snapshot — Persistence Write Route

```
POST /api/snapshot
  → reads current health score from /api/health-summary (or recomputes)
  → calls db.insertSnapshot(row)
  → returns { ok: true }
```

**When is /api/snapshot called?**
Two trigger points:
1. Client: after a successful `/api/health-summary` response (fire-and-forget `fetch` from client or from inside the health-summary route itself)
2. Scheduled: via a Next.js Route Handler called by a GitHub Actions cron job (`schedule: cron: '0 9 * * 1-5'`)

Embedding the snapshot write inside the health-summary route is simpler — it runs once per fresh fetch, uses the already-computed score, and avoids a second computation. Route Handlers are the correct location for this (not Server Actions — those require form interactions).

### lib/cache.ts — SQLite Cache Store (swap, not rewrite)

The existing `CacheStore` interface is already pluggable:

```typescript
// Existing interface
interface CacheStore {
  get<T>(key: string): CacheEntry<T> | undefined
  set<T>(key: string, entry: CacheEntry<T>): void
  delete(key: string): void
  clear(): void
}
```

A `SqliteCacheStore` implementing this interface swaps in without touching any existing code. The singleton at the bottom of `cache.ts` changes from:

```typescript
export const cache = globalForCache.__apiCache ??= new InMemoryCacheStore()
```

to:

```typescript
export const cache = globalForCache.__apiCache ??= process.env.ENABLE_PERSISTENT_CACHE
  ? new SqliteCacheStore(getDb())
  : new InMemoryCacheStore()
```

**Why keep the in-memory store as default:**
- Avoids a breaking change for users without SQLite set up
- In-memory is faster; SQLite cache only matters for surviving process restarts
- Keep it opt-in with an env flag initially

### lib/notify.ts — Notification Dispatch

```
lib/notify.ts
  - checkScoreDrop(current: number, previous: number): AlertLevel | null
  - dispatchAlert(level: AlertLevel, score: number, message: string): Promise<void>
    → Slack webhook (SLACK_ALERT_WEBHOOK_URL env var)
    → Email (ALERT_EMAIL env var, via sendmail or SMTP)
```

**Trigger:** Called inside `/api/snapshot` after writing to SQLite. Reads the last N snapshots to compare. Fires only when score crosses a band boundary (Healthy→Warning or Warning→Critical), not on every drop — this prevents alert spam.

**Why Slack webhook and not a Slack Bot:**
- Webhook requires zero OAuth setup — just a URL
- The existing Slack integration is already under-tested; adding a bot layer for notifications introduces complexity before the base integration is verified
- Webhook posts can be replaced with richer bot posts later without changing the caller interface

### OnboardingWizard Component

```
src/components/dashboard/OnboardingWizard.tsx
  - Reads config status from /api/config
  - If all integrations configured: renders null (invisible)
  - If any unconfigured: renders wizard overlay/banner
  - Steps: GitHub → Linear → Slack → AI → Done
  - Each step: description, input fields, "Test Connection" button, success state
  - Completion: calls existing POST /api/config, then dismisses
  - Dismissal state: localStorage flag "onboarding-dismissed" — persists across refresh
```

**Integration with existing SettingsModal:**
- The OnboardingWizard is a first-run experience, not a replacement for SettingsModal
- SettingsModal remains accessible via gear icon at all times
- Wizard and modal share the same POST /api/config endpoint — no duplication

---

## Data Flow

### Score Persistence Flow

```
1. Browser loads dashboard
2. useApiData calls GET /api/health-summary
3. Route Handler:
   a. Computes deterministic score (existing scoring.ts)
   b. Calls LLM for insights (existing claude.ts)
   c. Returns response to client
   d. Fire-and-forget: POST /api/snapshot with score + breakdown
4. /api/snapshot:
   a. Writes to health.db (lib/db.ts)
   b. Reads last snapshot for comparison
   c. If band crossing: lib/notify.ts dispatches alert
5. Client renders score + charts
```

### OAuth Flow

```
1. User clicks "Connect GitHub" in OnboardingWizard or SettingsModal
2. Browser navigates to GET /api/auth/login?provider=github
3. Server generates PKCE state, sets state cookie, returns 302 to GitHub
4. User authenticates on GitHub, GitHub redirects to /api/auth/callback/github
5. Server validates state cookie, exchanges code for access token
6. Server calls saveConfig({ GITHUB_TOKEN: token }) → writes .config.local.json
7. Server calls cache.clear() (same as existing POST /api/config does)
8. Server creates JWT session cookie (7-day expiry)
9. Server returns 302 to / (dashboard reloads with new config)
```

### Historical Trend Flow

```
Browser TrendChart component
  → useApiData("/api/health-history?days=30", refreshKey)
  → GET /api/health-history
  → lib/db.ts queryHistory({ days: 30 })
  → returns [{ date, score, breakdown }]
  → Recharts LineChart renders trend
```

### Onboarding Flow

```
DashboardShell mounts
  → reads configStatus from /api/config (already fetched by Settings)
  → if any source unconfigured AND !localStorage.getItem("onboarding-dismissed")
    → renders OnboardingWizard above dashboard content
  → OnboardingWizard shows steps for unconfigured sources
  → user fills fields → POST /api/config → config saved → step marked complete
  → on all steps complete → sets localStorage flag → wizard unmounts
```

---

## Suggested Build Order

Dependencies flow downward — build lower layers first.

```
Layer 0 (foundation, no dependencies):
  lib/db.ts                  — SQLite singleton, schema, queries

Layer 1 (depends on Layer 0):
  SqliteCacheStore           — implements existing CacheStore interface
  /api/health-history        — reads db
  /api/snapshot              — writes db

Layer 2 (depends on Layer 1):
  lib/session.ts             — JWT cookie utils (standalone)
  lib/notify.ts              — alert dispatch (standalone, only needs env vars)

Layer 3 (depends on Layer 2):
  /api/auth/login            — needs session.ts for state cookie
  /api/auth/callback/*       — needs session.ts + saveConfig
  /api/auth/logout           — needs session.ts

Layer 4 (depends on Layer 1 + Layer 3):
  OnboardingWizard           — needs config status + OAuth triggers + /api/config POST
  Score trend chart (client) — needs /api/health-history data
  Notification banner (UI)   — needs score comparison from /api/snapshot + notify.ts
```

**Recommended phase ordering based on dependencies:**

1. **Persistence + history route** (Layer 0+1) — enables trending, unblocks notifications
2. **Enhanced caching** (Layer 1, SqliteCacheStore) — independent but shares lib/db.ts
3. **Notifications** (Layer 2, lib/notify.ts) — depends on snapshot data in SQLite
4. **OAuth** (Layers 2+3) — self-contained, depends on existing config system
5. **Onboarding** (Layer 4) — depends on config system, can reference OAuth

Each layer is independently shippable. Layers 1 and 2 have no user-visible dependencies on each other and can be developed in parallel.

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Using next-auth for this use case

**What:** Installing next-auth/Auth.js to handle the OAuth flow.
**Why bad:** next-auth is designed for multi-user apps. It requires a database adapter for session persistence, introduces a user model, and has a complex callback structure. For a single-operator tool where the OAuth token is just a config credential, it's dramatically over-engineered.
**Instead:** Custom ~100-line OAuth handler + Jose JWT cookie. Token written to `.config.local.json` via existing `saveConfig()`.

### Anti-Pattern 2: Calling /api/snapshot from the client as a side effect

**What:** Having the client fire a snapshot write every time health-summary data loads.
**Why bad:** Duplicates snapshots on every client re-render, cache hit, or multi-tab scenario. Creates artificial data.
**Instead:** Write snapshot inside the `/api/health-summary` Route Handler, gated on `cached === false` — only write when fresh data was actually fetched from upstream APIs.

### Anti-Pattern 3: Storing OAuth tokens in session cookies only

**What:** Storing the GitHub/Linear/Slack token only in the JWT session cookie.
**Why bad:** Session expires after 7 days; user must re-OAuth constantly. Breaks the existing env-var and settings-UI config paths.
**Instead:** On OAuth completion, write the token to `.config.local.json` via `saveConfig()`. The session cookie is then just a UX signal ("connected via GitHub OAuth"), not the token store. The token persists across sessions just like a manually entered API key.

### Anti-Pattern 4: SQLite in the Next.js Edge Runtime

**What:** Using better-sqlite3 in middleware or Edge functions.
**Why bad:** better-sqlite3 is a native Node.js module. It does not run in the Edge Runtime (V8 isolates). Will throw at import time.
**Instead:** All SQLite access is server-side only (Node.js runtime Route Handlers). Never import `lib/db.ts` from middleware or Edge routes. Mark with `import 'server-only'` guard.

### Anti-Pattern 5: Schema migrations with a migration framework

**What:** Adding drizzle-orm, prisma, or knex for schema management.
**Why bad:** Overkill for a local SQLite file with 1-2 tables that never changes structure post-launch. Adds build-step complexity and a migration runner.
**Instead:** `CREATE TABLE IF NOT EXISTS` in `ensureSchema()` called at db-open time. Additive column changes use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`. This is sufficient for the entire lifecycle of a local health dashboard.

---

## Scalability Considerations

This is a local-first internal tool. Scalability is not a primary concern. The relevant constraint is:

| Concern | At current scale | If ever multi-team |
|---------|-----------------|-------------------|
| SQLite concurrency | Single writer, fine for local | Switch to Turso or libsql (same API surface as better-sqlite3) |
| Notification spam | Band-crossing threshold prevents it | Add per-team cooldown in notify.ts |
| History retention | 90-day prune cron is sufficient | Add configurable retention window |
| OAuth multi-user | Not needed — single operator | Would require next-auth + user table |

---

## Sources

- Next.js App Router Authentication docs (official, verified 2026-03-20): https://nextjs.org/docs/app/guides/authentication
- Existing codebase: `src/lib/cache.ts` — pluggable `CacheStore` interface
- Existing codebase: `src/lib/config.ts` — `saveConfig()` pattern that OAuth should reuse
- Existing codebase: `src/hooks/useApiData.ts` — client fetch/cache pattern (unchanged)
- Official Next.js session management: stateless JWT cookies with Jose recommended for simple cases
- Official Next.js recommended session libraries: iron-session, Jose
- Project constraints (PROJECT.md): no heavy database, backward compatible, no multi-tenant
