"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { CycleTimeDataPoint } from "@/types/github";

export function CycleTimeChart({ data }: { data: CycleTimeDataPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No cycle time data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="week"
            tick={{ fontSize: 12 }}
            stroke="#a1a1aa"
          />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#a1a1aa"
            label={{
              value: "Hours",
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
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Line
            type="monotone"
            dataKey="avgHoursToMerge"
            name="Avg hours to merge"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
          <Line
            type="monotone"
            dataKey="avgHoursToFirstReview"
            name="Avg hours to first review"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
