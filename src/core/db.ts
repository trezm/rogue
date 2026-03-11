import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

let _db: Database.Database | null = null;
let _rogueHome: string = '';

export function getRogueHome(): string {
  if (_rogueHome) return _rogueHome;
  // Walk up from cwd looking for .rogue directory
  let dir = process.cwd();
  while (dir !== path.dirname(dir)) {
    if (fs.existsSync(path.join(dir, '.rogue'))) {
      _rogueHome = path.join(dir, '.rogue');
      return _rogueHome;
    }
    dir = path.dirname(dir);
  }
  // Default to ~/.rogue
  _rogueHome = path.join(process.env.HOME || '~', '.rogue');
  return _rogueHome;
}

export function setRogueHome(dir: string): void {
  _rogueHome = dir;
  _db = null; // reset db singleton
}

function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      repo_path TEXT NOT NULL UNIQUE,
      main_branch TEXT NOT NULL DEFAULT 'main',
      default_qa_requirements TEXT NOT NULL DEFAULT '["human_review"]',
      max_concurrent_agents INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'blocked'
        CHECK (state IN ('blocked', 'ready', 'in_progress', 'qa', 'complete')),
      qa_requirements TEXT NOT NULL DEFAULT '["human_review"]',
      qa_agent_approved INTEGER NOT NULL DEFAULT 0,
      qa_human_approved INTEGER NOT NULL DEFAULT 0,
      worktree_path TEXT,
      branch_name TEXT,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE IF NOT EXISTS ticket_dependencies (
      ticket_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      depends_on_id TEXT NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
      PRIMARY KEY (ticket_id, depends_on_id)
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      author TEXT NOT NULL,
      type TEXT NOT NULL,
      content TEXT NOT NULL,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id)
    );
  `);
}

export function getDb(): Database.Database {
  if (_db) return _db;

  const home = getRogueHome();
  fs.mkdirSync(home, { recursive: true });

  const dbPath = path.join(home, 'rogue.db');
  _db = new Database(dbPath);
  _db.pragma('journal_mode = WAL');
  initSchema(_db);
  return _db;
}
