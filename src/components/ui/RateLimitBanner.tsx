"use client";

import { formatRelativeTime } from "@/lib/utils";

export function RateLimitBanner({
  source,
  fetchedAt,
  rateLimitReset,
}: {
  source: string;
  fetchedAt: string | null;
  rateLimitReset: string | null;
}) {
  const ageText = fetchedAt ? formatRelativeTime(fetchedAt) : "unknown time";
  return (
    <div role="status" aria-live="polite" className="rounded-md bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:border-amber-800 dark:text-amber-400">
      {source} data is {ageText} old (rate limited)
      {rateLimitReset && (
        <span> — refreshes at {new Date(rateLimitReset).toLocaleTimeString()}</span>
      )}
    </div>
  );
}

export function RevalidatingBanner({ source }: { source: string }) {
  return (
    <div role="status" aria-live="polite" className="rounded-md bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 dark:bg-blue-950/30 dark:border-blue-800 dark:text-blue-400">
      {source} data is refreshing in background...
    </div>
  );
}
