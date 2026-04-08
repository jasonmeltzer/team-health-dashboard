import type { LinearMetrics, VelocityDataPoint, StalledIssue, WorkloadEntry, TimeInStateStats, TimeInStateData, TimeInStateIssue, LeadTimeTrendPoint, CycleSummary, ScopeChange, ScopeChangeSummary } from "@/types/linear";
import { daysBetween } from "@/lib/utils";
import { getConfig } from "@/lib/config";
import { RateLimitError } from "@/lib/errors";
import { writeCycleSnapshot, getLatestCycleSnapshot, getEarliestCycleSnapshot, diffSnapshots } from "@/lib/db";

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

  if (res.status === 429) {
    const retryAfter = res.headers.get("Retry-After");
    throw new RateLimitError(
      "linear",
      retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined
    );
  }
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
  issueCountHistory: number[];
  issues: { nodes: LinearIssue[] };
}

interface CycleHistoryEntry {
  id: string;
  createdAt: string;
  actorId: string | null;
  actor: { id: string; name: string } | null;
  fromCycleId: string | null;
  toCycleId: string | null;
  toCycle: { id: string; name: string | null; number: number } | null;
  fromCycle: { id: string; name: string | null; number: number } | null;
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
            issueCountHistory
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
    return await buildCycleMetrics(cycles, lookbackDays);
  } else {
    return buildContinuousMetrics(teamId, lookbackDays);
  }
}

async function fetchCycleHistoryForIssue(
  issueId: string,
  cycleId: string
): Promise<CycleHistoryEntry[]> {
  try {
    const data = await linearQuery<{
      issue: {
        history: {
          nodes: CycleHistoryEntry[];
        };
      };
    }>(
      `query($issueId: String!) {
        issue(id: $issueId) {
          history(first: 50, orderBy: createdAt) {
            nodes {
              id createdAt actorId
              actor { id name }
              fromCycleId toCycleId
              toCycle { id name number }
              fromCycle { id name number }
            }
          }
        }
      }`,
      { issueId }
    );
    // Filter to entries relevant to this cycle
    return data.issue.history.nodes.filter(
      (n) => n.fromCycleId === cycleId || n.toCycleId === cycleId
    );
  } catch (e) {
    console.warn("[Linear] fetchCycleHistoryForIssue failed for", issueId, e);
    return []; // Non-fatal — degrade to snapshot-only
  }
}

async function fetchIssueMeta(
  issueIds: string[]
): Promise<Map<string, { identifier: string; title: string; url: string }>> {
  const result = new Map<string, { identifier: string; title: string; url: string }>();
  for (let i = 0; i < issueIds.length; i += 10) {
    const batch = issueIds.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((id) =>
        linearQuery<{ issue: { identifier: string; title: string; url: string } }>(
          `query($id: String!) { issue(id: $id) { identifier title url } }`,
          { id }
        )
      )
    );
    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      if (r.status === "fulfilled" && r.value.issue) {
        result.set(batch[j], r.value.issue);
      }
    }
  }
  return result;
}

