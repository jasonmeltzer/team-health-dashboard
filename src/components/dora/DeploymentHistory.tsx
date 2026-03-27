"use client";

import { useState, useEffect, useRef } from "react";
import type { DeploymentRecord } from "@/types/dora";
import type { DeployFilter } from "./DeploymentFrequencyChart";
import { Card } from "@/components/ui/Card";
import { cn, getISOWeek } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  failure: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  incident: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
};

function effectiveStatus(d: DeploymentRecord): string {
  if (d.causedIncident) return "incident";
  return d.status;
}

export function DeploymentHistory({
  deployments,
  filter,
  onClearFilter,
}: {
  deployments: DeploymentRecord[];
  filter?: DeployFilter;
  onClearFilter?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-expand and scroll into view when filter is applied
  useEffect(() => {
    if (!filter) return;
    setExpanded(true);
    const timer = setTimeout(() => {
      containerRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    return () => clearTimeout(timer);
  }, [filter]);

  // Apply filter: match by week and effective status (same logic as computeTrend in dora.ts)
  const filtered = filter
    ? deployments.filter((d) => {
        const week = getISOWeek(new Date(d.createdAt));
        if (week !== filter.period) return false;
        // Effective status: failure/error/causedIncident → "failure", success (no incident) → "success", else "other"
        const isFailed = d.status === "failure" || d.status === "error" || d.causedIncident;
        const isSuccess = d.status === "success" && !d.causedIncident;
        if (filter.status === "failure") return isFailed;
        return isSuccess;
      })
    : deployments;

  if (!filter && deployments.length === 0) {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Recent Deployments
        </h3>
        <p className="text-sm text-zinc-500">
          No deployments found in this period.
        </p>
      </Card>
    );
  }

  const visible = expanded ? filtered : filtered.slice(0, 5);
  const remaining = filtered.length - 5;

  return (
    <Card>
      <div ref={containerRef} className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {filter
            ? `${filter.status === "failure" ? "Failed" : "Successful"} Deployments — ${filter.period}`
            : "Recent Deployments"}
        </h3>
        {filter && onClearFilter && (
          <button
            onClick={onClearFilter}
            className="text-xs font-medium text-blue-500 hover:text-blue-400"
          >
            Show all
          </button>
        )}
      </div>
      {filter && filtered.length === 0 && (
        <p className="text-sm text-zinc-500">
          No {filter.status === "failure" ? "failed" : "successful"} deployments in {filter.period}.
        </p>
      )}
      <div className="space-y-2">
        {visible.map((d) => (
          <a
            key={d.id}
            href={d.url}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-800/50",
              d.causedIncident
                ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                : "border-zinc-200 dark:border-zinc-700"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  STATUS_STYLES[effectiveStatus(d)] || STATUS_STYLES.pending
                )}
              >
                {effectiveStatus(d)}
              </span>
              <span className="truncate font-mono text-xs text-zinc-600 dark:text-zinc-400">
                {d.ref || d.sha.slice(0, 7)}
              </span>
              {d.description && (
                <span className="truncate text-zinc-500 dark:text-zinc-400">
                  {d.description}
                </span>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-3 text-xs text-zinc-400">
              <span>{d.creator}</span>
              <span>{new Date(d.createdAt).toLocaleDateString()}</span>
              <svg className="h-3 w-3 text-zinc-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </div>
          </a>
        ))}
      </div>
      {!expanded && remaining > 0 && (
        <button
          onClick={() => setExpanded(true)}
          className="mt-2 text-xs font-medium text-blue-500 hover:text-blue-400"
        >
          {remaining} more...
        </button>
      )}
    </Card>
  );
}
