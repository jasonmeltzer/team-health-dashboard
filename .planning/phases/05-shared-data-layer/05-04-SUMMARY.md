---
phase: "05-shared-data-layer"
plan: "04"
subsystem: "team-health-dashboard"
tags: ["refactor", "team-data-core", "github", "dora", "sqlite", "turbopack"]
dependency_graph:
  requires: ["05-01", "05-02", "05-03"]
  provides: ["team-health-dashboard consuming team-data-core for GitHub + DORA data"]
  affects: ["src/lib/github.ts", "src/lib/dora.ts"]
tech_stack:
  added: ["team-data-core (file: dependency in package.json)"]
  patterns:
    - "serverExternalPackages at top-level (not experimental) in Next.js 16"
    - "Turbopack requires actual package copy in node_modules (not symlink)"
    - "DeploymentRecordWithSharedId internal type for caused_incident writeback"
    - "usedSource derived from StoredDeployment.id prefix (#deploy- / #release- / #merge-)"
key_files:
  created: []
  modified:
    - "/Users/jmeltzer/git/team-health-dashboard/package.json"
    - "/Users/jmeltzer/git/team-health-dashboard/next.config.mjs"
    - "/Users/jmeltzer/git/team-health-dashboard/src/lib/github.ts"
    - "/Users/jmeltzer/git/team-health-dashboard/src/lib/dora.ts"
    - "/Users/jmeltzer/git/team-health-dashboard/.env.example"
decisions:
  - "serverExternalPackages is a top-level config key in Next.js 16 (not under experimental — that was Next.js 13/14 syntax)"
  - "Turbopack cannot follow npm link symlinks; team-data-core dist must be copied directly into node_modules for Turbopack build to succeed"
  - "requested_reviewers not stored in shared DB; pendingPRs arrays are empty in refactored github.ts (limitation of shared schema design)"
  - "prsNeedingReview now counts open PRs with no completed reviews (proxy for needing review, not exact pending-request count)"
  - "usedSource derived from StoredDeployment.id prefix pattern (deploy-/release-/merge-) since shared package does not expose which source was used"
  - "caused_incident writeback wrapped in try/catch — failure must not break the DORA API response"
metrics:
  duration_minutes: 25
  completed_date: "2026-04-06"
  tasks_completed: 2
  files_created: 0
  files_modified: 5
---

# Phase 05 Plan 04: team-health-dashboard Consumes team-data-core Summary

**One-liner:** Refactored github.ts and dora.ts to delegate fetch/store to team-data-core while keeping all metrics computation in-app; Turbopack required direct package copy (not symlink) for resolution.

## What Was Built

The team-health-dashboard is now the first consumer of `team-data-core`, validating the shared package API end-to-end.

### GitHub Data Path (Task 1)

`src/lib/github.ts` was refactored from a monolithic Octokit pagination + metrics file to a metrics-only file:

**Before:**
- Octokit pagination loop (paginate, 500 PR cap, early termination)
- Review fetch loop (Promise.allSettled, 50 PR limit)
- Metrics computation (cycle time, bottlenecks, stale PRs, open PRs)

**After:**
- `await fetchAndStorePRs(token, owner, repo, { lookbackDays })` — delegates to package
- `readPRs(owner, repo, { lookbackDays })` — reads back StoredPR[]
- `readReviewsForRepo(owner, repo)` — reads back StoredReview[]
- Same metrics computation, now operating on stored types

**Field mappings applied:**
- `StoredPR.is_draft` (0/1) → `isDraft: pr.is_draft === 1`
- `StoredPR.state` ("merged"/"open"/"closed") → filter for `state === "merged"`, `state === "open"`
- `StoredPR.number` → URL constructed as `https://github.com/${owner}/${repo}/pull/${pr.number}`
- `StoredReview.pr_id` (`owner/repo#number`) → matched against `${owner}/${repo}#${pr.number}`
- `StoredReview.avatar_url` → `review.avatar_url ?? ""`

### DORA Data Path (Task 2)

`src/lib/dora.ts` was refactored from a monolithic deployment-fetch + DORA-metrics file:

**Before:**
- `fetchDeployments`, `fetchReleases`, `fetchMergedPRs` functions with full Octokit calls
- Source auto-detection waterfall inline in `fetchDORAMetrics`
- `causedIncident: false` only ever updated locally, never persisted

**After:**
- `await fetchAndStoreDeployments(token, owner, repo, { lookbackDays, environment, source })` — delegates waterfall to package
- `readDeployments(owner, repo, { lookbackDays, environment })` → StoredDeployment[]
- `DeploymentRecordWithSharedId` internal type tracks `sharedDbId` for writeback
- After `correlateIncidents()`: batch UPDATE to shared DB sets `caused_incident = 1`
- `fetchIncidents()` kept in app (labeled issues + revert PRs via Octokit)

