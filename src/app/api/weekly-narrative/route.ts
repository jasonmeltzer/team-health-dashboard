import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
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

    if (!github && !linear && !slack) {
      return Response.json(
        { error: "No data sources available." },
        { status: 400 }
      );
    }

    const emptyGithub = {
      cycleTimeTrend: [],
      reviewBottlenecks: [],
      stalePRs: [],
      summary: { totalOpenPRs: 0, avgCycleTimeHours: 0, stalePRCount: 0, prsNeedingReview: 0 },
    };
    const emptyLinear = {
      mode: "continuous" as const,
      velocityTrend: [],
      stalledIssues: [],
      workloadDistribution: [],
      availableCycles: [],
      workloadByCycle: {},
      timeInState: { stats: [], issues: [], flowEfficiency: 0, leadTimeTrend: [] },
      summary: { currentCycleName: "N/A", currentCycleProgress: 0, totalActiveIssues: 0, stalledIssueCount: 0, avgVelocity: 0 },
    };
    const emptySlack = {
      responseTimeTrend: [],
      channelActivity: [],
      overloadIndicators: [],
      summary: { totalMessages7Days: 0, avgResponseMinutes: 0, mostActiveChannel: "N/A", potentiallyOverloaded: 0 },
    };

    const narrative = await generateWeeklyNarrative(
      github || emptyGithub,
      linear || emptyLinear,
      slack || emptySlack
    );

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
