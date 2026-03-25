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
  hasImport?: boolean;
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
      // Always re-compute the deterministic score (even on force refresh)
      const { github, linear, slack, dora } = await fetchSourceData();
      const scoreResult = computeHealthScore(github, linear, slack, dora);

      // Force refresh in manual mode: clear the cached import so the user can re-import.
      // Source data cache is unaffected — the deterministic score is always fresh.
      if (force) {
        cache.delete("manual:health-summary");
      }

      const imported = cache.get<HealthSummaryData>("manual:health-summary");
      if (imported) {
        // TTL check at read time — the 2x cleanup timer is a memory safety net only,
        // not the authoritative TTL gate. This prevents stale imports after navigate-away/back.
        const age = Date.now() - imported.cachedAt;
        if (age > imported.ttlMs) {
          cache.delete("manual:health-summary");
          // fall through to "no import" response below
        } else {
          const data: HealthSummaryData = {
            overallHealth: scoreResult.overallHealth,
            score: scoreResult.score,
            scoreBreakdown: scoreResult.deductions,
            insights: imported.value.insights,
            recommendations: imported.value.recommendations,
            generatedAt: imported.value.generatedAt,
            manualMode: true,
            hasImport: true,
          };
          return Response.json({
            data,
            fetchedAt: new Date(imported.cachedAt).toISOString(),
            cached: !force,
          });
        }
      }

      // No import yet (or TTL expired or force-cleared) — return score with fallback insights
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
        hasImport: false,
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
