import { Octokit } from "octokit";
import type { PRMetrics, CycleTimeDataPoint, ReviewBottleneck, BottleneckPR, StalePR, OpenPR } from "@/types/github";
import { getISOWeek, daysBetween, hoursBetween, daysAgo } from "@/lib/utils";
import { getConfig } from "@/lib/config";

export async function fetchGitHubMetrics(
  owner: string,
  repo: string,
  staleDays: number = 7,
  lookbackDays: number = 30
): Promise<PRMetrics> {
  const octokit = new Octokit({ auth: getConfig("GITHUB_TOKEN") });
  const since = daysAgo(lookbackDays).toISOString();

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

  // Fetch reviews for up to 30 recent PRs (serves both cycle time + bottleneck analysis)
  const prsForReviews = recentPulls.slice(0, 30);
  const reviewResults = await Promise.allSettled(
    prsForReviews.map((pr) =>
      octokit.rest.pulls.listReviews({
        owner,
        repo,
        pull_number: pr.number,
        per_page: 30,
      })
    )
  );

  // Map PR number -> all reviews
  const prReviewsMap = new Map<
    number,
    { user: string; avatarUrl: string; submittedAt: string }[]
  >();
  prsForReviews.forEach((pr, i) => {
    const result = reviewResults[i];
    if (result.status !== "fulfilled") return;
    const reviews = result.value.data
      .filter((r) => r.user?.login && r.submitted_at)
      .map((r) => ({
        user: r.user!.login,
        avatarUrl: r.user!.avatar_url || "",
        submittedAt: r.submitted_at!,
      }));
    if (reviews.length > 0) prReviewsMap.set(pr.number, reviews);
  });

  // Cycle time trend (using first review from prReviewsMap)
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

    const reviews = prReviewsMap.get(pr.number);
    if (reviews && reviews.length > 0) {
      const firstReviewHours = hoursBetween(
        new Date(pr.created_at),
        new Date(reviews[0].submittedAt)
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

  // Review bottlenecks — combines pending requests + completed review load
  const now = new Date();
  const openPRs = recentPulls.filter((pr) => pr.state === "open");

  const reviewerMap = new Map<
    string,
    {
      avatarUrl: string;
      pendingPRs: BottleneckPR[];
      completedReviews: number;
      totalReviewHours: number;
    }
  >();

  const getOrCreate = (login: string, avatarUrl: string) => {
    if (!reviewerMap.has(login)) {
      reviewerMap.set(login, {
        avatarUrl,
        pendingPRs: [],
        completedReviews: 0,
        totalReviewHours: 0,
      });
    }
    return reviewerMap.get(login)!;
  };

  // Pending review requests on open PRs
  for (const pr of openPRs) {
    for (const reviewer of pr.requested_reviewers || []) {
      if (!reviewer || !("login" in reviewer)) continue;
      const entry = getOrCreate(reviewer.login, reviewer.avatar_url || "");
      entry.pendingPRs.push({
        number: pr.number,
        title: pr.title,
        author: pr.user?.login || "unknown",
        url: pr.html_url,
        hoursWaiting: Math.round(hoursBetween(new Date(pr.created_at), now) * 10) / 10,
      });
    }
  }

  // Completed reviews from all fetched PRs
  for (const [prNumber, reviews] of prReviewsMap) {
    const pr = recentPulls.find((p) => p.number === prNumber);
    if (!pr) continue;
    const seen = new Set<string>();
    for (const review of reviews) {
      if (seen.has(review.user)) continue;
      seen.add(review.user);
      const entry = getOrCreate(review.user, review.avatarUrl);
      entry.completedReviews += 1;
      entry.totalReviewHours += hoursBetween(
        new Date(pr.created_at),
        new Date(review.submittedAt)
      );
    }
  }

  const reviewBottlenecks: ReviewBottleneck[] = Array.from(
    reviewerMap.entries()
  )
    .map(([reviewer, data]) => ({
      reviewer,
      avatarUrl: data.avatarUrl,
      pendingReviews: data.pendingPRs.length,
      pendingPRs: data.pendingPRs.sort((a, b) => b.hoursWaiting - a.hoursWaiting),
      completedReviews: data.completedReviews,
      avgReviewTimeHours:
        data.completedReviews > 0
          ? Math.round((data.totalReviewHours / data.completedReviews) * 10) / 10
          : 0,
    }))
    .sort((a, b) => b.pendingReviews - a.pendingReviews || b.completedReviews - a.completedReviews);

  // Stale PRs (open > N days without update)
  const stalePRs: StalePR[] = openPRs
    .filter((pr) => daysBetween(new Date(pr.updated_at), now) > staleDays)
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

  // Open PRs list
  const openPRsList: OpenPR[] = openPRs
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.user?.login || "unknown",
      url: pr.html_url,
      daysOpen: daysBetween(new Date(pr.created_at), now),
      reviewers: (pr.requested_reviewers || [])
        .filter((r) => r !== null && "login" in r)
        .map((r) => (r as { login: string }).login),
      isDraft: pr.draft || false,
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen);

  return {
    cycleTimeTrend,
    reviewBottlenecks,
    stalePRs,
    openPRs: openPRsList,
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
