"use client";

import { useState } from "react";
import type { DeploymentRecord } from "@/types/dora";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  failure: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  error: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  inactive: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-400",
};

export function DeploymentHistory({
  deployments,
}: {
  deployments: DeploymentRecord[];
}) {
  const [expanded, setExpanded] = useState(false);

  if (deployments.length === 0) {
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

  const visible = expanded ? deployments : deployments.slice(0, 5);
  const remaining = deployments.length - 5;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Recent Deployments
      </h3>
      <div className="space-y-2">
        {visible.map((d) => (
          <div
            key={d.id}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
              d.causedIncident
                ? "border-red-200 bg-red-50/50 dark:border-red-900/50 dark:bg-red-950/20"
                : "border-zinc-200 dark:border-zinc-700"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <span
                className={cn(
                  "inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  STATUS_STYLES[d.status] || STATUS_STYLES.inactive
                )}
              >
                {d.status}
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
            </div>
          </div>
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
