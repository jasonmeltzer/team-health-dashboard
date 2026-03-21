"use client";

import { formatRelativeTime } from "@/lib/utils";

export function RateLimitState({
  resetAt,
  onRetry,
}: {
  resetAt?: string | null;
  onRetry?: () => void;
}) {
  const resetLabel = resetAt ? formatRelativeTime(resetAt) : null;
  // formatRelativeTime returns "Xm ago" for past times — for future times we need different text
  const resetFuture = resetAt ? new Date(resetAt).getTime() > Date.now() : false;
  const minsLeft = resetAt
    ? Math.max(1, Math.ceil((new Date(resetAt).getTime() - Date.now()) / 60000))
    : null;

  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8 text-center">
      <div className="rounded-full bg-amber-100 p-3 dark:bg-amber-900/30">
        <svg
          className="h-6 w-6 text-amber-600 dark:text-amber-400"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        </svg>
      </div>
      <div>
        <p className="text-sm font-medium text-amber-600 dark:text-amber-400">
          GitHub API rate limit exceeded
        </p>
        <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
          {resetFuture && minsLeft
            ? `Resets in ~${minsLeft} minute${minsLeft === 1 ? "" : "s"}`
            : resetLabel
              ? `Reset ${resetLabel}`
              : "Try again later"}
        </p>
      </div>
      {onRetry && (
        <button
          onClick={onRetry}
          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Retry
        </button>
      )}
    </div>
  );
}
