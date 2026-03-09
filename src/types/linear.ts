export interface VelocityDataPoint {
  cycleName: string;
  cycleNumber: number;
  completedIssues: number;
  completedPoints: number;
  scopeChange: number;
}

export interface StalledIssue {
  id: string;
  identifier: string;
  title: string;
  state: string;
  assignee: string | null;
  daysSinceLastUpdate: number;
  url: string;
}

export interface WorkloadEntry {
  assignee: string;
  avatarUrl: string | null;
  inProgress: number;
  todo: number;
  completed: number;
  totalPoints: number;
}

export interface LinearMetrics {
  velocityTrend: VelocityDataPoint[];
  stalledIssues: StalledIssue[];
  workloadDistribution: WorkloadEntry[];
  summary: {
    currentCycleName: string;
    currentCycleProgress: number;
    totalActiveIssues: number;
    stalledIssueCount: number;
    avgVelocity: number;
  };
}
