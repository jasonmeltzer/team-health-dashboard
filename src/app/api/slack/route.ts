import { NextRequest } from "next/server";
import { fetchSlackMetrics } from "@/lib/slack";
import { getConfig } from "@/lib/config";
import { getOrFetch, buildCacheKey, CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");

    if (!channelIdsStr || !getConfig("SLACK_BOT_TOKEN")) {
      return Response.json({ notConfigured: true });
    }

    const channelIds = channelIdsStr.split(",").map((id) => id.trim());
    const force = request.nextUrl.searchParams.get("force") === "true";

    const cacheKey = buildCacheKey("slack", {});
    const result = await getOrFetch(
      cacheKey,
      CACHE_TTL.slack,
      () => fetchSlackMetrics(channelIds),
      { force }
    );

    return Response.json({
      data: result.value,
      fetchedAt: result.cachedAt,
      cached: result.cached,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Slack metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