export async function fetchScopeChanges(
  currentCycle: LinearCycle,
  allIssueIds: string[],
  issueMap: Map<string, LinearIssue>,
  previousCycleId: string | null
): Promise<ScopeChangeSummary> {
  // Get previous snapshot before writing the new one
  const prevSnapshot = getLatestCycleSnapshot(currentCycle.id);

  // Write current snapshot
  writeCycleSnapshot(
    currentCycle.id,
    currentCycle.name || `Cycle ${currentCycle.number}`,
    allIssueIds
  );

  // Compute snapshot diff (if previous snapshot exists)
  const diff = prevSnapshot
    ? diffSnapshots(prevSnapshot.issueIds, allIssueIds)
    : { added: [], removed: [] };

  // Fetch IssueHistory for all relevant issues (current + removed from diff).
  // Note: Linear history retention is not documented; treat as best-effort.
  // Batch in groups of 10 to avoid rate limits.
  // Track which issueId produced which history entries via batch index.
  const issueIdsToQuery = [...new Set([...allIssueIds, ...diff.removed])];
  const historyChangesByIssue: ScopeChange[] = [];
  for (let i = 0; i < issueIdsToQuery.length; i += 10) {
    const batch = issueIdsToQuery.slice(i, i + 10);
    const results = await Promise.allSettled(
      batch.map((id) => fetchCycleHistoryForIssue(id, currentCycle.id))
    );
    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status !== "fulfilled") continue;
      const issId = batch[j];
      const issue = issueMap.get(issId);
      const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
      const cycleStartMs = new Date(currentCycle.startsAt).getTime();
      for (const entry of result.value) {
        // Only count changes AFTER the sprint started — pre-sprint planning isn't scope change
        if (new Date(entry.createdAt) < new Date(currentCycle.startsAt)) continue;
        const isAdded = entry.toCycleId === currentCycle.id;
        const type: "added" | "removed" = isAdded ? "added" : "removed";
        const actor =
          entry.actor?.name ?? (entry.actorId ? "Unknown" : "Automation");
        // For removals, show destination cycle name or "backlog" if moved to no cycle.
        // toCycleId === null means moved to backlog
        const destination = !isAdded
          ? (entry.toCycle?.name ?? (entry.toCycleId === null ? "backlog" : null))
          : null;
        // Carry-over: issue added within 12h of cycle start, coming from previous cycle
        const changedAtMs = new Date(entry.createdAt).getTime();
        const withinWindow = Math.abs(changedAtMs - cycleStartMs) <= WINDOW_MS;
        const isCarryOver = isAdded && withinWindow && previousCycleId != null && entry.fromCycleId === previousCycleId;
        historyChangesByIssue.push({
          issueId: issId,
          identifier: issue?.identifier ?? issId,
          title: issue?.title ?? "Unknown issue",
          url: issue?.url ?? "",
          type,
          actor,
          changedAt: entry.createdAt,
          destination,
          source: "history",
          isCarryOver,
        });
      }
    }
  }

  const changes: ScopeChange[] = [...historyChangesByIssue];

  // Fetch metadata for removed issues not in issueMap (they left the cycle)
  const unknownIds = [
    ...diff.removed.filter((id) => !issueMap.has(id)),
    ...historyChangesByIssue
      .filter((c) => !issueMap.has(c.issueId))
      .map((c) => c.issueId),
  ];
  const uniqueUnknownIds = [...new Set(unknownIds)];
  const removedMeta = uniqueUnknownIds.length > 0
    ? await fetchIssueMeta(uniqueUnknownIds)
    : new Map<string, { identifier: string; title: string; url: string }>();

  // Backfill history entries that had unknown issue metadata
  for (const change of changes) {
    if (change.identifier === change.issueId || change.title === "Unknown issue") {
      const meta = removedMeta.get(change.issueId);
      if (meta) {
        change.identifier = meta.identifier;
        change.title = meta.title;
        change.url = meta.url;
      }
    }
  }

  // Merge snapshot-diff entries for issues not already covered by Linear history.
  // Snapshot entries have no actor attribution — shown as null ("?") in the UI.
  const historyCoveredIds = new Set(
    historyChangesByIssue.map((c) => `${c.type}:${c.issueId}`)
  );

  if (prevSnapshot) {
    const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours
    const cycleStartMs = new Date(currentCycle.startsAt).getTime();
    // Snapshot carry-over heuristic: if this snapshot was captured within 12h of
    // cycle start, additions in the diff are likely carry-overs. If the snapshot
    // was captured later, additions are mid-sprint changes. This avoids using
    // capturedAt as a per-issue timestamp (it's when the snapshot was taken, not
    // when individual issues entered the cycle).
    const snapshotCapturedMs = new Date(prevSnapshot.capturedAt).getTime();
    const snapshotIsNearCycleStart = Math.abs(snapshotCapturedMs - cycleStartMs) <= WINDOW_MS;
    for (const id of diff.added) {
      if (historyCoveredIds.has(`added:${id}`)) continue;
      const issue = issueMap.get(id) ?? removedMeta.get(id);
      changes.push({
        issueId: id,
        identifier: issue?.identifier ?? id,
        title: issue?.title ?? "Unknown issue",
        url: issue?.url ?? "",
        type: "added",
        actor: null,
        changedAt: prevSnapshot.capturedAt,
        destination: null,
        source: "snapshot",
        isCarryOver: snapshotIsNearCycleStart,
      });
    }
    for (const id of diff.removed) {
      if (historyCoveredIds.has(`removed:${id}`)) continue;
      const meta = issueMap.get(id) ?? removedMeta.get(id);
      changes.push({
        issueId: id,
        identifier: meta?.identifier ?? id,
        title: meta?.title ?? "Unknown issue",
        url: meta?.url ?? "",
        type: "removed",
        actor: null,
        changedAt: prevSnapshot.capturedAt,
        destination: null,
        source: "snapshot",
        isCarryOver: false,
      });
    }
  }

  // Sort chronologically (oldest first)
  changes.sort((a, b) => a.changedAt.localeCompare(b.changedAt));

  // Cold-start gap: true when earliest snapshot postdates cycle startsAt
  const earliest = getEarliestCycleSnapshot(currentCycle.id);
  const hasColdStartGap =
    !earliest || new Date(earliest.capturedAt) > new Date(currentCycle.startsAt);

  const added = changes.filter((c) => c.type === "added").length;
  const removed = changes.filter((c) => c.type === "removed").length;
  const carryOverCount = changes.filter((c) => c.isCarryOver).length;
  const midSprintAdded = added - carryOverCount; // carry-overs are always "added" type
  const midSprintRemoved = removed;              // removals can't be carry-overs

  return {
    added,
    removed,
    net: added - removed,
    changes,
    hasColdStartGap,
    issueCountAtStart: currentCycle.issueCountHistory?.[0] ?? null,
    issueCountNow: allIssueIds.length,
    midSprintAdded,
    midSprintRemoved,
    carryOvers: carryOverCount,
  };
}

