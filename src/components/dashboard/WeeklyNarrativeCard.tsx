"use client";

import { useApiData } from "@/hooks/useApiData";
import type { WeeklyNarrative } from "@/types/metrics";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";

export function WeeklyNarrativeCard({ refreshKey }: { refreshKey: number }) {
  const { data, loading, error, notConfigured, setupHint, refetch } = useApiData<WeeklyNarrative>(
    "/api/weekly-narrative",
    refreshKey
  );

  if (notConfigured) return null;

  if (loading) {
    return (
      <Card className="col-span-full">
        <Skeleton className="mb-3 h-5 w-48" />
        <div className="space-y-2">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-4 h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
        </div>
      </Card>
    );
  }

  if (setupHint) {
    return (
      <Card className="col-span-full">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Weekly Summary
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          A narrative summary of your team&apos;s week — trends, risks, and highlights — will appear here.
        </p>
        <p className="mt-2 text-xs text-zinc-400">{setupHint}</p>
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

  return (
    <Card className="col-span-full">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-lg font-bold text-zinc-900 dark:text-zinc-100">
          Weekly Summary
        </h2>
        <span className="text-xs text-zinc-500">Week of {data.weekOf}</span>
      </div>
      <div className="prose prose-sm prose-zinc max-w-none dark:prose-invert">
        {data.narrative.split("\n\n").map((paragraph, i) => (
          <p key={i}>{paragraph}</p>
        ))}
      </div>
    </Card>
  );
}
