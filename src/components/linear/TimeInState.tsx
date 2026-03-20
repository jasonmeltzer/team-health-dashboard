"use client";

import { useState, useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  LineChart,
  Line,
} from "recharts";
import { cn } from "@/lib/utils";
import type { TimeInStateData, TimeInStateStats, TimeInStateIssue } from "@/types/linear";

const STATE_COLORS: Record<string, string> = {
  "In Progress": "#f59e0b",
  "In Review": "#8b5cf6",
  "Todo": "#94a3b8",
  "Done": "#10b981",
  "Backlog": "#64748b",
};

function getColor(state: string): string {
  return STATE_COLORS[state] || "#6366f1";
}

type Tab = "summary" | "wip" | "outliers" | "assignee" | "flow" | "trends";

const TABS: { key: Tab; label: string }[] = [
  { key: "summary", label: "Summary" },
  { key: "wip", label: "Current WIP" },
  { key: "outliers", label: "Outliers" },
  { key: "assignee", label: "By Assignee" },
  { key: "flow", label: "Flow Efficiency" },
  { key: "trends", label: "Trends" },
];

export function TimeInState({ data }: { data: TimeInStateData }) {
  const [activeTab, setActiveTab] = useState<Tab>("summary");
  const [hiddenStates, setHiddenStates] = useState<Set<string>>(() => {
    // Hide "completed" states (e.g. Done) by default — their "days" metric
    // (days since completed) is less actionable than active states
    const completedStates = new Set(
      data.issues
        .filter((i) => i.stateType === "completed")
        .map((i) => i.state)
    );
    return completedStates;
  });

  if (data.stats.length === 0 && data.issues.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No time-in-state data available
      </p>
    );
  }

  const toggleState = (state: string) => {
    setHiddenStates((prev) => {
      const next = new Set(prev);
      if (next.has(state)) next.delete(state);
      else next.add(state);
      return next;
    });
  };

  const filteredStats = data.stats.filter((d) => !hiddenStates.has(d.state));

  return (
    <div className="space-y-3">
      {/* Section title + tabs */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h3 className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Time in State
        </h3>
        <div className="flex flex-wrap gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                activeTab === tab.key
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Global state filter toggles */}
      <div className="flex flex-wrap gap-2">
        {data.stats.map((d) => {
          const hidden = hiddenStates.has(d.state);
          return (
            <button
              key={d.state}
              onClick={() => toggleState(d.state)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                hidden
                  ? "border-zinc-200 bg-zinc-50 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500"
                  : "border-zinc-300 bg-white text-zinc-700 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300"
              )}
            >
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{
                  backgroundColor: hidden ? "#d4d4d8" : getColor(d.state),
                }}
              />
              {d.state}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      {activeTab === "summary" && <SummaryTab stats={filteredStats} />}
      {activeTab === "wip" && <WipTab issues={data.issues} />}
      {activeTab === "outliers" && (
        <OutliersTab issues={data.issues} stats={filteredStats} />
      )}
      {activeTab === "assignee" && (
        <AssigneeTab issues={data.issues} hiddenStates={hiddenStates} />
      )}
      {activeTab === "flow" && (
        <FlowTab
          efficiency={data.flowEfficiency}
          issues={data.issues}
          hiddenStates={hiddenStates}
        />
      )}
      {activeTab === "trends" && <TrendsTab data={data} />}
    </div>
  );
}

/* ────────────────────────────────── Summary Tab ────────────────────────────────── */

function SummaryTab({ stats }: { stats: TimeInStateStats[] }) {
  return (
    <div className="space-y-4">
      {/* Chart */}
      {stats.length > 0 && (
        <div className="h-48">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
            <BarChart data={stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="state" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
              <YAxis
                tick={{ fontSize: 12 }}
                stroke="#a1a1aa"
                label={{
                  value: "Days",
                  angle: -90,
                  position: "insideLeft",
                  style: { fontSize: 12, fill: "#a1a1aa" },
                }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(value) => [`${value} days`]}
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="meanDays" name="Mean" radius={[4, 4, 0, 0]}>
                {stats.map((entry, i) => (
                  <Cell key={i} fill={getColor(entry.state)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-500">State</th>
              <th className="pb-2 text-right font-medium text-zinc-500">Count</th>
              <th className="pb-2 text-right font-medium text-zinc-500">Min</th>
              <th className="pb-2 text-right font-medium text-zinc-500">Median</th>
              <th className="pb-2 text-right font-medium text-zinc-500">Mean</th>
              <th className="pb-2 text-right font-medium text-zinc-500" title="90th percentile — only 10% of issues are slower than this">
                Slow
              </th>
              <th className="pb-2 text-right font-medium text-zinc-500">Max</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((row) => (
              <tr
                key={row.state}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  <span className="flex items-center gap-2">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: getColor(row.state) }}
                    />
                    {row.state}
                  </span>
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {row.count}
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {row.minDays}d
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {row.medianDays}d
                </td>
                <td className="py-2 text-right font-medium text-zinc-700 dark:text-zinc-300">
                  {row.meanDays}d
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400" title="90th percentile">
                  {row.p90Days}d
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {row.maxDays}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Explanation of what "days" means */}
      <p className="text-xs leading-relaxed text-zinc-400">
        <strong className="text-zinc-500">How days are measured:</strong>{" "}
        In Progress = days since work started.{" "}
        Todo / Backlog = days since last activity (approximate).{" "}
        Done = days since completed (hidden by default).{" "}
        <span className="italic">
          &ldquo;Slow&rdquo; = 90th percentile: only 10% of issues took longer.
        </span>
      </p>
    </div>
  );
}

/* ────────────────────────────────── Current WIP Tab ────────────────────────────────── */

function WipTab({ issues }: { issues: TimeInStateIssue[] }) {
  const wipIssues = useMemo(
    () =>
      issues
        .filter((i) => i.stateType === "started")
        .sort((a, b) => b.daysInState - a.daysInState),
    [issues]
  );

  if (wipIssues.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
        No work currently in progress
      </p>
    );
  }

  // Compute average for reference line
  const avgDays =
    Math.round(
      (wipIssues.reduce((s, i) => s + i.daysInState, 0) / wipIssues.length) * 10
    ) / 10;

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        {wipIssues.length} items in progress. Average age: <strong>{avgDays}d</strong>.
        Items over {Math.round(avgDays * 2)}d may need attention.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-500">Issue</th>
              <th className="pb-2 text-left font-medium text-zinc-500">State</th>
              <th className="pb-2 text-left font-medium text-zinc-500">Assignee</th>
              <th className="pb-2 text-right font-medium text-zinc-500">Days</th>
            </tr>
          </thead>
          <tbody>
            {wipIssues.map((issue) => (
              <tr
                key={issue.identifier}
                className={cn(
                  "border-b border-zinc-100 dark:border-zinc-800",
                  issue.daysInState > avgDays * 2 && "bg-amber-50 dark:bg-amber-950/20"
                )}
              >
                <td className="py-2 text-zinc-700 dark:text-zinc-300">
                  <a
                    href={issue.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    <span className="font-mono text-xs text-zinc-400">
                      {issue.identifier}
                    </span>{" "}
                    {issue.title}
                  </a>
                </td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  <span className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: getColor(issue.state) }}
                    />
                    {issue.state}
                  </span>
                </td>
                <td className="py-2 text-zinc-600 dark:text-zinc-400">
                  {issue.assignee || "Unassigned"}
                </td>
                <td className="py-2 text-right font-mono text-zinc-700 dark:text-zinc-300">
                  {issue.daysInState}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Outliers Tab ────────────────────────────────── */

function OutliersTab({
  issues,
  stats,
}: {
  issues: TimeInStateIssue[];
  stats: TimeInStateStats[];
}) {
  const outliersByState = useMemo(() => {
    const p90Map = new Map(stats.map((s) => [s.state, s.p90Days]));
    const result: { state: string; threshold: number; issues: TimeInStateIssue[] }[] = [];

    for (const stat of stats) {
      const threshold = p90Map.get(stat.state) || 0;
      const stateOutliers = issues
        .filter((i) => i.state === stat.state && i.daysInState >= threshold)
        .sort((a, b) => b.daysInState - a.daysInState);
      if (stateOutliers.length > 0) {
        result.push({ state: stat.state, threshold, issues: stateOutliers });
      }
    }
    return result;
  }, [issues, stats]);

  if (outliersByState.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">No outliers detected</p>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Issues in the slowest 10% for their state. These are worth investigating.
      </p>
      {outliersByState.map((group) => (
        <div key={group.state}>
          <h4 className="mb-2 flex items-center gap-2 text-sm font-medium text-zinc-700 dark:text-zinc-300">
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: getColor(group.state) }}
            />
            {group.state}
            <span className="text-xs font-normal text-zinc-400">
              ({group.issues.length} issues, threshold: {group.threshold}d)
            </span>
          </h4>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <tbody>
                {group.issues.map((issue) => (
                  <tr
                    key={issue.identifier}
                    className="border-b border-zinc-100 dark:border-zinc-800"
                  >
                    <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                      <a
                        href={issue.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="hover:underline"
                      >
                        <span className="font-mono text-xs text-zinc-400">
                          {issue.identifier}
                        </span>{" "}
                        {issue.title}
                      </a>
                    </td>
                    <td className="py-1.5 text-right text-zinc-600 dark:text-zinc-400">
                      {issue.assignee || "Unassigned"}
                    </td>
                    <td className="py-1.5 text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                      {issue.daysInState}d
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ────────────────────────────────── By Assignee Tab ────────────────────────────────── */

function AssigneeTab({
  issues,
  hiddenStates,
}: {
  issues: TimeInStateIssue[];
  hiddenStates: Set<string>;
}) {
  const { assignees, states, matrix } = useMemo(() => {
    const filtered = issues.filter((i) => !hiddenStates.has(i.state));
    const map = new Map<string, Map<string, { count: number; totalDays: number }>>();
    const stateSet = new Set<string>();

    for (const issue of filtered) {
      const name = issue.assignee || "Unassigned";
      stateSet.add(issue.state);
      if (!map.has(name)) map.set(name, new Map());
      const assigneeMap = map.get(name)!;
      const entry = assigneeMap.get(issue.state) || { count: 0, totalDays: 0 };
      entry.count += 1;
      entry.totalDays += issue.daysInState;
      assigneeMap.set(issue.state, entry);
    }

    const assignees = Array.from(map.keys()).sort();
    const states = Array.from(stateSet);
    return { assignees, states, matrix: map };
  }, [issues, hiddenStates]);

  if (assignees.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">No assignee data</p>
    );
  }

  // Find max mean days for color scaling
  let maxMean = 0;
  matrix.forEach((stateMap) =>
    stateMap.forEach((v) => {
      const mean = v.totalDays / v.count;
      if (mean > maxMean) maxMean = mean;
    })
  );

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Average days in state per assignee. Darker cells = longer time.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-500">Assignee</th>
              {states.map((s) => (
                <th key={s} className="pb-2 text-center font-medium text-zinc-500">
                  <span className="flex items-center justify-center gap-1">
                    <span
                      className="inline-block h-2 w-2 rounded-full"
                      style={{ backgroundColor: getColor(s) }}
                    />
                    {s}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {assignees.map((assignee) => (
              <tr
                key={assignee}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-2 font-medium text-zinc-700 dark:text-zinc-300">
                  {assignee}
                </td>
                {states.map((state) => {
                  const entry = matrix.get(assignee)?.get(state);
                  if (!entry) {
                    return (
                      <td key={state} className="py-2 text-center text-zinc-300 dark:text-zinc-600">
                        -
                      </td>
                    );
                  }
                  const mean = Math.round((entry.totalDays / entry.count) * 10) / 10;
                  const intensity = maxMean > 0 ? mean / maxMean : 0;
                  return (
                    <td
                      key={state}
                      className="py-2 text-center"
                      style={{
                        backgroundColor: `rgba(245, 158, 11, ${intensity * 0.3})`,
                      }}
                    >
                      <span className="font-mono text-xs font-medium text-zinc-700 dark:text-zinc-300">
                        {mean}d
                      </span>
                      <span className="block text-xs text-zinc-400">
                        ({entry.count})
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────────────────────────────── Flow Efficiency Tab ────────────────────────────────── */

function FlowTab({
  efficiency,
  issues,
  hiddenStates,
}: {
  efficiency: number;
  issues: TimeInStateIssue[];
  hiddenStates: Set<string>;
}) {
  const breakdown = useMemo(() => {
    const visible = issues.filter((i) => !hiddenStates.has(i.state));
    const active = visible.filter((i) => i.stateType === "started");
    const waiting = visible.filter(
      (i) => i.stateType === "unstarted" || i.stateType === "backlog"
    );
    const completed = visible.filter((i) => i.stateType === "completed");

    const activeDays = active.reduce((s, i) => s + i.daysInState, 0);
    const waitingDays = waiting.reduce((s, i) => s + i.daysInState, 0);
    const completedDays = completed.reduce((s, i) => s + i.daysInState, 0);
    const total = activeDays + waitingDays + completedDays;

    return { activeDays, waitingDays, completedDays, total };
  }, [issues, hiddenStates]);

  const qualityLabel =
    efficiency >= 40
      ? "Good"
      : efficiency >= 25
        ? "Typical"
        : efficiency >= 15
          ? "Low"
          : "Very Low";

  const qualityColor =
    efficiency >= 40
      ? "text-emerald-600"
      : efficiency >= 25
        ? "text-blue-600"
        : efficiency >= 15
          ? "text-amber-600"
          : "text-red-600";

  return (
    <div className="space-y-4">
      <p className="text-xs text-zinc-500">
        Flow efficiency measures what percentage of time is spent actively working
        vs. waiting. Higher is better — most teams are 15-40%.
      </p>

      {/* Big number */}
      <div className="flex items-baseline gap-3">
        <span className={cn("text-4xl font-bold", qualityColor)}>
          {efficiency}%
        </span>
        <span className={cn("text-sm font-medium", qualityColor)}>
          {qualityLabel}
        </span>
      </div>

      {/* Bar breakdown */}
      {breakdown.total > 0 && (
        <div>
          <div className="mb-1 flex h-4 overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
            {breakdown.activeDays > 0 && (
              <div
                className="bg-amber-400"
                style={{
                  width: `${(breakdown.activeDays / breakdown.total) * 100}%`,
                }}
                title={`Active: ${breakdown.activeDays}d`}
              />
            )}
            {breakdown.waitingDays > 0 && (
              <div
                className="bg-zinc-300 dark:bg-zinc-600"
                style={{
                  width: `${(breakdown.waitingDays / breakdown.total) * 100}%`,
                }}
                title={`Waiting: ${breakdown.waitingDays}d`}
              />
            )}
            {breakdown.completedDays > 0 && (
              <div
                className="bg-emerald-400"
                style={{
                  width: `${(breakdown.completedDays / breakdown.total) * 100}%`,
                }}
                title={`Completed: ${breakdown.completedDays}d`}
              />
            )}
          </div>
          <div className="flex gap-4 text-xs text-zinc-500">
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-400" />
              Active ({breakdown.activeDays}d)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-zinc-300 dark:bg-zinc-600" />
              Waiting ({breakdown.waitingDays}d)
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-400" />
              Done ({breakdown.completedDays}d)
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────────── Trends Tab ────────────────────────────────── */

function TrendsTab({ data }: { data: TimeInStateData }) {
  if (data.leadTimeTrend.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-zinc-500">
        Not enough completed issues to show trends
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-zinc-500">
        Average lead time (created to completed) for issues finished each week.
        Lower is better.
      </p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
          <LineChart data={data.leadTimeTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis dataKey="week" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
            <YAxis
              tick={{ fontSize: 12 }}
              stroke="#a1a1aa"
              label={{
                value: "Days",
                angle: -90,
                position: "insideLeft",
                style: { fontSize: 12, fill: "#a1a1aa" },
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`${value}d`]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="avgDays"
              name="Avg lead time (days)"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-700">
              <th className="pb-2 text-left font-medium text-zinc-500">Week</th>
              <th className="pb-2 text-right font-medium text-zinc-500">
                Issues completed
              </th>
              <th className="pb-2 text-right font-medium text-zinc-500">
                Avg lead time
              </th>
            </tr>
          </thead>
          <tbody>
            {data.leadTimeTrend.map((row) => (
              <tr
                key={row.sortKey}
                className="border-b border-zinc-100 dark:border-zinc-800"
              >
                <td className="py-2 text-zinc-700 dark:text-zinc-300">
                  {row.week}
                </td>
                <td className="py-2 text-right text-zinc-600 dark:text-zinc-400">
                  {row.count}
                </td>
                <td className="py-2 text-right font-mono font-medium text-zinc-700 dark:text-zinc-300">
                  {row.avgDays}d
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
