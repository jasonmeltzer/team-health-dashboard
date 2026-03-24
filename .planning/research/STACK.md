# Technology Stack

**Project:** Team Health Dashboard — Milestone 2 Additions
**Researched:** 2026-03-24
**Scope:** Adding persistence, caching, OAuth, notifications, PDF export, and accessibility to the existing Next.js 16 + React 19 + TypeScript + Tailwind app. Does NOT re-research the existing stack.

---

## Persistence — Historical Trending

### Recommended: `better-sqlite3` v12.8.0

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `better-sqlite3` | 12.8.0 | Store daily health score snapshots for trend charts | Synchronous, zero-latency, file-based. No separate process. Perfect for a single-server local tool. Native Node.js bindings — works in Next.js API routes (not Edge Runtime). |
| `@types/better-sqlite3` | 7.6.13 | TypeScript types | Official types package. |

**Why not Drizzle ORM (v0.45.1):** The schema is trivial — one or two tables (score snapshots, maybe alert history). Drizzle adds migration complexity and a build step for zero benefit at this scale. Raw `better-sqlite3` with typed query helpers in `lib/db.ts` is sufficient. Add Drizzle only if the schema grows to 5+ tables.

**Why not Prisma:** Heavy, requires a migration workflow, and doesn't add value for a local single-file SQLite store.

**Why not JSON files:** Concurrent writes from parallel API routes cause race conditions. SQLite handles this correctly; JSON files do not.

**Why not PostgreSQL/MySQL:** Overkill. The PROJECT.md constraint explicitly says "no heavy database." SQLite is the right fit.

**Constraint:** `better-sqlite3` uses native Node.js bindings. It will NOT work in Next.js Edge Runtime. All DB access must be in standard Node.js API routes (not `export const runtime = 'edge'`). This is fine for this project — no Edge routes exist.

**Data model (minimal):**
```
health_snapshots(id, timestamp, score, github_score, linear_score, slack_score, dora_score, raw_json)
```

---

## Server-Side Caching

### Recommended: In-memory module-level cache (already exists at `lib/cache.ts`)

The project already has a `lib/cache.ts` with stale-on-error and TTL. The active requirement is to extend it with:
- ETags for HTTP-level caching
- Rate-limit-aware stale data serving with a UI banner

**No new library needed.** Extend the existing `lib/cache.ts`.

For ETag support, use Node.js built-in `crypto.createHash('sha256')` — already available, no install required.

**Why not `node-cache` or `lru-cache`:** The existing custom cache already handles the stale-on-error pattern the project needs. Replacing it with a third-party cache adds migration cost with no functional gain.

**Why not Redis:** Overkill for a single-server local tool. Redis requires a separate process.

**Why not `next/cache` / React cache():** These are for RSC/Server Components deduplication, not persistent cross-request TTL caches. Not suitable here.

---

## OAuth Authentication

### Recommended: Arctic v3.7.0 + custom session handling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `arctic` | 3.7.0 | OAuth 2.0 provider abstractions (GitHub, Linear, Slack) | Lightweight (no framework coupling), handles PKCE, state, token exchange. Supports all three providers this project needs. Works with any framework including Next.js App Router. |
| `oslo` | 1.2.1 | Cryptographic utilities (CSRF tokens, session IDs) | Companion to Arctic. Provides `generateState()`, `generateCodeVerifier()`, secure random bytes. From the same author. |

**Session storage:** Store OAuth tokens in `.config.local.json` (already gitignored) alongside existing API key config. No cookie-based sessions needed — this is a single-user local tool, not a multi-user app.

**Why not Auth.js / NextAuth v5 (5.0.0-beta.30):** Auth.js is designed for multi-user authentication with database adapters, JWT cookies, and session middleware. This project has no user accounts. The PROJECT.md explicitly lists "Multi-tenant / user accounts" as out of scope. Auth.js is massive overhead for "store OAuth tokens for API integrations."

**Why not NextAuth v4 (4.24.13):** Same reason — wrong abstraction. Also, v4 is in maintenance mode; v5 (Auth.js) is the active branch.

