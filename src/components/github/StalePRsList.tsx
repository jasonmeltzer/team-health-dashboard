import type { StalePR } from "@/types/github";

export function StalePRsList({ data }: { data: StalePR[] }) {
  if (data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No stale PRs found
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 dark:border-zinc-700">
            <th className="pb-2 text-left font-medium text-zinc-500">PR</th>
            <th className="pb-2 text-left font-medium text-zinc-500">Author</th>
            <th className="pb-2 text-left font-medium text-zinc-500">Reviewers</th>
            <th className="pb-2 text-right font-medium text-zinc-500">
              Days stale
            </th>
          </tr>
        </thead>
        <tbody>
          {data.slice(0, 10).map((pr) => (
            <tr
              key={pr.number}
              className="border-b border-zinc-100 dark:border-zinc-800"
            >
              <td className="py-2">
                <a
                  href={pr.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:underline dark:text-blue-400"
                >
                  #{pr.number}
                </a>{" "}
                <span className="text-zinc-700 dark:text-zinc-300">
                  {pr.title.length > 50
                    ? pr.title.slice(0, 50) + "..."
                    : pr.title}
                </span>
              </td>
              <td className="py-2 text-zinc-500">{pr.author}</td>
              <td className="py-2 text-zinc-500">
                {pr.reviewers.length > 0
                  ? pr.reviewers.join(", ")
                  : <span className="text-zinc-300 dark:text-zinc-600">none</span>}
              </td>
              <td className="py-2 text-right font-medium text-red-600 dark:text-red-400">
                {pr.daysSinceUpdate}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
