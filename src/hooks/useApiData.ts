"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiResponse } from "@/types/api";

export function useApiData<T>(url: string, refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [setupHint, setSetupHint] = useState<string | null>(null);
  const [fetchedAt, setFetchedAt] = useState<string | null>(null);
  const [rateLimited, setRateLimited] = useState(false);
  const [rateLimitReset, setRateLimitReset] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    setSetupHint(null);
    setRateLimited(false);
    setRateLimitReset(null);
    try {
      const res = await fetch(url);
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
      setFetchedAt(json.fetchedAt ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  return { data, loading, error, notConfigured, setupHint, fetchedAt, rateLimited, rateLimitReset, refetch: fetchData };
}
