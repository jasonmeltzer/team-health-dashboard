import Anthropic from "@anthropic-ai/sdk";
import type { PRMetrics } from "@/types/github";
import type { LinearMetrics } from "@/types/linear";
import type { SlackMetrics } from "@/types/slack";
import type { HealthSummary, WeeklyNarrative } from "@/types/metrics";
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
  slack: SlackMetrics | null
): Promise<HealthSummary> {
  const ALL_SOURCES = ["GitHub", "Linear", "Slack"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  const system = `You are an engineering team health analyst. Analyze the provided metrics and return a JSON object with this exact shape:

{"overallHealth":"healthy","score":85,"insights":["insight1","insight2","insight3"],"recommendations":["rec1","rec2"]}

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no explanation before or after.
- overallHealth: "healthy" (score 80-100), "warning" (50-79), or "critical" (0-49)
- insights: 3-5 strings. Each must cite a specific number from the data. No generic statements.
- recommendations: 2-3 actionable strings. Be specific about what to do.
- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention these at all): ${notConnected.join(", ")}. Do not reference, speculate about, or suggest configuring these.` : ""}

Scoring guide:
- 80-100 = healthy: Low cycle times, good velocity, no major bottlenecks
- 50-79 = warning: Some bottlenecks, stalled work, or overload signals
- 0-49 = critical: Significant blockers, high cycle times, or severe overload`;

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

  const userMessage = `Analyze these engineering team metrics from the past week:\n\n${sections.join("\n\n")}`;

  const text = await chatCompletion(system, userMessage, 1024, {
    temperature: 0,
    jsonMode: true,
  });

  try {
    const json = extractJSON(text);
    const parsed = JSON.parse(json);
    return {
      overallHealth: parsed.overallHealth || "warning",
      score: typeof parsed.score === "number" ? parsed.score : 50,
      insights: Array.isArray(parsed.insights) ? parsed.insights : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.error("[health-summary] Failed to parse AI response:", err);
    console.error("[health-summary] Raw text:", text.slice(0, 500));
    return {
      overallHealth: "warning",
      score: 50,
      insights: ["AI analysis could not be parsed. Try refreshing, or try a different model (e.g. llama3.1 or mistral)."],
      recommendations: ["Run 'ollama list' to check available models.", "Larger models (8B+) handle structured JSON output more reliably."],
      generatedAt: new Date().toISOString(),
    };
  }
}

export async function generateWeeklyNarrative(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null
): Promise<WeeklyNarrative> {
  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay()); // Start of week

  const ALL_SOURCES = ["GitHub", "Linear", "Slack"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
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

  const userMessage = `Write a weekly team health narrative based on these metrics:\n\n${sections.join("\n\n")}`;

  const text = await chatCompletion(system, userMessage, 2048);

  return {
    narrative: text,
    weekOf: weekOf.toISOString().split("T")[0],
    generatedAt: new Date().toISOString(),
  };
}
