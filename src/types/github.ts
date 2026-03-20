export interface CycleTimeDataPoint {
  week: string;
  avgHoursToMerge: number;
  avgHoursToFirstReview: number;
  prsMerged: number;
}

export interface BottleneckPR {
  number: number;
  title: string;
  author: string;
  url: string;
  hoursWaiting: number;
}

export interface ReviewBottleneck {
  reviewer: string;
  avatarUrl: string;
  pendingReviews: number;
  pendingPRs: BottleneckPR[];
  completedReviews: number;
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

export interface OpenPR {
  number: number;
  title: string;
  author: string;
  url: string;
  daysOpen: number;
  reviewers: string[];
  isDraft: boolean;
}

export interface PRMetrics {
  cycleTimeTrend: CycleTimeDataPoint[];
  reviewBottlenecks: ReviewBottleneck[];
  stalePRs: StalePR[];
  openPRs: OpenPR[];
  summary: {
    totalOpenPRs: number;
    avgCycleTimeHours: number;
    stalePRCount: number;
    prsNeedingReview: number;
  };
}
