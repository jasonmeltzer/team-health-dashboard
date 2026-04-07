import { RequestError } from "@octokit/request-error";
import {
  fetchAndStorePRs,
  readPRs,
  readReviewsForRepo,
  type StoredPR,
  type StoredReview,
} from "team-data-core";
import type { PRMetrics, CycleTimeDataPoint, ReviewBottleneck, BottleneckPR, StalePR, OpenPR } from "@/types/github";
import { getISOWeek, daysBetween, hoursBetween, daysAgo } from "@/lib/utils";
import { getConfig } from "@/lib/config";
import { RateLimitError } from "@/lib/errors";

export async function fetchGitHubMetrics(
  owner: string,
  repo: string,
  staleDays: number = 7,
  lookbackDays: number = 30
): Promise<PRMetrics> {
  try {
    return await _fetchGitHubMetrics(owner, repo, staleDays, lookbackDays);
  } catch (error) {
    if (error instanceof RequestError) {
      if (
        error.status === 429 ||
        (error.status === 403 && error.response?.headers?.["x-ratelimit-remaining"] === "0")
      ) {
        const retryAfter = error.response?.headers?.["retry-after"];
        const resetAt = error.response?.headers?.["x-ratelimit-reset"];
        throw new RateLimitError(
          "github",
          retryAfter ? parseInt(String(retryAfter), 10) * 1000 : undefined,
          resetAt ? new Date(parseInt(String(resetAt), 10) * 1000) : undefined
        );
      }
    }
    throw error;
  }
}

