/**
 * Deterministic health score computation.
 *
 * Starts at 100 and subtracts points for signals of trouble.
 * Only scores against integrations that are actually connected.
 * Final score is rescaled so the max possible deduction always maps to 0.
 */

import type { PRMetrics } from "@/types/github";
import type { LinearMetrics } from "@/types/linear";
import type { SlackMetrics } from "@/types/slack";
import type { DORAMetrics } from "@/types/dora";
import type { ScoreDeduction } from "@/types/metrics";

export type { ScoreDeduction };

export interface ScoreResult {
  score: number;
  overallHealth: "healthy" | "warning" | "critical";
  deductions: ScoreDeduction[];
}

export interface ScoreWeights {
  github?: number; // 0.0-1.0 multiplier (from 0-100 slider / 100)
  linear?: number;
  slack?: number;
  dora?: number;
}

/* ─── GitHub (max 30 pts) ─────────────────────────────────────────────── */

function scoreGitHub(github: PRMetrics): ScoreDeduction[] {
  const deductions: ScoreDeduction[] = [];

  // 1. Average cycle time (0-8 pts)
  const avgHours = github.summary.avgCycleTimeHours;
  let ctPts = 0;
  if (avgHours > 72) ctPts = 8;
  else if (avgHours > 48) ctPts = 6;
  else if (avgHours > 24) ctPts = 4;
  else if (avgHours > 12) ctPts = 2;
  deductions.push({
    signal: "Cycle time",
    category: "github",
    points: ctPts,
    maxPoints: 8,
    detail: `${Math.round(avgHours)}h avg merge time`,
  });

  // 2. Stale PRs (0-8 pts)
  const staleCount = github.summary.stalePRCount;
  let stalePts = 0;
  if (staleCount >= 4) stalePts = 8;
  else if (staleCount >= 3) stalePts = 6;
  else if (staleCount >= 2) stalePts = 4;
  else if (staleCount >= 1) stalePts = 2;
  deductions.push({
    signal: "Stale PRs",
    category: "github",
    points: stalePts,
    maxPoints: 8,
    detail: `${staleCount} stale PR${staleCount !== 1 ? "s" : ""}`,
  });

  // 3. Review queue backup (0-7 pts)
  const totalOpen = github.summary.totalOpenPRs;
  const needingReview = github.summary.prsNeedingReview;
  const reviewPct = totalOpen > 0 ? (needingReview / totalOpen) * 100 : 0;
  let reviewPts = 0;
  if (reviewPct > 75) reviewPts = 7;
  else if (reviewPct > 50) reviewPts = 6;
  else if (reviewPct > 25) reviewPts = 4;
  else if (reviewPct > 10) reviewPts = 2;
  deductions.push({
    signal: "Review queue",
    category: "github",
    points: reviewPts,
    maxPoints: 7,
    detail: `${needingReview}/${totalOpen} PRs awaiting review (${Math.round(reviewPct)}%)`,
  });

  // 4. Cycle time trending up (0-7 pts)
  const trend = github.cycleTimeTrend;
  let trendPts = 0;
  let trendDetail = "Stable";
  if (trend.length >= 2) {
    const prior = trend.slice(0, -1);
    const avg =
      prior.reduce((s, d) => s + d.avgHoursToMerge, 0) / prior.length;
    const latest = trend[trend.length - 1].avgHoursToMerge;
    if (avg > 0) {
      const ratio = latest / avg;
      if (ratio > 1.5) trendPts = 7;
      else if (ratio > 1.25) trendPts = 4;
      else if (ratio > 1.1) trendPts = 2;
      trendDetail =
        trendPts > 0
          ? `Latest ${Math.round(latest)}h vs avg ${Math.round(avg)}h (${ratio.toFixed(1)}×)`
          : `Latest ${Math.round(latest)}h vs avg ${Math.round(avg)}h`;
    }
  }
  deductions.push({
    signal: "Cycle time trend",
    category: "github",
    points: trendPts,
    maxPoints: 7,
    detail: trendDetail,
  });

  return deductions;
}

/* ─── Linear (max 30 pts in continuous mode; max 34 pts in cycles mode with scope data) ─── */

/** True statistical median of a sorted numeric array. Caller must ensure array is non-empty and sorted ascending. */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}

