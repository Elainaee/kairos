import path from "node:path";
import crypto from "node:crypto";

export const APP_DB_SCHEMA_VERSION = 5;

const ENTITY_TABLES = {
  schedules: "app_schedules",
  habits: "app_habits",
  checkins: "app_checkins"
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

function mapLegacyTypeToCategory(type) {
  switch (String(type || "").toLowerCase()) {
    case "profile": return "identity";
    case "preference": return "preference";
    case "goal": return "work";
    case "activity": return "other";
    default: return "other";
  }
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
      CREATE TABLE IF NOT EXISTS memory_ledger (
        sequence_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id TEXT NOT NULL UNIQUE,
        event_type TEXT NOT NULL,
        conversation_id TEXT,
        session_id TEXT,
        valid_time TEXT NOT NULL,
        transaction_time TEXT NOT NULL,
        source TEXT NOT NULL DEFAULT 'conversation',
        confidence REAL NOT NULL DEFAULT 0.7,
        payload TEXT NOT NULL,
        correlation_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_ledger_type ON memory_ledger (event_type);
      CREATE INDEX IF NOT EXISTS idx_memory_ledger_conversation ON memory_ledger (conversation_id, sequence_id);
      CREATE INDEX IF NOT EXISTS idx_memory_ledger_valid_time ON memory_ledger (valid_time);
      CREATE INDEX IF NOT EXISTS idx_memory_ledger_correlation ON memory_ledger (correlation_id);
      CREATE TABLE IF NOT EXISTS memory_profile_fields (
        field_key TEXT PRIMARY KEY,
        field_value TEXT NOT NULL,
        category TEXT NOT NULL DEFAULT 'other',
        confidence REAL NOT NULL DEFAULT 0.7,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        transaction_time TEXT NOT NULL,
        source_event_id TEXT,
        access_count INTEGER NOT NULL DEFAULT 0,
        last_accessed_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_profile_category ON memory_profile_fields (category);
      CREATE TABLE IF NOT EXISTS memory_profile_history (
        history_id INTEGER PRIMARY KEY AUTOINCREMENT,
        field_key TEXT NOT NULL,
        field_value TEXT NOT NULL,
        valid_from TEXT NOT NULL,
        valid_to TEXT,
        transaction_time TEXT NOT NULL,
        source_event_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_profile_history_key ON memory_profile_history (field_key, valid_from);
      CREATE TABLE IF NOT EXISTS memory_conversation_summaries (
        conversation_id TEXT PRIMARY KEY,
        summary_text TEXT,
        goals TEXT DEFAULT '[]',
        open_tasks TEXT DEFAULT '[]',
        key_constraints TEXT DEFAULT '[]',
        topics TEXT DEFAULT '[]',
        updated_at TEXT NOT NULL,
        last_message_sequence INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS memory_sliding_window (
        conversation_id TEXT NOT NULL,
        position INTEGER NOT NULL,
        message_id TEXT NOT NULL,
        role TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TEXT NOT NULL,
        PRIMARY KEY (conversation_id, position)
      );
      CREATE TABLE IF NOT EXISTS memory_session_metadata (
        session_id TEXT PRIMARY KEY,
        conversation_id TEXT,
        timezone TEXT,
        language TEXT,
        device TEXT,
        model TEXT,
        model_version TEXT,
        started_at TEXT NOT NULL,
        ended_at TEXT,
        payload TEXT DEFAULT '{}'
      );
      CREATE TABLE IF NOT EXISTS memory_timeline (
        timeline_id INTEGER PRIMARY KEY AUTOINCREMENT,
        event_time TEXT NOT NULL,
        event_type TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT,
        importance INTEGER NOT NULL DEFAULT 3,
        source_event_id TEXT,
        conversation_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_memory_timeline_time ON memory_timeline (event_time DESC);
      CREATE INDEX IF NOT EXISTS idx_memory_timeline_importance ON memory_timeline (importance DESC);
      CREATE TABLE IF NOT EXISTS memory_view_state (
        view_name TEXT PRIMARY KEY,
        last_processed_sequence INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );
    `);
    this.exec("CREATE VIRTUAL TABLE IF NOT EXISTS memory_fts USING fts5(content, content_type, source_id, tokenize='unicode61')");
    await this.migrateStudyPlans();
    await this.migrateJsonStoreSnapshots();
    await this.migrateAgentMemoryV1();
    await this.migrateNotesRemoval();
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

  // 将旧的 memories[] 数组导入新的 Memory Ledger 架构
  // 幂等：已存在 migration ID 时跳过
  async migrateAgentMemoryV1() {
    const migrationId = "app-db-v4-agent-memory";
    if (this.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(migrationId)) return;

    // 读取旧的 ai-data JSON blob 中的 memories 数组
    const aiData = this.readStorePayload("ai-data");
    const legacyMemories = Array.isArray(aiData?.memories) ? aiData.memories : [];
    if (!legacyMemories.length) {
      // 没有旧数据，直接标记迁移完成
      this.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, new Date().toISOString());
      return;
    }

    const now = new Date().toISOString();
    this.exec("BEGIN IMMEDIATE");
    try {
      const insertEvent = this.prepare(
        "INSERT OR IGNORE INTO memory_ledger (event_id, event_type, conversation_id, session_id, valid_time, transaction_time, source, confidence, payload, correlation_id) VALUES (?, ?, NULL, NULL, ?, ?, ?, ?, ?, NULL)"
      );
      const insertProfile = this.prepare(
        "INSERT OR REPLACE INTO memory_profile_fields (field_key, field_value, category, confidence, valid_from, valid_to, transaction_time, source_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
      );
      const insertProfileHistory = this.prepare(
        "INSERT INTO memory_profile_history (field_key, field_value, valid_from, valid_to, transaction_time, source_event_id) VALUES (?, ?, ?, ?, ?, ?)"
      );
      const insertTimeline = this.prepare(
        "INSERT OR IGNORE INTO memory_timeline (event_time, event_type, title, detail, importance, source_event_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, NULL)"
      );
      const insertFts = this.prepare(
        "INSERT INTO memory_fts (content, content_type, source_id) VALUES (?, ?, ?)"
      );

      for (const mem of legacyMemories) {
        const eventId = mem.id || crypto.randomUUID();
        const validTime = mem.createdAt || now;
        const txTime = now;
        const source = mem.source || "conversation";

        // 1. 写入 memory_ledger
        const eventType = mem.deletedAt ? "memory_forget" : "memory_import";
        const payload = JSON.stringify({
          legacy_type: mem.type || "fact",
          key: mem.key || "",
          value: mem.value || "",
          legacy_id: mem.id,
          legacy_createdAt: mem.createdAt,
          legacy_deletedAt: mem.deletedAt || null,
        });

        insertEvent.run(eventId, eventType, validTime, txTime, source, mem.confidence ?? 0.7, payload);

        // 2. profile / preference 类型的记忆写入 memory_profile_fields
        if (!mem.deletedAt && (mem.type === "profile" || mem.type === "preference")) {
          const fieldKey = `legacy.${mem.type}.${mem.key || mem.id}`;
          const category = mapLegacyTypeToCategory(mem.type);
          insertProfile.run(fieldKey, mem.value || "", category, mem.confidence ?? 0.7, validTime, null, txTime, eventId);
          insertProfileHistory.run(fieldKey, mem.value || "", validTime, null, txTime, eventId);

          // FTS
          const content = `${fieldKey} ${mem.value || ""}`;
          insertFts.run(content, "profile", eventId);
        }

        // 3. 写入 memory_timeline
        if (!mem.deletedAt) {
          insertTimeline.run(
            validTime,
            "memory_import",
            mem.key || "记忆",
            mem.value || "",
            3,
            eventId
          );
        }
      }

      this.prepare("INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)").run(migrationId, now);
      this.exec("COMMIT");
    } catch (error) {
      this.exec("ROLLBACK");
      throw error;
    }
  }

  async migrateNotesRemoval() {
    const migrationId = "app-db-v5-remove-notes";
    if (this.prepare("SELECT 1 FROM schema_migrations WHERE id = ?").get(migrationId)) return;
    this.exec("BEGIN IMMEDIATE");
    try {
      if (this.tableExists("app_notes")) this.exec("DROP TABLE app_notes");
      const snapshot = this.readAppStateSnapshot();
      if (snapshot) {
        delete snapshot.notes;
        delete snapshot.moods;
        snapshot.version = Math.max(Number(snapshot.version || 0), 4);
        this.prepare("UPDATE app_state_snapshots SET version = ?, payload = ?, updated_at = ? WHERE id = 1")
          .run(snapshot.version, safeJson(snapshot), new Date().toISOString());
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
    const memoryTables = ["memory_ledger","memory_profile_fields","memory_profile_history","memory_conversation_summaries","memory_sliding_window","memory_session_metadata","memory_timeline","memory_view_state"];
    const memory = {};
    for (const name of memoryTables) {
      if (this.tableExists(name)) memory[name] = this.prepare(`SELECT COUNT(*) AS count FROM ${name}`).get().count;
    }
    const memoryMigrated = Boolean(this.prepare("SELECT 1 FROM schema_migrations WHERE id = 'app-db-v4-agent-memory'").get());
    return { available: true, path: path.resolve(this.filePath), version: APP_DB_SCHEMA_VERSION, snapshot, tables, stores, binaryAssets, memory: { ...memory, migrated: memoryMigrated }, migrations };
  }

  close() {
    this.db?.close?.();
    this.db = null;
    this.available = false;
  }
}
