export interface CycleTimeDataPoint {
  week: string;
  avgHoursToMerge: number;
  avgHoursToFirstReview: number;
  prsMerged: number;
}

export interface ReviewBottleneck {
  reviewer: string;
  avatarUrl: string;
  pendingReviews: number;
  avgReviewTimeHours: number;
}

export interface StalePR {
  number: number;
  title: string;
  author: string;
  url: string;
  daysSinceUpdate: number;
  reviewers: string[];
}

export interface PRMetrics {
  cycleTimeTrend: CycleTimeDataPoint[];
  reviewBottlenecks: ReviewBottleneck[];
  stalePRs: StalePR[];
  summary: {
    totalOpenPRs: number;
    avgCycleTimeHours: number;
    stalePRCount: number;
    prsNeedingReview: number;
  };
}
