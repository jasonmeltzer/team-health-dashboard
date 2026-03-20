"use client";

import { useState, useMemo } from "react";
import { useApiData } from "@/hooks/useApiData";
import type { LinearMetrics, WorkloadEntry, CycleInfo } from "@/types/linear";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { cn } from "@/lib/utils";
import { VelocityChart } from "./VelocityChart";
import { StalledIssuesList } from "./StalledIssuesList";
import { WorkloadDistribution } from "./WorkloadDistribution";
import { TimeInState } from "./TimeInState";

const LinearIcon = () => (
  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
    <path d="M3.357 20.643a12.035 12.035 0 01-1.418-2.417l7.066-7.066a1.5 1.5 0 012.122 0l1.713 1.713a1.5 1.5 0 010 2.122l-7.066 7.066a12.035 12.035 0 01-2.417-1.418zm-1.98-3.84A11.96 11.96 0 010 12C0 5.373 5.373 0 12 0s12 5.373 12 12-5.373 12-12 12c-1.676 0-3.277-.344-4.803-.962l6.09-6.09a3.5 3.5 0 000-4.95l-1.713-1.713a3.5 3.5 0 00-4.95 0l-6.09 6.09a11.943 11.943 0 01-.157-.572z" />
  </svg>
);

type ViewMode = "cycles" | "weekly";

const MIN_DAYS = 7;
const MAX_DAYS = 180;

function ViewToggle({
  mode,
  onChange,
}: {
  mode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-100 p-0.5 dark:border-zinc-700 dark:bg-zinc-800">
      {(["cycles", "weekly"] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={cn(
            "rounded-md px-3 py-1 text-xs font-medium transition-colors",
            mode === m
              ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-700 dark:text-zinc-100"
              : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200"
          )}
        >
          {m === "cycles" ? "Cycles" : "Weekly"}
        </button>
      ))}
    </div>
  );
}

function formatDaysLabel(days: number): string {
  if (days < 14) return `${days}d`;
  if (days < 60) return `${Math.round(days / 7)}wk`;
  return `${Math.round(days / 30)}mo`;
}

function RangeSlider({
  days,
  onChange,
  onCommit,
}: {
  days: number;
  onChange: (days: number) => void;
  onCommit: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-zinc-500 whitespace-nowrap">
        {formatDaysLabel(days)}
      </span>
      <input
        type="range"
        min={MIN_DAYS}
        max={MAX_DAYS}
        step={7}
        value={days}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        onMouseUp={onCommit}
        onTouchEnd={onCommit}
        className="h-1.5 w-24 cursor-pointer appearance-none rounded-full bg-zinc-200 accent-zinc-700 dark:bg-zinc-700 dark:accent-zinc-300 sm:w-32"
      />
    </div>
  );
}

