import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { buildHealthSummaryPromptFile, buildWeeklyNarrativePromptFile } from "@/lib/claude";
import { computeHealthScore } from "@/lib/scoring";
import { getConfig } from "@/lib/config";
import { getOrFetch, buildCacheKey, CACHE_TTL } from "@/lib/cache";

export async function GET(request: NextRequest) {
  try {
    const type = request.nextUrl.searchParams.get("type");
    if (type !== "health-summary" && type !== "weekly-narrative") {
      return Response.json(
        { error: 'Missing or invalid "type" parameter. Use "health-summary" or "weekly-narrative".' },
        { status: 400 }
      );
    }

    // Fetch all configured source data (reusing cache)
    const owner = getConfig("GITHUB_ORG");
    const repo = getConfig("GITHUB_REPO");
    const teamId = getConfig("LINEAR_TEAM_ID");
    const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");
    const channelIds = channelIdsStr?.split(",").map((id) => id.trim());

    const githubConfigured = !!(owner && repo && getConfig("GITHUB_TOKEN"));
    const [github, linear, slack, dora] = await Promise.all([
      githubConfigured
        ? getOrFetch(buildCacheKey("github", { staleDays: 7, lookbackDays: 30 }), CACHE_TTL.github, () => fetchGitHubMetrics(owner!, repo!)).then((r) => r.value).catch(() => null)
        : null,
      teamId && getConfig("LINEAR_API_KEY")
        ? getOrFetch(buildCacheKey("linear", { mode: "cycles", days: 42 }), CACHE_TTL.linear, () => fetchLinearMetrics(teamId)).then((r) => r.value).catch(() => null)
        : null,
      channelIds && getConfig("SLACK_BOT_TOKEN")
        ? getOrFetch(buildCacheKey("slack", { channels: channelIdsStr }), CACHE_TTL.slack, () => fetchSlackMetrics(channelIds)).then((r) => r.value).catch(() => null)
        : null,
      githubConfigured
        ? getOrFetch(buildCacheKey("dora", { lookbackDays: 30 }), CACHE_TTL.dora, () => fetchDORAMetrics(owner!, repo!)).then((r) => r.value).catch(() => null)
        : null,
    ]);

    if (!github && !linear && !slack) {
      return Response.json(
        { error: "No data sources available. Configure at least one of: GitHub, Linear, or Slack." },
        { status: 400 }
      );
    }

    let markdown: string;
    let filename: string;

    if (type === "health-summary") {
      const scoreResult = computeHealthScore(github, linear, slack, dora);
      markdown = buildHealthSummaryPromptFile(github, linear, slack, dora, scoreResult);
      filename = `team-health-summary-prompt-${new Date().toISOString().split("T")[0]}.md`;
    } else {
      markdown = buildWeeklyNarrativePromptFile(github, linear, slack, dora);
      filename = `weekly-narrative-prompt-${new Date().toISOString().split("T")[0]}.md`;
    }

    return new Response(markdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate prompt file";
    return Response.json({ error: message }, { status: 500 });
  }
}
