import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { PRMetrics } from "@/types/github";
import type { LinearMetrics } from "@/types/linear";
import type { SlackMetrics } from "@/types/slack";
import type { DORAMetrics } from "@/types/dora";
import type { ScoreDeduction } from "@/types/metrics";

// Mock getConfig before importing claude.ts
vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(),
  clearConfigCache: vi.fn(),
}));

import { getConfig } from "@/lib/config";
import {
  getProvider,
  isAIConfigured,
  buildHealthSummaryPromptFile,
  buildWeeklyNarrativePromptFile,
  extractJSON,
  normalizeQuotes,
} from "@/lib/claude";

const mockGetConfig = vi.mocked(getConfig);

// ─── Helpers to build minimal valid data ─────────────────────────────

function makeGitHub(overrides: Partial<{
  avgCycleTimeHours: number;
  stalePRCount: number;
  totalOpenPRs: number;
  prsNeedingReview: number;
}> = {}): PRMetrics {
  return {
    cycleTimeTrend: [
      { week: "W1", avgHoursToMerge: 10, avgHoursToFirstReview: 5, prsMerged: 3 },
    ],
    reviewBottlenecks: [
      {
        reviewer: "alice",
        avatarUrl: "",
        pendingReviews: 2,
        completedReviews: 5,
        avgReviewTimeHours: 8,
        pendingPRs: [{ number: 101, title: "Fix bug", author: "bob", hoursWaiting: 12, url: "https://github.com/org/repo/pull/101" }],
      },
    ],
    stalePRs: [
      { number: 42, title: "Old PR", author: "charlie", reviewers: ["alice"], daysSinceUpdate: 10, url: "https://github.com/org/repo/pull/42" },
    ],
    openPRs: [
      { number: 42, title: "Old PR", author: "charlie", reviewers: ["alice"], daysOpen: 10, isDraft: false, url: "https://github.com/org/repo/pull/42" },
    ],
    summary: {
      totalOpenPRs: overrides.totalOpenPRs ?? 5,
      avgCycleTimeHours: overrides.avgCycleTimeHours ?? 10,
      stalePRCount: overrides.stalePRCount ?? 1,
      prsNeedingReview: overrides.prsNeedingReview ?? 1,
    },
  };
}

function makeLinear(): LinearMetrics {
  return {
    mode: "continuous" as const,
    availableCycles: [],
    workloadByCycle: {},
    timeInStateByCycle: {},
    stalledIssuesByCycle: {},
    summaryByCycle: {},
    summary: {
      currentCycleName: "Continuous",
      currentCycleProgress: 0,
      currentCycleStartsAt: null,
      currentCycleEndsAt: null,
      totalActiveIssues: 10,
      stalledIssueCount: 2,
      avgVelocity: 20,
    },
    velocityTrend: [
      { cycleName: "W1", completedPoints: 20, completedIssues: 10, scopeChange: 0 },
    ],
    workloadDistribution: [
      { assignee: "dev0", avatarUrl: null, todo: 3, inProgress: 2, completed: 5, totalPoints: 10, issues: [] },
    ],
    timeInState: {
      stats: [{ state: "In Progress", count: 5, minDays: 0.5, maxDays: 6, meanDays: 2, medianDays: 1.5, p90Days: 4 }],
      issues: [],
      flowEfficiency: 45,
      leadTimeTrend: [],
    },
    stalledIssues: [
      { id: "id-123", identifier: "ENG-123", title: "Stalled task", state: "In Progress", daysSinceLastUpdate: 7, assignee: "dev0", url: "https://linear.app/team/ENG-123" },
    ],
  };
}

