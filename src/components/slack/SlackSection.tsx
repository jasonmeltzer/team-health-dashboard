"use client";

import { useApiData } from "@/hooks/useApiData";
import type { SlackMetrics } from "@/types/slack";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { RateLimitBanner, RevalidatingBanner } from "@/components/ui/RateLimitBanner";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { ResponseTimeChart } from "./ResponseTimeChart";
import { ChannelActivityChart } from "./ChannelActivityChart";
import { OverloadIndicators } from "./OverloadIndicators";

const SlackIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M5.042 15.165a2.528 2.528 0 01-2.52 2.523A2.528 2.528 0 010 15.165a2.527 2.527 0 012.522-2.52h2.52v2.52zm1.271 0a2.527 2.527 0 012.521-2.52 2.527 2.527 0 012.521 2.52v6.313A2.528 2.528 0 018.834 24a2.528 2.528 0 01-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 01-2.521-2.52A2.528 2.528 0 018.834 0a2.528 2.528 0 012.521 2.522v2.52H8.834zm0 1.271a2.528 2.528 0 012.521 2.521 2.528 2.528 0 01-2.521 2.521H2.522A2.528 2.528 0 010 8.834a2.528 2.528 0 012.522-2.521h6.312zm10.122 2.521a2.528 2.528 0 012.522-2.521A2.528 2.528 0 0124 8.834a2.528 2.528 0 01-2.522 2.521h-2.522V8.834zm-1.268 0a2.528 2.528 0 01-2.523 2.521 2.527 2.527 0 01-2.52-2.521V2.522A2.527 2.527 0 0115.165 0a2.528 2.528 0 012.523 2.522v6.312zm-2.523 10.122a2.528 2.528 0 012.523 2.522A2.528 2.528 0 0115.165 24a2.527 2.527 0 01-2.52-2.522v-2.522h2.52zm0-1.268a2.527 2.527 0 01-2.52-2.523 2.526 2.526 0 012.52-2.52h6.313A2.527 2.527 0 0124 15.165a2.528 2.528 0 01-2.522 2.523h-6.313z" />
  </svg>
);

export function SlackSection({ refreshKey, onOpenSettings }: { refreshKey: number; onOpenSettings?: (section: string) => void }) {
  const { data, loading, refreshing, error, notConfigured, fetchedAt, cached, revalidating, rateLimited, rateLimitReset, refetch } = useApiData<SlackMetrics>(
    "/api/slack",
    refreshKey
  );

  if (notConfigured) {
    return (
      <Card>
        <div id="slack-section" className="min-h-[200px] flex flex-col items-center justify-center text-center px-4">
          <SectionHeader title="Slack" icon={<SlackIcon />} />
          <p className="mt-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Slack not connected
          </p>
          <p className="mt-1 text-sm font-normal text-zinc-600 dark:text-zinc-400 max-w-md">
            Response times, channel activity, and overload indicators appear here. Add your bot token and channel IDs in Settings.
          </p>
          {onOpenSettings && (
            <button
              onClick={() => onOpenSettings("slack")}
              className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-normal text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Connect Slack
            </button>
          )}
        </div>
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

  if (rateLimited && !data) {
    return (
      <div>
        <SectionHeader title="Slack" icon={<SlackIcon />} />
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Slack API rate limit exceeded
            </p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {rateLimitReset
                ? `Resets in ~${Math.max(1, Math.ceil((new Date(rateLimitReset).getTime() - Date.now()) / 60000))} minute(s)`
                : "Try again later"}
            </p>
            <button
              onClick={refetch}
              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Retry
            </button>
          </div>
        </Card>
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

  // Treatment B: configured but no channel activity found
  const noChannelActivity = data.summary.totalMessages7Days === 0 && data.channelActivity.length === 0;

  return (
    <div id="slack-section" className="space-y-4">
      <div className="flex items-center gap-2">
        <SectionHeader title="Slack" icon={<SlackIcon />} timestamp={fetchedAt} cached={cached} onRefresh={refetch} refreshing={refreshing} />
        {data.teamMemberFilter !== null && (
          <span className="text-xs font-normal text-zinc-500 -ml-1 mb-4">
            (filtered to {data.teamMemberFilter} members)
          </span>
        )}
      </div>
      {rateLimited && (
        <RateLimitBanner
          source="Slack"
          fetchedAt={fetchedAt}
          rateLimitReset={rateLimitReset}
        />
      )}
      {revalidating && !rateLimited && (
        <RevalidatingBanner source="Slack" />
      )}

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
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Response Time Trend
        </h3>
        {noChannelActivity ? (
          <p className="py-8 text-center text-sm font-normal text-zinc-500">
            No channel activity found. Verify the bot has been invited to the configured channels.
          </p>
        ) : (
          <ResponseTimeChart data={data.responseTimeTrend} />
        )}
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
