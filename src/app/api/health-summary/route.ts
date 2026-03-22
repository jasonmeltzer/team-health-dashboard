import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { generateHealthSummary, isAIConfigured, OllamaNotRunningError } from "@/lib/claude";
import { computeHealthScore } from "@/lib/scoring";
import { getConfig } from "@/lib/config";
import { getOrFetch, CACHE_TTL } from "@/lib/cache";

interface HealthSummaryData {
  overallHealth: string;
  score: number;
  scoreBreakdown: unknown[];
  insights: string[];
  recommendations: string[];
  generatedAt: string;
}

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "true";

    const result = await getOrFetch<HealthSummaryData>(
      "health-summary",
      CACHE_TTL.healthSummary,
      async () => {
        const owner = getConfig("GITHUB_ORG");
        const repo = getConfig("GITHUB_REPO");
        const teamId = getConfig("LINEAR_TEAM_ID");
        const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");
        const channelIds = channelIdsStr?.split(",").map((id) => id.trim());

        const githubConfigured = !!(owner && repo && getConfig("GITHUB_TOKEN"));
        const [github, linear, slack, dora] = await Promise.all([
          githubConfigured
            ? fetchGitHubMetrics(owner!, repo!).catch(() => null)
            : null,
          teamId && getConfig("LINEAR_API_KEY")
            ? fetchLinearMetrics(teamId).catch(() => null)
            : null,
          channelIds && getConfig("SLACK_BOT_TOKEN")
            ? fetchSlackMetrics(channelIds).catch(() => null)
            : null,
          githubConfigured
            ? fetchDORAMetrics(owner!, repo!).catch(() => null)
            : null,
        ]);

        if (!github && !linear && !slack) {
          throw new Error(
            "No data sources available. Configure at least one of: GitHub, Linear, or Slack."
          );
        }

        const scoreResult = computeHealthScore(github, linear, slack, dora);

        if (isAIConfigured()) {
          const summary = await generateHealthSummary(github, linear, slack, scoreResult, dora);
          return summary as HealthSummaryData;
        }

        return {
          overallHealth: scoreResult.overallHealth,
          score: scoreResult.score,
          scoreBreakdown: scoreResult.deductions,
          insights: scoreResult.deductions
            .filter((d) => d.points > 0)
            .map((d) => `${d.signal}: ${d.detail}`),
          recommendations: ["Connect an AI provider (Ollama or Anthropic) for richer insights."],
          generatedAt: new Date().toISOString(),
        };
      },
      { force }
    );

    return Response.json({
      data: result.value,
      fetchedAt: result.cachedAt,
      cached: result.cached,
    });
  } catch (error) {
    if (error instanceof OllamaNotRunningError) {
      return Response.json({ setupHint: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Failed to generate health summary";
    // "No data sources" comes through as an Error now
    const status = message.includes("No data sources") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
