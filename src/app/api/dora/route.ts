import { NextRequest } from "next/server";
import { fetchDORAMetrics } from "@/lib/dora";
import { getConfig } from "@/lib/config";
import { RateLimitError } from "@/lib/errors";
import { getOrFetch, buildCacheKey, CACHE_TTL, cache } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const owner = getConfig("GITHUB_ORG");
    const repo = getConfig("GITHUB_REPO");

    if (!owner || !repo || !getConfig("GITHUB_TOKEN")) {
      return Response.json({ notConfigured: true });
    }

    const searchParams = request.nextUrl.searchParams;
    const lookbackParam = searchParams.get("lookbackDays");
    const lookbackParsed = parseInt(lookbackParam ?? "", 10);
    const lookbackDays = !isNaN(lookbackParsed) && lookbackParsed > 0 ? lookbackParsed : 30;
    const force = searchParams.get("force") === "true";

    const source =
      (getConfig("DORA_DEPLOYMENT_SOURCE") as
        | "deployments"
        | "releases"
        | "merges"
        | "auto"
        | undefined) || "auto";
    const environment = getConfig("DORA_ENVIRONMENT") || "production";
    const labelsRaw = getConfig("DORA_INCIDENT_LABELS");
    const incidentLabels = labelsRaw
      ? labelsRaw.split(",").map((l) => l.trim())
      : undefined;

    const cacheKey = buildCacheKey("dora", { lookbackDays });
    const result = await getOrFetch(
      cacheKey,
      CACHE_TTL.dora,
      () =>
        fetchDORAMetrics(owner, repo, lookbackDays, {
          source,
          environment,
          incidentLabels,
        }),
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
      const lookbackParam = request.nextUrl.searchParams.get("lookbackDays");
      const lookbackParsed = parseInt(lookbackParam ?? "", 10);
      const lookbackDays = !isNaN(lookbackParsed) && lookbackParsed > 0 ? lookbackParsed : 30;
      const cacheKey = buildCacheKey("dora", { lookbackDays });
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
      error instanceof Error
        ? error.message
        : "Failed to fetch DORA metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
