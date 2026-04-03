"use client";

import { useState } from "react";

interface SetupBannerProps {
  unconfigured: string[]; // e.g. ["GitHub", "Slack"]
  onConnect: () => void; // opens Settings on first unconfigured section
}

function buildBannerText(unconfigured: string[]): string {
  if (unconfigured.length === 1) {
    return `${unconfigured[0]} is not yet connected.`;
  }
  if (unconfigured.length === 2) {
    return `${unconfigured[0]} and ${unconfigured[1]} are not yet connected.`;
  }
  // 3 or more — list all with Oxford-style "and" before last
  const allButLast = unconfigured.slice(0, -1).join(", ");
  const last = unconfigured[unconfigured.length - 1];
  return `${allButLast}, and ${last} are not yet connected.`;
}

export function SetupBanner({ unconfigured, onConnect }: SetupBannerProps) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("setupBannerDismissed") === "true";
    } catch {
      return false;
    }
  });

  if (dismissed || unconfigured.length === 0) return null;

  const handleDismiss = () => {
    try {
      localStorage.setItem("setupBannerDismissed", "true");
    } catch {
      // ignore storage errors
    }
    setDismissed(true);
  };

  return (
    <div role="status" aria-live="polite" className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-800 dark:bg-amber-950/30">
      <div className="flex items-center justify-between gap-4">
        <p className="text-sm font-normal text-amber-700 dark:text-amber-400">
          {buildBannerText(unconfigured)}{" "}
          <button
            onClick={onConnect}
            className="text-sm font-semibold text-amber-700 hover:underline cursor-pointer dark:text-amber-400"
          >
            Connect now →
          </button>
        </p>
        <button
          onClick={handleDismiss}
          aria-label="Dismiss setup banner"
          className="shrink-0 text-amber-600 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-200"
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M12 4L4 12M4 4l8 8"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
