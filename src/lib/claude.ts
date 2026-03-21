import Anthropic from "@anthropic-ai/sdk";
import type { PRMetrics } from "@/types/github";
import type { LinearMetrics } from "@/types/linear";
import type { SlackMetrics } from "@/types/slack";
import type { DORAMetrics } from "@/types/dora";
import type { HealthSummary, WeeklyNarrative, ScoreDeduction } from "@/types/metrics";
import { getConfig } from "@/lib/config";

export class OllamaNotRunningError extends Error {
  constructor(baseUrl: string, model: string) {
    super(
      `Could not connect to Ollama at ${baseUrl}. Install Ollama (https://ollama.com) and run: ollama pull ${model}`
    );
    this.name = "OllamaNotRunningError";
  }
}

/** Extract JSON from LLM responses that may wrap it in markdown code fences or add preamble text. */
function extractJSON(text: string): string {
  // Try to find JSON inside ```json ... ``` or ``` ... ``` fences
  const fenceMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Try to find a JSON object directly
  const braceMatch = text.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];

  // Return as-is and let JSON.parse throw
  return text;
}

type AIProvider = "anthropic" | "ollama";

function getProvider(): AIProvider {
  const explicit = getConfig("AI_PROVIDER");
  if (explicit === "ollama" || explicit === "anthropic") return explicit;
  return getConfig("ANTHROPIC_API_KEY") ? "anthropic" : "ollama";
}

export function isAIConfigured(): boolean {
  const provider = getProvider();
  if (provider === "anthropic") return !!getConfig("ANTHROPIC_API_KEY");
  return true; // Ollama runs locally, no key needed
}

async function chatCompletion(
  system: string,
  userMessage: string,
  maxTokens: number,
  options?: { temperature?: number; jsonMode?: boolean }
): Promise<string> {
  const provider = getProvider();
  const temperature = options?.temperature ?? 0.3;

  if (provider === "anthropic") {
    const client = new Anthropic({ apiKey: getConfig("ANTHROPIC_API_KEY") });
    const message = await client.messages.create({
      model: "claude-sonnet-4-5-20250514",
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
      temperature,
    });
    return message.content[0].type === "text" ? message.content[0].text : "";
  }

  // Ollama via OpenAI-compatible API
  const baseUrl = getConfig("OLLAMA_BASE_URL") || "http://localhost:11434";
  const model = getConfig("OLLAMA_MODEL") || "llama3";

  const body: Record<string, unknown> = {
    model,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userMessage },
    ],
    max_tokens: maxTokens,
    temperature,
  };

  // Force JSON output when supported (Ollama OpenAI-compatible API)
  if (options?.jsonMode) {
    body.response_format = { type: "json_object" };
  }

  let response: Response;
  try {
    response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      throw new OllamaNotRunningError(baseUrl, model);
    }
    throw err;
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Ollama API error (${response.status}): ${body}. Is Ollama running at ${baseUrl}?`
    );
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "";
}

export async function generateHealthSummary(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  scoreResult: { score: number; overallHealth: string; deductions: ScoreDeduction[] },
  dora: DORAMetrics | null = null
): Promise<HealthSummary> {
  const ALL_SOURCES = ["GitHub", "Linear", "Slack", "DORA"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  if (dora && dora.summary.totalDeployments > 0) sources.push("DORA");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  // Format the score breakdown for the LLM context
  const deductionSummary = scoreResult.deductions
    .filter((d) => d.points > 0)
    .map((d) => `  - ${d.signal}: -${d.points} pts (${d.detail})`)
    .join("\n");

  const system = `You are an engineering team health analyst. The health score has already been computed (${scoreResult.score}/100, ${scoreResult.overallHealth}). Your job is to provide insights and recommendations.

