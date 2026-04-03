import { describe, it, expect } from "vitest";

/**
 * Tests for Treatment B (configured but no data) empty state conditions
 * in each section component. These verify the boolean logic that determines
 * when contextual "no data" messages should appear.
 *
 * The actual conditions are extracted from each section's source code.
 */

describe("Treatment B: GitHub — no merged PRs", () => {
  function noMergedPRs(cycleTimeTrend: { prsMerged: number }[]): boolean {
    return cycleTimeTrend.length === 0 || cycleTimeTrend.every((w) => w.prsMerged === 0);
  }

  it("returns true when cycleTimeTrend is empty", () => {
    expect(noMergedPRs([])).toBe(true);
  });

  it("returns true when all weeks have zero merged PRs", () => {
    expect(noMergedPRs([{ prsMerged: 0 }, { prsMerged: 0 }, { prsMerged: 0 }])).toBe(true);
  });

  it("returns false when any week has merged PRs", () => {
    expect(noMergedPRs([{ prsMerged: 0 }, { prsMerged: 3 }, { prsMerged: 0 }])).toBe(false);
  });

  it("returns false when all weeks have merged PRs", () => {
    expect(noMergedPRs([{ prsMerged: 5 }, { prsMerged: 2 }])).toBe(false);
  });
});

describe("Treatment B: Linear — no velocity data", () => {
  function noVelocityData(velocityTrend: unknown[]): boolean {
    return velocityTrend.length === 0;
  }

  it("returns true when velocityTrend is empty", () => {
    expect(noVelocityData([])).toBe(true);
  });

  it("returns false when velocityTrend has entries", () => {
    expect(noVelocityData([{ cycleName: "W1", completedPoints: 0 }])).toBe(false);
  });
});

describe("Treatment B: Slack — no channel activity", () => {
  function noChannelActivity(totalMessages7Days: number, channelActivity: unknown[]): boolean {
    return totalMessages7Days === 0 && channelActivity.length === 0;
  }

  it("returns true when zero messages and empty channel activity", () => {
    expect(noChannelActivity(0, [])).toBe(true);
  });

  it("returns false when messages exist even with empty channels", () => {
    expect(noChannelActivity(5, [])).toBe(false);
  });

  it("returns false when channel activity exists even with zero messages", () => {
    expect(noChannelActivity(0, [{ channelName: "general" }])).toBe(false);
  });

  it("returns false when both messages and channels exist", () => {
    expect(noChannelActivity(10, [{ channelName: "general" }])).toBe(false);
  });
});

describe("Treatment B: DORA — no deployments", () => {
  function noDeployments(totalDeployments: number, incidents: unknown[]): boolean {
    return totalDeployments === 0 && incidents.length === 0;
  }

  it("returns true when zero deployments and no incidents", () => {
    expect(noDeployments(0, [])).toBe(true);
  });

  it("returns false when deployments exist", () => {
    expect(noDeployments(5, [])).toBe(false);
  });

  it("returns false when incidents exist even with zero deployments", () => {
    expect(noDeployments(0, [{ title: "Outage" }])).toBe(false);
  });

  it("returns false when both deployments and incidents exist", () => {
    expect(noDeployments(3, [{ title: "Outage" }])).toBe(false);
  });
});
