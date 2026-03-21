"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { DORADataPoint } from "@/types/dora";
import { Card } from "@/components/ui/Card";

export function DeploymentFrequencyChart({
  data,
}: {
  data: DORADataPoint[];
}) {
  if (data.length === 0) return null;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Deployment Frequency
      </h3>
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <BarChart data={data}>
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            stroke="#a1a1aa"
          />
          <YAxis
            allowDecimals={false}
            tick={{ fontSize: 11 }}
            stroke="#a1a1aa"
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: "8px",
              fontSize: 12,
            }}
            itemStyle={{ color: "#fafafa" }}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Legend wrapperStyle={{ fontSize: 11 }} />
          <Bar
            dataKey="successCount"
            name="Successful"
            stackId="a"
            fill="#22c55e"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="failureCount"
            name="Failed"
            stackId="a"
            fill="#ef4444"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
