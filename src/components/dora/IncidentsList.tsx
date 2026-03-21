"use client";

import type { IncidentRecord } from "@/types/dora";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function IncidentsList({
  incidents,
}: {
  incidents: IncidentRecord[];
}) {
  if (incidents.length === 0) {
    return (
      <Card>
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Incidents
        </h3>
        <p className="text-sm text-emerald-600 dark:text-emerald-400">
          No incidents in this period.
        </p>
      </Card>
    );
  }

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Incidents
      </h3>
      <div className="space-y-2">
        {incidents.slice(0, 10).map((inc) => (
          <div
            key={inc.number}
            className={cn(
              "flex items-center justify-between rounded-lg border px-3 py-2 text-sm",
              inc.closedAt
                ? "border-zinc-200 dark:border-zinc-700"
                : "border-amber-200 bg-amber-50/50 dark:border-amber-900/50 dark:bg-amber-950/20"
            )}
          >
            <div className="flex items-center gap-2 overflow-hidden">
              <a
                href={inc.url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 font-mono text-xs text-blue-500 hover:underline"
              >
                #{inc.number}
              </a>
              <span className="truncate text-zinc-700 dark:text-zinc-300">
                {inc.title}
              </span>
              {inc.labels.map((l) => (
                <span
                  key={l}
                  className="shrink-0 rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                >
                  {l}
                </span>
              ))}
            </div>
            <span className="shrink-0 text-xs text-zinc-400">
              {inc.resolutionHours != null
                ? `${Math.round(inc.resolutionHours)}h to resolve`
                : "Open"}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
