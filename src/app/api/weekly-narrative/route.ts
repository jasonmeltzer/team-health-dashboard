import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { generateWeeklyNarrative, isAIConfigured, getProvider, OllamaNotRunningError } from "@/lib/claude";
import { getConfig } from "@/lib/config";
import { getOrFetch, buildCacheKey, cache, CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    // Parse force param first — must happen before any early returns so manual mode
    // can honor force-refresh (clears the cached import for re-import).
    const force = request.nextUrl.searchParams.get("force") === "true";
    const provider = getProvider();

    if (provider === "manual") {
      // Force refresh in manual mode: clear the cached import so the user can re-import.
      // Without this, force-refresh would re-serve the existing import unchanged.
      if (force) {
        cache.delete("manual:weekly-narrative");
      }

      const cached = cache.get<{ narrative: string; weekOf: string; generatedAt: string }>("manual:weekly-narrative");
      if (cached) {
        // TTL check at read time — the 2x cleanup timer is a memory safety net only,
        // not the authoritative TTL gate. This prevents stale imports after navigate-away/back.
        const age = Date.now() - cached.cachedAt;
        if (age > cached.ttlMs) {
          cache.delete("manual:weekly-narrative");
          // fall through to "no import" response below
        } else {
          return Response.json({
            data: { ...cached.value, manualMode: true },
            fetchedAt: new Date(cached.cachedAt).toISOString(),
            cached: true,
          });
        }
      }

      // No imported response yet (or TTL expired or force-cleared)
      return Response.json({ data: { manualMode: true }, fetchedAt: new Date().toISOString() });
    }

    if (!isAIConfigured()) {
      return Response.json({ notConfigured: true });
    }

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
            ? getOrFetch(buildCacheKey("linear", { mode: "auto", days: 42 }), CACHE_TTL.linear, () => fetchLinearMetrics(teamId)).then((r) => r.value).catch(() => null)
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
