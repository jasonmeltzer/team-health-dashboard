"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ReviewBottleneck } from "@/types/github";

export function ReviewBottlenecks({ data }: { data: ReviewBottleneck[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No review bottlenecks detected
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data} layout="vertical">
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
          />
          <Bar
            dataKey="pendingReviews"
            name="Pending reviews"
            fill="#f59e0b"
            radius={[0, 4, 4, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
