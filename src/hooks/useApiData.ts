"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse } from "@/types/api";

// Client-side cache: avoids re-fetching when switching back to a previously-seen URL
const clientCache = new Map<string, { data: unknown; fetchedAt: string; timestamp: number }>();
const CLIENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes, matches server TTL

/** Clear all client-side cached API responses. Call when config changes. */
export function clearClientCache() {
  clientCache.clear();
}

export function useApiData<T>(url: string, refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [cached, setCached] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitReset, setRateLimitReset] = useState<string | null>(null);

  // Track previous refreshKey to detect manual refresh (force bypass cache)
  const prevRefreshKey = useRef(refreshKey);
  // Flag for explicit refetch() calls — bypasses client cache without server force
  const explicitRefetch = useRef(false);

  // Derived: true when refetching with existing data (not initial load)
  const refreshing = loading && data != null;

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    // If refreshKey increased, this is a manual refresh — force bypass cache
    const isForceRefresh = refreshKey > prevRefreshKey.current;
    prevRefreshKey.current = refreshKey;

    // Explicit refetch() calls bypass client cache (but don't force server cache bypass)
    const skipClientCache = isForceRefresh || explicitRefetch.current;
    explicitRefetch.current = false;

    // Check client-side cache for non-force requests
    if (!skipClientCache) {
      const entry = clientCache.get(url);
      if (entry && Date.now() - entry.timestamp < CLIENT_CACHE_TTL) {
        setData(entry.data as T);
        setFetchedAt(entry.fetchedAt);
        setCached(true);
        setLoading(false);
        setError(null);
        setNotConfigured(false);
        setSetupHint(null);
        return;
      }
    }

    setLoading(true);
    setError(null);
    // Don't clear data/notConfigured/setupHint — keep stale values visible during refetch
    setRateLimited(false);
    setRateLimitReset(null);

    const separator = url.includes("?") ? "&" : "?";
    const fetchUrl = isForceRefresh ? `${url}${separator}force=true` : url;

    try {
      const res = await fetch(fetchUrl, { signal });
      const json: ApiResponse<T> = await res.json();
      if (json.rateLimited) {
        setRateLimited(true);
        setRateLimitReset(json.rateLimitReset ?? null);
        return;
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.notConfigured) {
        setNotConfigured(true);
        setData(null);
        setSetupHint(null);
        return;
      }
      if (json.setupHint) {
        setSetupHint(json.setupHint);
        setData(null);
        setNotConfigured(false);
        return;
      }
      if (json.error) throw new Error(json.error);
      setData(json.data ?? null);
      setNotConfigured(false);
      setSetupHint(null);
      setFetchedAt(json.fetchedAt ?? null);
      setCached(json.cached ?? false);

      // Store in client cache
      if (json.data && json.fetchedAt) {
        clientCache.set(url, {
          data: json.data,
          fetchedAt: json.fetchedAt,
          timestamp: Date.now(),
        });
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return; // silently ignore aborted requests
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      // Only update loading state if the request was not aborted (component may be unmounting)
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [url, refreshKey]);

  useEffect(() => {
    const controller = new AbortController();
    fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const refetch = useCallback(() => {
    explicitRefetch.current = true;
    return fetchData(); // No signal — user-initiated, not lifecycle-managed
  }, [fetchData]);

  return { data, loading, refreshing, error, notConfigured, setupHint, fetchedAt, cached, rateLimited, rateLimitReset, refetch };
}
