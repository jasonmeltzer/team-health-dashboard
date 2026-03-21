export type DORARating = "elite" | "high" | "medium" | "low";

export interface DeploymentRecord {
  id: string;
  environment: string;
  sha: string;
  ref: string;
  createdAt: string;
  status: "success" | "failure" | "error" | "pending";
  url: string;
  creator: string;
  description: string | null;
  causedIncident: boolean;
}

export interface IncidentRecord {
  number: number;
  title: string;
  url: string;
  labels: string[];
  createdAt: string;
  closedAt: string | null;
  resolutionHours: number | null;
}

export interface DORADataPoint {
  period: string; // ISO week e.g. "2026-W12"
  deploymentCount: number;
  successCount: number;
  failureCount: number;
  otherCount: number; // pending
  avgLeadTimeHours: number | null;
  changeFailureRate: number; // percentage 0-100
  mttrHours: number | null;
}

export interface DORASummary {
  deploymentFrequency: number; // deploys per week avg
  deploymentFrequencyRating: DORARating;
  avgLeadTimeHours: number | null;
  leadTimeRating: DORARating | null;
  changeFailureRate: number; // percentage
  changeFailureRateRating: DORARating;
  mttrHours: number | null;
  mttrRating: DORARating | null;
  totalDeployments: number;
  totalFailures: number;
  openIncidents: number;
}

export interface DORAMetrics {
  trend: DORADataPoint[];
  deployments: DeploymentRecord[];
  incidents: IncidentRecord[];
  summary: DORASummary;
  source: "deployments" | "releases" | "merges";
}
