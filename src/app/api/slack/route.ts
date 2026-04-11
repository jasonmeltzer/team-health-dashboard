import { NextRequest } from "next/server";
import { fetchSlackMetrics } from "@/lib/slack";
import { getConfig, getConfigAsync } from "@/lib/config";
import { RateLimitError } from "@/lib/errors";
import { getOrFetch, buildCacheKey, getTTL, cache } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");

    if (!channelIdsStr || !(await getConfigAsync("SLACK_BOT_TOKEN"))) {
      return Response.json({ notConfigured: true });
    }

    const channelIds = channelIdsStr.split(",").map((id) => id.trim());
    const force = request.nextUrl.searchParams.get("force") === "true";

    const cacheKey = buildCacheKey("slack", { channels: channelIdsStr });
    const result = await getOrFetch(
      cacheKey,
      getTTL("slack"),
      () => fetchSlackMetrics(channelIds),
      { force, rethrow: (e) => e instanceof RateLimitError }
    );

    return Response.json({
      data: result.value,
      fetchedAt: result.cachedAt,
      cached: result.cached,
      stale: result.stale ?? false,
    });
  } catch (error) {
    if (error instanceof RateLimitError) {
      const channelIdsStrForKey = getConfig("SLACK_CHANNEL_IDS") ?? "";
      const cacheKey = buildCacheKey("slack", { channels: channelIdsStrForKey });
      const staleEntry = cache.get(cacheKey);
      if (staleEntry) {
        return Response.json({
          data: staleEntry.value,
          fetchedAt: new Date(staleEntry.cachedAt).toISOString(),
          cached: true,
          stale: true,
          rateLimited: true,
          rateLimitReset: error.resetAt?.toISOString() ?? null,
        });
      }
      return Response.json(
        { error: error.message, rateLimited: true, rateLimitReset: error.resetAt?.toISOString() ?? null },
        { status: 429 }
      );
    }
    const message =
      error instanceof Error ? error.message : "Failed to fetch Slack metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
