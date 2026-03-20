export interface VelocityDataPoint {
  cycleName: string;
  cycleNumber?: number;
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

export interface WorkloadIssue {
  identifier: string;
  title: string;
  state: string;
  stateType: string;
  estimate: number | null;
  url: string;
}

export interface WorkloadEntry {
  assignee: string;
  avatarUrl: string | null;
  inProgress: number;
  todo: number;
  completed: number;
  totalPoints: number;
  issues: WorkloadIssue[];
}

export interface TimeInStateStats {
  state: string;
  count: number;
  minDays: number;
  maxDays: number;
  meanDays: number;
  medianDays: number;
  p90Days: number;
}

export interface TimeInStateIssue {
  identifier: string;
  title: string;
  state: string;
  stateType: string;
  assignee: string | null;
  daysInState: number;
  url: string;
}

export interface LeadTimeTrendPoint {
  sortKey: string;
  week: string;
  avgDays: number;
  count: number;
}

export interface TimeInStateData {
  stats: TimeInStateStats[];
  issues: TimeInStateIssue[];
  flowEfficiency: number;
  leadTimeTrend: LeadTimeTrendPoint[];
}

export interface CycleInfo {
  id: string;
  name: string;
  isCurrent: boolean;
}

export interface LinearMetrics {
  mode: "cycles" | "continuous";
  velocityTrend: VelocityDataPoint[];
  stalledIssues: StalledIssue[];
  workloadDistribution: WorkloadEntry[];
  availableCycles: CycleInfo[];
  workloadByCycle: Record<string, WorkloadEntry[]>;
  timeInState: TimeInStateData;
  summary: {
    currentCycleName: string;
    currentCycleProgress: number;
    totalActiveIssues: number;
    stalledIssueCount: number;
    avgVelocity: number;
  };
}
