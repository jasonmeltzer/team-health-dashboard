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