function CyclePicker({
  cycles,
  selected,
  onChange,
}: {
  cycles: CycleInfo[];
  selected: Set<string>;
  onChange: (selected: Set<string>) => void;
}) {
  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) {
      if (next.size > 1) next.delete(name); // keep at least one selected
    } else {
      next.add(name);
    }
    onChange(next);
  };

  return (
    <div className="flex flex-wrap gap-1.5">
      {cycles.map((c) => {
        const active = selected.has(c.name);
        return (
          <button
            key={c.id}
            onClick={() => toggle(c.name)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors",
              active
                ? "border-zinc-400 bg-zinc-900 text-white dark:border-zinc-500 dark:bg-zinc-100 dark:text-zinc-900"
                : "border-zinc-200 bg-zinc-50 text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
            )}
          >
            {c.name}
            {c.isCurrent && (
              <span className={cn("ml-1", active ? "opacity-60" : "opacity-40")}>
                (current)
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function mergeWorkloads(
  workloadByCycle: Record<string, WorkloadEntry[]>,
  selectedCycles: Set<string>
): WorkloadEntry[] {
  const merged = new Map<
    string,
    { avatarUrl: string | null; inProgress: number; todo: number; completed: number; totalPoints: number }
  >();

  for (const cycleName of selectedCycles) {
    const entries = workloadByCycle[cycleName];
    if (!entries) continue;
    for (const entry of entries) {
      const existing = merged.get(entry.assignee) || {
        avatarUrl: entry.avatarUrl,
        inProgress: 0,
        todo: 0,
        completed: 0,
        totalPoints: 0,
      };
      existing.inProgress += entry.inProgress;
      existing.todo += entry.todo;
      existing.completed += entry.completed;
      existing.totalPoints += entry.totalPoints;
      merged.set(entry.assignee, existing);
    }
  }

  return Array.from(merged.entries())
    .map(([assignee, data]) => ({ assignee, ...data }))
    .sort((a, b) => b.inProgress + b.todo - (a.inProgress + a.todo));
}

export function LinearSection({ refreshKey }: { refreshKey: number }) {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [sliderDays, setSliderDays] = useState(42);
  const [committedDays, setCommittedDays] = useState(42);
  const { data, loading, error, notConfigured, refetch } = useApiData<LinearMetrics>(
    `/api/linear?mode=${viewMode}&days=${committedDays}`,
    refreshKey
  );

  if (notConfigured) return null;

  const controls = (
    <div className="flex items-center gap-2">
      <RangeSlider
        days={sliderDays}
        onChange={setSliderDays}
        onCommit={() => setCommittedDays(sliderDays)}
      />
      <ViewToggle mode={viewMode} onChange={setViewMode} />
    </div>
  );

  if (loading) {
    return (
      <div className="space-y-4">
        <SectionHeader title="Linear" icon={<LinearIcon />} action={controls} />
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
        <SectionHeader title="Linear" icon={<LinearIcon />} action={controls} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const isCycles = data.mode === "cycles";
  const hasCycleWorkloads = isCycles && data.availableCycles.length > 0;

  return (
    <div className="space-y-4">
      <SectionHeader title="Linear" icon={<LinearIcon />} action={controls} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MetricCard
          label={isCycles ? "Current Cycle" : "Mode"}
          value={data.summary.currentCycleName}
        />
        {isCycles ? (
          <MetricCard
            label="Progress"
            value={`${data.summary.currentCycleProgress}%`}
          />
        ) : (
          <MetricCard
            label="Active Issues"
            value={data.summary.totalActiveIssues}
          />
        )}
        <MetricCard
          label="Stalled Issues"
          value={data.summary.stalledIssueCount}
          trend={data.summary.stalledIssueCount > 3 ? "up" : "flat"}
        />
        <MetricCard
          label={isCycles ? "Avg Velocity" : "Avg Throughput"}
          value={`${data.summary.avgVelocity} pts/${isCycles ? "cycle" : "wk"}`}
        />
      </div>

      <Card>
        <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {isCycles ? "Sprint Velocity" : "Weekly Throughput"}
        </h3>
        <VelocityChart data={data.velocityTrend} />
      </Card>

      <Card>
        <TimeInState data={data.timeInState} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {hasCycleWorkloads ? (
          <CycleWorkloadCard data={data} />
        ) : (
          <Card>
            <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
              Workload Distribution
            </h3>
            <WorkloadDistribution data={data.workloadDistribution} />
          </Card>
        )}
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

function CycleWorkloadCard({ data }: { data: LinearMetrics }) {
  const [selectedCycles, setSelectedCycles] = useState<Set<string>>(() => {
    const current = data.availableCycles.find((c) => c.isCurrent);
    return new Set(current ? [current.name] : data.availableCycles.length > 0 ? [data.availableCycles[0].name] : []);
  });

  const mergedWorkload = useMemo(
    () => mergeWorkloads(data.workloadByCycle, selectedCycles),
    [data.workloadByCycle, selectedCycles]
  );

  return (
    <Card>
      <div className="mb-3 space-y-2">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Workload Distribution
        </h3>
        <CyclePicker
          cycles={data.availableCycles}
          selected={selectedCycles}
          onChange={setSelectedCycles}
        />
      </div>
      <WorkloadDistribution data={mergedWorkload} />
    </Card>
  );
}
