"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ResponseTimeDataPoint } from "@/types/slack";

export function ResponseTimeChart({ data }: { data: ResponseTimeDataPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No response time data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis dataKey="day" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <YAxis
            tick={{ fontSize: 12 }}
            stroke="#a1a1aa"
            label={{
              value: "Minutes",
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
          <Line
            type="monotone"
            dataKey="avgResponseMinutes"
            name="Avg response (min)"
            stroke="#06b6d4"
            strokeWidth={2}
            dot={{ r: 3 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
