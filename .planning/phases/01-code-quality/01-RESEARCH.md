# Phase 1: Code Quality - Research

**Researched:** 2026-03-24
**Domain:** TypeScript refactoring, cache TTL enforcement, API response shape, test import hygiene
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01 (QUAL-01/06 — Function consolidation):** Export `extractJSON` and `normalizeQuotes` from `claude.ts` as the single source of truth. The `claude.ts` version of `extractJSON` should incorporate `normalizeQuotes` (call it internally), matching the `ai-response/route.ts` behavior. Remove the duplicate implementations from `ai-response/route.ts` and import from `claude.ts`. Tests in `manual-ai.test.ts` should import the real functions from `claude.ts` rather than reimplementing them.

- **D-02 (QUAL-02 — Force refresh in manual mode):** Move `force` param parsing before the manual mode early return in `weekly-narrative/route.ts`. In manual mode, force refresh should clear the cached manual import (so the UI returns to the "no import yet" state and the user can re-import). Add an explicit comment documenting this behavior.

- **D-03 (QUAL-03/05 — Manual mode cache TTL):** Add TTL enforcement at read time in cache reads for manual mode entries. When `cache.get()` returns an entry, check `Date.now() - cachedAt > ttlMs` before serving it. This prevents stale manual imports from being served after navigate-away/back. The existing 2x TTL cleanup timer stays as a memory safety net. Client-side: ensure `useApiData` doesn't serve stale data by respecting the `cached` flag and `fetchedAt` timestamp from the server.

- **D-04 (QUAL-04 — hasImport flag):** Add `hasImport: boolean` to the health summary response when in manual mode. `hasImport: true` when a cached manual import exists (even if insights/recommendations are empty arrays). `hasImport: false` (or absent) when no import has been uploaded yet. This lets the client distinguish "no import yet" from "imported with zero recommendations."

### Claude's Discretion

Full discretion on all implementation decisions. Standard approaches apply.

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| QUAL-01 | `extractJSON` and `normalizeQuotes` exported from `claude.ts`, imported (not duplicated) in `ai-response/route.ts` | D-01: change `extractJSON` in `claude.ts` to call `normalizeQuotes` internally; export both; remove local definitions from `ai-response/route.ts` |
| QUAL-02 | Force refresh param parsed before manual mode early return in `weekly-narrative/route.ts`, with comment | D-02: move `force` parse to line 11 (before provider check); add `cache.delete("manual:weekly-narrative")` when force=true in manual branch |
| QUAL-03 | Manual mode cache reads check TTL instead of relying on 2x cleanup timer | D-03: inline age check `Date.now() - cached.cachedAt > cached.ttlMs` before serving `cache.get()` result in both `weekly-narrative` and `health-summary` manual branches |
| QUAL-04 | Health summary response includes `hasImport` flag | D-04: add `hasImport: boolean` to `HealthSummaryData` interface; set `true` when `imported` entry exists, `false` when it does not |
| QUAL-05 | Client-side cache does not serve stale manual mode stub after import and navigate-away/back | D-03 (server-side TTL check) addresses root cause; also verify `useApiData` propagates `cached`/`fetchedAt` fields correctly |
| QUAL-06 | Tests import real `extractJSON`/`normalizeQuotes` from `claude.ts` instead of reimplementing | D-01 prerequisite: once exported from `claude.ts`, update `manual-ai.test.ts` to import them and delete the local re-implementations |
</phase_requirements>

## Summary

This phase resolves six PR #3 follow-up issues identified in a code review. All six are tightly scoped: function consolidation, control-flow ordering, read-time TTL enforcement, an API response flag, and test import hygiene. There are no new features and no new dependencies. The work is entirely within the existing codebase.

The most structurally impactful change is D-01: making `claude.ts` the single source of truth for `extractJSON` and `normalizeQuotes`. This is a prerequisite for D-06 (test imports) and touches three files. The other changes are each self-contained single-file edits.

