import { NextRequest } from "next/server";
import { fetchDORAMetrics } from "@/lib/dora";
import { getConfig } from "@/lib/config";
import { asRateLimitError } from "@/lib/utils";
import { getOrFetch, buildCacheKey, CACHE_TTL } from "@/lib/cache";

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
      error instanceof Error
        ? error.message
        : "Failed to fetch DORA metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
