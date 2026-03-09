"use client";

import { useState } from "react";
import { RefreshButton } from "./RefreshButton";
import { HealthSummaryCard } from "./HealthSummaryCard";
import { WeeklyNarrativeCard } from "./WeeklyNarrativeCard";
import { GitHubSection } from "@/components/github/GitHubSection";
import { LinearSection } from "@/components/linear/LinearSection";
import { SlackSection } from "@/components/slack/SlackSection";

export function DashboardShell() {
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
            Team Health Dashboard
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            AI-powered engineering team insights
          </p>
        </div>
        <RefreshButton onClick={() => setRefreshKey((k) => k + 1)} />
      </div>

      {/* AI Summary */}
      <HealthSummaryCard refreshKey={refreshKey} />

      {/* Data Sections */}
      <GitHubSection refreshKey={refreshKey} />
      <LinearSection refreshKey={refreshKey} />
      <SlackSection refreshKey={refreshKey} />

      {/* Weekly Narrative */}
      <WeeklyNarrativeCard refreshKey={refreshKey} />
    </div>
  );
}
