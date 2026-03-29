import type { ScoreDeduction } from "./metrics";

export interface TrendSnapshot {
  id: number;
  date: string;        // YYYY-MM-DD
  createdAt: string;   // ISO 8601
  score: number;
  band: "healthy" | "warning" | "critical";
  deductions: ScoreDeduction[];
}

export interface TrendsResponse {
  snapshots: TrendSnapshot[];
  dateRange: { days: number; from: string; to: string };
}
