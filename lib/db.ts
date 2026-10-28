import fs from "node:fs"
import path from "node:path"

import Database from "better-sqlite3"

const globalKey = "__nfwStatusDb"

type DbState = {
  db?: Database.Database
}

function state(): DbState {
  const root = globalThis as typeof globalThis & { [globalKey]?: DbState }
  if (!root[globalKey]) {
    root[globalKey] = {}
  }
  return root[globalKey]
}

export function dataDir(): string {
  return path.join(process.cwd(), "data")
}

export function uploadsDir(): string {
  return path.join(dataDir(), "uploads")
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS status_segments (
      id TEXT PRIMARY KEY,
      level TEXT NOT NULL CHECK (level IN ('very_free', 'free', 'doing', 'busy', 'afk')),
      content TEXT NOT NULL,
      started_at TEXT NOT NULL,
      ended_at TEXT
    );

    CREATE TABLE IF NOT EXISTS status_phrases (
      id TEXT PRIMARY KEY,
      text TEXT NOT NULL UNIQUE,
      last_used_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meals (
      id TEXT PRIMARY KEY,
      day TEXT NOT NULL,
      slot TEXT NOT NULL CHECK (slot IN ('breakfast', 'lunch', 'dinner')),
      eaten_at TEXT NOT NULL,
      UNIQUE (day, slot)
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      path TEXT NOT NULL,
      mime TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS meal_photos (
      id TEXT PRIMARY KEY,
      meal_id TEXT NOT NULL REFERENCES meals(id) ON DELETE CASCADE,
      sort INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS calendar_subscriptions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      last_ok_at TEXT,
      last_error TEXT
    );

    CREATE TABLE IF NOT EXISTS calendar_events (
      id TEXT PRIMARY KEY,
      subscription_id TEXT NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
      uid TEXT NOT NULL,
      title TEXT NOT NULL,
      start_at TEXT NOT NULL,
      end_at TEXT NOT NULL,
      all_day INTEGER NOT NULL,
      day TEXT NOT NULL,
      UNIQUE (subscription_id, uid, start_at, day)
    );

    CREATE TABLE IF NOT EXISTS calendar_state (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      refreshed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS sleep_days (
      date TEXT PRIMARY KEY,
      bedtime TEXT,
      wake_time TEXT,
      duration_minutes INTEGER,
      stages_json TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sleep_screenshots (
      id TEXT PRIMARY KEY,
      date TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_segments_started ON status_segments (started_at);
    CREATE INDEX IF NOT EXISTS idx_meals_day ON meals (day);
    CREATE INDEX IF NOT EXISTS idx_events_day ON calendar_events (day);
    CREATE INDEX IF NOT EXISTS idx_screenshots_date ON sleep_screenshots (date);
  `)
  rebuildCalendarEvents(db)
  db.prepare(
    "INSERT INTO calendar_state (id, refreshed_at) SELECT 1, NULL WHERE NOT EXISTS (SELECT 1 FROM calendar_state WHERE id = 1)"
  ).run()
}

function rebuildCalendarEvents(db: Database.Database): void {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'calendar_events'"
    )
    .get() as { sql: string } | undefined
  if (!row) {
    return
  }
  const compact = row.sql.replace(/\s+/g, " ").toLowerCase()
  if (compact.includes("unique (subscription_id, uid, start_at, day)")) {
    return
  }
  db.pragma("foreign_keys = OFF")
  try {
    db.exec(`
      CREATE TABLE calendar_events_next (
        id TEXT PRIMARY KEY,
        subscription_id TEXT NOT NULL REFERENCES calendar_subscriptions(id) ON DELETE CASCADE,
        uid TEXT NOT NULL,
        title TEXT NOT NULL,
        start_at TEXT NOT NULL,
        end_at TEXT NOT NULL,
        all_day INTEGER NOT NULL,
        day TEXT NOT NULL,
        UNIQUE (subscription_id, uid, start_at, day)
      );
      INSERT INTO calendar_events_next (id, subscription_id, uid, title, start_at, end_at, all_day, day)
        SELECT id, subscription_id, uid, title, start_at, end_at, all_day, day FROM calendar_events;
      DROP TABLE calendar_events;
      ALTER TABLE calendar_events_next RENAME TO calendar_events;
      CREATE INDEX IF NOT EXISTS idx_events_day ON calendar_events (day);
    `)
  } finally {
    db.pragma("foreign_keys = ON")
  }
}

export function getDb(): Database.Database {
  const current = state()
  if (current.db) {
    return current.db
  }
  fs.mkdirSync(uploadsDir(), { recursive: true })
  const db = new Database(path.join(dataDir(), "status.db"))
  db.pragma("journal_mode = WAL")
  db.pragma("foreign_keys = ON")
  db.pragma("busy_timeout = 5000")
  migrate(db)
  current.db = db
  return db
}
