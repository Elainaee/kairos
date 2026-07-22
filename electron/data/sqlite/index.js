import path from "node:path";
import crypto from "node:crypto";

export const APP_DB_SCHEMA_VERSION = 3;

const ENTITY_TABLES = {
  schedules: "app_schedules",
  habits: "app_habits",
  checkins: "app_checkins",
  notes: "app_notes"
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

function migrateStudyPlanState(snapshot = {}, legacyPlans = []) {
  const now = new Date().toISOString();
  const plans = [...(Array.isArray(snapshot?.studyPlans) ? snapshot.studyPlans : []), ...legacyPlans];
  const schedules = Array.isArray(snapshot?.schedules) ? [...snapshot.schedules] : [];
  schedules.push(...plans.map(plan => ({ ...plan, id: String(plan?.id || crypto.randomUUID()), date: plan?.date || plan?.start_date || now.slice(0, 10), end_date: plan?.end_date || plan?.start_date || plan?.date || now.slice(0, 10), type: "event", migrated_from: "studyPlans", updated_at: plan?.updated_at || now })));
  const state = { ...snapshot, version: Math.max(3, Number(snapshot?.version || 0)), schedules };
  delete state.studyPlans;
  return state;
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
      CREATE TABLE IF NOT EXISTS store_payloads (
        store TEXT PRIMARY KEY,
        version INTEGER NOT NULL DEFAULT 0,
        summary TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS binary_assets (
        id TEXT PRIMARY KEY,
        owner_type TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        byte_length INTEGER NOT NULL,
        checksum TEXT NOT NULL,
        payload BLOB NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_binary_assets_owner ON binary_assets (owner_type, owner_id);
    `);
    await this.migrateStudyPlans();
    await this.migrateJsonStoreSnapshots();
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

  tableExists(name) {
    return Boolean(this.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get(name));
  }

  async migrateStudyPlans() {
    const migrationId = "app-db-v2-remove-study-plans";
    if (this.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(migrationId)) return;
    const hasLegacyTable = this.tableExists("app_study_plans");
    const snapshot = this.readAppStateSnapshot();
    const legacyRows = hasLegacyTable ? this.prepare("SELECT payload FROM app_study_plans ORDER BY updated_at, id").all().map(row => JSON.parse(row.payload)) : [];
    const legacyPlans = [...(Array.isArray(snapshot?.studyPlans) ? snapshot.studyPlans : []), ...legacyRows];
    if (snapshot || legacyPlans.length) await this.saveAppStateSnapshot(migrateStudyPlanState(snapshot || {}, legacyRows));
    this.exec("BEGIN IMMEDIATE");
    try {
      if (hasLegacyTable) this.exec("DROP TABLE app_study_plans");
      this.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
      this.exec("COMMIT");
    } catch (error) {
      this.exec("ROLLBACK");
      throw error;
    }
  }

  async migrateJsonStoreSnapshots() {
    const migrationId = "app-db-v3-store-payloads";
    if (this.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(migrationId)) return;
    const hasLegacyTable = this.tableExists("json_store_snapshots");
    this.exec("BEGIN IMMEDIATE");
    try {
      if (hasLegacyTable) {
        this.exec("INSERT OR REPLACE INTO store_payloads (store, version, summary, payload, updated_at) SELECT store, version, summary, payload, updated_at FROM json_store_snapshots");
        this.exec("DROP TABLE json_store_snapshots");
      }
      this.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
      this.exec("COMMIT");
    } catch (error) {
      this.exec("ROLLBACK");
      throw error;
    }
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

  saveStorePayload(store, payload = {}, summary = {}) {
    if (!this.db) return { available: false, reason: this.reason || "sqlite_unavailable" };
    const updatedAt = new Date().toISOString();
    this.prepare("INSERT OR REPLACE INTO store_payloads (store, version, summary, payload, updated_at) VALUES (?, ?, ?, ?, ?)")
      .run(String(store || ""), Number(payload?.version || 0), safeJson(summary), safeJson(payload), updatedAt);
    return { available: true, updated_at: updatedAt };
  }

  readStoreSummary(store) {
    if (!this.db) return null;
    const row = this.prepare("SELECT store, version, summary, updated_at FROM store_payloads WHERE store = ?").get(String(store || ""));
    return row ? { ...row, summary: JSON.parse(row.summary) } : null;
  }

  readStorePayload(store) {
    if (!this.db) return null;
    const row = this.prepare("SELECT payload FROM store_payloads WHERE store = ?").get(String(store || ""));
    return row?.payload ? JSON.parse(row.payload) : null;
  }

  saveBinaryAsset({ id = crypto.randomUUID(), ownerType, ownerId, name = "", mimeType = "application/octet-stream", payload }) {
    if (!this.db) throw new Error("sqlite_unavailable");
    const bytes = Buffer.from(payload || []);
    if (!bytes.length) throw new Error("binary_asset_empty");
    const now = new Date().toISOString();
    const checksum = crypto.createHash("sha256").update(bytes).digest("hex");
    this.prepare("INSERT OR REPLACE INTO binary_assets (id, owner_type, owner_id, name, mime_type, byte_length, checksum, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM binary_assets WHERE id = ?), ?), ?)")
      .run(String(id), String(ownerType || ""), String(ownerId || ""), String(name), String(mimeType), bytes.length, checksum, bytes, String(id), now, now);
    return { id: String(id), ownerType: String(ownerType || ""), ownerId: String(ownerId || ""), name: String(name), mimeType: String(mimeType), byteLength: bytes.length, checksum, updatedAt: now };
  }

  readBinaryAsset(id) {
    if (!this.db) return null;
    const row = this.prepare("SELECT id, owner_type, owner_id, name, mime_type, byte_length, checksum, payload, created_at, updated_at FROM binary_assets WHERE id = ?").get(String(id || ""));
    return row ? { id: row.id, ownerType: row.owner_type, ownerId: row.owner_id, name: row.name, mimeType: row.mime_type, byteLength: row.byte_length, checksum: row.checksum, payload: Buffer.from(row.payload), createdAt: row.created_at, updatedAt: row.updated_at } : null;
  }

  listBinaryAssets(ownerType, ownerId = null) {
    if (!this.db) return [];
    const rows = ownerId === null
      ? this.prepare("SELECT id, owner_type, owner_id, name, mime_type, byte_length, checksum, created_at, updated_at FROM binary_assets WHERE owner_type = ? ORDER BY created_at, id").all(String(ownerType || ""))
      : this.prepare("SELECT id, owner_type, owner_id, name, mime_type, byte_length, checksum, created_at, updated_at FROM binary_assets WHERE owner_type = ? AND owner_id = ? ORDER BY created_at, id").all(String(ownerType || ""), String(ownerId || ""));
    return rows.map(row => ({ id: row.id, ownerType: row.owner_type, ownerId: row.owner_id, name: row.name, mimeType: row.mime_type, byteLength: row.byte_length, checksum: row.checksum, createdAt: row.created_at, updatedAt: row.updated_at }));
  }

  removeBinaryAsset(id) {
    if (!this.db) throw new Error("sqlite_unavailable");
    return this.prepare("DELETE FROM binary_assets WHERE id = ?").run(String(id || "")).changes > 0;
  }

  audit() {
    if (!this.db) return { available: false, reason: this.reason || "sqlite_unavailable" };
    const tables = {};
    for (const [key, table] of Object.entries(ENTITY_TABLES)) {
      tables[key] = this.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    }
    const snapshot = this.prepare("SELECT version, updated_at FROM app_state_snapshots WHERE id = 1").get() || null;
    const migrations = this.prepare("SELECT id, applied_at FROM schema_migrations ORDER BY applied_at").all();
    const stores = this.prepare("SELECT store, version, summary, updated_at FROM store_payloads ORDER BY store").all()
      .map(row => ({ ...row, summary: JSON.parse(row.summary) }));
    const binaryAssets = this.prepare("SELECT owner_type AS ownerType, COUNT(*) AS count, COALESCE(SUM(byte_length), 0) AS bytes FROM binary_assets GROUP BY owner_type ORDER BY owner_type").all();
    return { available: true, path: path.resolve(this.filePath), version: APP_DB_SCHEMA_VERSION, snapshot, tables, stores, binaryAssets, migrations };
  }

  close() {
    this.db?.close?.();
    this.db = null;
    this.available = false;
  }
}
