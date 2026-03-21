"use client";

import { useApiData } from "@/hooks/useApiData";
import type { SlackMetrics } from "@/types/slack";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ResponseTimeChart } from "./ResponseTimeChart";
import { ChannelActivityChart } from "./ChannelActivityChart";
import { OverloadIndicators } from "./OverloadIndicators";

const SlackIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" />
  </svg>
);

export function SlackSection({ refreshKey }: { refreshKey: number }) {
  const { data, loading, refreshing, error, notConfigured, fetchedAt, refetch } = useApiData<SlackMetrics>(
    "/api/slack",
    refreshKey
  );

  if (notConfigured) {
    return (
      <Card>
        <SectionHeader title="Slack" icon={<SlackIcon />} />
        <p className="text-sm text-zinc-500">
          Response times, channel activity, and team overload indicators.
        </p>
        <p className="mt-2 text-xs text-zinc-400">
          Add your Slack bot token and channel IDs in Settings to enable.
        </p>
      </Card>
    );
  }

  if (loading && !data) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Slack" icon={<SlackIcon />} />
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
        <SectionHeader title="Slack" icon={<SlackIcon />} onRefresh={refetch} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-4">
      <SectionHeader title="Slack" icon={<SlackIcon />} timestamp={fetchedAt} onRefresh={refetch} refreshing={refreshing} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label="Messages (7d)"
          value={data.summary.totalMessages7Days}
          refreshing={refreshing}
        />
        <MetricCard
          label="Avg Response"
          value={`${data.summary.avgResponseMinutes}m`}
          refreshing={refreshing}
        />
        <MetricCard
          label="Most Active"
          value={data.summary.mostActiveChannel}
          refreshing={refreshing}
        />
        <MetricCard
          label="Overloaded"
          value={data.summary.potentiallyOverloaded}
          refreshing={refreshing}
          trend={data.summary.potentiallyOverloaded > 0 ? "up" : "flat"}
        />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Response Time Trend
        </h3>
        <ResponseTimeChart data={data.responseTimeTrend} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Channel Activity
          </h3>
          <ChannelActivityChart data={data.channelActivity} />
        </Card>
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Team Activity
          </h3>
          <OverloadIndicators data={data.overloadIndicators} />
        </Card>
      </div>
    </div>
  );
}