function scoreLinear(linear: LinearMetrics): ScoreDeduction[] {
  const deductions: ScoreDeduction[] = [];

  // 1. Stalled issues (0-6 pts)
  const stalledCount = linear.summary.stalledIssueCount;
  let stalledPts = 0;
  if (stalledCount >= 5) stalledPts = 6;
  else if (stalledCount >= 3) stalledPts = 4;
  else if (stalledCount >= 2) stalledPts = 3;
  else if (stalledCount >= 1) stalledPts = 1;
  deductions.push({
    signal: "Stalled issues",
    category: "linear",
    points: stalledPts,
    maxPoints: 6,
    detail: `${stalledCount} issue${stalledCount !== 1 ? "s" : ""} with no update in 5+ days`,
  });

  // 2. Workload imbalance (0-6 pts)
  const workloads = linear.workloadDistribution
    .map((w) => w.inProgress + w.todo)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);
  let imbalancePts = 0;
  let imbalanceDetail = "Balanced";
  if (workloads.length >= 2) {
    const med = median(workloads);
    const max = workloads[workloads.length - 1];
    if (med > 0) {
      const ratio = max / med;
      if (ratio > 2.5) imbalancePts = 6;
      else if (ratio > 2) imbalancePts = 4;
      else if (ratio > 1.5) imbalancePts = 2;
      imbalanceDetail =
        imbalancePts > 0
          ? `Busiest: ${max} items, median: ${med} (${ratio.toFixed(1)}×)`
          : `Busiest: ${max} items, median: ${med}`;
    }
  }
  deductions.push({
    signal: "Workload imbalance",
    category: "linear",
    points: imbalancePts,
    maxPoints: 6,
    detail: imbalanceDetail,
  });

  // 3. Velocity declining (0-6 pts)
  const vTrend = linear.velocityTrend;
  let velPts = 0;
  let velDetail = "Stable";
  if (vTrend.length >= 2) {
    const prior = vTrend.slice(0, -1);
    const avg =
      prior.reduce((s, v) => s + v.completedPoints, 0) / prior.length;
    const latest = vTrend[vTrend.length - 1].completedPoints;
    if (avg > 0) {
      const pct = latest / avg;
      if (pct < 0.5) velPts = 6;
      else if (pct < 0.75) velPts = 4;
      else if (pct < 0.9) velPts = 2;
      velDetail =
        velPts > 0
          ? `Latest ${latest} pts vs avg ${Math.round(avg)} pts (${Math.round(pct * 100)}%)`
          : `Latest ${latest} pts vs avg ${Math.round(avg)} pts`;
    }
  }
  deductions.push({
    signal: "Velocity trend",
    category: "linear",
    points: velPts,
    maxPoints: 6,
    detail: velDetail,
  });

  // 4. Flow efficiency (0-4 pts)
  const efficiency = linear.timeInState.flowEfficiency;
  let effPts = 0;
  if (efficiency < 15) effPts = 4;
  else if (efficiency < 25) effPts = 2;
  else if (efficiency < 40) effPts = 1;
  deductions.push({
    signal: "Flow efficiency",
    category: "linear",
    points: effPts,
    maxPoints: 4,
    detail: `${efficiency}% of time in active work`,
  });

  // 5. WIP overload (0-4 pts)
  const assigneesWithWIP = linear.workloadDistribution.filter(
    (w) => w.inProgress > 0
  );
  const avgWIP =
    assigneesWithWIP.length > 0
      ? assigneesWithWIP.reduce((s, w) => s + w.inProgress, 0) /
        assigneesWithWIP.length
      : 0;
  let wipPts = 0;
  if (avgWIP > 7) wipPts = 4;
  else if (avgWIP > 5) wipPts = 2;
  else if (avgWIP > 3) wipPts = 1;
  deductions.push({
    signal: "WIP per person",
    category: "linear",
    points: wipPts,
    maxPoints: 4,
    detail: `${avgWIP.toFixed(1)} avg in-progress per person`,
  });

  // 6. Long-running items (0-4 pts)
  const activeIssues = linear.timeInState.issues.filter(
    (i) => i.stateType === "started"
  );
  const activeStats = linear.timeInState.stats.filter((s) => {
    const match = linear.timeInState.issues.find((i) => i.state === s.state);
    return match?.stateType === "started";
  });
  let outlierCount = 0;
  for (const stat of activeStats) {
    outlierCount += activeIssues.filter(
      (i) => i.state === stat.state && i.daysInState >= stat.p90Days
    ).length;
  }
  const outlierPct =
    activeIssues.length > 0 ? (outlierCount / activeIssues.length) * 100 : 0;
  let outlierPts = 0;
  if (outlierPct > 20) outlierPts = 4;
  else if (outlierPct > 15) outlierPts = 3;
  else if (outlierPct > 10) outlierPts = 2;
  else if (outlierPct > 5) outlierPts = 1;
  deductions.push({
    signal: "Long-running items",
    category: "linear",
    points: outlierPts,
    maxPoints: 4,
    detail: `${outlierCount}/${activeIssues.length} active items past p90 (${Math.round(outlierPct)}%)`,
  });

  // 7. Scope churn (0-4 pts, cycles mode only) — mid-sprint only, carry-overs excluded
  const scopeChanges = linear.scopeChanges;
  const isCyclesMode = linear.mode === "cycles";
  let churnPts = 0;
  let churnDetail = "Continuous mode (not scored)";

  if (isCyclesMode && scopeChanges != null) {
    const sprintSize = scopeChanges.issueCountNow;
    const movements = scopeChanges.midSprintAdded + scopeChanges.midSprintRemoved;
    const churnPct = sprintSize > 0 ? (movements / sprintSize) * 100 : 0;
    if (churnPct > 30) churnPts = 4;
    else if (churnPct > 20) churnPts = 2;
    else if (churnPct > 10) churnPts = 1;
    churnDetail = sprintSize > 0
      ? `${Math.round(churnPct)}% mid-sprint churn (${scopeChanges.midSprintAdded} added, ${scopeChanges.midSprintRemoved} removed of ${sprintSize})`
      : "Empty sprint";
  } else if (isCyclesMode) {
    churnDetail = "No scope data available";
  }

  deductions.push({
    signal: "Scope churn",
    category: "linear",
    points: churnPts,
    maxPoints: isCyclesMode && scopeChanges != null && scopeChanges.issueCountNow > 0 ? 4 : 0,
    detail: churnDetail,
  });

  // 8. Scope carry-overs (0-4 pts, cycles mode only)
  const carryOvers = scopeChanges?.carryOvers ?? 0;
  let carryOverPts = 0;
  let carryOverDetail = "Continuous mode (not scored)";

  if (isCyclesMode && scopeChanges != null) {
    const sprintSize = scopeChanges.issueCountNow;
    const carryOverPct = sprintSize > 0 ? (carryOvers / sprintSize) * 100 : 0;
    if (carryOverPct > 30) carryOverPts = 4;
    else if (carryOverPct > 20) carryOverPts = 2;
    else if (carryOverPct > 10) carryOverPts = 1;
    carryOverDetail = sprintSize > 0
      ? `${Math.round(carryOverPct)}% carry-over rate (${carryOvers} of ${sprintSize} issues carried over)`
      : "Empty sprint";
  } else if (isCyclesMode) {
    carryOverDetail = "No scope data available";
  }

  deductions.push({
    signal: "Scope carry-overs",
    category: "linear",
    points: carryOverPts,
    maxPoints: isCyclesMode && scopeChanges != null && scopeChanges.issueCountNow > 0 ? 4 : 0,
    detail: carryOverDetail,
  });

  return deductions;
}

