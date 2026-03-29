import { describe, it, expect, beforeEach, afterEach } from "vitest";
import Database from "better-sqlite3";
import type { ScoreDeduction } from "@/types/metrics";

// Test against an in-memory SQLite database to avoid file system side effects.
// We replicate the schema from db.ts directly rather than importing getDb()
// (which writes to a real file via globalThis singleton).

let db: Database.Database;

function initTestSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS health_snapshots (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      date       TEXT    NOT NULL UNIQUE,
      created_at TEXT    NOT NULL DEFAULT (datetime('now')),
      score      INTEGER NOT NULL,
      band       TEXT    NOT NULL,
      deductions TEXT    NOT NULL
    )
  `);
}

function writeSnapshot(
  db: Database.Database,
  snap: { score: number; band: string; deductions: ScoreDeduction[] },
  dateOverride?: string
) {
  const now = new Date();
  const date = dateOverride ?? now.toISOString().slice(0, 10);
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO health_snapshots (date, created_at, score, band, deductions) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(date, now.toISOString(), snap.score, snap.band, JSON.stringify(snap.deductions));
}

function getSnapshots(db: Database.Database, days: number) {
  const stmt = db.prepare(
    "SELECT id, date, created_at, score, band, deductions FROM health_snapshots WHERE date >= date('now', ? || ' days') ORDER BY date ASC"
  );
  return stmt.all(`-${days}`) as Array<{
    id: number;
    date: string;
    created_at: string;
    score: number;
    band: string;
    deductions: string;
  }>;
}

const sampleDeductions: ScoreDeduction[] = [
  { signal: "Cycle time", category: "github", points: 4, maxPoints: 8, detail: ">24h avg" },
];

beforeEach(() => {
  db = new Database(":memory:");
  initTestSchema(db);
});

afterEach(() => {
  db.close();
});

describe("writeSnapshot", () => {
  it("inserts a snapshot", () => {
    writeSnapshot(db, { score: 85, band: "healthy", deductions: sampleDeductions }, "2026-03-28");
    const rows = db.prepare("SELECT * FROM health_snapshots").all() as Array<{ score: number }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(85);
  });

  it("enforces one snapshot per day via INSERT OR REPLACE", () => {
    writeSnapshot(db, { score: 85, band: "healthy", deductions: sampleDeductions }, "2026-03-28");
    writeSnapshot(db, { score: 72, band: "warning", deductions: sampleDeductions }, "2026-03-28");
    writeSnapshot(db, { score: 90, band: "healthy", deductions: [] }, "2026-03-28");

    const rows = db.prepare("SELECT * FROM health_snapshots").all() as Array<{
      score: number;
      band: string;
    }>;
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(90);
    expect(rows[0].band).toBe("healthy");
  });

  it("allows different dates", () => {
    writeSnapshot(db, { score: 85, band: "healthy", deductions: [] }, "2026-03-27");
    writeSnapshot(db, { score: 72, band: "warning", deductions: [] }, "2026-03-28");

    const rows = db.prepare("SELECT * FROM health_snapshots").all();
    expect(rows).toHaveLength(2);
  });

  it("stores deductions as JSON", () => {
    writeSnapshot(db, { score: 85, band: "healthy", deductions: sampleDeductions }, "2026-03-28");
    const row = db.prepare("SELECT deductions FROM health_snapshots").get() as {
      deductions: string;
    };
    const parsed = JSON.parse(row.deductions);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].signal).toBe("Cycle time");
    expect(parsed[0].points).toBe(4);
  });

  it("stores date as YYYY-MM-DD", () => {
    writeSnapshot(db, { score: 85, band: "healthy", deductions: [] }, "2026-03-28");
    const row = db.prepare("SELECT date FROM health_snapshots").get() as { date: string };
    expect(row.date).toBe("2026-03-28");
    expect(row.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("getSnapshots", () => {
  it("returns empty array when no snapshots", () => {
    const rows = getSnapshots(db, 30);
    expect(rows).toEqual([]);
  });

  it("returns snapshots within date range", () => {
    const today = new Date().toISOString().slice(0, 10);
    writeSnapshot(db, { score: 85, band: "healthy", deductions: [] }, today);

    const rows = getSnapshots(db, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0].date).toBe(today);
  });

  it("excludes snapshots outside date range", () => {
    writeSnapshot(db, { score: 85, band: "healthy", deductions: [] }, "2020-01-01");
    const today = new Date().toISOString().slice(0, 10);
    writeSnapshot(db, { score: 72, band: "warning", deductions: [] }, today);

    const rows = getSnapshots(db, 7);
    expect(rows).toHaveLength(1);
    expect(rows[0].score).toBe(72);
  });

  it("returns rows ordered by date ascending", () => {
    const today = new Date();
    const yesterday = new Date(today.getTime() - 86400000).toISOString().slice(0, 10);
    const todayStr = today.toISOString().slice(0, 10);

    writeSnapshot(db, { score: 72, band: "warning", deductions: [] }, todayStr);
    writeSnapshot(db, { score: 85, band: "healthy", deductions: [] }, yesterday);

    const rows = getSnapshots(db, 7);
    expect(rows).toHaveLength(2);
    expect(rows[0].date).toBe(yesterday);
    expect(rows[1].date).toBe(todayStr);
  });

  it("includes date field in returned rows", () => {
    const today = new Date().toISOString().slice(0, 10);
    writeSnapshot(db, { score: 85, band: "healthy", deductions: sampleDeductions }, today);

    const rows = getSnapshots(db, 7);
    expect(rows[0]).toHaveProperty("date");
    expect(rows[0]).toHaveProperty("created_at");
    expect(rows[0]).toHaveProperty("deductions");
  });
});

describe("schema constraints", () => {
  it("rejects duplicate dates via UNIQUE constraint", () => {
    db.prepare(
      "INSERT INTO health_snapshots (date, created_at, score, band, deductions) VALUES (?, ?, ?, ?, ?)"
    ).run("2026-03-28", new Date().toISOString(), 85, "healthy", "[]");

    // Plain INSERT (not OR REPLACE) should fail on duplicate date
    expect(() => {
      db.prepare(
        "INSERT INTO health_snapshots (date, created_at, score, band, deductions) VALUES (?, ?, ?, ?, ?)"
      ).run("2026-03-28", new Date().toISOString(), 72, "warning", "[]");
    }).toThrow();
  });
});
