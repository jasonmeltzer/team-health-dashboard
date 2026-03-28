"use client";

import { useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ResponsiveContainer,
} from "recharts";
import { useApiData } from "@/hooks/useApiData";
import type { TrendsResponse, TrendSnapshot } from "@/types/trends";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { cn } from "@/lib/utils";

function ScoreTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: TrendSnapshot }> }) {
  if (!active || !payload?.length) return null;
  const snap = payload[0].payload;
  return (
    <div className="rounded-lg border border-zinc-200 bg-white p-2 text-xs shadow dark:border-zinc-700 dark:bg-zinc-800">
      <p className="font-medium text-zinc-700 dark:text-zinc-300">
        Score: {snap.score}
      </p>
      <p className="mb-1 text-zinc-400">
        {new Date(snap.createdAt).toLocaleString()}
      </p>
      {snap.deductions
        .filter((d) => d.points > 0)
        .map((d) => (
          <p key={d.signal} className="text-zinc-500 dark:text-zinc-400">
            {d.signal}: -{d.points} ({d.detail})
          </p>
        ))}
      {snap.deductions.filter((d) => d.points > 0).length === 0 && (
        <p className="text-emerald-500">No deductions</p>
      )}
    </div>
  );
}

export function HealthTrendChart({ refreshKey }: { refreshKey: number }) {
  const [days, setDays] = useState(30);

  const { data, loading, error, refetch } = useApiData<TrendsResponse>(
    `/api/trends?days=${days}`,
    refreshKey
  );

  const snapshots = data?.snapshots ?? [];

  return (
    <div>
      {/* Header row with label and date range selector */}
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-zinc-400">
          Score History
        </span>
        <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={cn(
                "rounded-md px-2 py-0.5 text-xs font-medium",
                days === d
                  ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
                  : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && !data && (
        <Skeleton className="h-64 w-full rounded-lg" />
      )}

      {/* Error state */}
      {error && !loading && (
        <ErrorState message={error} onRetry={refetch} />
      )}

      {/* Empty state: 0 or 1 snapshots */}
      {!loading && !error && snapshots.length <= 1 && (
        <div className="flex flex-col items-center justify-center py-8">
          {snapshots.length === 1 && (
            <svg className="mb-2 h-8 w-8" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="4" fill="#3b82f6" />
            </svg>
          )}
          <p className="text-center text-sm text-zinc-500">
            Score history builds over time — check back tomorrow.
          </p>
        </div>
      )}

      {/* Chart: 2+ snapshots */}
      {!loading && !error && snapshots.length >= 2 && (
        <ResponsiveContainer width="100%" height={256} minWidth={0}>
          <LineChart data={snapshots}>
            {/* Health band zones */}
            <ReferenceArea y1={80} y2={100} fill="#d1fae5" fillOpacity={0.3} ifOverflow="visible" />
            <ReferenceArea y1={60} y2={79}  fill="#fef3c7" fillOpacity={0.3} ifOverflow="visible" />
            <ReferenceArea y1={0}  y2={59}  fill="#fee2e2" fillOpacity={0.3} ifOverflow="visible" />
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis
              dataKey="createdAt"
              tick={{ fontSize: 12 }}
              stroke="#a1a1aa"
              tickFormatter={(value) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
            />
            <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} stroke="#a1a1aa" />
            <Tooltip content={<ScoreTooltip />} />
            <Line
              type="monotone"
              dataKey="score"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
