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
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No workload data available
      </p>
    );
  }

  // Shorten names: take first name + last initial, strip email domains
  const chartData = data.map((d) => ({
    ...d,
    assignee: shortenName(d.assignee),
  }));

  const chartHeight = Math.max(250, chartData.length * 40);

  return (
    <div style={{ height: chartHeight }}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={chartData} layout="vertical">
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
