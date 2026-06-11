import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { getConfig } from "../core/config";
import { CONVERSATIONS_SCHEMA } from "./schema-conversations";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    user_data_dir TEXT NOT NULL,
    headless INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS project_conversations (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    task TEXT NOT NULL,
    steps_json TEXT NOT NULL DEFAULT '[]',
    result TEXT,
    agent_mode TEXT DEFAULT 'browser',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    steps_json TEXT NOT NULL DEFAULT '[]',
    result TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL REFERENCES sessions(id),
    action TEXT NOT NULL,
    observation TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trajectories (
    id TEXT PRIMARY KEY,
    task TEXT NOT NULL,
    steps_json TEXT NOT NULL DEFAULT '[]',
    result TEXT,
    success INTEGER NOT NULL DEFAULT 0,
    skill_name TEXT,
    error_type TEXT,
    duration_ms INTEGER,
    screenshot_dir TEXT,
    metadata_json TEXT DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS trajectory_preferences (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trajectory_id TEXT NOT NULL REFERENCES trajectories(id),
    rating INTEGER NOT NULL CHECK(rating >= -1 AND rating <= 1),
    feedback TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_projects_name ON projects(name);
CREATE INDEX IF NOT EXISTS idx_project_conversations_project ON project_conversations(project_id);
CREATE INDEX IF NOT EXISTS idx_project_conversations_created ON project_conversations(created_at);

CREATE INDEX IF NOT EXISTS idx_trajectories_success ON trajectories(success);
CREATE INDEX IF NOT EXISTS idx_trajectories_skill ON trajectories(skill_name);
CREATE INDEX IF NOT EXISTS idx_trajectories_task ON trajectories(task);
CREATE INDEX IF NOT EXISTS idx_trajectories_created ON trajectories(created_at);
CREATE INDEX IF NOT EXISTS idx_traj_prefs_traj ON trajectory_preferences(trajectory_id);

CREATE VIRTUAL TABLE IF NOT EXISTS sessions_fts USING fts5(
    id, task, result,
    content=sessions,
    content_rowid=rowid
);

CREATE TRIGGER IF NOT EXISTS sessions_ai AFTER INSERT ON sessions BEGIN
    INSERT INTO sessions_fts(rowid, id, task, result)
    VALUES (new.rowid, new.id, new.task, new.result);
END;

CREATE TRIGGER IF NOT EXISTS sessions_ad AFTER DELETE ON sessions BEGIN
    INSERT INTO sessions_fts(sessions_fts, rowid, id, task, result)
    VALUES ('delete', old.rowid, old.id, old.task, old.result);
END;

CREATE TRIGGER IF NOT EXISTS sessions_au AFTER UPDATE ON sessions BEGIN
    INSERT INTO sessions_fts(sessions_fts, rowid, id, task, result)
    VALUES ('delete', old.rowid, old.id, old.task, old.result);
    INSERT INTO sessions_fts(rowid, id, task, result)
    VALUES (new.rowid, new.id, new.task, new.result);
END;
`;

const PRAGMAS = [
  "PRAGMA journal_mode=WAL",
  "PRAGMA synchronous=NORMAL",
  "PRAGMA cache_size=-32000",
  "PRAGMA busy_timeout=5000",
  "PRAGMA foreign_keys=ON",
];

let _db: Database | null = null;

export function getDb(dbPath?: string): Database {
  if (!_db) {
    const config = getConfig();
    const path = dbPath || config.dbPath;
    mkdirSync(dirname(path), { recursive: true });
    _db = new Database(path, { create: true });
    for (const p of PRAGMAS) _db.exec(p);
    _db.exec(SCHEMA);
    _db.exec(CONVERSATIONS_SCHEMA);

    // Migration: Add screenshot column to messages table if it doesn't exist
    try {
      _db.exec("ALTER TABLE messages ADD COLUMN screenshot TEXT");
      console.log('[DB] Added screenshot column to messages table (migration)');
    } catch (err: any) {
      // Column already exists, ignore the error
      if (!err.message.includes('duplicate column')) {
        console.log('[DB] Migration info:', err.message);
      }
    }
  }
  return _db;
}

export function initDb(dbPath?: string): Database {
  return getDb(dbPath);
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
