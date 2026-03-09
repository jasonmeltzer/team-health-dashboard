import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  trend,
  trendLabel,
}: {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "flat";
  trendLabel?: string;
}) {
  return (
    <Card className="flex flex-col gap-1">
      <p className="text-sm text-zinc-500 dark:text-zinc-400">{label}</p>
      <p className="text-2xl font-bold text-zinc-900 dark:text-zinc-100">
        {value}
      </p>
      {trend && (
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "text-sm font-medium",
              trend === "up" && "text-red-600 dark:text-red-400",
              trend === "down" && "text-emerald-600 dark:text-emerald-400",
              trend === "flat" && "text-zinc-500"
            )}
          >
            {trend === "up" ? "\u2191" : trend === "down" ? "\u2193" : "\u2192"}
          </span>
          {trendLabel && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">
              {trendLabel}
            </span>
          )}
        </div>
      )}
    </Card>
  );
}
