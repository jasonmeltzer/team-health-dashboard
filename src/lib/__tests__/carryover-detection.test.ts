import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ScopeChangeSummary } from "@/types/linear";

// Mock DB functions before importing the module under test
vi.mock("@/lib/db", () => ({
  writeCycleSnapshot: vi.fn(),
  getLatestCycleSnapshot: vi.fn(() => null),
  getEarliestCycleSnapshot: vi.fn(() => null),
  diffSnapshots: vi.fn(() => ({ added: [], removed: [] })),
}));

vi.mock("@/lib/config", () => ({
  getConfig: vi.fn((key: string) => {
    if (key === "LINEAR_API_KEY") return "test-key";
    return undefined;
  }),
  getConfigAsync: vi.fn(async (key: string) => {
    if (key === "LINEAR_API_KEY") return "test-key";
    return undefined;
  }),
}));

import { fetchScopeChanges } from "@/lib/linear";
import {
  getLatestCycleSnapshot,
  getEarliestCycleSnapshot,
  diffSnapshots,
} from "@/lib/db";

// ── Test Helpers ──────────────────────────────────────────

const CYCLE_START = "2026-04-01T09:00:00.000Z";
const CYCLE_END = "2026-04-15T09:00:00.000Z";
const PREV_CYCLE_ID = "prev-cycle-1";
const CURRENT_CYCLE_ID = "current-cycle-1";

function makeCycle(overrides: Partial<{
  id: string;
  startsAt: string;
  endsAt: string;
  issues: { id: string; identifier: string; title: string }[];
}> = {}) {
  const issues = (overrides.issues ?? []).map((i) => ({
    id: i.id,
    identifier: i.identifier,
    title: i.title,
    state: { name: "In Progress", type: "started" },
    assignee: null,
    estimate: null,
    updatedAt: CYCLE_START,
    completedAt: null,
    startedAt: CYCLE_START,
    createdAt: CYCLE_START,
    url: `https://linear.app/issue/${i.identifier}`,
  }));
  return {
    id: overrides.id ?? CURRENT_CYCLE_ID,
    name: "Sprint 10",
    number: 10,
    startsAt: overrides.startsAt ?? CYCLE_START,
    endsAt: overrides.endsAt ?? CYCLE_END,
    progress: 0.5,
    issueCountHistory: [issues.length],
    issues: { nodes: issues },
  };
}

