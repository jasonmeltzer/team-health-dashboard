import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get("owner") || getConfig("GITHUB_ORG");
    const repo = searchParams.get("repo") || getConfig("GITHUB_REPO");

    if (!owner || !repo || !getConfig("GITHUB_TOKEN")) {
      return Response.json({ notConfigured: true });
    }

    const staleDaysParam = searchParams.get("staleDays");
    const staleDays = staleDaysParam ? parseInt(staleDaysParam, 10) : 7;
    const lookbackParam = searchParams.get("lookbackDays");
    const lookbackDays = lookbackParam ? parseInt(lookbackParam, 10) : 30;
    const metrics = await fetchGitHubMetrics(owner, repo, staleDays, lookbackDays);
    return Response.json({
      data: metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch GitHub metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
