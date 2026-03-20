export interface ScoreDeduction {
  signal: string;
  category: "github" | "linear" | "slack";
  points: number;
  maxPoints: number;
  detail: string;
}

export interface HealthSummary {
  overallHealth: "healthy" | "warning" | "critical";
  score: number;
  scoreBreakdown: ScoreDeduction[];
  insights: string[];
  recommendations: string[];
  generatedAt: string;
}

export interface WeeklyNarrative {
  narrative: string;
  weekOf: string;
  generatedAt: string;
}
