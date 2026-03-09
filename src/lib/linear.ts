import type { LinearMetrics, VelocityDataPoint, StalledIssue, WorkloadEntry } from "@/types/linear";
import { daysBetween } from "@/lib/utils";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: process.env.LINEAR_API_KEY!,
    },
    body: JSON.stringify({ query, variables }),
  });

  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${res.statusText}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`Linear GraphQL error: ${json.errors[0].message}`);
  }
  return json.data;
}

export async function fetchLinearMetrics(teamId: string): Promise<LinearMetrics> {
  const data = await linearQuery<{
    team: {
      cycles: {
        nodes: Array<{
          id: string;
          name: string | null;
          number: number;
          startsAt: string;
          endsAt: string;
          progress: number;
          issues: {
            nodes: Array<{
              id: string;
              identifier: string;
              title: string;
              state: { name: string; type: string };
              assignee: { name: string; avatarUrl: string | null } | null;
              estimate: number | null;
              updatedAt: string;
              url: string;
            }>;
          };
        }>;
      };
    };
  }>(
    `query($teamId: String!) {
      team(id: $teamId) {
        cycles(first: 6, orderBy: createdAt) {
          nodes {
            id
            name
            number
            startsAt
            endsAt
            progress
            issues {
              nodes {
                id
                identifier
                title
                state { name type }
                assignee { name avatarUrl }
                estimate
                updatedAt
                url
              }
            }
          }
        }
      }
    }`,
    { teamId }
  );

  const cycles = data.team.cycles.nodes;
  const now = new Date();

  // Find current cycle
  const currentCycle = cycles.find(
    (c) => new Date(c.startsAt) <= now && new Date(c.endsAt) >= now
  ) || cycles[cycles.length - 1];

  // Velocity trend
  const velocityTrend: VelocityDataPoint[] = cycles.map((cycle) => {
    const completed = cycle.issues.nodes.filter(
      (i) => i.state.type === "completed"
    );
    return {
      cycleName: cycle.name || `Cycle ${cycle.number}`,
      cycleNumber: cycle.number,
      completedIssues: completed.length,
      completedPoints: completed.reduce((s, i) => s + (i.estimate || 0), 0),
      scopeChange: 0, // Would need historical data to compute
    };
  });

  // Stalled issues (in progress/review for > 5 days without update)
  const activeIssues = currentCycle
    ? currentCycle.issues.nodes.filter(
        (i) => i.state.type === "started" || i.state.name.toLowerCase().includes("review")
      )
    : [];

  const stalledIssues: StalledIssue[] = activeIssues
    .filter((i) => daysBetween(new Date(i.updatedAt), now) > 5)
    .map((i) => ({
      id: i.id,
      identifier: i.identifier,
      title: i.title,
      state: i.state.name,
      assignee: i.assignee?.name || null,
      daysSinceLastUpdate: daysBetween(new Date(i.updatedAt), now),
      url: i.url,
    }))
    .sort((a, b) => b.daysSinceLastUpdate - a.daysSinceLastUpdate);

  // Workload distribution (current cycle)
  const assigneeMap = new Map<
    string,
    { avatarUrl: string | null; inProgress: number; todo: number; completed: number; totalPoints: number }
  >();

  if (currentCycle) {
    for (const issue of currentCycle.issues.nodes) {
      const name = issue.assignee?.name || "Unassigned";
      const entry = assigneeMap.get(name) || {
        avatarUrl: issue.assignee?.avatarUrl || null,
        inProgress: 0,
        todo: 0,
        completed: 0,
        totalPoints: 0,
      };

      if (issue.state.type === "completed") entry.completed += 1;
      else if (issue.state.type === "started") entry.inProgress += 1;
      else if (issue.state.type === "unstarted") entry.todo += 1;

      entry.totalPoints += issue.estimate || 0;
      assigneeMap.set(name, entry);
    }
  }

  const workloadDistribution: WorkloadEntry[] = Array.from(
    assigneeMap.entries()
  )
    .map(([assignee, data]) => ({ assignee, ...data }))
    .sort((a, b) => b.inProgress + b.todo - (a.inProgress + a.todo));

  const avgVelocity =
    velocityTrend.length > 0
      ? Math.round(
          velocityTrend.reduce((s, v) => s + v.completedPoints, 0) /
            velocityTrend.length
        )
      : 0;

  return {
    velocityTrend,
    stalledIssues,
    workloadDistribution,
    summary: {
      currentCycleName: currentCycle
        ? currentCycle.name || `Cycle ${currentCycle.number}`
        : "No active cycle",
      currentCycleProgress: currentCycle
        ? Math.round(currentCycle.progress * 100)
        : 0,
      totalActiveIssues: activeIssues.length,
      stalledIssueCount: stalledIssues.length,
      avgVelocity,
    },
  };
}
