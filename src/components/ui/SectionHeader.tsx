import { formatRelativeTime } from "@/lib/utils";

export function SectionHeader({
  title,
  icon,
  action,
  timestamp,
}: {
  title: string;
  icon: React.ReactNode;
  action?: React.ReactNode;
  timestamp?: string | null;
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
          </span>
        )}
      </div>
      {action}
    </div>
  );
}
