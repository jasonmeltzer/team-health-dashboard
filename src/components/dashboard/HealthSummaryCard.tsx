"use client";

import { useApiData } from "@/hooks/useApiData";
import type { HealthSummary } from "@/types/metrics";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export function HealthSummaryCard({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, notConfigured, refetch } = useApiData<HealthSummary>(
    "/api/health-summary",
    refreshKey
  );

  if (notConfigured) return null;

  if (loading) {
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
      : data.score >= 50
        ? "stroke-amber-500"
        : "stroke-red-500";

  return (
    <Card className="col-span-full">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        {/* Score circle */}
        <div className="relative flex-shrink-0">
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
            </h2>
            <Badge variant={data.overallHealth}>
              {data.overallHealth.charAt(0).toUpperCase() +
                data.overallHealth.slice(1)}
            </Badge>
          </div>

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
        </div>
      </div>
    </Card>
  );
}
