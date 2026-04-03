"use client";

import { useState } from "react";
import type { ScopeChangeSummary, ScopeChange, CycleInfo } from "@/types/linear";
import { Card } from "@/components/ui/Card";
import { cn, formatRelativeTime } from "@/lib/utils";

interface ScopeChangesCardProps {
  summary: ScopeChangeSummary;
  scopeChangesByCycle?: Record<string, ScopeChangeSummary>;
  cycles?: CycleInfo[];
  currentCycleName?: string;
}

function ScopeChangeRow({ change }: { change: ScopeChange }) {
  return (
    <div className="flex items-start gap-2 px-3 py-2 rounded-md bg-zinc-50 dark:bg-zinc-800/50">
      {/* +/- indicator */}
      <span
        className={cn(
          "text-sm font-semibold w-4 shrink-0",
          change.type === "added"
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

export function ScopeChangesCard({ summary, scopeChangesByCycle, cycles, currentCycleName }: ScopeChangesCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [selectedCycle, setSelectedCycle] = useState<string | null>(null);

  const hasCyclePicker = scopeChangesByCycle && cycles && cycles.length > 0;
  const activeCycleName = selectedCycle && scopeChangesByCycle?.[selectedCycle]
    ? selectedCycle
    : currentCycleName ?? null;
  const activeSummary = activeCycleName && scopeChangesByCycle?.[activeCycleName]
    ? scopeChangesByCycle[activeCycleName]
    : summary;

  return (
    <div id="scope-changes">
      <Card>
        {/* Header row — always visible, click to expand */}
        <button
          className="flex w-full items-center justify-between min-h-[44px]"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          aria-label="Toggle scope changes detail"
        >
          <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Scope Changes
          </h3>
          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-500">
              +{activeSummary.added} added&nbsp;&nbsp;{"\u2212"}{activeSummary.removed} removed
            </span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs font-medium",
                activeSummary.net > 0
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                  : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
              )}
            >
              net {activeSummary.net >= 0 ? "+" : ""}
              {activeSummary.net}
            </span>
            <span className="text-zinc-400 text-sm" aria-hidden="true">
              {expanded ? "\u25B2" : "\u25BC"}
            </span>
          </div>
        </button>

        {/* Cycle picker — shown when multiple cycles have scope data */}
        {expanded && hasCyclePicker && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {cycles.map((c) => {
              const isActive = c.name === activeCycleName;
              const hasScopeData = !!scopeChangesByCycle[c.name];
              return (
                <button
                  key={c.id}
                  onClick={(e) => { e.stopPropagation(); setSelectedCycle(c.name); }}
                  disabled={!hasScopeData}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
                    isActive
                      ? "border-zinc-400 bg-zinc-900 text-white dark:border-zinc-500 dark:bg-zinc-100 dark:text-zinc-900"
                      : hasScopeData
                        ? "border-zinc-200 bg-zinc-50 text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                        : "border-zinc-100 bg-zinc-50 text-zinc-300 cursor-not-allowed dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-600"
                  )}
                >
                  {c.name}
                  {c.isCurrent && (
                    <span className={cn("ml-1", isActive ? "opacity-60" : "opacity-40")}>(current)</span>
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* Cold-start warning — always visible when applicable, not gated on expand */}
        {activeSummary.hasColdStartGap && (
          <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
            Tracking started mid-sprint &mdash; earlier scope changes may be missing.
            {activeSummary.issueCountAtStart !== null && (
              <>
                {" "}Sprint started with ~{Math.round(activeSummary.issueCountAtStart)} issues, now has{" "}
                {activeSummary.issueCountNow}.
              </>
            )}
          </p>
        )}

        {/* Expanded content */}
        {expanded && (
          activeSummary.changes.length === 0 ? (
            <p className="py-4 text-center text-sm text-zinc-500">
              No scope changes detected this sprint
            </p>
          ) : (
            <div className="mt-3 space-y-2">
              {activeSummary.changes.map((change) => (
                <ScopeChangeRow key={`${change.issueId}-${change.changedAt}`} change={change} />
              ))}
            </div>
          )
        )}
      </Card>
    </div>
  );
}
