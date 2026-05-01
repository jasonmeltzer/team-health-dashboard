import { describe, it, expect } from "vitest";
import { fetchSlackMetrics } from "./slack";

// Live-workspace smoke tests (D-10, INTG-06).
//
// These tests validate the `SlackMetrics` shape produced by `fetchSlackMetrics`
// when run against a real Slack workspace. They are SKIPPED automatically when
// `SLACK_BOT_TOKEN` or `SLACK_CHANNEL_IDS` are absent, so CI and contributors
// without a Slack app don't see failures.
//
// To run locally:
//   SLACK_BOT_TOKEN=xoxb-... SLACK_CHANNEL_IDS=C0123,C4567 npx vitest run src/lib/slack.test.ts

const CHANNEL_IDS = process.env.SLACK_CHANNEL_IDS
  ?.split(",")
  .map((id) => id.trim())
  .filter(Boolean);

describe.skipIf(!process.env.SLACK_BOT_TOKEN || !CHANNEL_IDS?.length)(
  "Slack integration (live workspace)",
  () => {
    it("fetchSlackMetrics returns valid shape", async () => {
      const metrics = await fetchSlackMetrics(CHANNEL_IDS!);

      // Summary shape (matches SlackMetrics.summary in src/types/slack.ts)
      expect(metrics.summary).toBeDefined();
      expect(typeof metrics.summary.totalMessages7Days).toBe("number");
      expect(metrics.summary.totalMessages7Days).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.summary.avgResponseMinutes).toBe("number");
      expect(metrics.summary.avgResponseMinutes).toBeGreaterThanOrEqual(0);
      expect(typeof metrics.summary.mostActiveChannel).toBe("string");
      expect(typeof metrics.summary.potentiallyOverloaded).toBe("number");
      expect(metrics.summary.potentiallyOverloaded).toBeGreaterThanOrEqual(0);

      // Arrays exist and are arrays
      expect(Array.isArray(metrics.responseTimeTrend)).toBe(true);
      expect(Array.isArray(metrics.channelActivity)).toBe(true);
      expect(Array.isArray(metrics.overloadIndicators)).toBe(true);
    });

    it("channelActivity includes requested channels with well-formed entries", async () => {
      const metrics = await fetchSlackMetrics(CHANNEL_IDS!);
      // At least one channel should have activity data unless every requested
      // channel was inaccessible (skipped silently by the fetcher).
      expect(metrics.channelActivity.length).toBeGreaterThan(0);
      for (const channel of metrics.channelActivity) {
        expect(typeof channel.channelName).toBe("string");
        expect(typeof channel.channelId).toBe("string");
        expect(typeof channel.messagesLast7Days).toBe("number");
        expect(channel.messagesLast7Days).toBeGreaterThanOrEqual(0);
        expect(typeof channel.activeMembers).toBe("number");
        expect(channel.activeMembers).toBeGreaterThanOrEqual(0);
      }
    });

    it("does not throw on empty channel messages", async () => {
      // Verify graceful handling even when channels have no recent messages.
      const metrics = await fetchSlackMetrics(CHANNEL_IDS!);
      expect(metrics).toBeDefined();
    });

    it("team member filter count is null when no filter configured", async () => {
      // When SLACK_TEAM_MEMBER_IDS is not set, teamMemberFilter should be null.
      const metrics = await fetchSlackMetrics(CHANNEL_IDS!);
      if (!process.env.SLACK_TEAM_MEMBER_IDS) {
        expect(metrics.teamMemberFilter).toBeNull();
      } else {
        expect(typeof metrics.teamMemberFilter).toBe("number");
        expect(metrics.teamMemberFilter).toBeGreaterThan(0);
      }
    });

    it("overloadIndicators entries have well-formed user data", async () => {
      const metrics = await fetchSlackMetrics(CHANNEL_IDS!);
      for (const indicator of metrics.overloadIndicators) {
        expect(typeof indicator.userName).toBe("string");
        expect(typeof indicator.userId).toBe("string");
        expect(typeof indicator.messagesSent).toBe("number");
        expect(indicator.messagesSent).toBeGreaterThanOrEqual(0);
        expect(typeof indicator.channelsActive).toBe("number");
        expect(indicator.channelsActive).toBeGreaterThanOrEqual(0);
        expect(typeof indicator.avgResponseMinutes).toBe("number");
        expect(indicator.avgResponseMinutes).toBeGreaterThanOrEqual(0);
        expect(typeof indicator.isOverloaded).toBe("boolean");
      }
    });
  }
);
