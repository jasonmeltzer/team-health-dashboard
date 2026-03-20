"use client";

import { useState } from "react";
import { useApiData } from "@/hooks/useApiData";
import type { PRMetrics } from "@/types/github";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { cn } from "@/lib/utils";
import { CycleTimeChart } from "./CycleTimeChart";
import { ReviewBottlenecks } from "./ReviewBottlenecks";
import { StalePRsList } from "./StalePRsList";

const GitHubIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const STALE_OPTIONS = [
  { label: "3d", days: 3 },
  { label: "5d", days: 5 },
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
];

const LOOKBACK_OPTIONS = [
  { label: "7d", days: 7 },
  { label: "14d", days: 14 },
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
];

export function GitHubSection({ refreshKey }: { refreshKey: number }) {
  const [staleDays, setStaleDays] = useState(7);
  const [lookbackDays, setLookbackDays] = useState(30);
  const { data, loading, error, notConfigured, refetch } = useApiData<PRMetrics>(
    `/api/github?staleDays=${staleDays}&lookbackDays=${lookbackDays}`,
    refreshKey
  );

  if (notConfigured) {
    return (
      <Card>
        <SectionHeader title="GitHub" icon={<GitHubIcon />} />
        <p className="text-sm text-zinc-500">
          PR cycle time, review bottlenecks, and stale PR tracking.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Add your GitHub token, org, and repo in Settings to enable.
        </p>
      </Card>
    );
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-3">
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-400">Period</span>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
          {LOOKBACK_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setLookbackDays(opt.days)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                lookbackDays === opt.days
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-zinc-400">Stale after</span>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
          {STALE_OPTIONS.map((opt) => (
            <button
              key={opt.days}
              onClick={() => setStaleDays(opt.days)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium transition-colors",
                staleDays === opt.days
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="GitHub" icon={<GitHubIcon />} action={controls} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <SectionHeader title="GitHub" icon={<GitHubIcon />} action={controls} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionHeader title="GitHub" icon={<GitHubIcon />} action={controls} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard label="Open PRs" value={data.summary.totalOpenPRs} />
        <MetricCard
          label="Avg Cycle Time"
          value={`${data.summary.avgCycleTimeHours}h`}
        />
        <MetricCard
          label="Stale PRs"
          value={data.summary.stalePRCount}
          trend={data.summary.stalePRCount > 3 ? "up" : "flat"}
        />
        <MetricCard
          label="Needs Review"
          value={data.summary.prsNeedingReview}
        />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Cycle Time Trend
        </h3>
        <CycleTimeChart data={data.cycleTimeTrend} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Review Bottlenecks{" "}
            <span className="font-normal text-zinc-400">
              (last {lookbackDays}d)
            </span>
          </h3>
          <ReviewBottlenecks data={data.reviewBottlenecks} />
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Stale PRs
          </h3>
          <StalePRsList data={data.stalePRs} />
        </Card>
      </div>
    </div>
  );
}
