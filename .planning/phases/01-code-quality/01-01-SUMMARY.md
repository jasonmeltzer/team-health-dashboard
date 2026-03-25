---
phase: 01-code-quality
plan: 01
subsystem: api
tags: [typescript, refactoring, code-dedup, testing]

# Dependency graph
requires: []
provides:
  - "Canonical extractJSON and normalizeQuotes exports from claude.ts"
  - "Tests exercising real exported functions instead of reimplementations"
affects: [01-code-quality]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single source of truth for utility functions in lib/ modules"

key-files:
  created: []
  modified:
    - src/lib/claude.ts
    - src/app/api/ai-response/route.ts
    - src/lib/__tests__/manual-ai.test.ts

key-decisions:
  - "extractJSON now calls normalizeQuotes internally, giving all LLM response parsing smart quote normalization for free"

patterns-established:
  - "Utility functions defined once in lib/ and imported everywhere - no local reimplementations"

requirements-completed: [QUAL-01, QUAL-06]

# Metrics
duration: 2min
completed: 2026-03-25
---

# Phase 1 Plan 1: Consolidate extractJSON/normalizeQuotes Summary

**Consolidated extractJSON and normalizeQuotes into claude.ts as single source of truth, eliminated duplicate definitions in ai-response route and test file**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-25T23:30:18Z
- **Completed:** 2026-03-25T23:32:12Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments
- extractJSON and normalizeQuotes are defined exactly once in the codebase (in claude.ts)
- ai-response/route.ts imports extractJSON from @/lib/claude instead of reimplementing it
- Test file imports and exercises the real exported functions, not local copies
- All 33 existing tests pass with the consolidated functions

## Task Commits

Each task was committed atomically:

1. **Task 1: Export extractJSON and normalizeQuotes from claude.ts, remove duplicates** - `bc42606` (feat)
2. **Task 2: Update tests to import real functions from claude.ts** - `b1e4e54` (test)

## Files Created/Modified
- `src/lib/claude.ts` - Added normalizeQuotes export, updated extractJSON to call normalizeQuotes and export it
- `src/app/api/ai-response/route.ts` - Removed local normalizeQuotes and extractJSON, added import from @/lib/claude
- `src/lib/__tests__/manual-ai.test.ts` - Added extractJSON and normalizeQuotes to imports, removed local reimplementations

## Decisions Made
- extractJSON now incorporates normalizeQuotes internally (matches ai-response/route.ts behavior, not the old claude.ts behavior which skipped normalization). This means all LLM response parsing throughout the codebase now benefits from smart quote normalization automatically.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Pre-existing TypeScript error in scoring.test.ts (missing LinearMetrics properties) - out of scope, not caused by this plan's changes.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- extractJSON and normalizeQuotes are now importable from @/lib/claude for any future consumers
- Ready for Plan 01-02 (force-refresh, TTL checks, hasImport flag)

---
*Phase: 01-code-quality*
*Completed: 2026-03-25*
