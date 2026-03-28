// Server-side caching layer with pluggable storage backend.
// Currently uses in-memory Map; swap InMemoryCacheStore for filesystem/Redis/SQLite later.

import { getConfig } from "@/lib/config";

export interface CacheEntry<T> {
  value: T;
  cachedAt: number; // Date.now() when stored
  ttlMs: number; // TTL used when storing
}

export interface CacheStore {
  get<T>(key: string): CacheEntry<T> | undefined;
  set<T>(key: string, entry: CacheEntry<T>): void;
  delete(key: string): void;
  clear(): void;
}

class InMemoryCacheStore implements CacheStore {
  private store = new Map<string, CacheEntry<unknown>>();
  private timers = new Map<string, ReturnType<typeof setTimeout>>();

  get<T>(key: string): CacheEntry<T> | undefined {
    return this.store.get(key) as CacheEntry<T> | undefined;
  }

  set<T>(key: string, entry: CacheEntry<T>): void {
    this.store.set(key, entry);

    // Clear any existing cleanup timer for this key
    const existing = this.timers.get(key);
    if (existing) clearTimeout(existing);

    // Auto-cleanup at 2x TTL to prevent unbounded memory growth
    const timer = setTimeout(() => {
      const current = this.store.get(key);
      if (current && current.cachedAt === entry.cachedAt) {
        this.store.delete(key);
      }
      this.timers.delete(key);
    }, entry.ttlMs * 2);

    // Prevent timer from keeping Node.js process alive
    if (timer && typeof timer === "object" && "unref" in timer) {
      timer.unref();
    }

    this.timers.set(key, timer);
  }

  delete(key: string): void {
    this.store.delete(key);
    const timer = this.timers.get(key);
    if (timer) {
      clearTimeout(timer);
      this.timers.delete(key);
    }
  }

  clear(): void {
    this.store.clear();
    this.timers.forEach((timer) => clearTimeout(timer));
    this.timers.clear();
  }
}

// Singleton cache instance — stashed on globalThis so it survives
// Turbopack/Next.js dev mode module reloads
const globalForCache = globalThis as typeof globalThis & { __apiCache?: CacheStore };
export const cache: CacheStore = globalForCache.__apiCache ??= new InMemoryCacheStore();

// Track in-flight background revalidations to prevent duplicates
const pendingBackgroundFetches = new Set<string>();

function scheduleBackgroundFetch<T>(key: string, ttlMs: number, fetcher: () => Promise<T>) {
  if (pendingBackgroundFetches.has(key)) return;
  pendingBackgroundFetches.add(key);
  Promise.resolve()
    .then(() => fetcher())
    .then((value) => {
      cache.set(key, { value, cachedAt: Date.now(), ttlMs });
    })
    .catch(() => { /* stale data remains; next request will retry */ })
    .finally(() => pendingBackgroundFetches.delete(key));
}

// Default TTLs per source
export const CACHE_TTL = {
  github: 15 * 60 * 1000, // 15 minutes
  linear: 15 * 60 * 1000, // 15 minutes
  slack: 15 * 60 * 1000, // 15 minutes
  dora: 15 * 60 * 1000, // 15 minutes
  healthSummary: 10 * 60 * 1000, // 10 minutes (includes LLM call)
  weeklyNarrative: 15 * 60 * 1000, // 15 minutes (expensive LLM call)
} as const;

/**
 * Returns the TTL for a cache source, checking user config first, then defaults.
 * Config keys: CACHE_TTL_GITHUB, CACHE_TTL_LINEAR, CACHE_TTL_HEALTH_SUMMARY, etc.
 */
export function getTTL(source: keyof typeof CACHE_TTL): number {
  const envKey = `CACHE_TTL_${source.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase()}`;
  const configured = getConfig(envKey);
  if (configured) {
    const parsed = parseInt(configured, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return CACHE_TTL[source];
}

export interface GetOrFetchResult<T> {
  value: T;
  cached: boolean;
  cachedAt: string; // ISO string
  stale?: boolean;  // true when serving expired-but-valid stale data
}

/**
 * Returns cached value if fresh, otherwise calls fetcher and caches the result.
 * SWR behavior: when cache is stale, serves stale data immediately and revalidates in background.
 * On fetcher error, serves stale cached data if available (stale-on-error).
 */
export async function getOrFetch<T>(
  key: string,
  ttlMs: number,
  fetcher: () => Promise<T>,
  options?: { force?: boolean; rethrow?: (error: unknown) => boolean }
): Promise<GetOrFetchResult<T>> {
  const existing = cache.get<T>(key);

  // Return fresh cached value unless force-refreshing
  if (existing && !options?.force) {
    const age = Date.now() - existing.cachedAt;
    if (age < existing.ttlMs) {
      return {
        value: existing.value,
        cached: true,
        cachedAt: new Date(existing.cachedAt).toISOString(),
      };
    }
    // Stale — serve immediately, revalidate in background
    scheduleBackgroundFetch(key, ttlMs, fetcher);
    return {
      value: existing.value,
      cached: true,
      cachedAt: new Date(existing.cachedAt).toISOString(),
      stale: true,
    };
  }

  // Fetch fresh data
  try {
    const value = await fetcher();
    const now = Date.now();
    cache.set(key, { value, cachedAt: now, ttlMs });
    return {
      value,
      cached: false,
      cachedAt: new Date(now).toISOString(),
    };
  } catch (error) {
    // Always rethrow sentinel errors that callers need to handle
    if (options?.rethrow?.(error)) {
      throw error;
    }
    // Stale-on-error: serve expired cache entry if available
    if (existing) {
      return {
        value: existing.value,
        cached: true,
        cachedAt: new Date(existing.cachedAt).toISOString(),
        stale: true,
      };
    }
    throw error;
  }
}

/**
 * Builds a deterministic cache key from source name and parameters.
 * Parameters are sorted alphabetically for consistency.
 */
export function buildCacheKey(
  source: string,
  params: Record<string, string | number | boolean | undefined> = {}
): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join(":");
  return sorted ? `${source}:${sorted}` : source;
}
