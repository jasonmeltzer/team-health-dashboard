import { NextRequest } from "next/server";
import { fetchGitHubMetrics } from "@/lib/github";
import { fetchLinearMetrics } from "@/lib/linear";
import { fetchSlackMetrics } from "@/lib/slack";
import { fetchDORAMetrics } from "@/lib/dora";
import { computeHealthScore } from "@/lib/scoring";
import { getConfig, getConfigAsync } from "@/lib/config";
import { getOrFetch, buildCacheKey, cache, getTTL } from "@/lib/cache";
import { extractJSON } from "@/lib/claude";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, response } = body as { type?: string; response?: string };

    if (!type || !response) {
      return Response.json(
        { error: 'Missing required fields: "type" and "response".' },
        { status: 400 }
      );
    }

    if (type !== "health-summary" && type !== "weekly-narrative") {
      return Response.json(
        { error: 'Invalid "type". Use "health-summary" or "weekly-narrative".' },
        { status: 400 }
      );
    }

    if (type === "health-summary") {
      return await handleHealthSummaryResponse(response);
    } else {
      return handleWeeklyNarrativeResponse(response);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to process AI response";
    return Response.json({ error: message }, { status: 500 });
  }
}

async function handleHealthSummaryResponse(response: string) {
  // Parse the AI's JSON response
  let insights: string[];
  let recommendations: string[];

  try {
    const json = extractJSON(response);
    const parsed = JSON.parse(json);
    insights = Array.isArray(parsed.insights) ? parsed.insights : [];
    recommendations = Array.isArray(parsed.recommendations) ? parsed.recommendations : [];

    if (insights.length === 0 && recommendations.length === 0) {
      return Response.json(
        { error: "Could not find insights or recommendations in the response. Make sure the AI returned a JSON object with 'insights' and 'recommendations' arrays." },
        { status: 400 }
      );
    }
  } catch (err) {
    const detail = err instanceof Error ? err.message : "";
    // Log for debugging
    console.error("[ai-response] JSON parse failed:", detail);
    console.error("[ai-response] First 200 chars of input:", response.slice(0, 200));
    return Response.json(
      { error: `Could not parse JSON from the response. ${detail ? `(${detail}) ` : ""}Make sure you copied the AI's complete response, including the JSON object with 'insights' and 'recommendations'.` },
      { status: 400 }
    );
  }

  // Compute the current deterministic score (score is never from AI)
  const owner = getConfig("GITHUB_ORG");
  const repo = getConfig("GITHUB_REPO");
  const teamId = getConfig("LINEAR_TEAM_ID");
  const channelIdsStr = getConfig("SLACK_CHANNEL_IDS");
  const channelIds = channelIdsStr?.split(",").map((id) => id.trim());

  const githubConfigured = !!(owner && repo && (await getConfigAsync("GITHUB_TOKEN")));
  const [github, linear, slack, dora] = await Promise.all([
    githubConfigured
      ? getOrFetch(buildCacheKey("github", { staleDays: 7, lookbackDays: 30 }), getTTL("github"), () => fetchGitHubMetrics(owner!, repo!)).then((r) => r.value).catch(() => null)
      : null,
    teamId && (await getConfigAsync("LINEAR_API_KEY"))
      ? getOrFetch(buildCacheKey("linear", { mode: "auto", days: 42 }), getTTL("linear"), () => fetchLinearMetrics(teamId)).then((r) => r.value).catch(() => null)
      : null,
    channelIds && (await getConfigAsync("SLACK_BOT_TOKEN"))
      ? getOrFetch(buildCacheKey("slack", { channels: channelIdsStr }), getTTL("slack"), () => fetchSlackMetrics(channelIds)).then((r) => r.value).catch(() => null)
      : null,
    githubConfigured
      ? getOrFetch(buildCacheKey("dora", { lookbackDays: 30 }), getTTL("dora"), () => fetchDORAMetrics(owner!, repo!)).then((r) => r.value).catch(() => null)
      : null,
  ]);

  const scoreResult = computeHealthScore(github, linear, slack, dora);

  const result = {
    overallHealth: scoreResult.overallHealth,
    score: scoreResult.score,
    scoreBreakdown: scoreResult.deductions,
    insights,
    recommendations,
    generatedAt: new Date().toISOString(),
  };

  // Store under a manual-specific cache key (separate from AI-generated responses)
  cache.set("manual:health-summary", {
    value: result,
    cachedAt: Date.now(),
    ttlMs: getTTL("healthSummary"),
  });

  return Response.json({
    data: result,
    fetchedAt: result.generatedAt,
    cached: false,
  });
}

function handleWeeklyNarrativeResponse(response: string) {
  // For narrative, the response is prose — use it directly
  const narrative = response.trim();

  if (narrative.length < 20) {
    return Response.json(
      { error: "The response seems too short. Make sure you copied the AI's complete narrative response." },
      { status: 400 }
    );
  }

  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay());

  const result = {
    narrative,
    weekOf: weekOf.toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
  };

  // Store under a manual-specific cache key (separate from AI-generated responses)
  cache.set("manual:weekly-narrative", {
    value: result,
    cachedAt: Date.now(),
    ttlMs: getTTL("weeklyNarrative"),
  });

  return Response.json({
    data: result,
    fetchedAt: result.generatedAt,
    cached: false,
  });
}
