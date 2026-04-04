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

export interface CycleSummary {
  progress: number;
  activeIssues: number;
  stalledCount: number;
  completedPoints: number;
}

export interface ScopeChange {
  issueId: string;
  identifier: string;   // e.g. "ENG-123"
  title: string;
  url: string;
  type: "added" | "removed";
  actor: string | null;       // display name, null if unknown
  changedAt: string;          // ISO timestamp
  destination: string | null; // cycle name if moved to another cycle, "backlog" if removed, null if unknown
  source: "history" | "snapshot";  // attribution quality indicator
}

export interface ScopeChangeSummary {
  added: number;
  removed: number;
  net: number;            // added - removed (positive = scope grew)
  changes: ScopeChange[]; // sorted chronologically (oldest first)
  hasColdStartGap: boolean;         // true when earliest snapshot postdates cycle startsAt
  issueCountAtStart: number | null; // from issueCountHistory[0], null if unavailable
  issueCountNow: number;            // current issues.nodes.length
}

export interface LinearMetrics {
  mode: "cycles" | "continuous";
  velocityTrend: VelocityDataPoint[];
  stalledIssues: StalledIssue[];
  workloadDistribution: WorkloadEntry[];
  availableCycles: CycleInfo[];
  workloadByCycle: Record<string, WorkloadEntry[]>;
  timeInState: TimeInStateData;
  timeInStateByCycle: Record<string, TimeInStateData>;
  stalledIssuesByCycle: Record<string, StalledIssue[]>;
  summaryByCycle: Record<string, CycleSummary>;
  summary: {
    currentCycleName: string;
    currentCycleProgress: number;
    totalActiveIssues: number;
    stalledIssueCount: number;
    avgVelocity: number;
  };
  scopeChanges?: ScopeChangeSummary | null;
  scopeChangesByCycle?: Record<string, ScopeChangeSummary>;
}
