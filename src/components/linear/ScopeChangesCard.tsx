"use client";

import { useState } from "react";
import type { ScopeChangeSummary, ScopeChange } from "@/types/linear";
import { Card } from "@/components/ui/Card";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ScopeChangesCardProps {
  summary: ScopeChangeSummary;
}

function ScopeChangeRow({
  change,
  muted,
}: {
  change: ScopeChange;
  muted?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-800/50">
      {/* +/- indicator */}
      <span
        className={cn(
          "text-sm font-semibold w-4 shrink-0",
          muted
            ? "text-zinc-500 dark:text-zinc-400"
            : change.type === "added"
            ? "text-emerald-600 dark:text-emerald-400"
            : "text-red-500 dark:text-red-400"
        )}
      >
        {change.type === "added" ? "+" : "\u2212"}
      </span>

      {/* Issue info */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {change.url ? (
            <a
              href={change.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-semibold text-blue-600 hover:underline dark:text-blue-400"
            >
              {change.identifier}
            </a>
          ) : (
            <span className="text-xs font-semibold text-zinc-500">
              {change.identifier}
            </span>
          )}
          <span className="truncate text-sm text-zinc-700 dark:text-zinc-300">
            {change.title}
          </span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-xs text-zinc-500">
            {change.source === "snapshot" && change.actor === null ? (
              <span title="Change detected by dashboard snapshot">?</span>
            ) : (
              (change.actor ?? "Automation")
            )}
          </span>
          <span className="text-xs text-zinc-400">
            {formatRelativeTime(change.changedAt)}
          </span>
          {change.type === "removed" && change.destination && (
            <span className="text-xs text-zinc-400">
              {"\u2192"} {change.destination}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ScopeChangesCard({ summary }: ScopeChangesCardProps) {
  const [carryOversExpanded, setCarryOversExpanded] = useState(false);
  const [midSprintExpanded, setMidSprintExpanded] = useState(true);

  const carryOverChanges = summary.changes.filter((c) => c.isCarryOver);
  const midSprintChanges = summary.changes.filter((c) => !c.isCarryOver);

  return (
    <div id="scope-changes">
      <Card>
        {/* Card header — always visible */}
        <div className="flex w-full items-start justify-between min-h-[44px]">
          <div>
            <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
              Scope Changes
            </h3>
            <p className="text-xs text-zinc-500 mt-0.5">
              ({summary.carryOvers != null ? `${summary.carryOvers} carry-overs` : "carry-overs unknown"},{" "}
              {summary.midSprintAdded + summary.midSprintRemoved} mid-sprint)
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              +{summary.added} added&nbsp;&nbsp;{"\u2212"}{summary.removed} removed
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                summary.midSprintAdded - summary.midSprintRemoved > 0
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              )}
            >
              net {summary.midSprintAdded - summary.midSprintRemoved >= 0 ? "+" : ""}
              {summary.midSprintAdded - summary.midSprintRemoved}
            </span>
          </div>
        </div>

        {/* Cold-start warning — always visible when applicable */}
        {summary.hasColdStartGap && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Tracking started mid-sprint &mdash; earlier scope changes may be missing.
            {summary.issueCountAtStart !== null && (
              <>
                {" "}Sprint started with ~{Math.round(summary.issueCountAtStart)} issues, now has{" "}
                {summary.issueCountNow}.
              </>
            )}
          </p>
        )}

        <div className="mt-3 space-y-3">
          {/* Section 1: Carry-overs */}
          {carryOverChanges.length > 0 && (
            <div>
              <button
                className="flex w-full items-center justify-between py-1"
                onClick={() => setCarryOversExpanded((prev) => !prev)}
                aria-expanded={carryOversExpanded}
                aria-label="Toggle carry-overs detail"
              >
                <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                  Carry-overs ({carryOverChanges.length})
                </span>
                <span className="text-zinc-400 text-xs" aria-hidden="true">
                  {carryOversExpanded ? "\u25B2" : "\u25BC"}
                </span>
              </button>
              {carryOversExpanded && (
                <div className="mt-2 space-y-2 opacity-70">
                  {carryOverChanges.map((change) => (
                    <ScopeChangeRow
                      key={`${change.issueId}-${change.changedAt}`}
                      change={change}
                      muted
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Section 2: Mid-sprint changes */}
          <div>
            <button
              className="flex w-full items-center justify-between py-1"
              onClick={() => setMidSprintExpanded((prev) => !prev)}
              aria-expanded={midSprintExpanded}
              aria-label="Toggle mid-sprint changes detail"
            >
              <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">
                Mid-sprint changes ({midSprintChanges.length})
              </span>
              <span className="text-zinc-400 text-xs" aria-hidden="true">
                {midSprintExpanded ? "\u25B2" : "\u25BC"}
              </span>
            </button>
            {midSprintExpanded && (
              <div className="mt-2">
                {midSprintChanges.length === 0 ? (
                  <p className="py-2 text-center text-sm text-zinc-500">
                    No mid-sprint scope changes
                  </p>
                ) : (
                  <div className="space-y-2">
                    {midSprintChanges.map((change) => (
                      <ScopeChangeRow
                        key={`${change.issueId}-${change.changedAt}`}
                        change={change}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
