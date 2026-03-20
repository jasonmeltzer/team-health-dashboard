"use client";

import { useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { WorkloadEntry } from "@/types/linear";

function shortenName(name: string): string {
  // Strip email domain
  const clean = name.includes("@") ? name.split("@")[0] : name;
  // If it looks like an email prefix (has dots), convert to name
  const parts = clean.includes(".")
    ? clean.split(".")
    : clean.split(/\s+/);
  if (parts.length >= 2) {
    const first = parts[0].charAt(0).toUpperCase() + parts[0].slice(1);
    const last = parts[parts.length - 1].charAt(0).toUpperCase() + ".";
    return `${first} ${last}`;
  }
  return clean.charAt(0).toUpperCase() + clean.slice(1);
}

export function WorkloadDistribution({ data }: { data: WorkloadEntry[] }) {
  const [expandedAssignee, setExpandedAssignee] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No workload data available
      </p>
    );
  }

  // Build a map from shortened name back to original for lookup
  const shortToFull = new Map<string, string>();
  data.forEach((d) => shortToFull.set(shortenName(d.assignee), d.assignee));

  const chartData = data.map((d) => ({
    ...d,
    assignee: shortenName(d.assignee),
  }));

  const hasCompleted = data.some((d) => d.completed > 0);
  const chartHeight = Math.max(250, chartData.length * 40);

  const expandedData = expandedAssignee
    ? data.find((d) => d.assignee === expandedAssignee)
    : null;

  return (
    <div className="space-y-3">
      <div style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
          <BarChart
            data={chartData}
            layout="vertical"
            onClick={(state) => {
              if (state?.activeLabel != null) {
                const shortName = String(state.activeLabel);
                const fullName = shortToFull.get(shortName) || shortName;
                setExpandedAssignee((prev) =>
                  prev === fullName ? null : fullName
                );
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
            <YAxis
              dataKey="assignee"
              type="category"
              tick={{ fontSize: 12 }}
              stroke="#a1a1aa"
              width={120}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="inProgress"
              name="In Progress"
              fill="#f59e0b"
              stackId="a"
            />
            <Bar dataKey="todo" name="To Do" fill="#94a3b8" stackId="a" />
            {hasCompleted && (
              <Bar
                dataKey="completed"
                name="Completed"
                fill="#10b981"
                stackId="a"
              />
            )}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {expandedAssignee && expandedData && (
        <ExpandedIssues
          assignee={expandedAssignee}
          data={expandedData}
          onClose={() => setExpandedAssignee(null)}
        />
      )}

      <p className="text-xs text-zinc-400">
        Click a bar to see assigned issues.
      </p>
    </div>
  );
}

const stateOrder: Record<string, number> = {
  started: 0,
  unstarted: 1,
  completed: 2,
};

function ExpandedIssues({
  assignee,
  data,
  onClose,
}: {
  assignee: string;
  data: WorkloadEntry;
  onClose: () => void;
}) {
  const sorted = [...data.issues].sort(
    (a, b) => (stateOrder[a.stateType] ?? 3) - (stateOrder[b.stateType] ?? 3)
  );

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {assignee}{" "}
          <span className="font-normal text-zinc-400">
            — {data.inProgress} in progress, {data.todo} to do
            {data.completed > 0 ? `, ${data.completed} completed` : ""}
            {data.totalPoints > 0 ? ` · ${data.totalPoints} pts` : ""}
          </span>
        </span>
        <button
          onClick={onClose}
          className="text-xs text-zinc-400 hover:text-zinc-600"
        >
          close
        </button>
      </div>
      <table className="w-full text-sm">
        <tbody>
          {sorted.map((issue) => (
            <tr
              key={issue.identifier}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-700"
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
              <td className="py-1.5 text-right text-xs whitespace-nowrap">
                <span
                  className={
                    issue.stateType === "started"
                      ? "text-amber-600 dark:text-amber-400"
                      : issue.stateType === "completed"
                        ? "text-emerald-600 dark:text-emerald-400"
                        : "text-zinc-400"
                  }
                >
                  {issue.state}
                </span>
              </td>
              {data.totalPoints > 0 && (
                <td className="py-1.5 pl-3 text-right font-mono text-xs text-zinc-400">
                  {issue.estimate ? `${issue.estimate} pts` : "—"}
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