**Why not `passport`:** Express-centric, awkward with Next.js App Router, not actively developed for App Router patterns.

**OAuth flow pattern for this project:**
```
Settings UI → "Connect via OAuth" button
  → GET /api/auth/[provider]/start  (generate state + PKCE, store in cookie, redirect to provider)
  → Provider → GET /api/auth/[provider]/callback  (exchange code, store token in .config.local.json)
  → Redirect back to Settings UI
```

**Confidence:** MEDIUM — Arctic v3 is the current recommended lightweight OAuth library for Next.js App Router. Verified version from npm. Author is Pilcrow (same as Lucia), well-maintained. Not verified with Context7 due to tool unavailability.

---

## Notifications / Alerts

### Recommended: Browser Notifications API (no library) + optional Resend v6.9.4

**In-app alerts (score drops to Warning/Critical):** Use `window.Notification` (Web Notifications API) from the browser directly. No library needed. Requires user permission prompt; gracefully degrade to a persistent banner if permission denied.

**Email notifications (optional/future):**

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `resend` | 6.9.4 | Transactional email for score-drop alerts | Minimal API surface, excellent TypeScript types, free tier (100 emails/day). Integrates in one function call from a Next.js API route. |

**Why not nodemailer (v8.0.3):** Requires configuring SMTP credentials. Resend is simpler to set up and more reliable for deliverability. However, nodemailer is acceptable if the user already has SMTP credentials.

**Why not `@react-email/components` (v1.0.10):** Useful for rich email templating if email design becomes a priority. Defer — overkill for simple score-drop alerts.

**Why not push notifications / service workers:** This is a Next.js dev/internal tool, not a production web app. Browser notifications are sufficient. PWA complexity is unwarranted.

**Confidence:** MEDIUM — Web Notifications API is stable/standard. Resend version verified from npm. Recommendation is based on training knowledge; verify Resend pricing tier before committing.

---

## Export / PDF Generation

### Recommended: `html-to-image` v1.11.13 for screenshots + `jspdf` v4.2.1 for PDF wrapping

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `html-to-image` | 1.11.13 | Capture dashboard sections as PNG/JPEG | Client-side, no server process needed. Works with SVG charts (Recharts). More actively maintained than `html2canvas` (last release 2021). |
| `jspdf` | 4.2.1 | Wrap captured images into a PDF | Lightweight, client-side. Combine with `html-to-image` output to produce a PDF export. |

**Why not `@react-pdf/renderer` (v4.3.2):** Requires building a parallel React component tree that mirrors the dashboard layout in PDF-specific primitives. Large effort, brittle when dashboard changes. The `html-to-image + jsPDF` approach captures what the user sees — no duplication.

**Why not Puppeteer (v24.40.0):** Puppeteer requires a headless Chromium process on the server. This is a local dev tool running on the developer's machine. Puppeteer is overkill, adds 300MB+ to node_modules, and requires server-side headless browser infrastructure. Use it only if pixel-perfect server-side PDF generation becomes a hard requirement.

**Why not `html2canvas` (v1.4.1):** html2canvas was last meaningfully updated in 2021. `html-to-image` is the actively maintained successor with better SVG support (critical for Recharts SVG output).

**Slack post export:** No library needed. The Slack Web API `chat.postMessage` with `blocks` can render a text summary. Format data in `lib/slack.ts` and call via existing Slack client.

**Confidence:** MEDIUM — Versions verified from npm. `html-to-image`'s SVG support with Recharts should be tested in a spike; SVG cross-origin rendering is a known edge case.

---

## Accessibility

