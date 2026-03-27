"use client";

import { useState, useRef, useEffect } from "react";
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
  // Suppress tooltip briefly after clicking so it doesn't stick
  const [suppressTooltip, setSuppressTooltip] = useState(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup suppress timer on unmount
  useEffect(() => {
    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
    };
  }, []);

  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No velocity data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height={256} minWidth={0}>
        <BarChart
          data={data}
          className={onBarClick ? "cursor-pointer" : ""}
          onClick={onBarClick ? (state) => {
            if (state?.activeLabel) {
              onBarClick(String(state.activeLabel));
              setSuppressTooltip(true);
              if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
              suppressTimerRef.current = setTimeout(() => setSuppressTooltip(false), 300);
            }
          } : undefined}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="cycleName"
            tick={{ fontSize: 12 }}
            stroke="#a1a1aa"
          />
          <YAxis tick={{ fontSize: 12 }} stroke="#a1a1aa" />
          <Tooltip
            cursor={false}
            active={suppressTooltip ? false : undefined}
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
