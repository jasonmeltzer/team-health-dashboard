import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { generateHealthSummary, isAIConfigured, OllamaNotRunningError } from "@/lib/claude";
import { getConfig } from "@/lib/config";

export async function GET() {
  try {
    if (!isAIConfigured()) {
      return Response.json({ notConfigured: true });
    }

    const owner = getConfig("GITHUB_ORG");
    const repo = getConfig("GITHUB_REPO");
    const teamId = getConfig("LINEAR_TEAM_ID");
    const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");
    const channelIds = channelIdsStr?.split(",").map((id) => id.trim());

    // Fetch all sources in parallel, with graceful fallbacks
    const [github, linear, slack] = await Promise.all([
      owner && repo && getConfig("GITHUB_TOKEN")
        ? fetchGitHubMetrics(owner, repo).catch(() => null)
        : null,
      teamId && getConfig("LINEAR_API_KEY")
        ? fetchLinearMetrics(teamId).catch(() => null)
        : null,
      channelIds && getConfig("SLACK_BOT_TOKEN")
        ? fetchSlackMetrics(channelIds).catch(() => null)
        : null,
    ]);

    // Need at least one data source
    if (!github && !linear && !slack) {
      return Response.json(
        {
          error:
            "No data sources available. Configure at least one of: GitHub, Linear, or Slack.",
        },
        { status: 400 }
      );
    }

    const summary = await generateHealthSummary(github, linear, slack);

    return Response.json({
      data: summary,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof OllamaNotRunningError) {
      return Response.json({ setupHint: error.message });
    }
    const message =
      error instanceof Error ? error.message : "Failed to generate health summary";
    return Response.json({ error: message }, { status: 500 });
  }
}