async function _fetchGitHubMetrics(
  owner: string,
  repo: string,
  staleDays: number = 7,
  lookbackDays: number = 30
): Promise<PRMetrics> {
  // Fetch from GitHub API and store in shared DB
  await fetchAndStorePRs(getConfig("GITHUB_TOKEN")!, owner, repo, { lookbackDays });

  // Read back stored PRs and reviews
  const storedPRs: StoredPR[] = readPRs(owner, repo, { lookbackDays });
  const allReviews: StoredReview[] = readReviewsForRepo(owner, repo);

  const now = new Date();
  const sinceDate = daysAgo(lookbackDays);

  // Filter to PRs created within the lookback window
  // (readPRs filters by updated_at; we also want created_at >= since for cycle time accuracy)
  const recentPRs = storedPRs.filter(
    (pr) => new Date(pr.created_at) >= sinceDate
  );

  // Build a set of valid PR IDs for filtering reviews to the lookback window.
  // readReviewsForRepo returns all reviews in the DB; as the shared DB grows
  // over months, we only want reviews for PRs in our lookback window.
  const validPrIds = new Set(storedPRs.map((pr) => `${owner}/${repo}#${pr.number}`));
  const storedReviews = allReviews.filter((r) => validPrIds.has(r.pr_id));

  // Build a map from pr_id -> reviews (sorted by submitted_at asc)
  // pr_id format: "owner/repo#number"
  const reviewsByPrId = new Map<string, StoredReview[]>();
  for (const review of storedReviews) {
    const list = reviewsByPrId.get(review.pr_id) ?? [];
    list.push(review);
    reviewsByPrId.set(review.pr_id, list);
  }
  // Sort each PR's reviews by submitted_at ascending
  for (const [prId, reviews] of reviewsByPrId) {
    reviewsByPrId.set(
      prId,
      reviews.sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
    );
  }

  // Compute cycle time trend (by week) — merged PRs only
  const mergedPRs = recentPRs.filter((pr) => pr.state === "merged" && pr.merged_at);
  const weeklyData = new Map<
    string,
    { totalHours: number; count: number; reviewHours: number; reviewCount: number }
  >();

  for (const pr of mergedPRs) {
    const week = getISOWeek(new Date(pr.merged_at!));
    const cycleHours = hoursBetween(new Date(pr.created_at), new Date(pr.merged_at!));

    const entry = weeklyData.get(week) ?? {
      totalHours: 0,
      count: 0,
      reviewHours: 0,
      reviewCount: 0,
    };
    entry.totalHours += cycleHours;
    entry.count += 1;

    const prId = `${owner}/${repo}#${pr.number}`;
    const reviews = reviewsByPrId.get(prId);
    if (reviews && reviews.length > 0) {
      const firstReviewHours = hoursBetween(
        new Date(pr.created_at),
        new Date(reviews[0].submitted_at)
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

  // Review bottlenecks — completed review load per reviewer
  // Note: requested_reviewers (pending review requests) are not stored in the shared DB.
  // Bottleneck data reflects completed reviews only; pendingPRs will be empty.
  const openPRsStored = recentPRs.filter((pr) => pr.state === "open");

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

  // Completed reviews from all stored reviews (deduplicated: one count per reviewer per PR)
  const seenReviewerPerPR = new Set<string>();
  for (const review of storedReviews) {
    // Find the PR this review belongs to
    const pr = storedPRs.find((p) => `${owner}/${repo}#${p.number}` === review.pr_id);
    if (!pr) continue;
    // Only count actual review actions (not comments/pending drafts)
    const state = review.state.toUpperCase();
    if (state !== "APPROVED" && state !== "CHANGES_REQUESTED" && state !== "DISMISSED") continue;
    // Deduplicate: count each reviewer only once per PR
    const dedupeKey = `${review.pr_id}:${review.reviewer}`;
    if (seenReviewerPerPR.has(dedupeKey)) continue;
    seenReviewerPerPR.add(dedupeKey);

    const entry = getOrCreate(review.reviewer, review.avatar_url ?? "");
    entry.completedReviews += 1;
    entry.totalReviewHours += hoursBetween(
      new Date(pr.created_at),
      new Date(review.submitted_at)
    );
  }

  const reviewBottlenecks: ReviewBottleneck[] = Array.from(reviewerMap.entries())
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
  const stalePRs: StalePR[] = openPRsStored
    .filter((pr) => daysBetween(new Date(pr.updated_at), now) > staleDays)
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      url: `https://github.com/${owner}/${repo}/pull/${pr.number}`,
      daysSinceUpdate: daysBetween(new Date(pr.updated_at), now),
      reviewers: [], // requested_reviewers not stored in shared DB
    }))
    .sort((a, b) => b.daysSinceUpdate - a.daysSinceUpdate);

  const avgCycleTime =
    mergedPRs.length > 0
      ? Math.round(
          (mergedPRs.reduce(
            (sum, pr) =>
              sum + hoursBetween(new Date(pr.created_at), new Date(pr.merged_at!)),
            0
          ) /
            mergedPRs.length) *
            10
        ) / 10
      : 0;

  // Open PRs list
  const openPRsList: OpenPR[] = openPRsStored
    .map((pr) => ({
      number: pr.number,
      title: pr.title,
      author: pr.author,
      url: `https://github.com/${owner}/${repo}/pull/${pr.number}`,
      daysOpen: daysBetween(new Date(pr.created_at), now),
      reviewers: [], // requested_reviewers not stored in shared DB
      isDraft: pr.is_draft === 1,
    }))
    .sort((a, b) => b.daysOpen - a.daysOpen);

  return {
    cycleTimeTrend,
    reviewBottlenecks,
    stalePRs,
    openPRs: openPRsList,
    summary: {
      totalOpenPRs: openPRsStored.length,
      avgCycleTimeHours: avgCycleTime,
      stalePRCount: stalePRs.length,
      prsNeedingReview: openPRsStored.filter(
        (pr) => {
          // Check if any open PR has been reviewed (as a proxy for needing review)
          const prId = `${owner}/${repo}#${pr.number}`;
          const reviews = reviewsByPrId.get(prId);
          return !reviews || reviews.length === 0;
        }
      ).length,
    },
  };
}
