import path from "node:path";

export const APP_DB_SCHEMA_VERSION = 1;

const ENTITY_TABLES = {
  schedules: "app_schedules",
  habits: "app_habits",
  checkins: "app_checkins",
  notes: "app_notes",
  studyPlans: "app_study_plans"
};

function entityId(row, index) {
  return String(row?.id || `${index}`);
}

function entityTitle(row) {
  return String(row?.title || row?.name || "").trim();
}

function entityDate(row) {
  return String(row?.date || row?.start_date || row?.created_at?.slice?.(0, 10) || "");
}

function safeJson(value) {
  return JSON.stringify(value ?? null);
}

export class KairosAppDatabase {
  constructor(filePath, options = {}) {
    this.filePath = filePath;
    this.DatabaseSync = options.DatabaseSync || null;
    this.db = null;
    this.available = false;
    this.reason = "";
  }

  async loadDriver() {
    if (this.DatabaseSync) return this.DatabaseSync;
    try {
      const sqlite = await import("node:sqlite");
      return sqlite.DatabaseSync;
    } catch (error) {
      this.reason = error?.code || error?.message || "sqlite_unavailable";
      return null;
    }
  }

  async initialize() {
    const Driver = await this.loadDriver();
    if (!Driver) return { available: false, reason: this.reason || "sqlite_unavailable" };
    this.db = new Driver(this.filePath);
    this.available = true;
    this.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_state_snapshots (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        version INTEGER NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_schedules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        end_date TEXT NOT NULL,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_habits (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        streak_count INTEGER NOT NULL DEFAULT 0,
        completion_count INTEGER NOT NULL DEFAULT 0,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_checkins (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_notes (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS app_study_plans (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        date TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS json_store_snapshots (
        store TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
    `);
    this.prepare("INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(`app-db-v${APP_DB_SCHEMA_VERSION}`, new Date().toISOString());
    return { available: true, path: this.filePath, version: APP_DB_SCHEMA_VERSION };
  }

  exec(sql) {
    if (!this.db) return;
    this.db.exec(sql);
  }

  prepare(sql) {
    if (!this.db) throw new Error("sqlite_unavailable");
    return this.db.prepare(sql);
  }

  saveCollection(table, rows = [], bindRow) {
    this.prepare(`DELETE FROM ${table}`).run();
    const insert = this.prepare(bindRow.sql);
    rows.forEach((row, index) => insert.run(...bindRow.values(row, index)));
  }

  async saveAppStateSnapshot(state = {}) {
    if (!this.db) return { available: false, reason: this.reason || "sqlite_unavailable" };
    const updatedAt = new Date().toISOString();
    this.exec("BEGIN IMMEDIATE");
    try {
      this.prepare("INSERT OR REPLACE INTO app_state_snapshots (id, version, payload, updated_at) VALUES (1, ?, ?, ?)")
        .run(Number(state.version || 0), safeJson(state), updatedAt);
      this.saveCollection(ENTITY_TABLES.schedules, state.schedules || [], {
        sql: "INSERT OR REPLACE INTO app_schedules (id, title, type, date, end_date, status, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        values: (row, index) => [entityId(row, index), entityTitle(row), String(row?.type || ""), String(row?.date || ""), String(row?.end_date || row?.date || ""), String(row?.status || ""), safeJson(row), String(row?.updated_at || updatedAt)]
      });
      this.saveCollection(ENTITY_TABLES.habits, state.habits || [], {
        sql: "INSERT OR REPLACE INTO app_habits (id, name, streak_count, completion_count, payload, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
        values: (row, index) => [entityId(row, index), String(row?.name || ""), Number(row?.streak || 0), Array.isArray(row?.dates) ? row.dates.length : 0, safeJson(row), String(row?.updated_at || updatedAt)]
      });
      this.saveCollection(ENTITY_TABLES.checkins, state.checkins || [], {
        sql: "INSERT OR REPLACE INTO app_checkins (id, title, date, payload, updated_at) VALUES (?, ?, ?, ?, ?)",
        values: (row, index) => [entityId(row, index), entityTitle(row), entityDate(row), safeJson(row), String(row?.updated_at || updatedAt)]
      });
      this.saveCollection(ENTITY_TABLES.notes, state.notes || [], {
        sql: "INSERT OR REPLACE INTO app_notes (id, title, date, payload, updated_at) VALUES (?, ?, ?, ?, ?)",
        values: (row, index) => [entityId(row, index), entityTitle(row), entityDate(row), safeJson(row), String(row?.updated_at || updatedAt)]
      });
      this.saveCollection(ENTITY_TABLES.studyPlans, state.studyPlans || [], {
        sql: "INSERT OR REPLACE INTO app_study_plans (id, title, date, payload, updated_at) VALUES (?, ?, ?, ?, ?)",
        values: (row, index) => [entityId(row, index), entityTitle(row), entityDate(row), safeJson(row), String(row?.updated_at || updatedAt)]
      });
      this.exec("COMMIT");
      return { available: true, updated_at: updatedAt };
    } catch (error) {
      this.exec("ROLLBACK");
      throw error;
    }
  }

  readAppStateSnapshot() {
    if (!this.db) return null;
    const row = this.prepare("SELECT payload FROM app_state_snapshots WHERE id = 1").get();
    return row?.payload ? JSON.parse(row.payload) : null;
  }

  saveJsonStoreSnapshot(store, payload = {}, summary = {}) {
    if (!this.db) return { available: false, reason: this.reason || "sqlite_unavailable" };
    const updatedAt = new Date().toISOString();
    this.prepare("INSERT OR REPLACE INTO json_store_snapshots (store, version, summary, payload, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(String(store || ""), Number(payload?.version || 0), safeJson(summary), safeJson(payload), updatedAt);
    return { available: true, updated_at: updatedAt };
  }

  readJsonStoreSummary(store) {
    if (!this.db) return null;
    const row = this.prepare("SELECT store, version, summary, updated_at FROM json_store_snapshots WHERE store = ?").get(String(store || ""));
    return row ? { ...row, summary: JSON.parse(row.summary) } : null;
  }

  readJsonStorePayload(store) {
    if (!this.db) return null;
    const row = this.prepare("SELECT payload FROM json_store_snapshots WHERE store = ?").get(String(store || ""));
    return row?.payload ? JSON.parse(row.payload) : null;
  }

  audit() {
    if (!this.db) return { available: false, reason: this.reason || "sqlite_unavailable" };
    const tables = {};
    for (const [key, table] of Object.entries(ENTITY_TABLES)) {
      tables[key] = this.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    }
    const snapshot = this.prepare("SELECT version, updated_at FROM app_state_snapshots WHERE id = 1").get() || null;
    const migrations = this.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY applied_at").all();
    const stores = this.prepare("SELECT store, version, summary, updated_at FROM json_store_snapshots ORDER BY store").all()
      .map(row => ({ ...row, summary: JSON.parse(row.summary) }));
    return { available: true, path: path.resolve(this.filePath), version: APP_DB_SCHEMA_VERSION, snapshot, tables, stores, migrations };
  }

  close() {
    this.db?.close?.();
    this.db = null;
    this.available = false;
  }
}
