"use client";

import type { OAuthProvider } from "@/lib/oauth-client";

interface ConnectErrorAlertProps {
  provider: OAuthProvider;
  missingVars: string[];
  onOpenSetup: () => void;
  onClose: () => void;
}

const PROVIDER_LABELS: Record<OAuthProvider, string> = {
  github: "GitHub",
  linear: "Linear",
  slack: "Slack",
};

export default function ConnectErrorAlert({
  provider,
  missingVars,
  onOpenSetup,
  onClose,
}: ConnectErrorAlertProps) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
            {PROVIDER_LABELS[provider]} OAuth setup is incomplete.
          </p>
          <p className="text-xs font-normal text-amber-700 dark:text-amber-400">
            Set these environment variables in <code className="rounded bg-amber-100 px-1 py-0.5 font-mono text-[11px] dark:bg-amber-900/40">.env.local</code> and restart the dev server:
          </p>
          <ul className="ml-4 list-disc space-y-0.5 text-xs font-mono text-amber-900 dark:text-amber-200">
            {missingVars.map((v) => (
              <li key={v}>{v}</li>
            ))}
          </ul>
          <button
            type="button"
            onClick={onOpenSetup}
            className="text-xs font-normal text-amber-900 underline cursor-pointer dark:text-amber-300"
          >
            Set up OAuth
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Dismiss"
          className="shrink-0 rounded-md p-1 text-amber-700 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-400 dark:hover:bg-amber-900/40 dark:hover:text-amber-200"
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none">
            <path d="M15 5L5 15M5 5l10 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

export { ConnectErrorAlert };
