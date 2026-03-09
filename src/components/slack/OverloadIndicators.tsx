import { Badge } from "@/components/ui/Badge";
import type { OverloadIndicator } from "@/types/slack";

export function OverloadIndicators({ data }: { data: OverloadIndicator[] }) {
  if (data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No activity data available
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((person) => (
        <div
          key={person.userId}
          className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 dark:border-zinc-800"
        >
          <div>
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
                {person.userName}
              </span>
              {person.isOverloaded && (
                <Badge variant="critical">Overloaded</Badge>
              )}
            </div>
            <p className="text-xs text-zinc-500">
              {person.channelsActive} channels
            </p>
          </div>
          <div className="text-right">
            <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
              {person.messagesSent} msgs
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
