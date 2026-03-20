"use client";

import { useState } from "react";
import { RefreshButton } from "./RefreshButton";
import { SettingsModal } from "./SettingsModal";
import { HealthSummaryCard } from "./HealthSummaryCard";
import { WeeklyNarrativeCard } from "./WeeklyNarrativeCard";
import { GitHubSection } from "@/components/github/GitHubSection";
import { LinearSection } from "@/components/linear/LinearSection";
import { SlackSection } from "@/components/slack/SlackSection";

export function DashboardShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            title="Settings"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path
                d="M8.325 2.317a1.5 1.5 0 0 1 3.35 0l.083.543a1 1 0 0 0 1.404.712l.49-.233a1.5 1.5 0 0 1 1.676 2.388l-.408.31a1 1 0 0 0 0 1.583l.408.31a1.5 1.5 0 0 1-1.675 2.388l-.49-.233a1 1 0 0 0-1.405.712l-.083.543a1.5 1.5 0 0 1-3.35 0l-.083-.543a1 1 0 0 0-1.404-.712l-.49.233a1.5 1.5 0 0 1-1.676-2.388l.408-.31a1 1 0 0 0 0-1.583l-.408-.31A1.5 1.5 0 0 1 6.348 3.34l.49.233a1 1 0 0 0 1.404-.712l.083-.543Z"
                stroke="currentColor"
                strokeWidth="1.5"
              />
              <circle cx="10" cy="7.92" r="2" stroke="currentColor" strokeWidth="1.5" />
            </svg>
          </button>
          <RefreshButton onClick={() => setRefreshKey((k) => k + 1)} />
        </div>
      </div>

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        onSaved={() => setRefreshKey((k) => k + 1)}
      />

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