The cache TTL issue (QUAL-03/05) is subtle: `cache.get()` in `InMemoryCacheStore` returns entries without checking TTL — it relies on the 2x cleanup timer to eventually evict them. A direct `cache.get()` call followed by an age check is the correct pattern (already implemented correctly in `getOrFetch`), and the same pattern must be applied to the manual mode `cache.get()` calls in `health-summary/route.ts` and `weekly-narrative/route.ts`.

**Primary recommendation:** Execute changes in dependency order — D-01 first (exports), then D-06 (tests), then D-02/D-03/D-04 in any order, since they are independent of each other.

## Standard Stack

No new libraries are required. All changes use the project's existing stack.

### Core (already installed)
| Library | Version | Purpose | Relevant to This Phase |
|---------|---------|---------|----------------------|
| TypeScript | (project version) | Type safety | `HealthSummaryData` interface update for `hasImport` |
| Vitest | (project version) | Test runner | Update test imports from `@/lib/claude` |
| Next.js App Router | 16.x | API route framework | No changes to routing |

**Installation:** No new packages needed.

## Architecture Patterns

### Established Pattern: Lib-module as single source of truth
Functions with shared semantics live in `lib/` and are imported by API routes. This already applies to `getProvider`, `isAIConfigured`, `buildHealthSummaryPromptFile`, etc. in `claude.ts`. D-01 extends this to `extractJSON` and `normalizeQuotes`.

**Pattern for exporting from `claude.ts`:**
```typescript
// lib/claude.ts — add export keyword; update extractJSON to call normalizeQuotes
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

export function extractJSON(text: string): string {
  const normalized = normalizeQuotes(text); // incorporate normalizeQuotes
  const fenceMatch = normalized.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = normalized.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return normalized;
}
```

Note: the existing `extractJSON` in `claude.ts` (line 19) does NOT call `normalizeQuotes` — it is a simpler version. The `ai-response/route.ts` version does call it. The consolidated export must match the richer `ai-response` behavior.

### Established Pattern: read-time TTL check
`getOrFetch` in `cache.ts` correctly applies an age check before serving cached data:
```typescript
const age = Date.now() - existing.cachedAt;
if (age < existing.ttlMs) {
  return { value: existing.value, cached: true, ... };
}
```

The manual mode branches in `health-summary` and `weekly-narrative` call `cache.get()` directly and skip this check. They must add the equivalent:
```typescript
const cached = cache.get<T>("manual:health-summary");
if (cached) {
  const age = Date.now() - cached.cachedAt;
  if (age > cached.ttlMs) {
    cache.delete("manual:health-summary");
    // fall through to "no import" branch
  } else {
    // serve cached data
  }
}
```

### Established Pattern: force refresh clears cache before re-read
D-02 requires that force=true in manual mode clears the stored import. The same concept (force bypasses cache) is used in `getOrFetch` via `options?.force`. For manual mode the equivalent is `cache.delete(key)` before the subsequent read path.

The `force` param must be parsed before the provider early-return. Current code in `weekly-narrative/route.ts`:
```
line 13: const provider = getProvider();
line 14: if (provider === "manual") { ... return early ... }
line 31: const force = request.nextUrl.searchParams.get("force") === "true";  // AFTER manual return
```

Correct ordering:
```typescript
const force = request.nextUrl.searchParams.get("force") === "true";
const provider = getProvider();

if (provider === "manual") {
  // Force refresh in manual mode: clear the cached import so the user can re-import.
  // Without this, force-refresh would re-serve the stale import unchanged.
  if (force) {
    cache.delete("manual:weekly-narrative");
  }
  const cached = cache.get<...>("manual:weekly-narrative");
  // ... TTL check then serve or return empty ...
}
```

### Established Pattern: `HealthSummaryData` interface extension
The `HealthSummaryData` interface is defined locally in `health-summary/route.ts`. Adding `hasImport` follows the existing optional field pattern (`manualMode?: boolean`):
```typescript
interface HealthSummaryData {
  overallHealth: string;
  score: number;
  scoreBreakdown: ScoreDeduction[];
  insights: string[];
  recommendations: string[];
  generatedAt: string;
  manualMode?: boolean;
  hasImport?: boolean; // true = import exists; false/absent = no import yet
}
```

