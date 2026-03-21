import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { generateWeeklyNarrative, isAIConfigured, OllamaNotRunningError } from "@/lib/claude";
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

    const githubConfigured = !!(owner && repo && getConfig("GITHUB_TOKEN"));
    const [github, linear, slack, dora] = await Promise.all([
      githubConfigured
        ? fetchGitHubMetrics(owner!, repo!).catch(() => null)
        : null,
      teamId && getConfig("LINEAR_API_KEY")
        ? fetchLinearMetrics(teamId).catch(() => null)
        : null,
      channelIds && getConfig("SLACK_BOT_TOKEN")
        ? fetchSlackMetrics(channelIds).catch(() => null)
        : null,
      githubConfigured
        ? fetchDORAMetrics(owner!, repo!).catch(() => null)
        : null,
    ]);

    if (!github && !linear && !slack) {
      return Response.json(
        { error: "No data sources available." },
        { status: 400 }
      );
    }

    const narrative = await generateWeeklyNarrative(github, linear, slack, dora);

    return Response.json({
      data: narrative,
      fetchedAt: new Date().toISOString(),
    });
  } catch (error) {
    if (error instanceof OllamaNotRunningError) {
      return Response.json({ setupHint: error.message });
    }
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate weekly narrative";
    return Response.json({ error: message }, { status: 500 });
  }
}
