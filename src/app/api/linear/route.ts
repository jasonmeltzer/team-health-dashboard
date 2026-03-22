import { NextRequest } from "next/server";
import { fetchLinearMetrics } from "@/lib/linear";
import { getConfig } from "@/lib/config";
import { getOrFetch, buildCacheKey, CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const teamId = getConfig("LINEAR_TEAM_ID");

    if (!teamId || !getConfig("LINEAR_API_KEY")) {
      return Response.json({ notConfigured: true });
    }

    const mode = request.nextUrl.searchParams.get("mode") as
      | "cycles"
      | "weekly"
      | null;
    const daysParam = request.nextUrl.searchParams.get("days");
    const lookbackDays = daysParam ? parseInt(daysParam, 10) : 42;
    const force = request.nextUrl.searchParams.get("force") === "true";

    const cacheKey = buildCacheKey("linear", {
      mode: mode || "auto",
      days: lookbackDays,
    });
    const result = await getOrFetch(
      cacheKey,
      CACHE_TTL.linear,
      () => fetchLinearMetrics(teamId, mode || undefined, lookbackDays),
      { force }
    );

    return Response.json({
      data: result.value,
      fetchedAt: result.cachedAt,
      cached: result.cached,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Linear metrics";
    console.error("[Linear API]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
