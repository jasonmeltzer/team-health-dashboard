"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from "recharts";
import type { DORADataPoint } from "@/types/dora";
import { Card } from "@/components/ui/Card";

export type DeployFilter = { period: string; status: "success" | "failure" } | null;

export function DeploymentFrequencyChart({
  data,
  filter,
  onBarClick,
}: {
  data: DORADataPoint[];
  filter?: DeployFilter;
  onBarClick?: (filter: DeployFilter) => void;
}) {
  if (data.length === 0) return null;

  const handleClick = (dataKey: "successCount" | "failureCount") => {
    return (entry: DORADataPoint) => {
      if (!onBarClick) return;
      const status = dataKey === "successCount" ? "success" : "failure";
      // Toggle off if clicking the same filter
      if (filter && filter.period === entry.period && filter.status === status) {
        onBarClick(null);
      } else {
        onBarClick({ period: entry.period, status });
      }
    };
  };

  const isActive = (period: string, status: "success" | "failure") =>
    !filter || (filter.period === period && filter.status === status);

  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">
          Deployment Frequency
        </h3>
        {filter && (
          <button
            onClick={() => onBarClick?.(null)}
            className="text-xs font-medium text-blue-500 hover:text-blue-400"
          >
            Clear filter
          </button>
        )}
      </div>
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <BarChart data={data} className={onBarClick ? "cursor-pointer" : ""}>
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
            cursor={false}
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
            onClick={(entry) => handleClick("successCount")(entry as unknown as DORADataPoint)}
            activeBar={{ stroke: "#fff", strokeWidth: 2 }}
          >
            {data.map((d) => (
              <Cell
                key={d.period + "-s"}
                fillOpacity={isActive(d.period, "success") ? 1 : 0.25}
                className="cursor-pointer"
              />
            ))}
          </Bar>
          <Bar
            dataKey="otherCount"
            name="Pending"
            stackId="a"
            fill="#a1a1aa"
            radius={[0, 0, 0, 0]}
          />
          <Bar
            dataKey="failureCount"
            name="Failed"
            stackId="a"
            fill="#ef4444"
            radius={[4, 4, 0, 0]}
            onClick={(entry) => handleClick("failureCount")(entry as unknown as DORADataPoint)}
            activeBar={{ stroke: "#fff", strokeWidth: 2 }}
          >
            {data.map((d) => (
              <Cell
                key={d.period + "-f"}
                fillOpacity={isActive(d.period, "failure") ? 1 : 0.25}
                className="cursor-pointer"
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}
