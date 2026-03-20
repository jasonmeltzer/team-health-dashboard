import { NextRequest } from "next/server";
import { fetchLinearMetrics } from "@/lib/linear";

export async function GET(request: NextRequest) {
  try {
    const teamId = process.env.LINEAR_TEAM_ID;

    if (!teamId || !process.env.LINEAR_API_KEY) {
      return Response.json({ notConfigured: true });
    }

    const mode = request.nextUrl.searchParams.get("mode") as
      | "cycles"
      | "weekly"
      | null;
    const daysParam = request.nextUrl.searchParams.get("days");
    const lookbackDays = daysParam ? parseInt(daysParam, 10) : 42;
    const metrics = await fetchLinearMetrics(teamId, mode || undefined, lookbackDays);
    return Response.json({
      data: metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Linear metrics";
    console.error("[Linear API]", message);
    return Response.json({ error: message }, { status: 500 });
  }
}