/* ─── Slack (max 20 pts) ──────────────────────────────────────────────── */

function scoreSlack(slack: SlackMetrics): ScoreDeduction[] {
  const deductions: ScoreDeduction[] = [];

  // 1. Average response time (0-8 pts)
  const avgMin = slack.summary.avgResponseMinutes;
  let respPts = 0;
  if (avgMin > 60) respPts = 8;
  else if (avgMin > 30) respPts = 6;
  else if (avgMin > 15) respPts = 4;
  else if (avgMin > 5) respPts = 2;
  deductions.push({
    signal: "Response time",
    category: "slack",
    points: respPts,
    maxPoints: 8,
    detail: `${Math.round(avgMin)} min avg response`,
  });

  // 2. Overloaded members (0-6 pts)
  const overloaded = slack.overloadIndicators.filter(
    (o) => o.isOverloaded
  ).length;
  let overloadPts = 0;
  if (overloaded >= 3) overloadPts = 6;
  else if (overloaded >= 2) overloadPts = 4;
  else if (overloaded >= 1) overloadPts = 2;
  deductions.push({
    signal: "Overloaded members",
    category: "slack",
    points: overloadPts,
    maxPoints: 6,
    detail: `${overloaded} overloaded team member${overloaded !== 1 ? "s" : ""}`,
  });

  // 3. Response time trending up (0-6 pts)
  const trend = slack.responseTimeTrend;
  let trendPts = 0;
  let trendDetail = "Stable";
  if (trend.length >= 2) {
    const prior = trend.slice(0, -1);
    const avg =
      prior.reduce((s, d) => s + d.avgResponseMinutes, 0) / prior.length;
    const latest = trend[trend.length - 1].avgResponseMinutes;
    if (avg > 0) {
      const ratio = latest / avg;
      if (ratio > 1.5) trendPts = 6;
      else if (ratio > 1.25) trendPts = 4;
      else if (ratio > 1.1) trendPts = 2;
      trendDetail =
        trendPts > 0
          ? `Latest ${Math.round(latest)}m vs avg ${Math.round(avg)}m (${ratio.toFixed(1)}×)`
          : `Latest ${Math.round(latest)}m vs avg ${Math.round(avg)}m`;
    }
  }
  deductions.push({
    signal: "Response time trend",
    category: "slack",
    points: trendPts,
    maxPoints: 6,
    detail: trendDetail,
  });

  return deductions;
}

