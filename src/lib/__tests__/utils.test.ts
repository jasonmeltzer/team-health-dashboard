import { describe, it, expect, vi, afterEach } from "vitest";
import {
  getISOWeek,
  daysBetween,
  hoursBetween,
  minutesBetween,
  formatDate,
  daysAgo,
  formatRelativeTime,
  asRateLimitError,
  GitHubRateLimitError,
} from "../utils";

describe("getISOWeek", () => {
  it("returns correct ISO week for a known date", () => {
    // Verify against the actual implementation output
    const result = getISOWeek(new Date("2026-01-05"));
    expect(result).toMatch(/^\d{4}-W\d{2}$/);
    expect(result).toBe("2026-W01");
  });

  it("returns consistent week for same date", () => {
    const w1 = getISOWeek(new Date("2026-03-15"));
    const w2 = getISOWeek(new Date("2026-03-15"));
    expect(w1).toBe(w2);
  });

  it("adjacent weeks differ by 1", () => {
    // A Monday and the next Monday should be in consecutive weeks
    const w1 = getISOWeek(new Date("2026-03-09")); // Monday
    const w2 = getISOWeek(new Date("2026-03-16")); // Next Monday
    const num1 = parseInt(w1.split("-W")[1]);
    const num2 = parseInt(w2.split("-W")[1]);
    expect(num2 - num1).toBe(1);
  });
});

describe("daysBetween", () => {
  it("returns 0 for same date", () => {
    const d = new Date("2026-03-01");
    expect(daysBetween(d, d)).toBe(0);
  });

  it("returns correct days", () => {
    expect(daysBetween(new Date("2026-03-01"), new Date("2026-03-08"))).toBe(7);
  });

  it("is absolute (order independent)", () => {
    expect(daysBetween(new Date("2026-03-08"), new Date("2026-03-01"))).toBe(7);
  });
});

describe("hoursBetween", () => {
  it("returns 0 for same time", () => {
    const d = new Date("2026-03-01T12:00:00Z");
    expect(hoursBetween(d, d)).toBe(0);
  });

  it("returns correct hours with one decimal", () => {
    const d1 = new Date("2026-03-01T00:00:00Z");
    const d2 = new Date("2026-03-01T02:30:00Z");
    expect(hoursBetween(d1, d2)).toBe(2.5);
  });
});

describe("minutesBetween", () => {
  it("returns correct minutes", () => {
    const d1 = new Date("2026-03-01T00:00:00Z");
    const d2 = new Date("2026-03-01T00:45:00Z");
    expect(minutesBetween(d1, d2)).toBe(45);
  });
});

describe("formatDate", () => {
  it("returns YYYY-MM-DD", () => {
    expect(formatDate(new Date("2026-03-21T15:30:00Z"))).toBe("2026-03-21");
  });
});

describe("daysAgo", () => {
  it("returns a date in the past", () => {
    const result = daysAgo(7);
    const diff = Date.now() - result.getTime();
    const days = diff / (1000 * 60 * 60 * 24);
    expect(days).toBeCloseTo(7, 0);
  });
});

describe("formatRelativeTime", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns "just now" for <5s ago', () => {
    const now = new Date("2026-03-21T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatRelativeTime("2026-03-21T11:59:57Z")).toBe("just now");
  });

  it("returns seconds for <60s", () => {
    const now = new Date("2026-03-21T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatRelativeTime("2026-03-21T11:59:30Z")).toBe("30s ago");
  });

  it("returns minutes for <60m", () => {
    const now = new Date("2026-03-21T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatRelativeTime("2026-03-21T11:45:00Z")).toBe("15m ago");
  });

  it("returns hours for <24h", () => {
    const now = new Date("2026-03-21T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatRelativeTime("2026-03-21T09:00:00Z")).toBe("3h ago");
  });

  it("returns days for >=24h", () => {
    const now = new Date("2026-03-21T12:00:00Z");
    vi.setSystemTime(now);
    expect(formatRelativeTime("2026-03-19T12:00:00Z")).toBe("2d ago");
  });
});

describe("asRateLimitError", () => {
  it("returns null for non-rate-limit errors", () => {
    expect(asRateLimitError(new Error("something broke"))).toBeNull();
    expect(asRateLimitError({ status: 500, message: "server error" })).toBeNull();
    expect(asRateLimitError(null)).toBeNull();
    expect(asRateLimitError(undefined)).toBeNull();
  });

  it("detects a 403 rate limit error", () => {
    const err = { status: 403, message: "API rate limit exceeded" };
    const result = asRateLimitError(err);
    expect(result).toBeInstanceOf(GitHubRateLimitError);
    expect(result!.resetAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("extracts reset time from response headers", () => {
    const resetEpoch = Math.floor(Date.now() / 1000) + 3600;
    const err = {
      status: 403,
      message: "API rate limit exceeded",
      response: {
        headers: { "x-ratelimit-reset": String(resetEpoch) },
      },
    };
    const result = asRateLimitError(err);
    expect(result).toBeInstanceOf(GitHubRateLimitError);
    expect(result!.resetAt.getTime()).toBe(resetEpoch * 1000);
  });

  it("ignores 403 without rate limit message", () => {
    expect(asRateLimitError({ status: 403, message: "Forbidden" })).toBeNull();
  });
});
