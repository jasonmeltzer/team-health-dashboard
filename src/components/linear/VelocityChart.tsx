"use client";

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
import type { VelocityDataPoint } from "@/types/linear";

export function VelocityChart({ data }: { data: VelocityDataPoint[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No velocity data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="cycleName"
            tick={{ fontSize: 12 }}
            stroke="#a1a1aa"
          />
          <YAxis tick={{ fontSize: 12 }} stroke="#a1a1aa" />
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
            dataKey="completedPoints"
            name="Points completed"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
          />
          <Bar
            dataKey="completedIssues"
            name="Issues completed"
            fill="#6366f1"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
