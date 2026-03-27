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

/** Normalize smart quotes and other copy-paste artifacts that break JSON parsing. */
export function normalizeQuotes(text: string): string {
  return text
    .replace(/[\u201C\u201D\u201E\u201F\u2033\u2036]/g, '"')
    .replace(/[\u2018\u2019\u201A\u201B\u2032\u2035]/g, "'");
}

/** Extract JSON from LLM responses that may wrap it in markdown code fences or add preamble text. */
export function extractJSON(text: string): string {
  const normalized = normalizeQuotes(text);
  const fenceMatch = normalized.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const braceMatch = normalized.match(/\{[\s\S]*\}/);
  if (braceMatch) return braceMatch[0];
  return normalized;
}

type AIProvider = "anthropic" | "ollama" | "manual";

function getProvider(): AIProvider {
  const explicit = getConfig("AI_PROVIDER");
  if (explicit === "ollama" || explicit === "anthropic" || explicit === "manual") return explicit;
  return getConfig("ANTHROPIC_API_KEY") ? "anthropic" : "ollama";
}

export { getProvider };

export function isAIConfigured(): boolean {
  const provider = getProvider();
  if (provider === "manual") return true; // Manual mode doesn't need API config
  if (provider === "anthropic") return !!getConfig("ANTHROPIC_API_KEY");
  return true; // Ollama runs locally, no key needed
}