/* ─── DORA (max 20 pts) ──────────────────────────────────────────────── */

function scoreDORA(dora: DORAMetrics): ScoreDeduction[] {
  const deductions: ScoreDeduction[] = [];

  // 1. Deployment frequency (0-5 pts)
  const freq = dora.summary.deploymentFrequency;
  let freqPts = 0;
  if (freq < 0.25) freqPts = 5; // less than monthly
  else if (freq < 1) freqPts = 3; // less than weekly
  else if (freq < 2) freqPts = 1;
  deductions.push({
    signal: "Deploy frequency",
    category: "dora",
    points: freqPts,
    maxPoints: 5,
    detail: `${freq}/week avg`,
  });

  // 2. Lead time (0-5 pts) — uses avgLeadTimeHours if available
  const lt = dora.summary.avgLeadTimeHours;
  let ltPts = 0;
  let ltDetail = "Not available";
  if (lt != null) {
    if (lt > 168) ltPts = 5;
    else if (lt > 72) ltPts = 3;
    else if (lt > 24) ltPts = 1;
    ltDetail = `${Math.round(lt)}h avg`;
  }
  deductions.push({
    signal: "Lead time",
    category: "dora",
    points: ltPts,
    maxPoints: lt != null ? 5 : 0,
    detail: ltDetail,
  });

  // 3. Change failure rate (0-5 pts)
  const cfr = dora.summary.changeFailureRate;
  let cfrPts = 0;
  if (cfr > 15) cfrPts = 5;
  else if (cfr > 10) cfrPts = 3;
  else if (cfr > 5) cfrPts = 1;
  deductions.push({
    signal: "Change failure rate",
    category: "dora",
    points: cfrPts,
    maxPoints: 5,
    detail: `${cfr}%`,
  });

  // 4. MTTR (0-5 pts)
  const mttr = dora.summary.mttrHours;
  let mttrPts = 0;
  let mttrDetail = "No incidents";
  if (mttr != null) {
    if (mttr > 168) mttrPts = 5;
    else if (mttr > 24) mttrPts = 3;
    else if (mttr > 4) mttrPts = 1;
    mttrDetail = `${Math.round(mttr)}h avg recovery`;
  }
  deductions.push({
    signal: "MTTR",
    category: "dora",
    points: mttrPts,
    maxPoints: mttr != null ? 5 : 0,
    detail: mttrDetail,
  });

  return deductions;
}

/* ─── Main ────────────────────────────────────────────────────────────── */

export function computeHealthScore(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  dora: DORAMetrics | null = null,
  weights: ScoreWeights = {}
): ScoreResult {
  const deductions: ScoreDeduction[] = [];

  if (github) deductions.push(...scoreGitHub(github));
  if (linear) deductions.push(...scoreLinear(linear));
  if (slack) deductions.push(...scoreSlack(slack));
  if (dora && dora.summary.totalDeployments > 0) deductions.push(...scoreDORA(dora));

  const w = { github: 1, linear: 1, slack: 1, dora: 1, ...weights };
  const totalDeductions = deductions.reduce(
    (s, d) => s + d.points * (w[d.category as keyof typeof w] ?? 1),
    0
  );
  const maxPossible = deductions.reduce(
    (s, d) => s + d.maxPoints * (w[d.category as keyof typeof w] ?? 1),
    0
  );

  const score =
    maxPossible > 0
      ? Math.round(100 - (totalDeductions / maxPossible) * 100)
      : 100;

  const overallHealth: ScoreResult["overallHealth"] =
    score >= 80 ? "healthy" : score >= 60 ? "warning" : "critical";

  return { score, overallHealth, deductions };
}
