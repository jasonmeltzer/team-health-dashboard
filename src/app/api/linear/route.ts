import { fetchLinearMetrics } from "@/lib/linear";

export async function GET() {
  try {
    const teamId = process.env.LINEAR_TEAM_ID;

    if (!teamId) {
      return Response.json(
        { error: "LINEAR_TEAM_ID is not configured" },
        { status: 400 }
      );
    }

    if (!process.env.LINEAR_API_KEY) {
      return Response.json(
        { error: "LINEAR_API_KEY is not configured" },
        { status: 400 }
      );
    }

    const metrics = await fetchLinearMetrics(teamId);
    return Response.json({
      data: metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Linear metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
