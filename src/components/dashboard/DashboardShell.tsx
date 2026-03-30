"use client";

import { useState, useCallback, useRef } from "react";
import { RefreshButton } from "./RefreshButton";
import { SettingsModal } from "./SettingsModal";
import { clearClientCache } from "@/hooks/useApiData";
import { useConfigStatus } from "@/hooks/useConfigStatus";
import { HealthSummaryCard } from "./HealthSummaryCard";
import { WelcomeHero } from "./WelcomeHero";
import { SetupBanner } from "./SetupBanner";
import { WeeklyNarrativeCard } from "./WeeklyNarrativeCard";
import { GitHubSection } from "@/components/github/GitHubSection";
import { LinearSection } from "@/components/linear/LinearSection";
import { SlackSection } from "@/components/slack/SlackSection";
import { DORASection } from "@/components/dora/DORASection";
import { useTheme } from "@/components/ThemeProvider";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import type { ScoreDeduction } from "@/types/metrics";

export function DashboardShell() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsInitialSection, setSettingsInitialSection] = useState<
    "github" | "linear" | "slack" | "dora" | "ai" | "cache" | "scoring"
  >("github");
  const [lastDeductions, setLastDeductions] = useState<ScoreDeduction[] | null>(null);
  const { theme, toggleTheme } = useTheme();
  const [poorChoice, setPoorChoice] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status: configStatus, allUnconfigured, unconfiguredList, refetch: refetchConfig } = useConfigStatus(refreshKey);

  const handleThemeToggle = useCallback(() => {
    if (theme === "dark") {
      setPoorChoice(true);
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        toggleTheme();
        setPoorChoice(false);
      }, 2500);
    } else {
      toggleTheme();
    }
  }, [theme, toggleTheme]);

  const handleConnect = useCallback((section: "github" | "linear" | "slack" | "ai") => {
    setSettingsInitialSection(section);
    setSettingsOpen(true);
  }, []);

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-100">
            Team Health Dashboard
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            AI-powered engineering team insights
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
          <button
            suppressHydrationWarning
            onClick={handleThemeToggle}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-normal text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          >
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" />
                <line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" />
                <line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
            {theme === "dark" ? "Dark Mode" : "Incorrect Mode"}
          </button>
          {poorChoice && (
            <p className="absolute right-0 top-full mt-1 whitespace-nowrap text-xs font-semibold text-red-500">
              You have chosen... poorly.
            </p>
          )}
          </div>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
            aria-label="Settings"
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
        onSaved={() => {
          clearClientCache();
          setRefreshKey((k) => k + 1);
          refetchConfig();
        }}
        initialSection={settingsInitialSection}
        deductions={lastDeductions}
      />

      {/* Onboarding: Welcome hero when nothing configured, banner when partially configured */}
      {configStatus === null ? (
        /* Loading skeleton — same as HealthSummaryCard loading state */
        <Card className="col-span-full">
          <div className="flex items-center gap-4">
            <Skeleton className="h-16 w-16 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-4 w-96" />
              <Skeleton className="h-4 w-72" />
            </div>
          </div>
        </Card>
      ) : allUnconfigured ? (
        <WelcomeHero status={configStatus} onConnect={handleConnect} />
      ) : (
        <>
          <SetupBanner
            unconfigured={unconfiguredList}
            onConnect={() => {
              setSettingsInitialSection("github");
              setSettingsOpen(true);
            }}
          />
          <HealthSummaryCard refreshKey={refreshKey} onDeductionsLoaded={setLastDeductions} />
        </>
      )}

      {/* Data Sections */}
      <GitHubSection refreshKey={refreshKey} />
      <LinearSection refreshKey={refreshKey} />
      <DORASection refreshKey={refreshKey} />
      <SlackSection refreshKey={refreshKey} />

      {/* Weekly Narrative */}
      <WeeklyNarrativeCard refreshKey={refreshKey} />
    </div>
  );
}