The field should be set in both the "import exists" branch (`hasImport: true`) and the "no import" branch (`hasImport: false`), both under the manual provider check.

### Anti-Patterns to Avoid
- **Removing the 2x cleanup timer:** It is a memory safety net, not the TTL gate. D-03 adds a read-time check; the timer stays.
- **Skipping TTL check only for `health-summary`:** Both `weekly-narrative` and `health-summary` manual branches have the same problem — both need the fix.
- **Exporting the old (non-normalizing) `extractJSON`:** The exported version must incorporate `normalizeQuotes` to match `ai-response/route.ts` behavior. The simpler version in `claude.ts` line 19 is currently used only internally for LLM output (where smart quotes are less common). After consolidation, the same function handles both use cases correctly.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Cache TTL enforcement at read time | Custom TTL wrapper class | Inline age check (same pattern as `getOrFetch`) |
| Quote normalization | New regex library | Existing `normalizeQuotes` function (move, don't replace) |
| Test mock for `extractJSON`/`normalizeQuotes` | Re-implement in test file | Import real functions from `@/lib/claude` |

## Current State Inventory (What Each File Looks Like Today)

This is a refactor phase. The "runtime state" that matters is the current code.

| File | Current State | What Changes |
|------|--------------|--------------|
| `src/lib/claude.ts` | `extractJSON` defined at line 19, private (`function`, not `export`). No `normalizeQuotes`. | Add `normalizeQuotes` function; update `extractJSON` to call it internally; export both. |
| `src/app/api/ai-response/route.ts` | `normalizeQuotes` at line 11, `extractJSON` at line 18 — both local. `extractJSON` calls `normalizeQuotes`. | Remove both local definitions; add import from `@/lib/claude`. |
| `src/app/api/weekly-narrative/route.ts` | `force` param parsed at line 31, after manual mode early return at line 13. No TTL check on manual cache read. | Move `force` parse before provider check; add TTL check; add `cache.delete` on force. |
| `src/app/api/health-summary/route.ts` | Manual mode branch at line 59. No TTL check on `cache.get("manual:health-summary")`. No `hasImport` field. | Add TTL check; add `hasImport: true/false`; add force-refresh clear (follow same pattern as weekly-narrative). |
| `src/lib/__tests__/manual-ai.test.ts` | `extractJSON` re-implemented locally at line 434. `normalizeQuotes` re-implemented locally at line 501. | Delete both local re-implementations; import from `@/lib/claude`. |

**No database, no stored data, no OS-level registration, no build artifacts** need updating. This is pure source code change.

## Common Pitfalls

### Pitfall 1: Old `extractJSON` in `claude.ts` vs. the richer version in `ai-response/route.ts`
**What goes wrong:** Developer exports the existing `claude.ts` version of `extractJSON` (line 19) without incorporating `normalizeQuotes`. This breaks the manual mode import flow for responses with smart quotes (ChatGPT copy-paste artifacts).
**Why it happens:** The two versions look superficially similar but differ in one key way — the `ai-response` version normalizes quotes first.
**How to avoid:** The consolidated export must match the `ai-response/route.ts` behavior: call `normalizeQuotes` at the top of `extractJSON`, then apply fence/brace matching.
**Warning signs:** Tests for smart quote normalization pass at the unit level (using the new export) but ChatGPT-pasted JSON fails to parse at runtime.

### Pitfall 2: Missing TTL check in `health-summary` (only fixing `weekly-narrative`)
**What goes wrong:** D-03 specifies both routes need the fix, but only `weekly-narrative` gets it because D-02 changes are visible there.
**Why it happens:** `health-summary/route.ts` has a more complex manual branch (fetches source data, merges score), making it easy to miss the same pattern.
**How to avoid:** Both routes use `cache.get("manual:*")` directly — check both explicitly. The fix is the same in both: age check + delete if stale.

### Pitfall 3: Force refresh deletes cache but `health-summary` doesn't re-fetch source data
**What goes wrong:** In manual mode, `health-summary` always calls `fetchSourceData()` regardless of force, then checks for the import. If force=true clears the manual import, the response correctly shows "no import yet." This is intentional but could surprise a developer expecting force to also bypass the source data cache.
**Why it happens:** Manual mode mixes deterministic score (always fresh) with AI insights (cached import). Force should reset the import but not necessarily the underlying metric data.
**How to avoid:** The decision (D-02 specifies only clearing the manual import) is correct as-is. Document with an inline comment: "Force refresh clears the imported AI response so the user can re-import. Source data cache is unaffected."

### Pitfall 4: Test file imports `extractJSON` before the mock is set up
**What goes wrong:** `manual-ai.test.ts` mocks `@/lib/config` at the top before importing from `@/lib/claude`. If `extractJSON` is exported from `claude.ts` and the test imports it directly, the import order is already correct. But if the test restructure moves the import outside the existing `vi.mock` / `import` ordering, Vitest's hoisting behavior can cause issues.
**Why it happens:** Vitest hoists `vi.mock()` calls to the top of the file. The existing file already imports from `@/lib/claude` after the mock setup — the new imports should follow the same pattern.
**How to avoid:** Add `extractJSON` and `normalizeQuotes` to the existing import block from `@/lib/claude` at line 14-20. Do not create a second import statement from `@/lib/claude`.

### Pitfall 5: `hasImport` missing from the Ollama/Anthropic response path
**What goes wrong:** `hasImport` is only relevant in manual mode, but if the client-side code expects it unconditionally, an undefined value in non-manual mode could cause UI issues.
**Why it happens:** New optional fields on shared response types can be consumed incorrectly.
**How to avoid:** Define it as `hasImport?: boolean` (optional). Only set it in the manual provider branch. Client code should treat `undefined` the same as `false`.

## Code Examples

### D-01: Consolidated `extractJSON` in `claude.ts`
```typescript
// src/lib/claude.ts — replace the private extractJSON at line 19

/** Normalize smart quotes and copy-paste artifacts that break JSON parsing. */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"') // smart double quotes
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'"); // smart single quotes
}

/** Extract JSON from LLM responses that may wrap it in markdown or add preamble. */
export function extractJSON(text: string): string {
  const normalized = normalizeQuotes(text);
  const fenceMatch = normalized.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = normalized.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return normalized;
}
```

### D-01: Updated import in `ai-response/route.ts`
```typescript
// Remove lines 11-25 (local normalizeQuotes + extractJSON definitions)
// Add to imports:
import { extractJSON } from "@/lib/claude";
// normalizeQuotes is no longer needed directly; extractJSON incorporates it
```

### D-02: Force refresh ordering in `weekly-narrative/route.ts`
```typescript
export async function GET(request: NextRequest) {
  try {
    // Parse force param first — must happen before any early returns so manual mode
    // can honor it (force clears the cached import).
    const force = request.nextUrl.searchParams.get("force") === "true";
    const provider = getProvider();

    if (provider === "manual") {
      // Force refresh in manual mode: clear the cached import so the user can re-import.
      // Without this, force-refresh would re-serve the existing import unchanged.
      if (force) {
        cache.delete("manual:weekly-narrative");
      }
      const cached = cache.get<{ narrative: string; weekOf: string; generatedAt: string }>("manual:weekly-narrative");
      if (cached) {
        // TTL check at read time (2x cleanup timer is a memory safety net only)
        const age = Date.now() - cached.cachedAt;
        if (age > cached.ttlMs) {
          cache.delete("manual:weekly-narrative");
          // fall through to "no import" response
        } else {
          return Response.json({
            data: { ...cached.value, manualMode: true },
            fetchedAt: new Date(cached.cachedAt).toISOString(),
            cached: true,
          });
        }
      }
      return Response.json({ data: { manualMode: true }, fetchedAt: new Date().toISOString() });
    }
    // ... rest unchanged, but remove the old `const force = ...` line
```

### D-03/D-04: TTL check + `hasImport` in `health-summary/route.ts`
```typescript
if (provider === "manual") {
  const { github, linear, slack, dora } = await fetchSourceData();
  const scoreResult = computeHealthScore(github, linear, slack, dora);

  const imported = cache.get<HealthSummaryData>("manual:health-summary");
  if (imported) {
    // TTL check at read time (2x cleanup timer is a memory safety net only)
    const age = Date.now() - imported.cachedAt;
    if (age > imported.ttlMs) {
      cache.delete("manual:health-summary");
      // fall through to "no import" response
    } else {
      const data: HealthSummaryData = {
        overallHealth: scoreResult.overallHealth,
        score: scoreResult.score,
        scoreBreakdown: scoreResult.deductions,
        insights: imported.value.insights,
        recommendations: imported.value.recommendations,
        generatedAt: imported.value.generatedAt,
        manualMode: true,
        hasImport: true, // import exists
      };
      return Response.json({
        data,
        fetchedAt: new Date(imported.cachedAt).toISOString(),
        cached: !force,
      });
    }
  }

  // No import yet (or TTL expired)
  const data: HealthSummaryData = {
    // ... existing fallback fields ...
    manualMode: true,
    hasImport: false, // no import uploaded
  };
  // ...
}
```

### D-06: Updated test imports
```typescript
// src/lib/__tests__/manual-ai.test.ts
// Add extractJSON and normalizeQuotes to the existing import block:
import {
  getProvider,
  isAIConfigured,
  buildHealthSummaryPromptFile,
  buildWeeklyNarrativePromptFile,
  extractJSON,      // now exported from claude.ts
  normalizeQuotes,  // now exported from claude.ts
} from "@/lib/claude";

// In the "extractJSON (response parsing)" describe block:
// DELETE the local `function extractJSON(text: string): string { ... }` re-implementation
// Tests use the imported `extractJSON` directly

// In the "smart quote normalization" describe block:
// DELETE the local `function normalizeQuotes(text: string): string { ... }` re-implementation
// Tests use the imported `normalizeQuotes` directly
```

## Open Questions

1. **Does `health-summary` also need force-refresh to clear the manual import?**
   - What we know: D-02 specifies this behavior for `weekly-narrative`. The `health-summary` manual branch also reads from `cache.get("manual:health-summary")` but force is already parsed before the manual check (line 56 vs line 59 provider check — force is already in correct order). However, there is no `cache.delete` on force=true.
   - What's unclear: Should force=true in health-summary also clear the import? The CONTEXT.md D-02 decision only mentions `weekly-narrative` explicitly.
   - Recommendation: Apply the same force-clear pattern to `health-summary` for consistency. An engineering manager hitting "Refresh" in the UI expects both cards to reset to "no import" state.

2. **Should `hasImport` propagate through to the client component?**
   - What we know: `hasImport` is added to the API response. The `HealthSummaryCard` component receives the response via `useApiData`.
   - What's unclear: Whether the client-side `HealthSummaryCard` currently renders differently based on whether insights are empty vs. "no import yet."
   - Recommendation: The QUAL-04 requirement is server-side only ("health summary response includes `hasImport` flag"). Client consumption is out of scope for this phase unless the client-side components already read from the response shape in a way that breaks.

## Environment Availability

Step 2.6: SKIPPED — this phase contains no external dependencies beyond the project's own source code. All changes are edits to existing TypeScript files and one test file.

## Sources

### Primary (HIGH confidence)
- Direct source code inspection of `src/lib/claude.ts`, `src/app/api/ai-response/route.ts`, `src/app/api/weekly-narrative/route.ts`, `src/app/api/health-summary/route.ts`, `src/lib/cache.ts`, `src/lib/__tests__/manual-ai.test.ts`
- `01-CONTEXT.md` — locked implementation decisions D-01 through D-04

### Secondary (MEDIUM confidence)
- CLAUDE.md project constraints (established patterns section)
- `.planning/REQUIREMENTS.md` QUAL-01 through QUAL-06 definitions

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — no new libraries; existing stack fully understood from source
- Architecture: HIGH — all patterns are direct observations from the codebase, not inferences
- Pitfalls: HIGH — identified from concrete code differences between files (e.g., the two versions of `extractJSON`) and control-flow ordering visible in the source

**Research date:** 2026-03-24
**Valid until:** Until any of the six target files are modified (these findings are specific to the current code state)
