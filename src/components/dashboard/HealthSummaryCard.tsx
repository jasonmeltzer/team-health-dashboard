"use client";

import { useState, useRef, useEffect } from "react";
import { useApiData } from "@/hooks/useApiData";
import type { HealthSummary, ScoreDeduction } from "@/types/metrics";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { ManualAIResponseModal } from "./ManualAIResponseModal";
import { cn, formatRelativeTime } from "@/lib/utils";

function ScoreInfo() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative inline-block" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="ml-1 inline-flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-medium text-zinc-500 hover:bg-zinc-300 dark:bg-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-600"
      >
        ?
      </button>
      {open && (
        <div className="absolute left-0 top-6 z-50 w-80 rounded-lg border border-zinc-200 bg-white p-3 text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-400">
          <p className="mb-2 font-medium text-zinc-700 dark:text-zinc-300">
            How the score works
          </p>
          <p className="mb-2">
            The score starts at 100 and subtracts points for signals of trouble
            across your connected integrations. It&apos;s deterministic — same data
            always produces the same score.
          </p>

          <p className="mb-1.5 font-medium text-zinc-500">Signals checked:</p>
          <div className="mb-2 space-y-1.5">
            <div>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">GitHub (up to 30 pts)</p>
              <p>Avg cycle time, stale PRs, review queue backup, cycle time trend</p>
            </div>
            <div>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">Linear (up to 30 pts)</p>
              <p>Stalled issues, workload imbalance, velocity trend, flow efficiency, WIP per person, long-running items</p>
            </div>
            <div>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">DORA (up to 20 pts)</p>
              <p>Deploy frequency, lead time, change failure rate, MTTR</p>
            </div>
            <div>
              <p className="font-medium text-zinc-700 dark:text-zinc-300">Slack (up to 20 pts)</p>
              <p>Response time, overloaded members, response time trend</p>
            </div>
          </div>

          <p className="mb-2 text-zinc-400">
            Only connected integrations are scored. Missing sources don&apos;t
            penalize you — the score rescales to what&apos;s available.
          </p>

          <p className="mb-2">
            Click the score circle to see exactly which signals contributed.
          </p>

          <div className="space-y-0.5 border-t border-zinc-100 pt-2 dark:border-zinc-700">
            <p>
              <span className="font-medium text-emerald-600">80-100 Healthy</span>{" "}
              — smooth flow, no major blockers
            </p>
            <p>
              <span className="font-medium text-amber-600">60-79 Warning</span>{" "}
              — some bottlenecks or stalled work
            </p>
            <p>
              <span className="font-medium text-red-600">0-59 Critical</span>{" "}
              — significant blockers need attention
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

const CATEGORY_LABELS: Record<string, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
  dora: "DORA",
};

function ScoreBreakdown({
  deductions,
  onClose,
}: {
  deductions: ScoreDeduction[];
  onClose: () => void;
}) {
  const withPoints = deductions.filter((d) => d.points > 0);
  const clean = deductions.filter((d) => d.points === 0);

  // Group by category
  const categories = Array.from(new Set(deductions.map((d) => d.category)));

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Score Breakdown
        </p>
        <button
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          close
        </button>
      </div>

      {categories.map((cat) => {
        const catDeductions = deductions.filter((d) => d.category === cat);
        const catLost = catDeductions.reduce((s, d) => s + d.points, 0);
        const catMax = catDeductions.reduce((s, d) => s + d.maxPoints, 0);
        return (
          <div key={cat} className="mb-3 last:mb-0">
            <p className="mb-1 text-xs font-medium text-zinc-500">
              {CATEGORY_LABELS[cat] || cat}{" "}
              <span className="font-normal text-zinc-400">
                ({catLost}/{catMax} pts deducted)
              </span>
            </p>
            <div className="space-y-1">
              {catDeductions.map((d) => (
                <div
                  key={d.signal}
                  className="flex items-center justify-between text-xs"
                >
                  <span className="text-zinc-600 dark:text-zinc-400">
                    {d.signal}
                    <span className="ml-1.5 text-zinc-400">{d.detail}</span>
                  </span>
                  <span
                    className={cn(
                      "ml-2 font-mono whitespace-nowrap",
                      d.points > 0
                        ? "font-medium text-red-500"
                        : "text-emerald-500"
                    )}
                  >
                    {d.points > 0 ? `−${d.points}` : "✓"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {withPoints.length === 0 && (
        <p className="text-xs text-emerald-600">
          All signals are healthy — no deductions.
        </p>
      )}
      {clean.length > 0 && withPoints.length > 0 && (
        <p className="mt-2 text-xs text-zinc-400">
          {clean.length} signal{clean.length !== 1 ? "s" : ""} healthy (no deduction).
        </p>
      )}
    </div>
  );
}

function ManualModeControls({ onImported }: { onImported: () => void }) {
  const [importOpen, setImportOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/ai-prompt?type=health-summary");
      if (!res.ok) throw new Error("Failed to generate prompt file");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `team-health-summary-prompt-${new Date().toISOString().split("T")[0]}.md`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <>
      <div className="mt-3 flex items-center gap-3 border-t border-zinc-100 pt-3 dark:border-zinc-800">
        <span className="text-xs text-zinc-400">Manual AI mode:</span>
        <button
          onClick={handleDownload}
          disabled={downloading}
          className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs font-medium text-zinc-600 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-400 dark:hover:bg-zinc-800"
        >
          {downloading ? "Generating..." : "Download Prompt"}
        </button>
        <button
          onClick={() => setImportOpen(true)}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Import Response
        </button>
      </div>
      <ManualAIResponseModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        type="health-summary"
        onImported={onImported}
      />
    </>
  );
}

export function HealthSummaryCard({ refreshKey }: { refreshKey: number }) {
  const [showBreakdown, setShowBreakdown] = useState(false);
  const { data, loading, error, notConfigured, setupHint, cached, refetch } = useApiData<HealthSummary>(
    "/api/health-summary",
    refreshKey
  );

  if (notConfigured) return null;

  if (loading && !data) {
    return (
      <Card className="col-span-full">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-96" />
            <Skeleton className="h-4 w-72" />
          </div>
        </div>
      </Card>
    );
  }

  if (setupHint) {
    return (
      <Card className="col-span-full">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800">
            <span className="text-xl text-zinc-400">?</span>
          </div>
          <div>
            <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
              Team Health
            </h2>
            <p className="mt-1 text-sm text-zinc-500">
              AI-powered health score, insights, and recommendations will appear here.
            </p>
            <p className="mt-2 text-xs text-zinc-400">{setupHint}</p>
          </div>
        </div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="col-span-full">
        <ErrorState message={error} onRetry={refetch} />
      </Card>
    );
  }

  if (!data) return null;

  const healthColors = {
    healthy: "text-emerald-600 dark:text-emerald-400",
    warning: "text-amber-600 dark:text-amber-400",
    critical: "text-red-600 dark:text-red-400",
  };

  const scoreColor =
    data.score >= 80
      ? "stroke-emerald-500"
      : data.score >= 60
        ? "stroke-amber-500"
        : "stroke-red-500";

  return (
    <Card className={cn("col-span-full", loading && "animate-pulse")}>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Score circle — clickable to show breakdown */}
        <div
          className="relative flex-shrink-0 cursor-pointer"
          onClick={() => setShowBreakdown((prev) => !prev)}
          title="Click to see score breakdown"
        >
          <svg className="h-20 w-20 -rotate-90" viewBox="0 0 36 36">
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="#e4e4e7"
              strokeWidth="3"
            />
            <path
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              className={scoreColor}
              strokeWidth="3"
              strokeDasharray={`${data.score}, 100`}
              strokeLinecap="round"
            />
          </svg>
          <span className="absolute inset-0 flex items-center justify-center text-lg font-bold text-zinc-900 dark:text-zinc-100">
            {data.score}
          </span>
        </div>

        <div className="flex-1 space-y-3">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">
              Team Health
              <ScoreInfo />
            </h2>
            <Badge variant={data.overallHealth}>
              {data.overallHealth.charAt(0).toUpperCase() +
                data.overallHealth.slice(1)}
            </Badge>
            {data.generatedAt && (
              <span className="text-xs text-zinc-400 dark:text-zinc-500">
                Updated {formatRelativeTime(data.generatedAt)}
                {cached && (
                  <span className="ml-1 text-amber-500 dark:text-amber-400">(cached)</span>
                )}
              </span>
            )}
          </div>

          {/* In manual mode with no imported AI response, show compact score summary + prominent manual controls */}
          {data.manualMode && data.recommendations.length === 0 ? (
            <>
              {data.insights.length > 0 && (
                <div>
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-400">
                    Score signals
                  </p>
                  <ul className="space-y-0.5">
                    {data.insights.map((insight, i) => (
                      <li key={i} className="text-xs text-zinc-500 dark:text-zinc-500">
                        {insight}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <div className="rounded-lg border border-dashed border-zinc-300 bg-zinc-50/50 p-3 dark:border-zinc-700 dark:bg-zinc-800/30">
                <p className="mb-2 text-sm text-zinc-500">
                  Export your metrics as a prompt, paste into any AI chat, then import the response for richer insights.
                </p>
                <ManualModeControls onImported={refetch} />
              </div>
            </>
          ) : (
            <>
              <ul className="space-y-1">
                {data.insights.map((insight, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-zinc-600 dark:text-zinc-400"
                  >
                    <span className={healthColors[data.overallHealth]}>
                      {"\u2022"}
                    </span>
                    {insight}
                  </li>
                ))}
              </ul>

              {data.recommendations.length > 0 && (
                <div className="border-t border-zinc-100 pt-3 dark:border-zinc-800">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-zinc-500">
                    Recommendations
                  </p>
                  <ul className="space-y-1">
                    {data.recommendations.map((rec, i) => (
                      <li
                        key={i}
                        className="text-sm text-zinc-700 dark:text-zinc-300"
                      >
                        {i + 1}. {rec}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {data.manualMode && (
                <ManualModeControls onImported={refetch} />
              )}
            </>
          )}
        </div>
      </div>

      {/* Score breakdown panel */}
      {showBreakdown && data.scoreBreakdown && (
        <div className="mt-4">
          <ScoreBreakdown
            deductions={data.scoreBreakdown}
            onClose={() => setShowBreakdown(false)}
          />
        </div>
      )}
    </Card>
  );
}
