"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { ApiResponse } from "@/types/api";

// Client-side cache: avoids re-fetching when switching back to a previously-seen URL
const clientCache = new Map<string, { data: unknown; fetchedAt: string; timestamp: number }>();
const CLIENT_CACHE_TTL = 15 * 60 * 1000; // 15 minutes, matches server TTL

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

  // Derived: true when refetching with existing data (not initial load)
  const refreshing = loading && data != null;

  const fetchData = useCallback(async () => {
    // If refreshKey increased, this is a manual refresh — force bypass cache
    const isForceRefresh = refreshKey > prevRefreshKey.current;
    prevRefreshKey.current = refreshKey;

    // Check client-side cache for non-force requests
    if (!isForceRefresh) {
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
      const res = await fetch(fetchUrl);
      const json: ApiResponse<T> = await res.json();
      if (json.rateLimited) {
        setRateLimited(true);
        setRateLimitReset(json.rateLimitReset ?? null);
        return;
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (json.notConfigured) {
        setNotConfigured(true);
        return;
      }
      if (json.setupHint) {
        setSetupHint(json.setupHint);
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
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url, refreshKey]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, refreshing, error, notConfigured, setupHint, fetchedAt, cached, rateLimited, rateLimitReset, refetch: fetchData };
}