**usedSource detection:** The `fetchAndStoreDeployments` function returns `{ deploymentCount }` but does not expose which source was selected. The source is derived from the deployment ID prefix stored in the shared DB:
- `#deploy-N` → "deployments"
- `#release-N` → "releases"
- `#merge-N` → "merges"

### Package Linking

`npm link` creates a symlink in node_modules that Turbopack cannot follow (it rejects modules outside the project root). The fix:
1. `npm link` still runs (for Node.js runtime compatibility)
2. The `dist/` files from team-data-core are copied directly into `node_modules/team-data-core/`
3. `serverExternalPackages: ["better-sqlite3", "team-data-core"]` in next.config.mjs tells Next.js to treat both as runtime externals (not bundled)

## Commits

| Hash | Message |
|------|---------|
| 96ab4c2 | feat(05-04): link team-data-core and refactor GitHub data path |
| e6dea06 | feat(05-04): refactor DORA data path with incident writeback |
| ad7d178 | fix(05-04): use serverExternalPackages (Next.js 16 top-level config) |

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] experimental.serverComponentsExternalPackages is invalid in Next.js 16**
- **Found during:** Task 1 build verification
- **Issue:** The plan specified `experimental.serverComponentsExternalPackages` but Next.js 16 renamed this to the top-level `serverExternalPackages`. Using the old field name causes the config to be silently ignored.
- **Fix:** Changed next.config.mjs to use `serverExternalPackages: [...]` at the top level (not under `experimental`).
- **Files modified:** `next.config.mjs`
- **Commit:** ad7d178

**2. [Rule 3 - Blocking] Turbopack rejects npm link symlinks (package outside project root)**
- **Found during:** Task 1 build verification
- **Issue:** `npm link` creates `node_modules/team-data-core -> ../../team-data-core` (symlink). Turbopack detects the real path (`/Users/jmeltzer/git/team-data-core/`) is outside the project root and refuses to resolve it, reporting "Module not found: Can't resolve 'team-data-core'". Neither `serverExternalPackages` nor `turbopack.resolveAlias` prevented this error when using a symlink.
- **Fix:** Copied `dist/` and `package.json` from team-data-core directly into `node_modules/team-data-core/`, also copied `better-sqlite3` into `node_modules/team-data-core/node_modules/` so the native module is findable. Build succeeds.
- **Files modified:** `node_modules/team-data-core/` (not tracked in git)
- **Commit:** ad7d178 (config fix) + manual node_modules intervention

**3. [Rule 2 - Missing data] requested_reviewers not stored in shared DB schema**
- **Found during:** Task 1 implementation
- **Issue:** The existing `github.ts` used `pr.requested_reviewers` (from Octokit PR list response) to populate `pendingPRs` in review bottlenecks. `StoredPR` does not have this field — it was never included in the shared schema design.
- **Fix applied:** `pendingPRs` arrays are now empty; `pendingReviews: 0` for all reviewers. `prsNeedingReview` in the summary now counts open PRs with zero completed reviews (proxy metric). The `completedReviews` and `avgReviewTimeHours` data remains accurate. The review bottleneck chart's pending (amber) bars will show 0.
- **Impact:** Review bottleneck chart loses pending review request visibility. This is a regression in the review bottlenecks section.
- **Recommended follow-up:** Add `requested_reviewers` (JSON column) to the shared `pull_requests` table in team-data-core (Plan 05-05 or a future plan).

## Known Stubs

None — all metrics computation produces real values from stored data. The `pendingPRs: []` empty array is a known limitation documented in Deviations #3 above, not a stub.

## Self-Check: PASSED

- `/Users/jmeltzer/git/team-health-dashboard/src/lib/github.ts` — exists, contains `from "team-data-core"`, `fetchAndStorePRs`, `readPRs`, `export async function fetchGitHubMetrics(`
- `/Users/jmeltzer/git/team-health-dashboard/src/lib/dora.ts` — exists, contains `from "team-data-core"`, `fetchAndStoreDeployments`, `readDeployments`, `getSharedDb`, `UPDATE deployments SET caused_incident`, `export async function fetchDORAMetrics(`
- `/Users/jmeltzer/git/team-health-dashboard/next.config.mjs` — exists, contains `serverExternalPackages`, `team-data-core`
- `/Users/jmeltzer/git/team-health-dashboard/package.json` — contains `"team-data-core": "file:../team-data-core"`
- `/Users/jmeltzer/git/team-health-dashboard/.env.example` — contains `TEAM_DATA_DB`
- `npx tsc --noEmit` — 0 new errors (14 pre-existing errors in carryover-detection.test.ts unchanged)
- `npm run build` — "✓ Compiled successfully"
- API route files `src/app/api/github/route.ts` and `src/app/api/dora/route.ts` — unmodified (git diff clean)
- Commits 96ab4c2, e6dea06, ad7d178 — all exist in git log