Return a JSON object with this exact shape:
{"insights":["insight1","insight2","insight3"],"recommendations":["rec1","rec2"]}

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no explanation before or after.
- insights: 3-5 strings. Each must cite a specific number from the data. No generic statements.
- recommendations: 2-3 actionable strings. Be specific about what to do.
- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention these at all): ${notConnected.join(", ")}. Do not reference, speculate about, or suggest configuring these.` : ""}
- Focus your insights on the signals that scored poorly (shown below).

Score breakdown (signals that lost points):
${deductionSummary || "  (none — everything looks healthy)"}`;

  const sections: string[] = [];

  if (github) {
    sections.push(`GitHub PR Metrics:
- Open PRs: ${github.summary.totalOpenPRs}
- Average cycle time: ${github.summary.avgCycleTimeHours} hours
- Stale PRs (>7 days): ${github.summary.stalePRCount}
- PRs needing review: ${github.summary.prsNeedingReview}
- Review bottlenecks: ${JSON.stringify(github.reviewBottlenecks.slice(0, 5))}`);
  }

  if (linear) {
    sections.push(`Linear Sprint Metrics:
- Current cycle: ${linear.summary.currentCycleName} (${linear.summary.currentCycleProgress}% complete)
- Active issues: ${linear.summary.totalActiveIssues}
- Stalled issues (>5 days no update): ${linear.summary.stalledIssueCount}
- Average velocity: ${linear.summary.avgVelocity} points/cycle
- Workload: ${JSON.stringify(linear.workloadDistribution.slice(0, 5))}`);
  }

  if (slack) {
    sections.push(`Slack Communication Metrics:
- Total messages (7 days): ${slack.summary.totalMessages7Days}
- Average response time: ${slack.summary.avgResponseMinutes} minutes
- Most active channel: ${slack.summary.mostActiveChannel}
- Potentially overloaded team members: ${slack.summary.potentiallyOverloaded}
- Overload details: ${JSON.stringify(slack.overloadIndicators.filter((o) => o.isOverloaded))}`);
  }

  if (dora && dora.summary.totalDeployments > 0) {
    sections.push(`DORA Deployment Metrics:
- Deployment frequency: ${dora.summary.deploymentFrequency}/week (${dora.summary.deploymentFrequencyRating})
- Change failure rate: ${dora.summary.changeFailureRate}% (${dora.summary.changeFailureRateRating})
- MTTR: ${dora.summary.mttrHours != null ? dora.summary.mttrHours + "h" : "N/A"} (${dora.summary.mttrRating || "N/A"})
- Total deployments: ${dora.summary.totalDeployments}
- Open incidents: ${dora.summary.openIncidents}`);
  }

  const userMessage = `Provide insights and recommendations for these engineering team metrics:\n\n${sections.join("\n\n")}`;

  const text = await chatCompletion(system, userMessage, 1024, {
    temperature: 0,
    jsonMode: true,
  });

  try {
    const json = extractJSON(text);
    const parsed = JSON.parse(json);
    return {
      overallHealth: scoreResult.overallHealth as HealthSummary["overallHealth"],
      score: scoreResult.score,
      scoreBreakdown: scoreResult.deductions,
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[health-summary] Failed to parse AI response:", err);
    console.error("[health-summary] Raw text:", text.slice(0, 500));
    // Score is still valid even if LLM fails — return it with fallback text
    return {
      overallHealth: scoreResult.overallHealth as HealthSummary["overallHealth"],
      score: scoreResult.score,
      scoreBreakdown: scoreResult.deductions,
      insights: scoreResult.deductions
        .filter((d) => d.points > 0)
        .slice(0, 5)
        .map((d) => `${d.signal}: ${d.detail}`),
      recommendations: ["AI-generated recommendations unavailable. Score breakdown shown above."],
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function generateWeeklyNarrative(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  dora: DORAMetrics | null = null
): Promise<WeeklyNarrative> {
  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay()); // Start of week

  const ALL_SOURCES = ["GitHub", "Linear", "Slack", "DORA"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  if (dora && dora.summary.totalDeployments > 0) sources.push("DORA");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  const system = `You are an engineering team health analyst writing a weekly team health narrative.

Rules:
- Write 3-4 short paragraphs of plain text. NO markdown, NO headers, NO bold, NO bullet points, NO numbered lists.
- Be direct and specific — cite actual numbers from the data. Name specific people, PRs, or issues when relevant.
- Focus on what changed, what's at risk, and what to do about it. Skip generic advice.
- The tone should be like a sharp engineering manager's weekly update to their skip-level.
- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention these at all): ${notConnected.join(", ")}. Do not reference, speculate about, or suggest configuring these.` : ""}`;

  const sections: string[] = [];

  if (github) {
    sections.push(`GitHub Trends:
${JSON.stringify(github.cycleTimeTrend, null, 2)}
Stale PRs: ${JSON.stringify(github.stalePRs, null, 2)}
Review bottlenecks: ${JSON.stringify(github.reviewBottlenecks, null, 2)}`);
  }

  if (linear) {
    sections.push(`Linear Sprint Data:
Velocity trend: ${JSON.stringify(linear.velocityTrend, null, 2)}
Stalled issues: ${JSON.stringify(linear.stalledIssues, null, 2)}
Workload: ${JSON.stringify(linear.workloadDistribution, null, 2)}`);
  }

  if (slack) {
    sections.push(`Slack Activity:
Response times: ${JSON.stringify(slack.responseTimeTrend, null, 2)}
Channel activity: ${JSON.stringify(slack.channelActivity, null, 2)}
Overload indicators: ${JSON.stringify(slack.overloadIndicators, null, 2)}`);
  }

  if (dora && dora.summary.totalDeployments > 0) {
    sections.push(`DORA Deployment Metrics:
Deployment trend: ${JSON.stringify(dora.trend, null, 2)}
Recent incidents: ${JSON.stringify(dora.incidents.slice(0, 10), null, 2)}
Summary: ${JSON.stringify(dora.summary, null, 2)}`);
  }

  const userMessage = `Write a weekly team health narrative based on these metrics:\n\n${sections.join("\n\n")}`;

  const text = await chatCompletion(system, userMessage, 2048);

  // Strip any paragraphs/sentences that reference disconnected sources.
  // Local models often hallucinate about sources they weren't given data for.
  const cleaned = notConnected.length > 0
    ? stripDisconnectedReferences(text, notConnected)
    : text;

  return {
    narrative: cleaned,
    weekOf: weekOf.toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Remove paragraphs that reference data sources we don't have.
 * Splits on double-newline (paragraphs) and drops any that mention
 * a disconnected source by name or by obvious keyword.
 */
function stripDisconnectedReferences(text: string, notConnected: string[]): string {
  const keywords: Record<string, string[]> = {
    Slack: ["slack", "communication", "response time", "messages", "overload", "chat"],
    GitHub: ["github", "pull request", "PR", "merge", "cycle time", "review"],
    Linear: ["linear", "sprint", "velocity", "cycle", "backlog", "stalled issue"],
    DORA: ["dora", "deployment", "deploy", "incident", "recovery", "change failure", "lead time for changes", "mttr"],
  };

  const blocked = notConnected.flatMap(
    (source) => keywords[source] || [source.toLowerCase()]
  );

  const paragraphs = text.split(/\n\n+/);
  const filtered = paragraphs.filter((p) => {
    const lower = p.toLowerCase();
    return !blocked.some((kw) => lower.includes(kw.toLowerCase()));
  });

  // If we stripped everything, return a single paragraph noting limited data
  if (filtered.length === 0) {
    return "Limited data available. Connect more integrations for a richer narrative.";
  }

  return filtered.join("\n\n");
}
