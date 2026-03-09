export interface HealthSummary {
  overallHealth: "healthy" | "warning" | "critical";
  score: number;
  insights: string[];
  recommendations: string[];
  generatedAt: string;
}

export interface WeeklyNarrative {
  narrative: string;
  weekOf: string;
  generatedAt: string;
}
