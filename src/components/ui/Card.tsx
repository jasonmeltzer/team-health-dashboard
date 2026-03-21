import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  onClick,
  title,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900",
        className
      )}
      onClick={onClick}
      title={title}
    >
      {children}
    </div>
  );
}
