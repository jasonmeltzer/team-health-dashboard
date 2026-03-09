import { fetchSlackMetrics } from "@/lib/slack";

export async function GET() {
  try {
    const channelIdsStr = process.env.SLACK_CHANNEL_IDS;

    if (!channelIdsStr) {
      return Response.json(
        { error: "SLACK_CHANNEL_IDS is not configured" },
        { status: 400 }
      );
    }

    if (!process.env.SLACK_BOT_TOKEN) {
      return Response.json(
        { error: "SLACK_BOT_TOKEN is not configured" },
        { status: 400 }
      );
    }

    const channelIds = channelIdsStr.split(",").map((id) => id.trim());
    const metrics = await fetchSlackMetrics(channelIds);
    return Response.json({
      data: metrics,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch Slack metrics";
    return Response.json({ error: message }, { status: 500 });
  }
}
