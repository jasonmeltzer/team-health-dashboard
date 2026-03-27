import type { LinearMetrics, VelocityDataPoint, StalledIssue, WorkloadEntry, TimeInStateStats, TimeInStateData, TimeInStateIssue, LeadTimeTrendPoint, CycleSummary } from "@/types/linear";
import { daysBetween } from "@/lib/utils";
import { getConfig } from "@/lib/config";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: getConfig("LINEAR_API_KEY")!,
    },
    body: JSON.stringify({ query, variables }),
  });

  const json = await res.json();
  if (json.errors) {
    throw new Error(
      `Linear GraphQL error: ${json.errors.map((e: { message: string }) => e.message).join("; ")}`
    );
  }
  if (!res.ok) {
    throw new Error(`Linear API error: ${res.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  state: { name: string; type: string };
  assignee: { name: string; avatarUrl: string | null } | null;
  estimate: number | null;
  updatedAt: string;
  completedAt: string | null;
  startedAt: string | null;
  createdAt: string;
  url: string;
}

interface LinearCycle {
  id: string;
  name: string | null;
  number: number;
  startsAt: string;
  endsAt: string;
  progress: number;
  issues: { nodes: LinearIssue[] };
}

export async function fetchLinearMetrics(
  teamId: string,
  mode?: "cycles" | "weekly",
  lookbackDays: number = 42
): Promise<LinearMetrics> {
  // If mode is explicitly "weekly", skip cycle fetch
  if (mode === "weekly") {
    return buildContinuousMetrics(teamId, lookbackDays);
  }

  // Fetch cycles
  const cycleData = await linearQuery<{
    team: { cycles: { nodes: LinearCycle[] } };
  }>(
    `query($teamId: String!) {
      team(id: $teamId) {
        cycles(first: 6, orderBy: createdAt) {
          nodes {
            id name number startsAt endsAt progress
            issues {
              nodes {
                id identifier title
                state { name type }
                assignee { name avatarUrl }
                estimate updatedAt completedAt startedAt createdAt url
              }
            }
          }
        }
      }
    }`,
    { teamId }
  );

  if (!cycleData.team) {
    return buildContinuousMetrics(teamId, lookbackDays);
  }
  const cycles = cycleData.team.cycles.nodes;

  // If mode is explicitly "cycles", use cycles even if empty
  // If mode is auto (undefined), detect based on data
  if (mode === "cycles" || cycles.length > 0) {
    return buildCycleMetrics(cycles, lookbackDays);
  } else {
    return buildContinuousMetrics(teamId, lookbackDays);
  }
}

function buildCycleMetrics(cycles: LinearCycle[], lookbackDays: number = 42): LinearMetrics {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - lookbackDays);

  // Filter cycles to those that overlap with the lookback window
  cycles = cycles.filter((c) => new Date(c.endsAt) >= since);

  const currentCycle = cycles.find(
    (c) => new Date(c.startsAt) <= now && new Date(c.endsAt) >= now
  ) || cycles[cycles.length - 1];

  const velocityTrend: VelocityDataPoint[] = cycles.map((cycle) => {
    const completed = cycle.issues.nodes.filter(
      (i) => i.state.type === "completed"
    );
    return {
      cycleName: cycle.name || `Cycle ${cycle.number}`,
      cycleNumber: cycle.number,
      completedIssues: completed.length,
      completedPoints: completed.reduce((s, i) => s + (i.estimate || 0), 0),
      scopeChange: 0,
    };
  });

  const availableCycles = cycles.map((c) => ({
    id: c.id,
    name: c.name || `Cycle ${c.number}`,
    isCurrent: c === currentCycle,
  }));

  // Build per-cycle data for all views
  const workloadByCycle: Record<string, WorkloadEntry[]> = {};
  const timeInStateByCycle: Record<string, TimeInStateData> = {};
  const stalledIssuesByCycle: Record<string, StalledIssue[]> = {};
  const summaryByCycle: Record<string, CycleSummary> = {};

  for (const cycle of cycles) {
    const name = cycle.name || `Cycle ${cycle.number}`;
    const isCurrent = cycle === currentCycle;
    // For past cycles, use cycle end date as reference; for current, use now
    const referenceDate = isCurrent ? now : new Date(cycle.endsAt);

    const issues = cycle.issues.nodes;
    const activeIssues = issues.filter(
      (i) => i.state.type === "started" || i.state.name.toLowerCase().includes("review")
    );
    const completed = issues.filter((i) => i.state.type === "completed");

    workloadByCycle[name] = buildWorkload(issues);
    timeInStateByCycle[name] = buildTimeInState(issues, referenceDate);
    stalledIssuesByCycle[name] = findStalledIssues(activeIssues, referenceDate);
    summaryByCycle[name] = {
      progress: Math.round(cycle.progress * 100),
      activeIssues: activeIssues.length,
      stalledCount: stalledIssuesByCycle[name].length,
      completedPoints: completed.reduce((s, i) => s + (i.estimate || 0), 0),
    };
  }

  // Current cycle defaults for top-level fields (backward compatible)
  const currentName = currentCycle
    ? currentCycle.name || `Cycle ${currentCycle.number}`
    : "No active cycle";
  const currentSummary = summaryByCycle[currentName];

  const avgVelocity =
    velocityTrend.length > 0
      ? Math.round(
          velocityTrend.reduce((s, v) => s + v.completedPoints, 0) /
            velocityTrend.length
        )
      : 0;

  return {
    mode: "cycles",
    velocityTrend,
    stalledIssues: stalledIssuesByCycle[currentName] || [],
    workloadDistribution: workloadByCycle[currentName] || [],
    availableCycles,
    workloadByCycle,
    timeInState: timeInStateByCycle[currentName] || { stats: [], issues: [], flowEfficiency: 0, leadTimeTrend: [] },
    timeInStateByCycle,
    stalledIssuesByCycle,
    summaryByCycle,
    summary: {
      currentCycleName: currentName,
      currentCycleProgress: currentSummary?.progress ?? 0,
      totalActiveIssues: currentSummary?.activeIssues ?? 0,
      stalledIssueCount: currentSummary?.stalledCount ?? 0,
      avgVelocity,
    },
  };
}

async function buildContinuousMetrics(teamId: string, lookbackDays: number = 42): Promise<LinearMetrics> {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - lookbackDays);

  // Fetch active + recently completed issues using root issues query
  const issueData = await linearQuery<{
    issues: { nodes: LinearIssue[] };
  }>(
    `query($teamId: ID!, $since: DateTimeOrDuration!) {
      issues(
        first: 250
        orderBy: updatedAt
        filter: {
          team: { id: { eq: $teamId } }
          updatedAt: { gte: $since }
        }
      ) {
        nodes {
          id identifier title
          state { name type }
          assignee { name avatarUrl }
          estimate updatedAt completedAt startedAt createdAt url
        }
      }
    }`,
    { teamId, since: since.toISOString() }
  );

  const allIssues = issueData.issues.nodes;

  // Throughput by week (completed issues grouped by week)
  // Filter by completedAt within lookback window — issues may have been updated
  // recently but completed long ago
  const weekMap = new Map<string, { label: string; issues: number; points: number }>();
  for (const issue of allIssues) {
    if (issue.state.type === "completed" && issue.completedAt) {
      const completedDate = new Date(issue.completedAt);
      if (completedDate < since) continue;
      const { sortKey, label } = getWeekInfo(completedDate);
      const entry = weekMap.get(sortKey) || { label, issues: 0, points: 0 };
      entry.issues += 1;
      entry.points += issue.estimate || 0;
      weekMap.set(sortKey, entry);
    }
  }

  const velocityTrend: VelocityDataPoint[] = Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, data]) => ({
      cycleName: data.label,
      completedIssues: data.issues,
      completedPoints: data.points,
      scopeChange: 0,
    }));

  // Active issues for stalled detection + workload
  const activeIssues = allIssues.filter(
    (i) => i.state.type === "started" || i.state.name.toLowerCase().includes("review")
  );

  const stalledIssues = findStalledIssues(activeIssues, now);
  const workloadDistribution = buildWorkload(
    allIssues.filter((i) => i.state.type !== "completed" && i.state.type !== "cancelled")
  );

  const avgThroughput =
    velocityTrend.length > 0
      ? Math.round(
          velocityTrend.reduce((s, v) => s + v.completedPoints, 0) /
            velocityTrend.length
        )
      : 0;

  const timeInState = buildTimeInState(allIssues, now);

  return {
    mode: "continuous",
    velocityTrend,
    stalledIssues,
    workloadDistribution,
    availableCycles: [],
    workloadByCycle: {},
    timeInState,
    timeInStateByCycle: {},
    stalledIssuesByCycle: {},
    summaryByCycle: {},
    summary: {
      currentCycleName: "Continuous flow",
      currentCycleProgress: 0,
      totalActiveIssues: activeIssues.length,
      stalledIssueCount: stalledIssues.length,
      avgVelocity: avgThroughput,
    },
  };
}

function getWeekInfo(date: Date): { sortKey: string; label: string } {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // offset to Monday
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sortKey = monday.toISOString().slice(0, 10); // "2026-03-09"
  const label = `${months[monday.getMonth()]} ${monday.getDate()}`;
  return { sortKey, label };
}

function findStalledIssues(issues: LinearIssue[], now: Date): StalledIssue[] {
  return issues
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
}

function buildTimeInState(issues: LinearIssue[], now: Date): TimeInStateData {
  // Build individual issue records with days-in-state
  const issueRecords: TimeInStateIssue[] = [];
  const stateMap = new Map<string, number[]>();

  for (const issue of issues) {
    const stateName = issue.state.name;
    const stateType = issue.state.type;

    // Skip cancelled/triage states
    if (stateType === "cancelled" || stateType === "triage") continue;

    let daysInState: number;
    if (stateType === "started" && issue.startedAt) {
      daysInState = daysBetween(new Date(issue.startedAt), now);
    } else if (stateType === "completed" && issue.completedAt) {
      // Time spent in completed state: from last state transition (approximated by updatedAt) to completedAt
      // Falls back to createdAt→completedAt as total lead time if no better signal
      const enteredState = issue.startedAt ? new Date(issue.startedAt) : new Date(issue.createdAt);
      daysInState = daysBetween(enteredState, new Date(issue.completedAt));
    } else {
      daysInState = daysBetween(new Date(issue.updatedAt), now);
    }

    issueRecords.push({
      identifier: issue.identifier,
      title: issue.title,
      state: stateName,
      stateType,
      assignee: issue.assignee?.name || null,
      daysInState,
      url: issue.url,
    });

    const arr = stateMap.get(stateName) || [];
    arr.push(daysInState);
    stateMap.set(stateName, arr);
  }

  // Aggregate stats per state
  const stats: TimeInStateStats[] = Array.from(stateMap.entries())
    .map(([state, days]) => {
      days.sort((a, b) => a - b);
      const count = days.length;
      const sum = days.reduce((s, d) => s + d, 0);
      const p90Index = Math.ceil(count * 0.9) - 1;
      return {
        state,
        count,
        minDays: days[0],
        maxDays: days[count - 1],
        meanDays: Math.round((sum / count) * 10) / 10,
        medianDays: count % 2 === 0
          ? Math.round(((days[count / 2 - 1] + days[count / 2]) / 2) * 10) / 10
          : days[Math.floor(count / 2)],
        p90Days: days[Math.min(p90Index, count - 1)],
      };
    })
    .sort((a, b) => b.meanDays - a.meanDays);

  // Flow efficiency: time in "started" states vs total time across all states
  const activeTime = issueRecords
    .filter((i) => i.stateType === "started")
    .reduce((s, i) => s + i.daysInState, 0);
  const totalTime = issueRecords.reduce((s, i) => s + i.daysInState, 0);
  const flowEfficiency = totalTime > 0 ? Math.round((activeTime / totalTime) * 100) : 0;

  // Lead time trend: for completed issues, group by completion week
  const leadTimeTrend = buildLeadTimeTrend(issues);

  return { stats, issues: issueRecords, flowEfficiency, leadTimeTrend };
}

function buildLeadTimeTrend(issues: LinearIssue[]): LeadTimeTrendPoint[] {
  const weekMap = new Map<string, { label: string; totalDays: number; count: number }>();

  for (const issue of issues) {
    if (issue.state.type !== "completed" || !issue.completedAt) continue;
    const created = new Date(issue.createdAt);
    const completed = new Date(issue.completedAt);
    const leadDays = daysBetween(created, completed);
    const { sortKey, label } = getWeekInfo(completed);
    const entry = weekMap.get(sortKey) || { label, totalDays: 0, count: 0 };
    entry.totalDays += leadDays;
    entry.count += 1;
    weekMap.set(sortKey, entry);
  }

  return Array.from(weekMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([sortKey, data]) => ({
      sortKey,
      week: data.label,
      avgDays: Math.round((data.totalDays / data.count) * 10) / 10,
      count: data.count,
    }));
}

function buildWorkload(issues: LinearIssue[]): WorkloadEntry[] {
  const assigneeMap = new Map<
    string,
    { avatarUrl: string | null; inProgress: number; todo: number; completed: number; totalPoints: number; issues: { identifier: string; title: string; state: string; stateType: string; estimate: number | null; url: string }[] }
  >();

  for (const issue of issues) {
    const name = issue.assignee?.name || "Unassigned";
    const entry = assigneeMap.get(name) || {
      avatarUrl: issue.assignee?.avatarUrl || null,
      inProgress: 0,
      todo: 0,
      completed: 0,
      totalPoints: 0,
      issues: [],
    };

    if (issue.state.type === "completed") entry.completed += 1;
    else if (issue.state.type === "started") entry.inProgress += 1;
    else if (issue.state.type === "unstarted") entry.todo += 1;

    entry.totalPoints += issue.estimate || 0;
    entry.issues.push({
      identifier: issue.identifier,
      title: issue.title,
      state: issue.state.name,
      stateType: issue.state.type,
      estimate: issue.estimate,
      url: issue.url,
    });
    assigneeMap.set(name, entry);
  }

  return Array.from(assigneeMap.entries())
    .map(([assignee, data]) => ({ assignee, ...data }))
    .sort((a, b) => b.inProgress + b.todo - (a.inProgress + a.todo));
}
