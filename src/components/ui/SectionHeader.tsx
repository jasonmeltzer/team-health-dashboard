export function SectionHeader({
  title,
  icon,
}: {
  title: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">
        {title}
      </h2>
    </div>
  );
}
