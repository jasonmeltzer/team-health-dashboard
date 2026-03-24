import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { generateWeeklyNarrative, isAIConfigured, getProvider, OllamaNotRunningError } from "@/lib/claude";
import { getConfig } from "@/lib/config";
import { getOrFetch, buildCacheKey, CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const provider = getProvider();
    if (provider === "manual") {
      // Manual mode: return manualMode flag so UI shows export/import controls
      return Response.json({ data: { manualMode: true }, fetchedAt: new Date().toISOString() });
    }

    if (!isAIConfigured()) {
      return Response.json({ notConfigured: true });
    }

    const force = request.nextUrl.searchParams.get("force") === "true";

    const result = await getOrFetch(
      "weekly-narrative",
      CACHE_TTL.weeklyNarrative,
      async () => {
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
          throw new Error("No data sources available.");
        }

        return await generateWeeklyNarrative(github, linear, slack, dora);
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
      error instanceof Error
        ? error.message
        : "Failed to generate weekly narrative";
    const status = message.includes("No data sources") ? 400 : 500;
    return Response.json({ error: message }, { status });
  }
}
