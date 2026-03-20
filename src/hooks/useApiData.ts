"use client";

import { useState, useEffect, useCallback } from "react";
import type { ApiResponse } from "@/types/api";

export function useApiData<T>(url: string, refreshKey: number) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setNotConfigured(false);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: ApiResponse<T> = await res.json();
      if (json.notConfigured) {
        setNotConfigured(true);
        return;
      }
      if (json.error) throw new Error(json.error);
      setData(json.data ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [url]);

  useEffect(() => {
    fetchData();
  }, [fetchData, refreshKey]);

  return { data, loading, error, notConfigured, refetch: fetchData };
}
