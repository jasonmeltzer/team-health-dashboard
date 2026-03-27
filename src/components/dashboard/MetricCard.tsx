import { useState } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  trend,
  trendLabel,
  refreshing,
  onClick,
  tooltip,
  disabled,
  disabledTooltip,
  clickLabel,
}: {
  label: string;
  value: string | number;
  trend?: "up" | "down" | "flat";
  trendLabel?: React.ReactNode;
  refreshing?: boolean;
  onClick?: () => void;
  tooltip?: string;
  disabled?: boolean;
  disabledTooltip?: string;
  clickLabel?: string;
}) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <Card
      className={cn(
        "relative flex flex-col gap-1",
        disabled && "opacity-40 cursor-not-allowed",
        !disabled && onClick && "cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
      )}
      onClick={disabled ? undefined : onClick}
      title={disabled ? disabledTooltip : undefined}
      aria-label={!disabled && onClick ? (clickLabel || `View ${label}`) : undefined}
      onKeyDown={!disabled && onClick ? (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    >
      <p className="text-sm text-zinc-500 dark:text-zinc-400">
        {label}
        {tooltip && (
          <span
            className="ml-1 inline-flex h-3.5 w-3.5 cursor-help items-center justify-center rounded-full border border-zinc-300 text-[9px] leading-none text-zinc-400 dark:border-zinc-600"
            onMouseEnter={() => setShowTooltip(true)}
            onMouseLeave={() => setShowTooltip(false)}
          >
            ?
          </span>
        )}
        {onClick && (
          <span className="ml-1 text-xs text-zinc-400">↗</span>
        )}
      </p>
      {showTooltip && tooltip && (
        <div className="absolute left-0 top-0 z-10 w-64 -translate-y-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs text-zinc-600 shadow-lg dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
          {tooltip}
        </div>
      )}
      <p className={cn(
        "text-2xl font-bold text-zinc-900 dark:text-zinc-100",
        refreshing && "animate-pulse text-zinc-400 dark:text-zinc-500"
      )}>
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
      {!trend && trendLabel && (
        <div className="flex items-center">{trendLabel}</div>
      )}
    </Card>
  );
}
