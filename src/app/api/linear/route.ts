import { NextRequest } from "next/server";
import { fetchLinearMetrics } from "@/lib/linear";
import { getConfig } from "@/lib/config";
import { RateLimitError } from "@/lib/errors";
import { getOrFetch, buildCacheKey, getTTL, cache } from "@/lib/cache";

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
      getTTL("linear"),
      () => fetchLinearMetrics(teamId, mode || undefined, lookbackDays),
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
      const modeParam = request.nextUrl.searchParams.get("mode") as "cycles" | "weekly" | null;
      const daysParam = request.nextUrl.searchParams.get("days");
      const lookbackDays = daysParam ? parseInt(daysParam, 10) : 42;
      const cacheKey = buildCacheKey("linear", { mode: modeParam || "auto", days: lookbackDays });
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
      error instanceof Error ? error.message : "Failed to fetch Linear metrics";
    console.error("[Linear API]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
