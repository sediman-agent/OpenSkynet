import { PATHS } from "../config/index.js";
import { Database } from "bun:sqlite";

let db: Database | null = null;

export interface SessionRow {
  id: number;
  task: string;
  steps_json: string;
  result: string | null;
  created_at: string;
}

export interface TrajectoryRow {
  id: number;
  session_id: number | null;
  task: string;
  success: boolean;
  skill_name: string | null;
  error_type: string | null;
  duration_ms: number | null;
  created_at: string;
}

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized. Call initDb() first.");
  }
  return db;
}

export function initDb(path?: string): Database {
  if (db) return db;

  const dbPath = path ?? PATHS.db;
  db = new Database(dbPath, { create: true });

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task TEXT NOT NULL,
      steps_json TEXT DEFAULT '[]',
      result TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS session_steps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER NOT NULL REFERENCES sessions(id),
      phase TEXT,
      action TEXT,
      detail TEXT,
      url TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trajectories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id INTEGER REFERENCES sessions(id),
      task TEXT NOT NULL,
      success INTEGER DEFAULT 0,
      skill_name TEXT,
      error_type TEXT,
      duration_ms INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS trajectory_preferences (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trajectory_id INTEGER NOT NULL REFERENCES trajectories(id),
      rating INTEGER DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  try {
    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
        task, result,
        content=sessions,
        content_rowid=id
      )
    `);
  } catch {
    // FTS5 may not be available in all SQLite builds
  }

  return db;
}

export const Db = { initDb, getDb } as const;
