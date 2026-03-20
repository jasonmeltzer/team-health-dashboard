"use client";

import { useApiData } from "@/hooks/useApiData";
import type { PRMetrics } from "@/types/github";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { CycleTimeChart } from "./CycleTimeChart";
import { ReviewBottlenecks } from "./ReviewBottlenecks";
import { StalePRsList } from "./StalePRsList";

const GitHubIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

export function GitHubSection({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, notConfigured, refetch } = useApiData<PRMetrics>(
    "/api/github",
    refreshKey
  );

  if (notConfigured) return null;

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="GitHub" icon={<GitHubIcon />} />
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
        <SectionHeader title="GitHub" icon={<GitHubIcon />} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionHeader title="GitHub" icon={<GitHubIcon />} />

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
            Review Bottlenecks
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
