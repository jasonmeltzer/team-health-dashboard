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
  Cell,
} from "recharts";
import type { VelocityDataPoint } from "@/types/linear";

export function VelocityChart({
  data,
  selectedCycle,
  onBarClick,
}: {
  data: VelocityDataPoint[];
  selectedCycle?: string;
  onBarClick?: (cycleName: string) => void;
}) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No velocity data available
      </p>
    );
  }

  const handleClick = (entry: VelocityDataPoint) => {
    onBarClick?.(entry.cycleName);
  };

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <BarChart data={data} className={onBarClick ? "cursor-pointer" : ""}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="cycleName"
            tick={{ fontSize: 12 }}
            stroke="#a1a1aa"
          />
          <YAxis tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <Tooltip
            cursor={false}
            trigger={onBarClick ? "click" : "hover"}
            contentStyle={{
              backgroundColor: "#18181b",
              border: "1px solid #3f3f46",
              borderRadius: 8,
              fontSize: 12,
            }}
            itemStyle={{ color: "#fafafa" }}
            labelStyle={{ color: "#a1a1aa" }}
          />
          <Legend wrapperStyle={{ fontSize: 12 }} />
          <Bar
            dataKey="completedPoints"
            name="Points completed"
            fill="#10b981"
            radius={[4, 4, 0, 0]}
            onClick={(entry) => handleClick(entry as unknown as VelocityDataPoint)}
            activeBar={false}
          >
            {selectedCycle && data.map((d) => (
              <Cell
                key={d.cycleName + "-pts"}
                fillOpacity={d.cycleName === selectedCycle ? 1 : 0.3}
              />
            ))}
          </Bar>
          <Bar
            dataKey="completedIssues"
            name="Issues completed"
            fill="#6366f1"
            radius={[4, 4, 0, 0]}
            onClick={(entry) => handleClick(entry as unknown as VelocityDataPoint)}
            activeBar={false}
          >
            {selectedCycle && data.map((d) => (
              <Cell
                key={d.cycleName + "-iss"}
                fillOpacity={d.cycleName === selectedCycle ? 1 : 0.3}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
