import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const owner = searchParams.get("owner") || process.env.GITHUB_ORG;
    const repo = searchParams.get("repo") || process.env.GITHUB_REPO;

    if (!owner || !repo || !process.env.GITHUB_TOKEN) {
      return Response.json({ notConfigured: true });
    }

    const metrics = await fetchGitHubMetrics(owner, repo);
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
