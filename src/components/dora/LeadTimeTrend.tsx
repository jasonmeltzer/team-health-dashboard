"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { DORADataPoint } from "@/types/dora";
import { Card } from "@/components/ui/Card";

export function LeadTimeTrend({ data }: { data: DORADataPoint[] }) {
  const hasLeadTime = data.some((d) => d.avgLeadTimeHours != null);
  if (!hasLeadTime) return null;

  return (
    <Card>
      <h3 className="mb-3 text-sm font-semibold text-zinc-700 dark:text-zinc-300">
        Lead Time Trend
      </h3>
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <LineChart data={data}>
          <XAxis
            dataKey="period"
            tick={{ fontSize: 11 }}
            stroke="#a1a1aa"
          />
          <YAxis
            label={{
              value: "Hours",
              angle: -90,
              position: "insideLeft",
              style: { fontSize: 11, fill: "#a1a1aa" },
            }}
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
            formatter={(value) => [
              `${Math.round(Number(value))}h`,
              "Avg Lead Time",
            ]}
          />
          <Line
            type="monotone"
            dataKey="avgLeadTimeHours"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </Card>
  );
}
