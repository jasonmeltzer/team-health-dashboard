"use client";

import { useState } from "react";
import { useApiData } from "@/hooks/useApiData";
import type { DORAMetrics } from "@/types/dora";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { RateLimitState } from "@/components/ui/RateLimitState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { DORARatingBadge } from "./DORARatingBadge";
import { DeploymentFrequencyChart } from "./DeploymentFrequencyChart";
import { LeadTimeTrend } from "./LeadTimeTrend";
import { DeploymentHistory } from "./DeploymentHistory";
import { IncidentsList } from "./IncidentsList";
import { cn } from "@/lib/utils";

const DORAIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
    <path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
    <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
    <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
  </svg>
);

const LOOKBACK_OPTIONS = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
];

export function DORASection({ refreshKey }: { refreshKey: number }) {
  const [lookbackDays, setLookbackDays] = useState(30);
  const { data, loading, error, notConfigured, fetchedAt, rateLimited, rateLimitReset, refetch } =
    useApiData<DORAMetrics>(
      `/api/dora?lookbackDays=${lookbackDays}`,
      refreshKey
    );

  if (notConfigured) {
    return (
      <Card>
        <SectionHeader title="DORA Metrics" icon={<DORAIcon />} />
        <p className="text-sm text-zinc-500">
          Deployment frequency, lead time, change failure rate, and MTTR.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Configure GitHub (token, org, repo) in Settings to enable DORA metrics.
        </p>
      </Card>
    );
  }

  const controls = (
    <div className="flex items-center gap-1">
      {LOOKBACK_OPTIONS.map((opt) => (
        <button
          key={opt.days}
          onClick={() => setLookbackDays(opt.days)}
          className={cn(
            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
            lookbackDays === opt.days
              ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
              : "text-zinc-500 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="DORA Metrics" icon={<DORAIcon />} action={controls} />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <Skeleton className="mb-2 h-3 w-20" />
              <Skeleton className="h-7 w-16" />
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (rateLimited) {
    return (
      <div>
        <SectionHeader title="DORA Metrics" icon={<DORAIcon />} action={controls} />
        <Card>
          <RateLimitState resetAt={rateLimitReset} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <SectionHeader title="DORA Metrics" icon={<DORAIcon />} action={controls} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  // Empty state: GitHub configured but no deployments found
  if (data.summary.totalDeployments === 0 && data.incidents.length === 0) {
    return (
      <div className="space-y-4">
        <SectionHeader title="DORA Metrics" icon={<DORAIcon />} action={controls} timestamp={fetchedAt} />
        <Card>
          <p className="text-sm text-zinc-500">
            No deployments, releases, or merged PRs found in the last {lookbackDays} days.
          </p>
          <p className="mt-2 text-xs text-zinc-400">
            DORA metrics detect GitHub Deployments, Releases, or merged PRs to the default branch.
            Set the deployment source to &quot;merges&quot; in Settings if your team deploys on merge.
          </p>
        </Card>
      </div>
    );
  }

  const s = data.summary;

  return (
    <div className="space-y-4">
      <SectionHeader title="DORA Metrics" icon={<DORAIcon />} action={controls} timestamp={fetchedAt} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Deploy Freq"
          value={`${s.deploymentFrequency}/wk`}
          trendLabel={
            <DORARatingBadge rating={s.deploymentFrequencyRating} />
          }
        />
        <MetricCard
          label="Lead Time"
          value={
            s.avgLeadTimeHours != null
              ? `${Math.round(s.avgLeadTimeHours)}h`
              : "N/A"
          }
          trendLabel={
            s.leadTimeRating ? (
              <DORARatingBadge rating={s.leadTimeRating} />
            ) : undefined
          }
        />
        <MetricCard
          label="Change Failure"
          value={`${s.changeFailureRate}%`}
          trendLabel={
            <DORARatingBadge rating={s.changeFailureRateRating} />
          }
        />
        <MetricCard
          label="MTTR"
          value={s.mttrHours != null ? `${Math.round(s.mttrHours)}h` : "N/A"}
          trendLabel={
            s.mttrRating ? (
              <DORARatingBadge rating={s.mttrRating} />
            ) : undefined
          }
        />
      </div>

      <DeploymentFrequencyChart data={data.trend} />
      <LeadTimeTrend data={data.trend} />

      <div className="grid gap-4 lg:grid-cols-2">
        <DeploymentHistory deployments={data.deployments} />
        <IncidentsList incidents={data.incidents} />
      </div>
    </div>
  );
}
