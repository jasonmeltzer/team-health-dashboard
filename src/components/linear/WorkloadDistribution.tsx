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
import type { WorkloadEntry } from "@/types/linear";

export function WorkloadDistribution({ data }: { data: WorkloadEntry[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No workload data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical">
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis type="number" tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <YAxis
            dataKey="assignee"
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
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="inProgress"
            name="In Progress"
            fill="#f59e0b"
            stackId="a"
          />
          <Bar dataKey="todo" name="To Do" fill="#94a3b8" stackId="a" />
          <Bar
            dataKey="completed"
            name="Completed"
            fill="#10b981"
            stackId="a"
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