/** Build a mock fetch response for the Linear GraphQL API */
function mockLinearResponses(historyByIssue: Record<string, Array<{
  createdAt: string;
  fromCycleId: string | null;
  toCycleId: string | null;
  actorId?: string | null;
  actorName?: string;
}>>) {
  return vi.fn(async (_url: string, init: { body: string }) => {
    const body = JSON.parse(init.body);
    const query = body.query as string;
    const issueId = body.variables?.issueId ?? body.variables?.id;

    // History query
    if (query.includes("history")) {
      const entries = historyByIssue[issueId] ?? [];
      return new Response(JSON.stringify({
        data: {
          issue: {
            history: {
              nodes: entries.map((e, idx) => ({
                id: `hist-${idx}`,
                createdAt: e.createdAt,
                actorId: e.actorId ?? null,
                actor: e.actorName ? { id: "a1", name: e.actorName } : null,
                fromCycleId: e.fromCycleId,
                toCycleId: e.toCycleId,
                toCycle: e.toCycleId ? { id: e.toCycleId, name: "Sprint", number: 10 } : null,
                fromCycle: e.fromCycleId ? { id: e.fromCycleId, name: "Prev Sprint", number: 9 } : null,
              })),
            },
          },
        },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    // Issue metadata query
    if (query.includes("identifier") && issueId) {
      return new Response(JSON.stringify({
        data: { issue: { identifier: `TEAM-${issueId.slice(0, 3)}`, title: "Some issue", url: `https://linear.app/${issueId}` } },
      }), { status: 200, headers: { "Content-Type": "application/json" } });
    }

    return new Response(JSON.stringify({ data: {} }), { status: 200 });
  });
}

// ── Tests ─────────────────────────────────────────────────

describe("Carry-over detection in fetchScopeChanges", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestCycleSnapshot).mockReturnValue(null);
    vi.mocked(getEarliestCycleSnapshot).mockReturnValue(null);
    vi.mocked(diffSnapshots).mockReturnValue({ added: [], removed: [] });
  });

  it("classifies history-based add from previous cycle within 12h as carry-over", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "Carried issue" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Issue moved from previous cycle 30 minutes after sprint start
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:30:00.000Z",
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].isCarryOver).toBe(true);
    expect(result.changes[0].source).toBe("history");
    expect(result.carryOvers).toBe(1);
    expect(result.midSprintAdded).toBe(0);
  });

  it("classifies history-based add from previous cycle at exactly 12h boundary as carry-over", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "Edge case" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Exactly 12h after cycle start
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T21:00:00.000Z",
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    expect(result.changes[0].isCarryOver).toBe(true);
  });

  it("classifies history-based add from previous cycle beyond 12h as mid-sprint", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "Late add" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // 13 hours after cycle start — outside window
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T22:00:00.000Z",
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    expect(result.changes[0].isCarryOver).toBe(false);
    expect(result.midSprintAdded).toBe(1);
    expect(result.carryOvers).toBe(0);
  });

  it("does NOT classify add from a non-previous cycle as carry-over even within window", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "From other cycle" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Within 12h, but from a different cycle (not previous)
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:30:00.000Z",
        fromCycleId: "some-other-cycle",
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    expect(result.changes[0].isCarryOver).toBe(false);
    expect(result.midSprintAdded).toBe(1);
  });

  it("does NOT classify removals as carry-overs", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "Removed issue" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Issue removed from current cycle within 12h of start
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:30:00.000Z",
        fromCycleId: CURRENT_CYCLE_ID,
        toCycleId: null,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    expect(result.changes[0].type).toBe("removed");
    expect(result.changes[0].isCarryOver).toBe(false);
  });

  it("does NOT classify carry-overs when previousCycleId is null", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "No prev" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:30:00.000Z",
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    // previousCycleId = null (first sprint, or filtered out)
    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, null);

    expect(result.changes[0].isCarryOver).toBe(false);
    expect(result.carryOvers).toBe(0);
  });

  it("correctly counts mixed carry-overs and mid-sprint adds", async () => {
    const issues = [
      { id: "iss-1", identifier: "TEAM-1", title: "Carry-over" },
      { id: "iss-2", identifier: "TEAM-2", title: "Mid-sprint add" },
      { id: "iss-3", identifier: "TEAM-3", title: "Another carry-over" },
    ];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:15:00.000Z",  // 15min after start — carry-over
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
      "iss-2": [{
        createdAt: "2026-04-05T14:00:00.000Z",  // 4 days later — mid-sprint
        fromCycleId: null,
        toCycleId: CURRENT_CYCLE_ID,
      }],
      "iss-3": [{
        createdAt: "2026-04-01T10:00:00.000Z",  // 1h after start — carry-over
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1", "iss-2", "iss-3"], issueMap, PREV_CYCLE_ID);

    expect(result.added).toBe(3);
    expect(result.carryOvers).toBe(2);
    expect(result.midSprintAdded).toBe(1);
    expect(result.changes.filter((c) => c.isCarryOver)).toHaveLength(2);
  });

  it("filters out pre-sprint changes (before startsAt)", async () => {
    const issues = [{ id: "iss-1", identifier: "TEAM-1", title: "Pre-sprint" }];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // History entry from before the sprint started (sprint planning)
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-03-31T15:00:00.000Z",  // day before sprint start
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    expect(result.changes).toHaveLength(0);
    expect(result.carryOvers).toBe(0);
  });
});

