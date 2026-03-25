# Phase 1: Code Quality - Context

**Gathered:** 2026-03-24
**Status:** Ready for planning

<domain>
## Phase Boundary

Resolve six PR #3 follow-ups (QUAL-01 through QUAL-06) to eliminate code duplication, fix cache/refresh logic in manual AI mode, and ensure tests cover real code paths. No new features — cleanup only.

</domain>

<decisions>
## Implementation Decisions

### Claude's Discretion

User granted full discretion on all implementation decisions. The following approaches are planned:

- **D-01 (QUAL-01/06 — Function consolidation):** Export `extractJSON` and `normalizeQuotes` from `claude.ts` as the single source of truth. The `claude.ts` version of `extractJSON` should incorporate `normalizeQuotes` (call it internally), matching the `ai-response/route.ts` behavior. Remove the duplicate implementations from `ai-response/route.ts` and import from `claude.ts`. Tests in `manual-ai.test.ts` should import the real functions from `claude.ts` rather than reimplementing them.

- **D-02 (QUAL-02 — Force refresh in manual mode):** Move `force` param parsing before the manual mode early return in `weekly-narrative/route.ts`. In manual mode, force refresh should clear the cached manual import (so the UI returns to the "no import yet" state and the user can re-import). Add an explicit comment documenting this behavior.

- **D-03 (QUAL-03/05 — Manual mode cache TTL):** Add TTL enforcement at read time in cache reads for manual mode entries. When `cache.get()` returns an entry, check `Date.now() - cachedAt > ttlMs` before serving it. This prevents stale manual imports from being served after navigate-away/back. The existing 2x TTL cleanup timer stays as a memory safety net. Client-side: ensure `useApiData` doesn't serve stale data by respecting the `cached` flag and `fetchedAt` timestamp from the server.

- **D-04 (QUAL-04 — hasImport flag):** Add `hasImport: boolean` to the health summary response when in manual mode. `hasImport: true` when a cached manual import exists (even if insights/recommendations are empty arrays). `hasImport: false` (or absent) when no import has been uploaded yet. This lets the client distinguish "no import yet" from "imported with zero recommendations."

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source Code (primary targets)
- `src/lib/claude.ts` — Canonical location for `extractJSON`, `normalizeQuotes`, and AI provider logic
- `src/app/api/ai-response/route.ts` — Contains duplicate `extractJSON`/`normalizeQuotes` to be removed
- `src/app/api/weekly-narrative/route.ts` — Force refresh + manual mode early return ordering
- `src/app/api/health-summary/route.ts` — Manual mode response needs `hasImport` flag
- `src/lib/cache.ts` — Cache store with TTL and cleanup logic
- `src/lib/__tests__/manual-ai.test.ts` — Tests that may reimplement functions instead of importing

### Requirements
- `.planning/REQUIREMENTS.md` §Code Quality — QUAL-01 through QUAL-06 definitions

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `extractJSON` in `claude.ts` (line 19) — base implementation without quote normalization
- `normalizeQuotes` in `ai-response/route.ts` (line 11) — standalone function, easy to move
- `InMemoryCacheStore` in `cache.ts` — has `get`/`set`/`delete` with 2x TTL auto-cleanup
- `manual-ai.test.ts` — existing test suite with helper factories for all metric types

### Established Patterns
- Functions exported from `lib/` modules and imported by API routes
- Cache uses `cache.get<T>(key)` returning `CacheEntry<T> | undefined`
- Manual mode cache keys use `manual:` prefix (e.g., `manual:health-summary`, `manual:weekly-narrative`)
- `getOrFetch` pattern for non-manual providers; manual mode uses direct `cache.get()`

### Integration Points
- `ai-response/route.ts` POST handler calls its local `extractJSON` — needs to switch to imported version
- `weekly-narrative/route.ts` and `health-summary/route.ts` manual mode branches need TTL checks
- Test file imports from `@/lib/claude` — may need additional exports

</code_context>

<specifics>
## Specific Ideas

No specific requirements — user granted full discretion. Standard approaches apply.

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 01-code-quality*
*Context gathered: 2026-03-24*
