// Note: only usable in Node.js runtime (not Edge). Do not import in edge routes.
import Database from "better-sqlite3";
import { join } from "path";
import { mkdirSync } from "fs";
import type { ScoreDeduction } from "@/types/metrics";

const globalForDb = globalThis as typeof globalThis & { __db?: Database.Database };

function initSchema(db: Database.Database) {
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
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_snapshots_date ON health_snapshots(date)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS cycle_snapshots (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      cycle_id    TEXT    NOT NULL,
      cycle_name  TEXT    NOT NULL,
      issue_ids   TEXT    NOT NULL,
      captured_at TEXT    NOT NULL DEFAULT (datetime('now')),
      is_baseline INTEGER NOT NULL DEFAULT 0
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_cycle_snapshots_cycle_id
      ON cycle_snapshots(cycle_id, captured_at DESC)
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS oauth_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      provider     TEXT NOT NULL UNIQUE,
      access_token TEXT NOT NULL,
      refresh_token TEXT,
      expires_at   TEXT,
      account_name TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_oauth_tokens_provider ON oauth_tokens(provider)
  `);
}

export function getDb(): Database.Database {
  if (!globalForDb.__db) {
    const dir = join(process.cwd(), "data");
    mkdirSync(dir, { recursive: true });
    globalForDb.__db = new Database(join(dir, "health.db"));
    globalForDb.__db.pragma("journal_mode = WAL");
    globalForDb.__db.pragma("busy_timeout = 5000");
    globalForDb.__db.pragma("foreign_keys = ON");
    initSchema(globalForDb.__db);
  }
  return globalForDb.__db;
}

export function writeSnapshot(snap: {
  score: number;
  band: string;
  deductions: ScoreDeduction[];
}): void {
  const db = getDb();
  const now = new Date();
  const date = now.toISOString().slice(0, 10); // YYYY-MM-DD
  const stmt = db.prepare(
    "INSERT OR REPLACE INTO health_snapshots (date, created_at, score, band, deductions) VALUES (?, ?, ?, ?, ?)"
  );
  stmt.run(
    date,
    now.toISOString(),
    snap.score,
    snap.band,
    JSON.stringify(snap.deductions)
  );
}

export function getSnapshots(days: number): Array<{
  id: number;
  date: string;
  created_at: string;
  score: number;
  band: string;
  deductions: string;
}> {
  const db = getDb();
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

export function writeCycleSnapshot(
  cycleId: string,
  cycleName: string,
  issueIds: string[]
): void {
  try {
    const db = getDb();
    const isFirst = db
      .prepare("SELECT COUNT(*) as cnt FROM cycle_snapshots WHERE cycle_id = ?")
      .get(cycleId) as { cnt: number };
    const stmt = db.prepare(
      "INSERT INTO cycle_snapshots (cycle_id, cycle_name, issue_ids, captured_at, is_baseline) VALUES (?, ?, ?, ?, ?)"
    );
    stmt.run(
      cycleId,
      cycleName,
      JSON.stringify(issueIds),
      new Date().toISOString(),
      isFirst.cnt === 0 ? 1 : 0
    );
    // Retention: keep baseline + last 30 non-baseline snapshots per cycle
    db.prepare(`
      DELETE FROM cycle_snapshots
      WHERE cycle_id = ? AND is_baseline = 0
        AND id NOT IN (
          SELECT id FROM cycle_snapshots
          WHERE cycle_id = ? AND is_baseline = 0
          ORDER BY captured_at DESC LIMIT 30
        )
    `).run(cycleId, cycleId);
    // Also clean up snapshots older than 90 days (except baselines)
    db.prepare(`
      DELETE FROM cycle_snapshots
      WHERE is_baseline = 0 AND captured_at < datetime('now', '-90 days')
    `).run();
  } catch (e) {
    console.warn("[DB] cycle snapshot write failed:", e);
  }
}

export function getLatestCycleSnapshot(
  cycleId: string
): { issueIds: string[]; capturedAt: string } | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT issue_ids, captured_at FROM cycle_snapshots WHERE cycle_id = ? ORDER BY captured_at DESC LIMIT 1"
      )
      .get(cycleId) as { issue_ids: string; captured_at: string } | undefined;
    if (!row) return null;
    return { issueIds: JSON.parse(row.issue_ids), capturedAt: row.captured_at };
  } catch (e) {
    console.warn("[DB] getLatestCycleSnapshot failed:", e);
    return null;
  }
}

export function getEarliestCycleSnapshot(
  cycleId: string
): { issueIds: string[]; capturedAt: string } | null {
  try {
    const db = getDb();
    const row = db
      .prepare(
        "SELECT issue_ids, captured_at FROM cycle_snapshots WHERE cycle_id = ? ORDER BY captured_at ASC LIMIT 1"
      )
      .get(cycleId) as { issue_ids: string; captured_at: string } | undefined;
    if (!row) return null;
    return { issueIds: JSON.parse(row.issue_ids), capturedAt: row.captured_at };
  } catch (e) {
    console.warn("[DB] getEarliestCycleSnapshot failed:", e);
    return null;
  }
}

export function diffSnapshots(
  previous: string[],
  current: string[]
): { added: string[]; removed: string[] } {
  const prevSet = new Set(previous);
  const currSet = new Set(current);
  return {
    added: current.filter((id) => !prevSet.has(id)),
    removed: previous.filter((id) => !currSet.has(id)),
  };
}
