import { describe, it, expect, vi, beforeEach } from "vitest";
import { getTTL, CACHE_TTL } from "../cache";

vi.mock("@/lib/config", () => ({
  getConfig: vi.fn(),
}));

import { getConfig } from "@/lib/config";
const mockGetConfig = vi.mocked(getConfig);

beforeEach(() => {
  mockGetConfig.mockReset();
});

describe("getTTL", () => {
  it("returns default TTL when no config is set", () => {
    mockGetConfig.mockReturnValue(undefined);
    expect(getTTL("github")).toBe(CACHE_TTL.github);
    expect(getTTL("linear")).toBe(CACHE_TTL.linear);
    expect(getTTL("healthSummary")).toBe(CACHE_TTL.healthSummary);
  });

  it("returns configured TTL from config", () => {
    mockGetConfig.mockReturnValue("60000");
    expect(getTTL("github")).toBe(60000);
  });

  it("generates correct env key for simple sources", () => {
    mockGetConfig.mockReturnValue(undefined);
    getTTL("github");
    expect(mockGetConfig).toHaveBeenCalledWith("CACHE_TTL_GITHUB");
  });

  it("generates correct env key for camelCase sources", () => {
    mockGetConfig.mockReturnValue(undefined);
    getTTL("healthSummary");
    expect(mockGetConfig).toHaveBeenCalledWith("CACHE_TTL_HEALTH_SUMMARY");
  });

  it("generates correct env key for weeklyNarrative", () => {
    mockGetConfig.mockReturnValue(undefined);
    getTTL("weeklyNarrative");
    expect(mockGetConfig).toHaveBeenCalledWith("CACHE_TTL_WEEKLY_NARRATIVE");
  });

  it("falls back to default for non-numeric config", () => {
    mockGetConfig.mockReturnValue("not-a-number");
    expect(getTTL("github")).toBe(CACHE_TTL.github);
  });

  it("falls back to default for zero", () => {
    mockGetConfig.mockReturnValue("0");
    expect(getTTL("github")).toBe(CACHE_TTL.github);
  });

  it("falls back to default for negative values", () => {
    mockGetConfig.mockReturnValue("-5000");
    expect(getTTL("github")).toBe(CACHE_TTL.github);
  });

  it("falls back to default for empty string", () => {
    mockGetConfig.mockReturnValue("");
    expect(getTTL("github")).toBe(CACHE_TTL.github);
  });

  it("accepts valid positive integer config", () => {
    mockGetConfig.mockReturnValue("300000");
    expect(getTTL("slack")).toBe(300000);
  });
});
