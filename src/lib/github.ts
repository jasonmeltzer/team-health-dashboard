import { Octokit } from "octokit";
import type { PRMetrics, CycleTimeDataPoint, ReviewBottleneck, StalePR } from "@/types/github";
import { getISOWeek, daysBetween, hoursBetween, daysAgo } from "@/lib/utils";

export async function fetchGitHubMetrics(
  owner: string,
  repo: string
): Promise<PRMetrics> {
  const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  const since = daysAgo(30).toISOString();

  // Fetch recent PRs — single page of 100 (sorted by updated desc),
  // which is enough for most repos' last 30 days
  const { data: pulls } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 100,
  });

  const recentPulls = pulls.filter(
    (pr) => new Date(pr.created_at) >= new Date(since)
  );

  // Compute cycle time trend (by week)
  const mergedPRs = recentPulls.filter((pr) => pr.merged_at);
  const weeklyData = new Map<
    string,
    { totalHours: number; count: number; reviewHours: number; reviewCount: number }
  >();

  // Fetch first review for up to 20 merged PRs (to avoid rate limits)
  const prsToFetchReviews = mergedPRs.slice(0, 20);
  const reviewResults = await Promise.allSettled(
    prsToFetchReviews.map((pr) =>
      octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 1,
      })
    )
  );
  const reviewMap = new Map<number, string>();
  prsToFetchReviews.forEach((pr, i) => {
    const result = reviewResults[i];
    if (
      result.status === "fulfilled" &&
      result.value.data.length > 0 &&
      result.value.data[0].submitted_at
    ) {
      reviewMap.set(pr.number, result.value.data[0].submitted_at);
    }
  });

  for (const pr of mergedPRs) {
    const week = getISOWeek(new Date(pr.created_at));
    const cycleHours = hoursBetween(
      new Date(pr.created_at),
      new Date(pr.merged_at!)
    );

    const entry = weeklyData.get(week) || {
      totalHours: 0,
      count: 0,
      reviewHours: 0,
      reviewCount: 0,
    };
    entry.totalHours += cycleHours;
    entry.count += 1;

    const firstReviewAt = reviewMap.get(pr.number);
    if (firstReviewAt) {
      const firstReviewHours = hoursBetween(
        new Date(pr.created_at),
        new Date(firstReviewAt)
      );
      entry.reviewHours += firstReviewHours;
      entry.reviewCount += 1;
    }

    weeklyData.set(week, entry);
  }

  const cycleTimeTrend: CycleTimeDataPoint[] = Array.from(weeklyData.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, data]) => ({
      week,
      avgHoursToMerge: Math.round((data.totalHours / data.count) * 10) / 10,
      avgHoursToFirstReview:
        data.reviewCount > 0
          ? Math.round((data.reviewHours / data.reviewCount) * 10) / 10
          : 0,
      prsMerged: data.count,
    }));

  // Review bottlenecks (open PRs with pending reviewers)
  const openPRs = recentPulls.filter((pr) => pr.state === "open");
  const reviewerMap = new Map<
    string,
    { avatarUrl: string; pending: number; totalReviewHours: number; reviewCount: number }
  >();

  for (const pr of openPRs) {
    const requestedReviewers = pr.requested_reviewers || [];
    for (const reviewer of requestedReviewers) {
      if (!reviewer || !("login" in reviewer)) continue;
      const entry = reviewerMap.get(reviewer.login) || {
        avatarUrl: reviewer.avatar_url || "",
        pending: 0,
        totalReviewHours: 0,
        reviewCount: 0,
      };
      entry.pending += 1;
      reviewerMap.set(reviewer.login, entry);
    }
  }

  const reviewBottlenecks: ReviewBottleneck[] = Array.from(
    reviewerMap.entries()
  )
    .map(([reviewer, data]) => ({
      reviewer,
      avatarUrl: data.avatarUrl,
      pendingReviews: data.pending,
      avgReviewTimeHours:
        data.reviewCount > 0
          ? Math.round((data.totalReviewHours / data.reviewCount) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.pendingReviews - a.pendingReviews);

  // Stale PRs (open > 7 days without update)
  const now = new Date();
  const stalePRs: StalePR[] = openPRs
    .filter((pr) => daysBetween(new Date(pr.updated_at), now) > 7)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || "unknown",
      url: pr.html_url,
      daysSinceUpdate: daysBetween(new Date(pr.updated_at), now),
      reviewers: (pr.requested_reviewers || [])
        .filter((r) => r !== null && "login" in r)
        .map((r) => (r as { login: string }).login),
    }))
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  const avgCycleTime =
    mergedPRs.length > 0
      ? Math.round(
          (mergedPRs.reduce(
            (sum, pr) =>
              sum +
              hoursBetween(new Date(pr.created_at), new Date(pr.merged_at!)),
            0
          ) /
            mergedPRs.length) *
            10
        ) / 10
      : 0;

  return {
    cycleTimeTrend,
    reviewBottlenecks,
    stalePRs,
    summary: {
      totalOpenPRs: openPRs.length,
      avgCycleTimeHours: avgCycleTime,
      stalePRCount: stalePRs.length,
      prsNeedingReview: openPRs.filter(
        (pr) => (pr.requested_reviewers || []).length > 0
      ).length,
    },
  };
}