### Recommended: `axe-core` v4.11.1 (dev only) + `focus-trap-react` v12.0.0 + Radix UI primitives

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@axe-core/react` | 4.11.1 | Dev-time accessibility violation logging in browser console | Zero production cost. Catches common ARIA issues during development. Run only in `development` env. |
| `focus-trap-react` | 12.0.0 | Trap keyboard focus in modals (Settings, ManualAI) | The project already has modal components. Keyboard users must not be able to tab outside an open modal. `focus-trap-react` handles this with one wrapper component. |
| `@radix-ui/react-dialog` | 1.1.15 | Accessible modal primitive (optional replacement) | If refactoring existing modals, Radix Dialog handles focus trap, ARIA roles, and keyboard dismissal out of the box. Trade-off: migration cost. Add only when touching a specific modal. |

**For charts (Recharts):** Add `aria-label` and `role="img"` attributes manually to `<ResponsiveContainer>` wrappers. Provide a visually hidden `<table>` version of chart data for screen readers. No library needed — this is markup work.

**Why not `@headlessui/react` (v2.2.9):** Headless UI is Tailwind-specific and primarily for building components from scratch. The project already has components — retrofitting them to Headless UI is high effort. Radix UI is more surgical (use only the pieces you need).

**Why not full audit tools like Lighthouse CI:** Lighthouse CI is infrastructure-level. `@axe-core/react` in dev mode gives the same feedback interactively during development without CI pipeline changes.

**Confidence:** HIGH for axe-core and focus-trap-react — these are the standard tools and have been stable for years. Versions verified.

---

## Onboarding Wizard

### Recommended: No new library — extend existing Settings UI with wizard state machine

The Settings UI already has a multi-section sidebar modal with step-by-step help text. An onboarding wizard is the same component in a guided sequential mode.

**Pattern:** Add a `onboardingStep: number | null` state to `DashboardShell`. When `null`, onboarding is complete. When 0-N, render the Settings modal in "wizard mode" with Next/Back navigation and a progress indicator. Persist completion to `.config.local.json` via `POST /api/config`.

**No external wizard/stepper library needed.** The added complexity of a library (Joyride, Shepherd.js, Intro.js) is not justified for a single-wizard use case that already has the modal infrastructure.

**Why not react-joyride or Shepherd.js:** These are tooltip-overlay tour libraries (point at existing UI elements). They're brittle (break when DOM structure changes), hard to style with Tailwind, and poor for "fill in credentials" workflows. The onboarding need here is credential entry, not a product tour.

**Confidence:** HIGH — this is a patterns decision based on existing code, not a library choice.

---

## Form Validation (for Settings UI and Onboarding)

### Recommended: `zod` v4.3.6 (already familiar pattern, no `react-hook-form` needed)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `zod` | 4.3.6 | Validate config values (URLs, API key formats, OAuth tokens) before saving | Zod v4 is faster than v3, same API. Use for server-side validation in `/api/config`. |

The Settings UI currently POSTs values directly. Add Zod schema validation in the route handler — no client-side form library needed for a settings form with a handful of fields.

**Why not `react-hook-form` (v7.72.0):** react-hook-form excels at complex multi-field forms with real-time validation. The Settings modal has ~10 simple text fields saved on submit. Standard React state is sufficient; adding react-hook-form is over-engineering.

---

## Rate Limiting / Retry Logic

### Recommended: No library — implement exponential backoff in `lib/github.ts`, `lib/linear.ts`, `lib/slack.ts`

The Octokit SDK already has retry plugin support. Add `@octokit/plugin-retry` (part of the Octokit ecosystem, no new install) for GitHub. For Linear and Slack, implement simple exponential backoff with max 3 retries in the fetch wrappers.

**No standalone retry library needed** — the logic is 20 lines per client.

---

## Summary: What to Install

```bash
# Persistence
npm install better-sqlite3
npm install -D @types/better-sqlite3

# OAuth (if OAuth milestone is being built)
npm install arctic oslo

# Export
npm install html-to-image jspdf

# Accessibility (dev only)
npm install -D @axe-core/react

# Accessibility (production — keyboard traps)
npm install focus-trap-react

# Validation (server-side only)
npm install zod

# Email notifications (optional, only if email alerts are in scope)
npm install resend
```

---

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

---

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

---

## Sources

- npm registry: version lookups for all packages (2026-03-24)
- CLAUDE.md: existing stack constraints and patterns
- PROJECT.md: explicit "no heavy database" and "out of scope" constraints
- W3C Web Notifications API specification (stable standard)
- Training knowledge for library maturity/ecosystem status (flagged where MEDIUM confidence)