function makeSlack(): SlackMetrics {
  return {
    summary: {
      totalMessages7Days: 200,
      avgResponseMinutes: 12,
      mostActiveChannel: "general",
      potentiallyOverloaded: 1,
    },
    responseTimeTrend: [
      { day: "2026-03-20", avgResponseMinutes: 12, messageCount: 50 },
    ],
    channelActivity: [
      { channelName: "general", channelId: "C01", messagesLast7Days: 150, activeMembers: 8 },
    ],
    overloadIndicators: [
      { userId: "u1", userName: "Bob", messagesSent: 100, avgResponseMinutes: 5, channelsActive: 3, isOverloaded: true },
    ],
    teamMemberFilter: null,
  };
}

function makeDORA(overrides: Partial<{ totalDeployments: number }> = {}): DORAMetrics {
  return {
    trend: [
      { period: "W1", deploymentCount: 5, successCount: 4, failureCount: 1, otherCount: 0, avgLeadTimeHours: null, changeFailureRate: 20, mttrHours: 2 },
    ],
    deployments: [],
    incidents: [
      { number: 1, title: "Prod outage", labels: ["incident"], createdAt: "2026-03-18", closedAt: "2026-03-18", resolutionHours: 3, url: "https://github.com/org/repo/issues/1" },
    ],
    source: "merges",
    summary: {
      deploymentFrequency: 5,
      deploymentFrequencyRating: "high",
      avgLeadTimeHours: null,
      leadTimeRating: null,
      changeFailureRate: 20,
      changeFailureRateRating: "low",
      mttrHours: 3,
      mttrRating: "elite",
      totalDeployments: overrides.totalDeployments ?? 20,
      totalFailures: 1,
      openIncidents: 0,
    },
  };
}

function makeScoreResult(overrides: Partial<{
  score: number;
  overallHealth: string;
  deductions: ScoreDeduction[];
}> = {}): { score: number; overallHealth: string; deductions: ScoreDeduction[] } {
  return {
    score: overrides.score ?? 75,
    overallHealth: overrides.overallHealth ?? "warning",
    deductions: overrides.deductions ?? [
      { signal: "Cycle time", category: "github", points: 4, maxPoints: 8, detail: "Avg 30h to merge" },
      { signal: "Stale PRs", category: "github", points: 2, maxPoints: 8, detail: "1 stale PR" },
      { signal: "Review queue", category: "github", points: 0, maxPoints: 7, detail: "20% needing review" },
    ],
  };
}

// ─── Tests ────────────────────────────────────────────────────────────

