import { NextRequest } from "next/server";
import { fetchDORAMetrics } from "@/lib/dora";
import { getConfig } from "@/lib/config";

export async function GET(request: NextRequest) {
  try {
    const owner = getConfig("GITHUB_ORG");
    const repo = getConfig("GITHUB_REPO");

    if (!owner || !repo || !getConfig("GITHUB_TOKEN")) {
      return Response.json({ notConfigured: true });
    }

    const searchParams = request.nextUrl.searchParams;
    const lookbackParam = searchParams.get("lookbackDays");
    const lookbackDays = lookbackParam ? parseInt(lookbackParam, 10) : 30;

    const source =
      (getConfig("DORA_DEPLOYMENT_SOURCE") as
        | "deployments"
        | "releases"
        | "auto"
        | undefined) || "auto";
    const environment = getConfig("DORA_ENVIRONMENT") || "production";
    const labelsRaw = getConfig("DORA_INCIDENT_LABELS");
    const incidentLabels = labelsRaw
      ? labelsRaw.split(",").map((l) => l.trim())
      : undefined;

    const metrics = await fetchDORAMetrics(owner, repo, lookbackDays, {
      source,
      environment,
      incidentLabels,
    });

    return Response.json({
      data: metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch DORA metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
