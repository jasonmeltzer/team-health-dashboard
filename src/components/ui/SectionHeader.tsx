import { cn, formatRelativeTime } from "@/lib/utils";

export function SectionHeader({
  title,
  icon,
  action,
  timestamp,
  cached,
  onRefresh,
  refreshing,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  timestamp?: string | null;
  cached?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  return (
    <div className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
        <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
          {title}
        </h2>
        {timestamp && (
          <span className="text-xs text-zinc-400 dark:text-zinc-500">
            Updated {formatRelativeTime(timestamp)}
            {cached && (
              <span className="ml-1 text-amber-500 dark:text-amber-400">(cached)</span>
            )}
          </span>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            className="rounded p-0.5 text-zinc-400 transition-colors hover:text-zinc-600 disabled:opacity-50 dark:hover:text-zinc-300"
            title="Refresh section"
          >
            <svg
              className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182M20.984 4.356v4.993"
              />
            </svg>
          </button>
        )}
      </div>
      {action}
    </div>
  );
}
