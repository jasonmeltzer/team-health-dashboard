"use client";

import { useApiData } from "@/hooks/useApiData";
import type { LinearMetrics } from "@/types/linear";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { VelocityChart } from "./VelocityChart";
import { StalledIssuesList } from "./StalledIssuesList";
import { WorkloadDistribution } from "./WorkloadDistribution";

const LinearIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.357 20.643a12.035 12.035 0 01-1.418-2.417l7.066-7.066a1.5 1.5 0 012.122 0l1.713 1.713a1.5 1.5 0 010 2.122l-7.066 7.066a12.035 12.035 0 01-2.417-1.418zm-1.98-3.84A11.96 11.96 0 010 12C0 5.373 5.373 0 12 0s12 5.373 12 12-5.373 12-12 12c-1.676 0-3.277-.344-4.803-.962l6.09-6.09a3.5 3.5 0 000-4.95l-1.713-1.713a3.5 3.5 0 00-4.95 0l-6.09 6.09a11.943 11.943 0 01-.157-.572z" />
  </svg>
);

export function LinearSection({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, refetch } = useApiData<LinearMetrics>(
    "/api/linear",
    refreshKey
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Linear" icon={<LinearIcon />} />
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
        <SectionHeader title="Linear" icon={<LinearIcon />} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionHeader title="Linear" icon={<LinearIcon />} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Current Cycle"
          value={data.summary.currentCycleName}
        />
        <MetricCard
          label="Progress"
          value={`${data.summary.currentCycleProgress}%`}
        />
        <MetricCard
          label="Stalled Issues"
          value={data.summary.stalledIssueCount}
          trend={data.summary.stalledIssueCount > 3 ? "up" : "flat"}
        />
        <MetricCard
          label="Avg Velocity"
          value={`${data.summary.avgVelocity} pts`}
        />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Sprint Velocity
        </h3>
        <VelocityChart data={data.velocityTrend} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Workload Distribution
          </h3>
          <WorkloadDistribution data={data.workloadDistribution} />
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Stalled Issues
          </h3>
          <StalledIssuesList data={data.stalledIssues} />
        </Card>
      </div>
    </div>
  );
}
