"use client";
import { useState, useEffect, useCallback } from "react";

export interface ConfigStatus {
  github: boolean;
  linear: boolean;
  slack: boolean;
  ai: boolean;
  dora: boolean;
  aiProvider?: string;
  oauth?: {
    github: { connected: boolean; accountName: string | null };
    linear: { connected: boolean; accountName: string | null };
    slack: { connected: boolean; accountName: string | null };
  };
  oauthProvisioned?: {
    github: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
    linear: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
    slack: { clientId: boolean; clientSecret: boolean; encryptionKey: boolean };
  };
}

export function useConfigStatus(refreshKey?: number) {
  const [status, setStatus] = useState<ConfigStatus | null>(null);

  const refetch = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      const json = await res.json();
      if (json.data) {
        setStatus({
          github: !!json.data.github,
          linear: !!json.data.linear,
          slack: !!json.data.slack,
          ai: !!json.data.ai,
          dora: !!json.data.dora,
          aiProvider: json.data.aiProvider,
          oauth: json.data.oauth || undefined,
          oauthProvisioned: json.data.oauthProvisioned || undefined,
        });
      }
    } catch {
      // ignore — status stays null, skeleton shown
    }
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch, refreshKey]);

  const allUnconfigured = status
    ? !status.github && !status.linear && !status.slack && !status.ai
    : null; // null = still loading

  const unconfiguredList: string[] = [];
  if (status) {
    if (!status.github) unconfiguredList.push("GitHub");
    if (!status.linear) unconfiguredList.push("Linear");
    if (!status.slack) unconfiguredList.push("Slack");
    if (!status.ai) unconfiguredList.push("AI");
  }

  return { status, allUnconfigured, unconfiguredList, refetch };
}