describe("Manual AI mode", () => {
  beforeEach(() => {
    mockGetConfig.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ─── Provider detection ────────────────────────────────────────────

  describe("getProvider", () => {
    it('returns "manual" when AI_PROVIDER=manual', () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return "manual";
        return undefined;
      });
      expect(getProvider()).toBe("manual");
    });

    it('returns "anthropic" when AI_PROVIDER=anthropic', () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return "anthropic";
        return undefined;
      });
      expect(getProvider()).toBe("anthropic");
    });

    it('returns "ollama" when AI_PROVIDER=ollama', () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return "ollama";
        return undefined;
      });
      expect(getProvider()).toBe("ollama");
    });

    it('returns "anthropic" when no AI_PROVIDER but ANTHROPIC_API_KEY is set', () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return undefined;
        if (key === "ANTHROPIC_API_KEY") return "sk-test-key";
        return undefined;
      });
      expect(getProvider()).toBe("anthropic");
    });

    it('returns "ollama" as default when no AI_PROVIDER and no ANTHROPIC_API_KEY', () => {
      mockGetConfig.mockReturnValue(undefined);
      expect(getProvider()).toBe("ollama");
    });
  });

  describe("isAIConfigured", () => {
    it("returns true for manual mode (no API keys needed)", () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return "manual";
        return undefined;
      });
      expect(isAIConfigured()).toBe(true);
    });

    it("returns true for anthropic when API key is set", () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return "anthropic";
        if (key === "ANTHROPIC_API_KEY") return "sk-test-key";
        return undefined;
      });
      expect(isAIConfigured()).toBe(true);
    });

    it("returns false for anthropic when API key is missing", () => {
      mockGetConfig.mockImplementation((key: string) => {
        if (key === "AI_PROVIDER") return "anthropic";
        return undefined;
      });
      expect(isAIConfigured()).toBe(false);
    });

    it("returns true for ollama (always configured, runs locally)", () => {
      mockGetConfig.mockReturnValue(undefined);
      expect(isAIConfigured()).toBe(true);
    });
  });

  // ─── Prompt file builders ──────────────────────────────────────────

  describe("buildHealthSummaryPromptFile", () => {
    it("generates markdown with instructions, score breakdown, and metrics", () => {
      mockGetConfig.mockReturnValue(undefined);
      const github = makeGitHub();
      const score = makeScoreResult();
      const result = buildHealthSummaryPromptFile(github, null, null, null, score);

      // Check instructions header
      expect(result).toContain("# Team Health Analysis — AI Prompt");
      expect(result).toContain("Instructions:");
      expect(result).toContain("Upload this file to any AI chat");

      // Check score breakdown
      expect(result).toContain("75/100");
      expect(result).toContain("warning");
      expect(result).toContain("Signals that lost points");
      expect(result).toContain("Cycle time: -4/8 pts");
      expect(result).toContain("Stale PRs: -2/8 pts");

      // Check healthy signals
      expect(result).toContain("Review queue: OK");

      // Check response format instructions
      expect(result).toContain('"insights"');
      expect(result).toContain('"recommendations"');

      // Check GitHub metrics data is present
      expect(result).toContain("## GitHub PR Metrics");
      expect(result).toContain("Open PRs: 5");
      expect(result).toContain("Average cycle time: 10 hours");
    });

    it("includes only connected source data — GitHub only", () => {
      mockGetConfig.mockReturnValue(undefined);
      const github = makeGitHub();
      const score = makeScoreResult();
      const result = buildHealthSummaryPromptFile(github, null, null, null, score);

      // GitHub data is present
      expect(result).toContain("## GitHub PR Metrics");

      // Disconnected sources are mentioned as NOT connected
      expect(result).toContain("Connected data sources: GitHub");
      expect(result).toContain("NOT connected");
      expect(result).toContain("Linear");
      expect(result).toContain("Slack");
      expect(result).toContain("DORA");

      // Their data sections should NOT be present
      expect(result).not.toContain("## Linear Sprint/Cycle Metrics");
      expect(result).not.toContain("## Slack Communication Metrics");
      expect(result).not.toContain("## DORA Deployment Metrics");
    });

    it("includes all sources when all are connected", () => {
      mockGetConfig.mockReturnValue(undefined);
      const github = makeGitHub();
      const linear = makeLinear();
      const slack = makeSlack();
      const dora = makeDORA();
      const score = makeScoreResult();
      const result = buildHealthSummaryPromptFile(github, linear, slack, dora, score);

      expect(result).toContain("Connected data sources: GitHub, Linear, Slack, DORA");
      expect(result).not.toContain("NOT connected");
      expect(result).toContain("## GitHub PR Metrics");
      expect(result).toContain("## Linear Sprint/Cycle Metrics");
      expect(result).toContain("## Slack Communication Metrics");
      expect(result).toContain("## DORA Deployment Metrics");
    });

    it("excludes DORA when totalDeployments is 0", () => {
      mockGetConfig.mockReturnValue(undefined);
      const dora = makeDORA({ totalDeployments: 0 });
      const score = makeScoreResult();
      const result = buildHealthSummaryPromptFile(null, null, null, dora, score);

      expect(result).not.toContain("## DORA Deployment Metrics");
      expect(result).toContain("NOT connected");
    });

    it("includes rich detail: stale PRs, review bottlenecks, open PRs", () => {
      mockGetConfig.mockReturnValue(undefined);
      const github = makeGitHub();
      const score = makeScoreResult();
      const result = buildHealthSummaryPromptFile(github, null, null, null, score);

      // Stale PRs detail
      expect(result).toContain('#42 "Old PR" by charlie');
      expect(result).toContain("10d stale");

      // Review bottlenecks
      expect(result).toContain("alice: 2 pending");

      // Cycle time trend
      expect(result).toContain("W1: 10h avg to merge");
    });

    it("includes Linear detail when connected", () => {
      mockGetConfig.mockReturnValue(undefined);
      const linear = makeLinear();
      const score = makeScoreResult();
      const result = buildHealthSummaryPromptFile(null, linear, null, null, score);

      expect(result).toContain("## Linear Sprint/Cycle Metrics");
      expect(result).toContain("Stalled issues (>5d no update): 2");
      expect(result).toContain('ENG-123 "Stalled task"');
      expect(result).toContain("Flow efficiency: 45%");
    });

    it("shows healthy message when no deductions", () => {
      mockGetConfig.mockReturnValue(undefined);
      const score = makeScoreResult({
        score: 100,
        overallHealth: "healthy",
        deductions: [
          { signal: "Cycle time", category: "github", points: 0, maxPoints: 8, detail: "Avg 5h to merge" },
        ],
      });
      const result = buildHealthSummaryPromptFile(makeGitHub(), null, null, null, score);
      expect(result).toContain("(none — everything looks healthy)");
    });
  });

  describe("buildWeeklyNarrativePromptFile", () => {
    it("generates markdown with instructions and metrics data", () => {
      mockGetConfig.mockReturnValue(undefined);
      const github = makeGitHub();
      const result = buildWeeklyNarrativePromptFile(github, null, null, null);

      // Check instructions header
      expect(result).toContain("# Weekly Team Health Narrative — AI Prompt");
      expect(result).toContain("Instructions:");
      expect(result).toContain("Upload this file to any AI chat");

      // Check prose format instructions
      expect(result).toContain("3-4 short paragraphs");
      expect(result).toContain("plain text");

      // Check GitHub data present
      expect(result).toContain("## GitHub PR Metrics");
    });

    it("includes only connected source data", () => {
      mockGetConfig.mockReturnValue(undefined);
      const linear = makeLinear();
      const result = buildWeeklyNarrativePromptFile(null, linear, null, null);

      expect(result).toContain("Connected data sources: Linear");
      expect(result).toContain("NOT connected");
      expect(result).toContain("## Linear Sprint/Cycle Metrics");
      expect(result).not.toContain("## GitHub PR Metrics");
      expect(result).not.toContain("## Slack Communication Metrics");
    });

    it("includes all sources when all connected", () => {
      mockGetConfig.mockReturnValue(undefined);
      const result = buildWeeklyNarrativePromptFile(
        makeGitHub(), makeLinear(), makeSlack(), makeDORA()
      );

      expect(result).toContain("Connected data sources: GitHub, Linear, Slack, DORA");
      expect(result).not.toContain("NOT connected");
      expect(result).toContain("## GitHub PR Metrics");
      expect(result).toContain("## Linear Sprint/Cycle Metrics");
      expect(result).toContain("## Slack Communication Metrics");
      expect(result).toContain("## DORA Deployment Metrics");
    });

    it("includes week-of date", () => {
      mockGetConfig.mockReturnValue(undefined);
      const result = buildWeeklyNarrativePromptFile(makeGitHub(), null, null, null);

      // Should include a date in YYYY-MM-DD format
      expect(result).toMatch(/week of \d{4}-\d{2}-\d{2}/);
    });

    it("excludes DORA when totalDeployments is 0", () => {
      mockGetConfig.mockReturnValue(undefined);
      const dora = makeDORA({ totalDeployments: 0 });
      const result = buildWeeklyNarrativePromptFile(null, null, null, dora);

      expect(result).not.toContain("## DORA Deployment Metrics");
    });
  });

  // ─── Response parsing (extractJSON logic) ──────────────────────────

  describe("extractJSON (response parsing)", () => {
    it("parses a bare JSON object", () => {
      const input = '{"insights":["a","b"],"recommendations":["c"]}';
      const result = extractJSON(input);
      const parsed = JSON.parse(result);
      expect(parsed.insights).toEqual(["a", "b"]);
      expect(parsed.recommendations).toEqual(["c"]);
    });

    it("extracts JSON from ```json code fences", () => {
      const input = `Here is the analysis:

\`\`\`json
{"insights":["cycle time is high at 30h"],"recommendations":["reduce PR size"]}
\`\`\`

Hope this helps!`;
      const result = extractJSON(input);
      const parsed = JSON.parse(result);
      expect(parsed.insights).toHaveLength(1);
      expect(parsed.insights[0]).toContain("cycle time");
      expect(parsed.recommendations[0]).toContain("PR size");
    });

    it("extracts JSON from ``` code fences (no language tag)", () => {
      const input = `\`\`\`
{"insights":["velocity dropped 40%"],"recommendations":["triage stalled issues"]}
\`\`\``;
      const result = extractJSON(input);
      const parsed = JSON.parse(result);
      expect(parsed.insights[0]).toContain("velocity");
      expect(parsed.recommendations[0]).toContain("stalled");
    });

    it("extracts JSON embedded in surrounding prose", () => {
      const input = `Based on my analysis, here are the results:
{"insights":["3 stale PRs detected"],"recommendations":["assign reviewers"]}
That covers the key findings.`;
      const result = extractJSON(input);
      const parsed = JSON.parse(result);
      expect(parsed.insights[0]).toContain("stale PRs");
    });

    it("returns raw text for invalid/garbage input (lets JSON.parse throw)", () => {
      const input = "This is just random text with no JSON at all.";
      const result = extractJSON(input);
      expect(result).toBe(input);
      expect(() => JSON.parse(result)).toThrow();
    });

    it("returns raw text for partial/broken JSON", () => {
      const input = "Almost JSON: {broken";
      const result = extractJSON(input);
      // The brace match will grab "{broken" but it won't parse
      expect(() => JSON.parse(result)).toThrow();
    });
  });

  describe("smart quote normalization", () => {
    it("converts curly double quotes to straight", () => {
      const input = '\u201Cinsight one\u201D';
      expect(normalizeQuotes(input)).toBe('"insight one"');
    });

    it("converts curly single quotes to straight", () => {
      const input = "team\u2019s velocity";
      expect(normalizeQuotes(input)).toBe("team's velocity");
    });

    it("makes ChatGPT-style JSON parseable", () => {
      const input = '{\u201Cinsights\u201D:[\u201Chigh cycle time\u201D],\u201Crecommendations\u201D:[\u201Creduce WIP\u201D]}';
      const normalized = normalizeQuotes(input);
      const parsed = JSON.parse(normalized);
      expect(parsed.insights).toEqual(["high cycle time"]);
      expect(parsed.recommendations).toEqual(["reduce WIP"]);
    });

    it("leaves already-straight quotes unchanged", () => {
      const input = '{"insights":["normal quotes"]}';
      expect(normalizeQuotes(input)).toBe(input);
    });
  });

  describe("dated filenames in prompts", () => {
    it("health summary prompt requests a dated JSON file", () => {
      mockGetConfig.mockReturnValue(undefined);
      const result = buildHealthSummaryPromptFile(makeGitHub(), null, null, null, makeScoreResult());
      // Should contain a date-stamped filename like health-insights-YYYY-MM-DD.json
      expect(result).toMatch(/health-insights-\d{4}-\d{2}-\d{2}\.json/);
    });

    it("weekly narrative prompt requests a dated TXT file", () => {
      mockGetConfig.mockReturnValue(undefined);
      const result = buildWeeklyNarrativePromptFile(makeGitHub(), null, null, null);
      expect(result).toMatch(/weekly-narrative-\d{4}-\d{2}-\d{2}\.txt/);
    });
  });
});