describe("Snapshot-based carry-over detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEarliestCycleSnapshot).mockReturnValue(null);
  });

  it("classifies snapshot additions as carry-overs when snapshot is near cycle start", async () => {
    const cycle = makeCycle({
      issues: [{ id: "iss-1", identifier: "TEAM-1", title: "From snapshot" }],
    });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Snapshot was captured 2h after cycle start — within 12h window
    vi.mocked(getLatestCycleSnapshot).mockReturnValue({
      issueIds: [],
      capturedAt: "2026-04-01T11:00:00.000Z",
    } as ReturnType<typeof getLatestCycleSnapshot>);
    vi.mocked(diffSnapshots).mockReturnValue({ added: ["iss-1"], removed: [] });

    // No history entries — force snapshot path
    global.fetch = mockLinearResponses({});

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    const snapshotChanges = result.changes.filter((c) => c.source === "snapshot");
    expect(snapshotChanges).toHaveLength(1);
    expect(snapshotChanges[0].isCarryOver).toBe(true);
    expect(result.carryOvers).toBe(1);
  });

  it("classifies snapshot additions as mid-sprint when snapshot is far from cycle start", async () => {
    const cycle = makeCycle({
      issues: [{ id: "iss-1", identifier: "TEAM-1", title: "Mid-sprint snapshot" }],
    });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Snapshot captured 2 days after cycle start — outside 12h window
    vi.mocked(getLatestCycleSnapshot).mockReturnValue({
      issueIds: [],
      capturedAt: "2026-04-03T09:00:00.000Z",
    } as ReturnType<typeof getLatestCycleSnapshot>);
    vi.mocked(diffSnapshots).mockReturnValue({ added: ["iss-1"], removed: [] });

    global.fetch = mockLinearResponses({});

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    const snapshotChanges = result.changes.filter((c) => c.source === "snapshot");
    expect(snapshotChanges).toHaveLength(1);
    expect(snapshotChanges[0].isCarryOver).toBe(false);
    expect(result.midSprintAdded).toBe(1);
  });

  it("snapshot removals are never carry-overs", async () => {
    const cycle = makeCycle({ issues: [] });
    const issueMap = new Map<string, (typeof cycle.issues.nodes)[0]>();

    vi.mocked(getLatestCycleSnapshot).mockReturnValue({
      issueIds: ["iss-removed"],
      capturedAt: "2026-04-01T10:00:00.000Z",  // near cycle start
    } as ReturnType<typeof getLatestCycleSnapshot>);
    vi.mocked(diffSnapshots).mockReturnValue({ added: [], removed: ["iss-removed"] });

    global.fetch = mockLinearResponses({});

    const result = await fetchScopeChanges(cycle, [], issueMap, PREV_CYCLE_ID);

    const removals = result.changes.filter((c) => c.type === "removed");
    expect(removals).toHaveLength(1);
    expect(removals[0].isCarryOver).toBe(false);
  });

  it("history entries take precedence over snapshot entries for the same issue", async () => {
    const cycle = makeCycle({
      issues: [{ id: "iss-1", identifier: "TEAM-1", title: "Covered by history" }],
    });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    // Snapshot also shows this issue as added
    vi.mocked(getLatestCycleSnapshot).mockReturnValue({
      issueIds: [],
      capturedAt: "2026-04-01T10:00:00.000Z",
    } as ReturnType<typeof getLatestCycleSnapshot>);
    vi.mocked(diffSnapshots).mockReturnValue({ added: ["iss-1"], removed: [] });

    // History has the same issue — should win over snapshot
    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:30:00.000Z",
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1"], issueMap, PREV_CYCLE_ID);

    // Should have exactly 1 entry (history), not 2 (history + snapshot)
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0].source).toBe("history");
    expect(result.changes[0].isCarryOver).toBe(true);
  });
});

describe("Summary field correctness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getLatestCycleSnapshot).mockReturnValue(null);
    vi.mocked(getEarliestCycleSnapshot).mockReturnValue(null);
    vi.mocked(diffSnapshots).mockReturnValue({ added: [], removed: [] });
  });

  it("computes correct summary with carry-overs, mid-sprint adds, and removals", async () => {
    const issues = [
      { id: "iss-1", identifier: "TEAM-1", title: "Carry-over" },
      { id: "iss-2", identifier: "TEAM-2", title: "Mid-sprint" },
    ];
    const cycle = makeCycle({ issues });
    const issueMap = new Map(cycle.issues.nodes.map((i) => [i.id, i]));

    global.fetch = mockLinearResponses({
      "iss-1": [{
        createdAt: "2026-04-01T09:15:00.000Z",
        fromCycleId: PREV_CYCLE_ID,
        toCycleId: CURRENT_CYCLE_ID,
      }],
      "iss-2": [
        {
          createdAt: "2026-04-05T14:00:00.000Z",
          fromCycleId: null,
          toCycleId: CURRENT_CYCLE_ID,
        },
        {
          createdAt: "2026-04-07T10:00:00.000Z",
          fromCycleId: CURRENT_CYCLE_ID,
          toCycleId: null,  // removed to backlog
        },
      ],
    });

    const result = await fetchScopeChanges(cycle, ["iss-1", "iss-2"], issueMap, PREV_CYCLE_ID);

    expect(result.added).toBe(2);       // iss-1 (carry-over) + iss-2 (mid-sprint)
    expect(result.removed).toBe(1);     // iss-2 removed
    expect(result.net).toBe(1);         // 2 - 1
    expect(result.carryOvers).toBe(1);
    expect(result.midSprintAdded).toBe(1);  // added(2) - carryOvers(1)
    expect(result.midSprintRemoved).toBe(1);
    expect(result.issueCountNow).toBe(2);
  });

  it("returns zero carry-overs when no issues match criteria", async () => {
    const cycle = makeCycle({ issues: [] });
    const issueMap = new Map<string, (typeof cycle.issues.nodes)[0]>();

    global.fetch = mockLinearResponses({});

    const result = await fetchScopeChanges(cycle, [], issueMap, PREV_CYCLE_ID);

    expect(result.added).toBe(0);
    expect(result.removed).toBe(0);
    expect(result.carryOvers).toBe(0);
    expect(result.midSprintAdded).toBe(0);
    expect(result.midSprintRemoved).toBe(0);
  });
});
