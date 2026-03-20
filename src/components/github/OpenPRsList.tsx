import type { OpenPR } from "@/types/github";

export function OpenPRsList({ data }: { data: OpenPR[] }) {
  if (data.length === 0) {
    return (
      <p className="py-4 text-center text-sm text-zinc-500">
        No open PRs
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
            <th className="pb-2 text-right font-medium text-zinc-500">Age</th>
          </tr>
        </thead>
        <tbody>
          {data.map((pr) => (
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
                {pr.isDraft && (
                  <span className="ml-1.5 rounded bg-zinc-100 px-1.5 py-0.5 text-xs text-zinc-400 dark:bg-zinc-800">
                    Draft
                  </span>
                )}
              </td>
              <td className="py-2 text-zinc-500">{pr.author}</td>
              <td className="py-2 text-zinc-500">
                {pr.reviewers.length > 0
                  ? pr.reviewers.join(", ")
                  : <span className="text-zinc-300 dark:text-zinc-600">none</span>}
              </td>
              <td className="py-2 text-right font-mono text-zinc-600 dark:text-zinc-400">
                {pr.daysOpen}d
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
