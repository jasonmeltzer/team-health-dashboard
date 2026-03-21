import type { DORARating } from "@/types/dora";
import { cn } from "@/lib/utils";

const RATING_STYLES: Record<DORARating, string> = {
  elite: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400",
  high: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400",
  low: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
};

export function DORARatingBadge({
  rating,
  className,
}: {
  rating: DORARating;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        RATING_STYLES[rating],
        className
      )}
    >
      {rating}
    </span>
  );
}
