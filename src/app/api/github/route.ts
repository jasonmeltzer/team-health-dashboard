import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { getConfig } from "@/lib/config";
import { RateLimitError } from "@/lib/errors";
import { getOrFetch, buildCacheKey, getTTL, cache } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get("owner") || getConfig("GITHUB_ORG");
    const repo = searchParams.get("repo") || getConfig("GITHUB_REPO");

    if (!owner || !repo || !getConfig("GITHUB_TOKEN")) {
      return Response.json({ notConfigured: true });
    }

    const staleDaysParam = searchParams.get("staleDays");
    const staleDaysParsed = parseInt(staleDaysParam ?? "", 10);
    const staleDays = !isNaN(staleDaysParsed) && staleDaysParsed > 0 ? staleDaysParsed : 7;
    const lookbackParam = searchParams.get("lookbackDays");
    const lookbackParsed = parseInt(lookbackParam ?? "", 10);
    const lookbackDays = !isNaN(lookbackParsed) && lookbackParsed > 0 ? lookbackParsed : 30;
    const force = searchParams.get("force") === "true";

    const cacheKey = buildCacheKey("github", { staleDays, lookbackDays });
    const result = await getOrFetch(
      cacheKey,
      getTTL("github"),
      () => fetchGitHubMetrics(owner, repo, staleDays, lookbackDays),
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
      const cacheKey = buildCacheKey("github", {
        staleDays: parseInt(new URLSearchParams(request.nextUrl.search).get("staleDays") ?? "7", 10) || 7,
        lookbackDays: parseInt(new URLSearchParams(request.nextUrl.search).get("lookbackDays") ?? "30", 10) || 30,
      });
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
      error instanceof Error ? error.message : "Failed to fetch GitHub metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
