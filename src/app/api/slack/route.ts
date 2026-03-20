import { fetchSlackMetrics } from "@/lib/slack";

export async function GET() {
  try {
    const channelIdsStr = process.env.SLACK_CHANNEL_IDS;

    if (!channelIdsStr || !process.env.SLACK_BOT_TOKEN) {
      return Response.json({ notConfigured: true });
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
