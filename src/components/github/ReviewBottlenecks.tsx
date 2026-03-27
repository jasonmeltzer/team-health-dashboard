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
import type { ReviewBottleneck } from "@/types/github";

export function ReviewBottlenecks({ data }: { data: ReviewBottleneck[] }) {
  const [expandedReviewer, setExpandedReviewer] = useState<string | null>(null);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No review bottlenecks detected
      </p>
    );
  }

  const chartHeight = Math.max(200, data.length * 45);

  return (
    <div className="space-y-3">
      <div
        style={{ height: chartHeight }}
        role="img"
        aria-label="Review bottlenecks bar chart. Use the table below to explore reviewer details."
      >
        <ResponsiveContainer width="100%" height={chartHeight} minWidth={0}>
          <BarChart
            data={data}
            layout="vertical"
            onClick={(state) => {
              if (state?.activeLabel != null) {
                const label = String(state.activeLabel);
                setExpandedReviewer((prev) => (prev === label ? null : label));
              }
            }}
            style={{ cursor: "pointer" }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
            <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
            <YAxis
              dataKey="reviewer"
              type="category"
              tick={{ fontSize: 12 }}
              stroke="#a1a1aa"
              width={100}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "#fff",
                border: "1px solid #e4e4e7",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(value) => [`${value} PRs`]}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <Bar
              dataKey="pendingReviews"
              name="Pending"
              fill="#f59e0b"
              stackId="a"
              radius={[0, 0, 0, 0]}
            />
            <Bar
              dataKey="completedReviews"
              name="Reviewed"
              fill="#10b981"
              stackId="a"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Avg review time summary */}
      {data.some((d) => d.avgReviewTimeHours > 0) && (
        <div className="flex flex-wrap gap-3 text-xs text-zinc-500">
          {data
            .filter((d) => d.avgReviewTimeHours > 0)
            .map((d) => (
              <span key={d.reviewer}>
                {d.reviewer}:{" "}
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {d.avgReviewTimeHours < 24
                    ? `${d.avgReviewTimeHours}h`
                    : `${Math.round(d.avgReviewTimeHours / 24 * 10) / 10}d`}
                </span>{" "}
                avg wait
              </span>
            ))}
        </div>
      )}

      {/* Expanded PR list */}
      {expandedReviewer && (
        <ExpandedPRs
          reviewer={expandedReviewer}
          data={data.find((d) => d.reviewer === expandedReviewer)}
          onClose={() => setExpandedReviewer(null)}
        />
      )}

      <p className="text-xs text-zinc-400">
        Click a bar to see the PRs assigned to that reviewer.
      </p>
    </div>
  );
}

function ExpandedPRs({
  reviewer,
  data,
  onClose,
}: {
  reviewer: string;
  data: ReviewBottleneck | undefined;
  onClose: () => void;
}) {
  if (!data || data.pendingPRs.length === 0) {
    return (
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
            {reviewer}
          </span>
          <button
            onClick={onClose}
            className="text-xs text-zinc-400 hover:text-zinc-600"
          >
            close
          </button>
        </div>
        <p className="mt-1 text-xs text-zinc-500">
          No pending PRs — {data?.completedReviews || 0} reviews completed recently.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/50">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          {reviewer}{" "}
          <span className="font-normal text-zinc-400">
            — {data.pendingPRs.length} pending, {data.completedReviews} reviewed
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
          {data.pendingPRs.map((pr) => (
            <tr
              key={pr.number}
              className="border-b border-zinc-100 last:border-0 dark:border-zinc-700"
            >
              <td className="py-1.5 text-zinc-700 dark:text-zinc-300">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:underline"
                >
                  <span className="font-mono text-xs text-zinc-400">
                    #{pr.number}
                  </span>{" "}
                  {pr.title}
                </a>
              </td>
              <td className="py-1.5 text-right text-xs text-zinc-500">
                by {pr.author}
              </td>
              <td className="py-1.5 text-right font-mono text-xs font-medium text-amber-600 dark:text-amber-400">
                {pr.hoursWaiting < 24
                  ? `${Math.round(pr.hoursWaiting)}h`
                  : `${Math.round(pr.hoursWaiting / 24)}d`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