function validateOllamaUrl(raw: string): string {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error(`OLLAMA_BASE_URL is not a valid URL: "${raw}"`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(
      `OLLAMA_BASE_URL must use http:// or https://, got "${parsed.protocol}"`
    );
  }
  return raw;
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
  const baseUrlRaw = getConfig("OLLAMA_BASE_URL") || "http://localhost:11434";
  const baseUrl = validateOllamaUrl(baseUrlRaw);
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

  const tier = getPromptTier();
  let system: string;
  let userMessage: string;
  let maxTokens: number;

  if (tier === "rich") {
    // Anthropic — rich prompts with detailed per-item data
    const rich = buildRichHealthSummaryPrompt(github, linear, slack, dora, scoreResult);
    system = rich.system;
    userMessage = rich.userMessage;
    maxTokens = 2048;
  } else {
    // Ollama — compact prompts, summary-level data
    system = `You are an engineering team health analyst. The health score has already been computed (${scoreResult.score}/100, ${scoreResult.overallHealth}). Your job is to provide insights and recommendations.

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

    userMessage = `Provide insights and recommendations for these engineering team metrics:\n\n${sections.join("\n\n")}`;
    maxTokens = 1024;
  }

  const text = await chatCompletion(system, userMessage, maxTokens, {
    temperature: 0,
    jsonMode: tier === "compact", // Ollama needs JSON mode; Anthropic follows instructions
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

  const tier = getPromptTier();
  let system: string;
  let userMessage: string;
  let maxTokens: number;

  if (tier === "rich") {
    // Anthropic — rich prompts with detailed per-item data
    const rich = buildRichWeeklyNarrativePrompt(github, linear, slack, dora);
    system = rich.system;
    userMessage = rich.userMessage;
    maxTokens = 4096;
  } else {
    // Ollama — compact prompts, JSON-dumped data
    system = `You are an engineering team health analyst writing a weekly team health narrative.

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

    userMessage = `Write a weekly team health narrative based on these metrics:\n\n${sections.join("\n\n")}`;
    maxTokens = 2048;
  }

  const text = await chatCompletion(system, userMessage, maxTokens, {
    temperature: tier === "rich" ? 0.5 : 0.3,
  });

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

// ---------------------------------------------------------------------------
// Provider-aware prompt tiers
// ---------------------------------------------------------------------------

type PromptTier = "compact" | "rich";

function getPromptTier(): PromptTier {
  const provider = getProvider();
  return provider === "ollama" ? "compact" : "rich";
}

// ---------------------------------------------------------------------------
// Rich data formatters — used by rich prompts and manual export files
// ---------------------------------------------------------------------------

function formatGitHubRich(github: PRMetrics): string {
  const lines: string[] = ["## GitHub PR Metrics\n"];

  lines.push(`### Summary`);
  lines.push(`- Open PRs: ${github.summary.totalOpenPRs}`);
  lines.push(`- Average cycle time: ${github.summary.avgCycleTimeHours} hours`);
  lines.push(`- Stale PRs: ${github.summary.stalePRCount}`);
  lines.push(`- PRs needing review: ${github.summary.prsNeedingReview}`);

  if (github.cycleTimeTrend.length > 0) {
    lines.push(`\n### Cycle Time Trend (by week)`);
    for (const w of github.cycleTimeTrend) {
      lines.push(`- ${w.week}: ${w.avgHoursToMerge}h avg to merge, ${w.avgHoursToFirstReview}h avg to first review (${w.prsMerged} PRs merged)`);
    }
  }

  if (github.stalePRs.length > 0) {
    lines.push(`\n### Stale PRs (no updates)`);
    for (const pr of github.stalePRs) {
      lines.push(`- #${pr.number} "${pr.title}" by ${pr.author} — ${pr.daysSinceUpdate}d stale, reviewers: ${pr.reviewers.join(", ") || "none"}`);
    }
  }

  if (github.openPRs.length > 0) {
    lines.push(`\n### Open PRs`);
    for (const pr of github.openPRs.slice(0, 15)) {
      const draft = pr.isDraft ? " [DRAFT]" : "";
      lines.push(`- #${pr.number} "${pr.title}" by ${pr.author}${draft} — ${pr.daysOpen}d open, reviewers: ${pr.reviewers.join(", ") || "none"}`);
    }
    if (github.openPRs.length > 15) {
      lines.push(`  (${github.openPRs.length - 15} more not shown)`);
    }
  }

  if (github.reviewBottlenecks.length > 0) {
    lines.push(`\n### Review Bottlenecks (by reviewer)`);
    for (const rb of github.reviewBottlenecks.slice(0, 10)) {
      lines.push(`- ${rb.reviewer}: ${rb.pendingReviews} pending, ${rb.completedReviews} completed, avg review time ${rb.avgReviewTimeHours}h`);
      for (const pr of rb.pendingPRs.slice(0, 3)) {
        lines.push(`  - #${pr.number} "${pr.title}" by ${pr.author} — waiting ${pr.hoursWaiting}h`);
      }
    }
  }

  return lines.join("\n");
}

function formatLinearRich(linear: LinearMetrics): string {
  const lines: string[] = ["## Linear Sprint/Cycle Metrics\n"];

  lines.push(`### Summary`);
  lines.push(`- Mode: ${linear.mode}`);
  lines.push(`- Current cycle: ${linear.summary.currentCycleName} (${linear.summary.currentCycleProgress}% complete)`);
  lines.push(`- Active issues: ${linear.summary.totalActiveIssues}`);
  lines.push(`- Stalled issues (>5d no update): ${linear.summary.stalledIssueCount}`);
  lines.push(`- Average velocity: ${linear.summary.avgVelocity} points/cycle`);

  if (linear.velocityTrend.length > 0) {
    lines.push(`\n### Velocity Trend`);
    for (const v of linear.velocityTrend) {
      lines.push(`- ${v.cycleName}: ${v.completedIssues} issues, ${v.completedPoints} points${v.scopeChange !== 0 ? `, scope change: ${v.scopeChange > 0 ? "+" : ""}${v.scopeChange}` : ""}`);
    }
  }

  if (linear.timeInState?.stats?.length > 0) {
    lines.push(`\n### Time in State`);
    lines.push(`- Flow efficiency: ${linear.timeInState.flowEfficiency}%`);
    for (const s of linear.timeInState.stats) {
      lines.push(`- ${s.state}: ${s.count} issues, mean ${s.meanDays}d, median ${s.medianDays}d, p90 ${s.p90Days}d`);
    }
  }

  if (linear.workloadDistribution.length > 0) {
    lines.push(`\n### Workload Distribution`);
    for (const w of linear.workloadDistribution) {
      lines.push(`- ${w.assignee}: ${w.inProgress} in-progress, ${w.todo} todo, ${w.completed} completed (${w.totalPoints} points)`);
    }
  }

  if (linear.stalledIssues.length > 0) {
    lines.push(`\n### Stalled Issues`);
    for (const issue of linear.stalledIssues) {
      lines.push(`- ${issue.identifier} "${issue.title}" — ${issue.state}, ${issue.daysSinceLastUpdate}d no update, assignee: ${issue.assignee || "unassigned"}`);
    }
  }

  return lines.join("\n");
}

function formatSlackRich(slack: SlackMetrics): string {
  const lines: string[] = ["## Slack Communication Metrics\n"];

  lines.push(`### Summary`);
  lines.push(`- Total messages (7d): ${slack.summary.totalMessages7Days}`);
  lines.push(`- Average response time: ${slack.summary.avgResponseMinutes} minutes`);
  lines.push(`- Most active channel: ${slack.summary.mostActiveChannel}`);
  lines.push(`- Potentially overloaded members: ${slack.summary.potentiallyOverloaded}`);

  if (slack.responseTimeTrend.length > 0) {
    lines.push(`\n### Response Time Trend`);
    for (const d of slack.responseTimeTrend) {
      lines.push(`- ${d.day}: ${d.avgResponseMinutes}m avg (${d.messageCount} messages)`);
    }
  }

  if (slack.channelActivity.length > 0) {
    lines.push(`\n### Channel Activity`);
    for (const c of slack.channelActivity) {
      lines.push(`- #${c.channelName}: ${c.messagesLast7Days} messages, ${c.activeMembers} active members`);
    }
  }

  const overloaded = slack.overloadIndicators.filter((o) => o.isOverloaded);
  if (overloaded.length > 0) {
    lines.push(`\n### Overloaded Members`);
    for (const o of overloaded) {
      lines.push(`- ${o.userName}: ${o.messagesSent} messages sent, ${o.channelsActive} channels, ${o.avgResponseMinutes}m avg response`);
    }
  }

  return lines.join("\n");
}

function formatDORARich(dora: DORAMetrics): string {
  const lines: string[] = ["## DORA Deployment Metrics\n"];

  lines.push(`### Summary`);
  lines.push(`- Data source: ${dora.source}`);
  lines.push(`- Deployment frequency: ${dora.summary.deploymentFrequency}/week (${dora.summary.deploymentFrequencyRating})`);
  lines.push(`- Change failure rate: ${dora.summary.changeFailureRate}% (${dora.summary.changeFailureRateRating})`);
  lines.push(`- MTTR: ${dora.summary.mttrHours != null ? dora.summary.mttrHours + "h" : "N/A"} (${dora.summary.mttrRating || "N/A"})`);
  lines.push(`- Total deployments: ${dora.summary.totalDeployments}`);
  lines.push(`- Total failures: ${dora.summary.totalFailures}`);
  lines.push(`- Open incidents: ${dora.summary.openIncidents}`);

  if (dora.trend.length > 0) {
    lines.push(`\n### Weekly Trend`);
    for (const t of dora.trend) {
      lines.push(`- ${t.period}: ${t.deploymentCount} deploys (${t.successCount} success, ${t.failureCount} failure), CFR ${t.changeFailureRate}%${t.mttrHours != null ? `, MTTR ${t.mttrHours}h` : ""}`);
    }
  }

  if (dora.incidents.length > 0) {
    lines.push(`\n### Recent Incidents`);
    for (const inc of dora.incidents.slice(0, 10)) {
      const status = inc.closedAt ? `resolved in ${inc.resolutionHours}h` : "OPEN";
      lines.push(`- #${inc.number} "${inc.title}" (${status}) — ${inc.labels.join(", ")}`);
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// Prompt file builders — self-contained markdown files for manual AI mode
// ---------------------------------------------------------------------------

export function buildHealthSummaryPromptFile(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  dora: DORAMetrics | null,
  scoreResult: { score: number; overallHealth: string; deductions: ScoreDeduction[] }
): string {
  const ALL_SOURCES = ["GitHub", "Linear", "Slack", "DORA"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  if (dora && dora.summary.totalDeployments > 0) sources.push("DORA");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  const deductionSummary = scoreResult.deductions
    .filter((d) => d.points > 0)
    .map((d) => `- ${d.signal}: -${d.points}/${d.maxPoints} pts (${d.detail})`)
    .join("\n");

  const cleanSignals = scoreResult.deductions
    .filter((d) => d.points === 0)
    .map((d) => `- ${d.signal}: OK`)
    .join("\n");

  const dataSections: string[] = [];
  if (github) dataSections.push(formatGitHubRich(github));
  if (linear) dataSections.push(formatLinearRich(linear));
  if (slack) dataSections.push(formatSlackRich(slack));
  if (dora && dora.summary.totalDeployments > 0) dataSections.push(formatDORARich(dora));

  const today = new Date().toISOString().split("T")[0];

  return `# Team Health Analysis — AI Prompt

> **Instructions:** Upload this file to any AI chat (ChatGPT, Claude, Gemini, etc.)
> and say: **"See file for instructions. Please create a file with your response."**

---

## Your Task

You are an engineering team health analyst. Analyze the metrics data below and return insights and actionable recommendations.

**The health score has already been computed: ${scoreResult.score}/100 (${scoreResult.overallHealth}).** You do NOT need to compute a score. Your job is to explain what the data means and what the team should do about it.

## Response Format

**Create a downloadable file** named \`health-insights-${today}.json\` containing ONLY a JSON object with this exact shape:

\`\`\`
{"insights":["insight1","insight2",...],"recommendations":["rec1","rec2",...]}
\`\`\`

- **insights**: 3-5 strings. Each must cite a specific number from the data. No generic statements.
- **recommendations**: 2-3 actionable strings. Be specific about what to do and who should do it.
- The file must contain valid JSON only — no markdown, no commentary, no wrapping.

## Constraints

- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention at all): ${notConnected.join(", ")}.` : ""}
- Focus your insights on the signals that scored poorly (see score breakdown below).
- Name specific people, PRs, or issues when the data supports it.
- Be direct — an engineering manager is reading this, not a general audience.

## Score Breakdown

Score: **${scoreResult.score}/100** (${scoreResult.overallHealth})

### Signals that lost points:
${deductionSummary || "(none — everything looks healthy)"}

### Healthy signals:
${cleanSignals || "(none scored)"}

---

# Metrics Data

${dataSections.join("\n\n---\n\n")}

---

> **Reminder:** Create a downloadable file named health-insights-${today}.json with only the JSON object. If you cannot create files, return the JSON directly as text.
`;
}

export function buildWeeklyNarrativePromptFile(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  dora: DORAMetrics | null
): string {
  const ALL_SOURCES = ["GitHub", "Linear", "Slack", "DORA"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  if (dora && dora.summary.totalDeployments > 0) sources.push("DORA");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  const today = new Date().toISOString().split("T")[0];
  const weekOf = new Date();
  weekOf.setDate(weekOf.getDate() - weekOf.getDay());

  const dataSections: string[] = [];
  if (github) dataSections.push(formatGitHubRich(github));
  if (linear) dataSections.push(formatLinearRich(linear));
  if (slack) dataSections.push(formatSlackRich(slack));
  if (dora && dora.summary.totalDeployments > 0) dataSections.push(formatDORARich(dora));

  return `# Weekly Team Health Narrative — AI Prompt

> **Instructions:** Upload this file to any AI chat (ChatGPT, Claude, Gemini, etc.)
> and say: **"See file for instructions. Please create a file with your response."**

---

## Your Task

You are an engineering team health analyst. Write a weekly team health narrative for the week of ${weekOf.toISOString().split("T")[0]} based on the metrics data below.

## Response Format

**Create a downloadable file** named \`weekly-narrative-${today}.txt\` containing 3-4 short paragraphs of plain text.

You may use **bold** for emphasis and markdown headers (## Section) to organize if needed, but keep it concise. No bullet points or numbered lists — write in prose. The file should contain only the narrative text, no preamble.

## Constraints

- Be direct and specific — cite actual numbers from the data.
- Name specific people, PRs, or issues when the data supports it.
- Focus on: what changed, what's at risk, and what to do about it.
- The tone should be like a sharp engineering manager's weekly update to their skip-level.
- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention at all): ${notConnected.join(", ")}.` : ""}
- Skip generic advice like "improve communication" or "monitor velocity."

---

# Metrics Data

${dataSections.join("\n\n---\n\n")}

---

> **Reminder:** Create a downloadable file named weekly-narrative-${today}.txt with prose paragraphs only. If you cannot create files, return the text directly. Be specific, cite numbers, name names.
`;
}

/**
 * Build the rich system prompt + user message for Anthropic API calls.
 * Shares the same detailed data formatting as the manual export files.
 */
function buildRichHealthSummaryPrompt(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  dora: DORAMetrics | null,
  scoreResult: { score: number; overallHealth: string; deductions: ScoreDeduction[] }
): { system: string; userMessage: string } {
  const ALL_SOURCES = ["GitHub", "Linear", "Slack", "DORA"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  if (dora && dora.summary.totalDeployments > 0) sources.push("DORA");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  const deductionSummary = scoreResult.deductions
    .filter((d) => d.points > 0)
    .map((d) => `  - ${d.signal}: -${d.points}/${d.maxPoints} pts (${d.detail})`)
    .join("\n");

  const system = `You are an engineering team health analyst. The health score has already been computed (${scoreResult.score}/100, ${scoreResult.overallHealth}). Your job is to provide deep insights and actionable recommendations based on the detailed data provided.

Return a JSON object with this exact shape:
{"insights":["insight1","insight2",...],"recommendations":["rec1","rec2",...]}

Rules:
- Return ONLY valid JSON. No markdown, no code fences, no explanation before or after.
- insights: 3-5 strings. Each must cite a specific number from the data. Name specific people, PRs, or issues when relevant. No generic statements.
- recommendations: 2-3 actionable strings. Be specific about what to do and who should do it.
- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention these at all): ${notConnected.join(", ")}.` : ""}
- Focus your insights on the signals that scored poorly.

Score breakdown (signals that lost points):
${deductionSummary || "  (none — everything looks healthy)"}`;

  const dataSections: string[] = [];
  if (github) dataSections.push(formatGitHubRich(github));
  if (linear) dataSections.push(formatLinearRich(linear));
  if (slack) dataSections.push(formatSlackRich(slack));
  if (dora && dora.summary.totalDeployments > 0) dataSections.push(formatDORARich(dora));

  const userMessage = `Provide insights and recommendations for these engineering team metrics:\n\n${dataSections.join("\n\n")}`;

  return { system, userMessage };
}

function buildRichWeeklyNarrativePrompt(
  github: PRMetrics | null,
  linear: LinearMetrics | null,
  slack: SlackMetrics | null,
  dora: DORAMetrics | null
): { system: string; userMessage: string } {
  const ALL_SOURCES = ["GitHub", "Linear", "Slack", "DORA"];
  const sources: string[] = [];
  if (github) sources.push("GitHub");
  if (linear) sources.push("Linear");
  if (slack) sources.push("Slack");
  if (dora && dora.summary.totalDeployments > 0) sources.push("DORA");
  const notConnected = ALL_SOURCES.filter((s) => !sources.includes(s));

  const system = `You are an engineering team health analyst writing a weekly team health narrative.

Rules:
- Write 3-4 short paragraphs of plain text. You may use **bold** for emphasis.
- Be direct and specific — cite actual numbers from the data. Name specific people, PRs, or issues when relevant.
- Focus on what changed, what's at risk, and what to do about it. Skip generic advice.
- The tone should be like a sharp engineering manager's weekly update to their skip-level.
- Connected data sources: ${sources.join(", ")}. ONLY discuss these.${notConnected.length > 0 ? `\n- NOT connected (do NOT mention these at all): ${notConnected.join(", ")}.` : ""}`;

  const dataSections: string[] = [];
  if (github) dataSections.push(formatGitHubRich(github));
  if (linear) dataSections.push(formatLinearRich(linear));
  if (slack) dataSections.push(formatSlackRich(slack));
  if (dora && dora.summary.totalDeployments > 0) dataSections.push(formatDORARich(dora));

  const userMessage = `Write a weekly team health narrative based on these metrics:\n\n${dataSections.join("\n\n")}`;

  return { system, userMessage };
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
