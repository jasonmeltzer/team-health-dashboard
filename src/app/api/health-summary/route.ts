import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { generateHealthSummary, isAIConfigured, getProvider, OllamaNotRunningError } from "@/lib/claude";
import { computeHealthScore, type ScoreDeduction } from "@/lib/scoring";
import { getConfig } from "@/lib/config";
import { getOrFetch, buildCacheKey, cache, CACHE_TTL } from "@/lib/cache";

interface HealthSummaryData {
  overallHealth: string;
  score: number;
  scoreBreakdown: ScoreDeduction[];
  insights: string[];
  recommendations: string[];
  generatedAt: string;
  manualMode?: boolean;
}

/** Fetch all configured source data (reuses cache). */
async function fetchSourceData() {
  const owner = getConfig("GITHUB_ORG");
  const repo = getConfig("GITHUB_REPO");
  const teamId = getConfig("LINEAR_TEAM_ID");
  const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");
  const channelIds = channelIdsStr?.split(",").map((id) => id.trim());

  const githubConfigured = !!(owner && repo && getConfig("GITHUB_TOKEN"));
  const [github, linear, slack, dora] = await Promise.all([
    githubConfigured
      ? getOrFetch(buildCacheKey("github", { staleDays: 7, lookbackDays: 30 }), CACHE_TTL.github, () => fetchGitHubMetrics(owner!, repo!)).then((r) => r.value).catch(() => null)
      : null,
    teamId && getConfig("LINEAR_API_KEY")
      ? getOrFetch(buildCacheKey("linear", { mode: "cycles", days: 42 }), CACHE_TTL.linear, () => fetchLinearMetrics(teamId)).then((r) => r.value).catch(() => null)
      : null,
    channelIds && getConfig("SLACK_BOT_TOKEN")
      ? getOrFetch(buildCacheKey("slack", { channels: channelIdsStr }), CACHE_TTL.slack, () => fetchSlackMetrics(channelIds)).then((r) => r.value).catch(() => null)
      : null,
    githubConfigured
      ? getOrFetch(buildCacheKey("dora", { lookbackDays: 30 }), CACHE_TTL.dora, () => fetchDORAMetrics(owner!, repo!)).then((r) => r.value).catch(() => null)
      : null,
  ]);

  if (!github && !linear && !slack) {
    throw new Error(
      "No data sources available. Configure at least one of: GitHub, Linear, or Slack."
    );
  }

  return { github, linear, slack, dora };
}

export async function GET(request: NextRequest) {
  try {
    const force = request.nextUrl.searchParams.get("force") === "true";
    const provider = getProvider();

    if (provider === "manual") {
      // Check if there's a previously imported response in the cache
      const cached = cache.get<HealthSummaryData>("health-summary");
      if (cached && !force) {
        // Serve the imported response, tagged with manualMode
        const data = { ...cached.value, manualMode: true };
        return Response.json({
          data,
          fetchedAt: new Date(cached.cachedAt).toISOString(),
          cached: true,
        });
      }

      // No import (or force refresh) — return deterministic score + manualMode flag
      const { github, linear, slack, dora } = await fetchSourceData();
      const scoreResult = computeHealthScore(github, linear, slack, dora);
      const data: HealthSummaryData = {
        overallHealth: scoreResult.overallHealth,
        score: scoreResult.score,
        scoreBreakdown: scoreResult.deductions,
        insights: scoreResult.deductions
          .filter((d) => d.points > 0)
          .slice(0, 5)
          .map((d) => `${d.signal}: ${d.detail}`),
        recommendations: [],
        generatedAt: new Date().toISOString(),
        manualMode: true,
      };

      return Response.json({
        data,
        fetchedAt: data.generatedAt,
        cached: false,
      });
    }

    // Ollama / Anthropic — use getOrFetch for caching
    const result = await getOrFetch<HealthSummaryData>(
      "health-summary",
      CACHE_TTL.healthSummary,
      async () => {
        const { github, linear, slack, dora } = await fetchSourceData();
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
          recommendations: ["Connect an AI provider (Ollama, Anthropic, or Manual) for richer insights."],
          generatedAt: new Date().toISOString(),
        };
      },
      { force, rethrow: (e) => e instanceof OllamaNotRunningError }
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
