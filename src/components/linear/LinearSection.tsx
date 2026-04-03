"use client";

import { useState, useCallback } from "react";
import { useApiData } from "@/hooks/useApiData";
import type { LinearMetrics, CycleInfo } from "@/types/linear";
import { Card } from "@/components/ui/Card";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { ErrorState } from "@/components/ui/ErrorState";
import { RateLimitBanner, RevalidatingBanner } from "@/components/ui/RateLimitBanner";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { cn } from "@/lib/utils";
import { VelocityChart } from "./VelocityChart";
import { StalledIssuesList } from "./StalledIssuesList";
import { WorkloadDistribution } from "./WorkloadDistribution";
import { TimeInState } from "./TimeInState";
import { ScopeChangesCard } from "./ScopeChangesCard";

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
    // Single-select: always switch to the clicked cycle
    onChange(new Set([name]));
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


export function LinearSection({ refreshKey, onOpenSettings }: { refreshKey: number; onOpenSettings?: (section: string) => void }) {
  const [viewMode, setViewMode] = useState<ViewMode>("weekly");
  const [sliderDays, setSliderDays] = useState(42);
  const [committedDays, setCommittedDays] = useState(42);
  const [selectedCycleName, setSelectedCycleName] = useState<string | null>(null);
  const { data, loading, refreshing, error, notConfigured, fetchedAt, cached, stale, revalidating, rateLimited, rateLimitReset, refetch } = useApiData<LinearMetrics>(
    `/api/linear?mode=${viewMode}&days=${committedDays}`,
    refreshKey
  );

  // State for programmatically switching the TimeInState tab
  const [requestedTab, setRequestedTab] = useState<"wip" | null>(null);
  const clearRequestedTab = useCallback(() => setRequestedTab(null), []);

  if (notConfigured) {
    return (
      <Card>
        <div id="linear-section" className="min-h-[200px] flex flex-col items-center justify-center text-center px-4">
          <SectionHeader title="Linear" icon={<LinearIcon />} />
          <p className="mt-4 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
            Linear not connected
          </p>
          <p className="mt-1 text-sm font-normal text-zinc-600 dark:text-zinc-400 max-w-md">
            Sprint velocity, workload distribution, and time-in-state appear here. Add your API key and team ID in Settings.
          </p>
          {onOpenSettings && (
            <button
              onClick={() => onOpenSettings("linear")}
              className="mt-4 rounded-md bg-zinc-900 px-3 py-1.5 text-sm font-normal text-white transition-colors hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
            >
              Connect Linear
            </button>
          )}
        </div>
      </Card>
    );
  }

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

  if (loading && !data) {
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

  if (rateLimited && !data) {
    return (
      <div>
        <SectionHeader title="Linear" icon={<LinearIcon />} action={controls} />
        <Card>
          <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
            <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
              Linear API rate limit exceeded
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
        <SectionHeader title="Linear" icon={<LinearIcon />} action={controls} onRefresh={refetch} />
        <Card>
          <ErrorState message={error} onRetry={refetch} />
        </Card>
      </div>
    );
  }

  if (!data) return null;

  const isCycles = data.mode === "cycles";
  const hasCycles = isCycles && data.availableCycles.length > 0;

  // Resolve selected cycle (default to current)
  const currentCycleName = data.summary.currentCycleName;
  const activeCycleName = isCycles && selectedCycleName && data.summaryByCycle[selectedCycleName]
    ? selectedCycleName
    : currentCycleName;
  const isCurrentCycle = activeCycleName === currentCycleName;
  const isPastCycle = isCycles && !isCurrentCycle;

  // Get data for the selected cycle
  const cycleSummary = isCycles ? data.summaryByCycle[activeCycleName] : null;
  const activeTimeInState = isCycles
    ? data.timeInStateByCycle[activeCycleName] || data.timeInState
    : data.timeInState;
  const activeWorkload = isCycles
    ? data.workloadByCycle[activeCycleName] || data.workloadDistribution
    : data.workloadDistribution;
  const activeStalledIssues = isCycles
    ? data.stalledIssuesByCycle[activeCycleName] || data.stalledIssues
    : data.stalledIssues;

  return (
    <div id="linear-section" className="space-y-4">
      <SectionHeader title="Linear" icon={<LinearIcon />} action={controls} timestamp={fetchedAt} cached={cached} onRefresh={refetch} refreshing={refreshing} />
      {rateLimited && (
        <RateLimitBanner
          source="Linear"
          fetchedAt={fetchedAt}
          rateLimitReset={rateLimitReset}
        />
      )}
      {revalidating && !rateLimited && (
        <RevalidatingBanner source="Linear" />
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <MetricCard
          label={isCycles ? "Cycle" : "Mode"}
          value={isCycles ? activeCycleName : data.summary.currentCycleName}
          refreshing={refreshing}
        />
        {isCycles ? (
          <MetricCard
            label="Progress"
            value={`${cycleSummary?.progress ?? data.summary.currentCycleProgress}%`}
            refreshing={refreshing}
          />
        ) : (
          <MetricCard
            label="Active Issues"
            value={data.summary.totalActiveIssues}
            refreshing={refreshing}
            onClick={() => {
              setRequestedTab("wip");
              document.getElementById("time-in-state")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        )}
        <MetricCard
          label="Stalled Issues"
          value={cycleSummary?.stalledCount ?? data.summary.stalledIssueCount}
          refreshing={refreshing}
          onClick={!isPastCycle ? () => {
            document.getElementById("stalled-issues")?.scrollIntoView({ behavior: "smooth", block: "start" });
          } : undefined}
        />
        {isCycles ? (
          <MetricCard
            label="Active Issues"
            value={cycleSummary?.activeIssues ?? data.summary.totalActiveIssues}
            refreshing={refreshing}
            disabled={isPastCycle}
            disabledTooltip="Active issues only available for the current cycle"
            onClick={!isPastCycle ? () => {
              setRequestedTab("wip");
              document.getElementById("time-in-state")?.scrollIntoView({ behavior: "smooth", block: "start" });
            } : undefined}
          />
        ) : (
          <MetricCard
            label="Avg Throughput"
            value={`${data.summary.avgVelocity} pts/wk`}
            refreshing={refreshing}
          />
        )}
        {isCycles && data.scopeChanges && (
          <MetricCard
            label="Scope Change"
            value={data.scopeChanges.net >= 0 ? `+${data.scopeChanges.net}` : `${data.scopeChanges.net}`}
            trendLabel={
              <span
                className={cn(
                  "text-xs",
                  data.scopeChanges.net > 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-zinc-500"
                )}
              >
                {data.scopeChanges.net > 0
                  ? "scope grew"
                  : data.scopeChanges.net < 0
                  ? "scope reduced"
                  : "on track"}
              </span>
            }
            refreshing={refreshing}
            onClick={() => {
              document
                .getElementById("scope-changes")
                ?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
        )}
      </div>

      {hasCycles && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Cycle:</span>
          <CyclePicker
            cycles={data.availableCycles}
            selected={new Set([activeCycleName])}
            onChange={(s) => {
              const name = Array.from(s)[0];
              setSelectedCycleName(name === currentCycleName ? null : name);
            }}
          />
        </div>
      )}

      <Card>
        <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          {isCycles ? "Sprint Velocity" : "Weekly Throughput"}
        </h3>
        {data.velocityTrend.length === 0 ? (
          <p className="py-8 text-center text-sm font-normal text-zinc-500">
            No issues updated in the selected range. Try extending the lookback.
          </p>
        ) : (
          <VelocityChart
            data={data.velocityTrend}
            selectedCycle={isCycles ? activeCycleName : undefined}
            onBarClick={isCycles ? (name) => {
              setSelectedCycleName(name === currentCycleName ? null : name);
            } : undefined}
          />
        )}
      </Card>

      <Card>
        <div id="time-in-state">
          <TimeInState
            data={activeTimeInState}
            requestedTab={requestedTab}
            onTabActivated={clearRequestedTab}
          />
        </div>
      </Card>

      {isCycles && data.scopeChanges && (
        <ScopeChangesCard summary={data.scopeChanges} />
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h3 className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Workload Distribution
          </h3>
          <WorkloadDistribution data={activeWorkload} />
        </Card>
        <Card>
          <h3 id="stalled-issues" className="mb-3 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            Stalled Issues {isPastCycle && <span className="text-xs font-normal text-zinc-400">(at cycle end)</span>}
          </h3>
          <StalledIssuesList data={activeStalledIssues} />
        </Card>
      </div>
    </div>
  );
}