async function buildCycleMetrics(cycles: LinearCycle[], lookbackDays: number = 42): Promise<LinearMetrics> {
  const now = new Date();
  const since = new Date(now);
  since.setDate(since.getDate() - lookbackDays);

  // Sort all cycles by start date before filtering — needed for previousCycleId lookup
  const allCyclesSorted = [...cycles].sort(
    (a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime()
  );

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

  // Compute scope changes: full history fetch for current cycle only,
  // snapshot-only (no IssueHistory API calls) for past/future cycles.
  // Past cycles are immutable — re-fetching their history wastes API quota.
  let scopeChanges: ScopeChangeSummary | null = null;
  const scopeChangesByCycle: Record<string, ScopeChangeSummary> = {};
  if (currentCycle) {
    try {
      const issueMap = new Map(currentCycle.issues.nodes.map((i) => [i.id, i]));
      const allIssueIds = currentCycle.issues.nodes.map((i) => i.id);
      const cycleName = currentCycle.name || `Cycle ${currentCycle.number}`;
      // Derive previousCycleId from ALL cycles (not filtered by lookback) so
      // carry-over detection works even when lookback < sprint length
      const currentIndex = allCyclesSorted.findIndex((c) => c.id === currentCycle.id);
      const previousCycleId = currentIndex > 0 ? allCyclesSorted[currentIndex - 1].id : null;
      scopeChanges = await fetchScopeChanges(currentCycle, allIssueIds, issueMap, previousCycleId);
      scopeChangesByCycle[cycleName] = scopeChanges;
    } catch (e) {
      console.warn("[Linear] Failed to fetch scope changes for current cycle:", e);
    }
  }
  // Write snapshots for non-current cycles (baseline pre-caching) without history API calls
  for (const cycle of cycles) {
    if (cycle === currentCycle) continue;
    const cycleName = cycle.name || `Cycle ${cycle.number}`;
    try {
      const ids = cycle.issues.nodes.map((i) => i.id);
      writeCycleSnapshot(cycle.id, cycleName, ids);
      // Build snapshot-only scope changes (no history API calls)
      const prevSnapshot = getLatestCycleSnapshot(cycle.id);
      if (prevSnapshot) {
        const diff = diffSnapshots(prevSnapshot.issueIds, ids);
        const added = diff.added.length;
        const removed = diff.removed.length;
        scopeChangesByCycle[cycleName] = {
          added,
          removed,
          net: added - removed,
          changes: [], // No detailed entries without history fetch
          hasColdStartGap: true,
          issueCountAtStart: cycle.issueCountHistory?.[0] ?? null,
          issueCountNow: ids.length,
          midSprintAdded: added,    // no carry-over detection for past cycles
          midSprintRemoved: removed,
          carryOvers: null,         // null = detection unavailable (past cycles)
        };
      }
    } catch (e) {
      console.warn("[Linear] Failed to snapshot cycle", cycleName, e);
    }
  }

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
      currentCycleStartsAt: currentCycle?.startsAt ?? null,
      currentCycleEndsAt: currentCycle?.endsAt ?? null,
      totalActiveIssues: currentSummary?.activeIssues ?? 0,
      stalledIssueCount: currentSummary?.stalledCount ?? 0,
      avgVelocity,
    },
    scopeChanges,
    scopeChangesByCycle,
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
      currentCycleStartsAt: null,
      currentCycleEndsAt: null,
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
  // Exclude "Blocked" — it has stateType "started" but isn't active work
  const isActiveWork = (i: TimeInStateIssue) =>
    i.stateType === "started" && !/blocked/i.test(i.state);
  const activeTime = issueRecords
    .filter(isActiveWork)
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
