import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { getConfig } from "@/lib/config";
import { asRateLimitError } from "@/lib/utils";
import { getOrFetch, buildCacheKey, CACHE_TTL } from "@/lib/cache";

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
      CACHE_TTL.github,
      () => fetchGitHubMetrics(owner, repo, staleDays, lookbackDays),
      { force }
    );

    return Response.json({
      data: result.value,
      fetchedAt: result.cachedAt,
      cached: result.cached,
    });
  } catch (error) {
    const rateLimit = asRateLimitError(error);
    if (rateLimit) {
      return Response.json({
        rateLimited: true,
        rateLimitReset: rateLimit.resetAt.toISOString(),
        error: rateLimit.message,
      }, { status: 429 });
    }
    const message =
      error instanceof Error ? error.message : "Failed to fetch GitHub metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
