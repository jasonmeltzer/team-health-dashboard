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
import type { ChannelActivity } from "@/types/slack";

export function ChannelActivityChart({ data }: { data: ChannelActivity[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-zinc-500">
        No channel activity data available
      </p>
    );
  }

  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
          <XAxis
            dataKey="channelName"
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
          <Bar
            dataKey="messagesLast7Days"
            name="Messages (7 days)"
            fill="#06b6d4"
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
