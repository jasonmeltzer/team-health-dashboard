import type { StalledIssue } from "@/types/linear";

export function StalledIssuesList({ data }: { data: StalledIssue[] }) {
  if (data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No stalled issues found
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((issue) => (
        <div
          key={issue.id}
          className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <a
                href={issue.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-blue-600 hover:underline dark:text-blue-400"
              >
                {issue.identifier}
              </a>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                {issue.state}
              </span>
            </div>
            <p className="truncate text-sm text-zinc-700 dark:text-zinc-300">
              {issue.title}
            </p>
            {issue.assignee && (
              <p className="text-xs text-zinc-500">{issue.assignee}</p>
            )}
          </div>
          <span className="ml-3 whitespace-nowrap text-sm font-medium text-amber-600 dark:text-amber-400">
            {issue.daysSinceLastUpdate}d stalled
          </span>
        </div>
      ))}
    </div>
  );
}
