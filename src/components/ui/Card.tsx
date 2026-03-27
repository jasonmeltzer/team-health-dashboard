import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  onClick,
  onKeyDown,
  title,
  "aria-label": ariaLabel,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
  title?: string;
  "aria-label"?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className
      )}
      onClick={onClick}
      onKeyDown={onKeyDown}
      title={title}
      aria-label={ariaLabel}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
