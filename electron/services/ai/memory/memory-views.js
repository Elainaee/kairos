import { nowIso, isCurrentlyValid } from "./bitemporal.js";

// MemoryViews — 派生视图管理器
// 从 MemoryLedger 事件构建物化视图表，支持增量更新和全量重建

export class MemoryViews {
  constructor(database, ledger) {
    this.database = database;
    this.ledger = ledger;
    this._statements = null;
  }

  _db() {
    if (!this.database?.available) throw new Error("sqlite_unavailable");
    if (!this._statements) {
      const db = this.database;
      this._statements = {
        // Profile
        getProfileFields: db.prepare(
          "SELECT field_key, field_value, category, confidence, valid_from, valid_to, transaction_time, source_event_id, access_count, last_accessed_at FROM memory_profile_fields ORDER BY category, field_key"
        ),
        getProfileField: db.prepare(
          "SELECT field_key, field_value, category, confidence, valid_from, valid_to, transaction_time, source_event_id, access_count, last_accessed_at FROM memory_profile_fields WHERE field_key = ?"
        ),
        upsertProfile: db.prepare(
          "INSERT OR REPLACE INTO memory_profile_fields (field_key, field_value, category, confidence, valid_from, valid_to, transaction_time, source_event_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        ),
        insertProfileHistory: db.prepare(
          "INSERT INTO memory_profile_history (field_key, field_value, valid_from, valid_to, transaction_time, source_event_id) VALUES (?, ?, ?, ?, ?, ?)"
        ),
        getProfileHistory: db.prepare(
          "SELECT history_id, field_key, field_value, valid_from, valid_to, transaction_time, source_event_id FROM memory_profile_history WHERE field_key = ? ORDER BY valid_from DESC"
        ),
        deleteProfileField: db.prepare(
          "DELETE FROM memory_profile_fields WHERE field_key = ?"
        ),
        // Timeline
        insertTimeline: db.prepare(
          "INSERT OR IGNORE INTO memory_timeline (event_time, event_type, title, detail, importance, source_event_id, conversation_id) VALUES (?, ?, ?, ?, ?, ?, ?)"
        ),
        getTimeline: null,    // 动态构建
        // FTS
        insertFts: db.prepare(
          "INSERT INTO memory_fts (content, content_type, source_id) VALUES (?, ?, ?)"
        ),
        deleteFts: db.prepare(
          "DELETE FROM memory_fts WHERE source_id = ?"
        ),
        searchFts: null,       // 动态构建
        // Session metadata
        getSessionMeta: db.prepare(
          "SELECT session_id, conversation_id, timezone, language, device, model, model_version, started_at, ended_at, payload FROM memory_session_metadata WHERE session_id = ?"
        ),
        upsertSession: db.prepare(
          "INSERT OR REPLACE INTO memory_session_metadata (session_id, conversation_id, timezone, language, device, model, model_version, started_at, ended_at, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ),
        endSession: db.prepare(
          "UPDATE memory_session_metadata SET ended_at = ? WHERE session_id = ? AND ended_at IS NULL"
        ),
        // View state
        getViewState: db.prepare(
          "SELECT last_processed_sequence, updated_at FROM memory_view_state WHERE view_name = ?"
        ),
        upsertViewState: db.prepare(
          "INSERT OR REPLACE INTO memory_view_state (view_name, last_processed_sequence, updated_at) VALUES (?, ?, ?)"
        ),
      };
    }
    return this._statements;
  }

  // ====== Profile（Layer 2）======

  getProfile({ category = null, asOf = null } = {}) {
    const stmts = this._db();
    const rows = stmts.getProfileFields.all().map(r => ({
      ...r,
      access_count: Number(r.access_count),
      currentlyValid: isCurrentlyValid(r, asOf),
    }));

    let filtered = rows;
    if (asOf) filtered = filtered.filter(r => isCurrentlyValid(r, asOf));
    else filtered = filtered.filter(r => r.valid_to == null);
    if (category) filtered = filtered.filter(r => r.category === category);

    return filtered.map(row => ({
      fieldKey: row.field_key,
      value: row.field_value,
      category: row.category,
      confidence: row.confidence,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      sourceEventId: row.source_event_id,
      accessCount: row.access_count,
      lastAccessedAt: row.last_accessed_at,
    }));
  }

  getProfileField(fieldKey, { includeHistory = false } = {}) {
    const stmts = this._db();
    const row = stmts.getProfileField.get(fieldKey);
    if (!row) return null;
    const current = {
      fieldKey: row.field_key,
      value: row.field_value,
      category: row.category,
      confidence: row.confidence,
      validFrom: row.valid_from,
      validTo: row.valid_to,
      sourceEventId: row.source_event_id,
      accessCount: Number(row.access_count),
      lastAccessedAt: row.last_accessed_at,
    };
    if (!includeHistory) return current;

    const historyRows = stmts.getProfileHistory.all(fieldKey);
    return {
      ...current,
      history: historyRows.map(r => ({
        historyId: r.history_id,
        fieldValue: r.field_value,
        validFrom: r.valid_from,
        validTo: r.valid_to,
        transactionTime: r.transaction_time,
        sourceEventId: r.source_event_id,
      })),
    };
  }

  updateProfileField({ fieldKey, value, category = "other", confidence = 0.7, validFrom, validTo = null, sourceEventId }) {
    const stmts = this._db();
    const txTime = nowIso();
    const vFrom = validFrom || txTime;

    // 检查是否有已有记录
    const existing = stmts.getProfileField.get(fieldKey);
    if (existing && existing.valid_to == null) {
      // 关闭旧记录
      stmts.upsertProfile.run(
        existing.field_key, existing.field_value, existing.category,
        existing.confidence, existing.valid_from, vFrom,
        existing.transaction_time, existing.source_event_id
      );
      // 写入历史
      stmts.insertProfileHistory.run(
        existing.field_key, existing.field_value,
        existing.valid_from, vFrom, existing.transaction_time,
        existing.source_event_id
      );
    }

    // 插入新值
    stmts.upsertProfile.run(fieldKey, value, category, confidence, vFrom, validTo, txTime, sourceEventId);
    stmts.insertProfileHistory.run(fieldKey, value, vFrom, validTo, txTime, sourceEventId);

    // 更新 FTS 索引
    stmts.deleteFts.run(sourceEventId || fieldKey);
    stmts.insertFts.run(`${fieldKey} ${value}`, "profile", sourceEventId || fieldKey);

    return { fieldKey, value, category, confidence, validFrom: vFrom, validTo, transactionTime: txTime };
  }

  forgetProfileField(fieldKey) {
    const stmts = this._db();
    const existing = stmts.getProfileField.get(fieldKey);
    if (!existing) return false;
    const now = nowIso();
    stmts.upsertProfile.run(
      existing.field_key, existing.field_value, existing.category,
      existing.confidence, existing.valid_from, now,
      existing.transaction_time, existing.source_event_id
    );
    stmts.insertProfileHistory.run(
      existing.field_key, existing.field_value,
      existing.valid_from, now, existing.transaction_time,
      existing.source_event_id
    );
    return true;
  }

  // ====== 时间线 ======

  addToTimeline({ eventTime, eventType, title, detail, importance = 3, sourceEventId, conversationId }) {
    const stmts = this._db();
    stmts.insertTimeline.run(eventTime, eventType, title, detail, Math.min(5, Math.max(1, importance)), sourceEventId, conversationId || null);
  }

  getTimeline({ from, to, limit = 50, minImportance = 1, eventType = null } = {}) {
    this._db();
    const conditions = [];
    const params = [];
    if (from) { conditions.push("event_time >= ?"); params.push(from); }
    if (to) { conditions.push("event_time <= ?"); params.push(to); }
    if (minImportance > 1) { conditions.push("importance >= ?"); params.push(minImportance); }
    if (eventType) { conditions.push("event_type = ?"); params.push(eventType); }
    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const sql = `SELECT timeline_id, event_time, event_type, title, detail, importance, source_event_id, conversation_id FROM memory_timeline ${where} ORDER BY event_time DESC LIMIT ${Math.min(Number(limit), 500)}`;
    return this.database.prepare(sql).all(...params);
  }

  // ====== FTS5 搜索 ======

  searchFTS(query, { limit = 20, contentType = null } = {}) {
    this._db();
    const conditions = ["memory_fts MATCH ?"];
    const params = [String(query || "")];
    if (contentType) { conditions.push("content_type = ?"); params.push(contentType); }
    const sql = `SELECT content, content_type, source_id, rank FROM memory_fts WHERE ${conditions.join(" AND ")} ORDER BY rank LIMIT ${Math.min(Number(limit), 100)}`;
    return this.database.prepare(sql).all(...params);
  }

  addToFTS(content, contentType, sourceId) {
    this._db();
    this._statements.insertFts.run(content, contentType, sourceId);
  }

  removeFromFTS(sourceId) {
    this._db();
    this._statements.deleteFts.run(sourceId);
  }

  // ====== 会话元数据（Layer 1） ======

  getSessionMetadata(sessionId) {
    this._db();
    const row = this._statements.getSessionMeta.get(sessionId);
    if (!row) return null;
    return {
      sessionId: row.session_id,
      conversationId: row.conversation_id,
      timezone: row.timezone,
      language: row.language,
      device: row.device,
      model: row.model,
      modelVersion: row.model_version,
      startedAt: row.started_at,
      endedAt: row.ended_at,
      payload: parseJson(row.payload),
    };
  }

  startSession({ sessionId, conversationId, timezone = "Asia/Shanghai", language = "zh-CN", device = "desktop", model = "", modelVersion = "" }) {
    const stmts = this._db();
    const startedAt = nowIso();
    stmts.upsertSession.run(sessionId, conversationId || null, timezone, language, device, model, modelVersion, startedAt, null, "{}");
    return { sessionId, startedAt };
  }

  endSession(sessionId) {
    this._db();
    this._statements.endSession.run(nowIso(), sessionId);
  }

  // ====== 视图重建 ======

  processNewEvents() {
    const viewName = "memory_views";
    const stmts = this._db();
    const state = stmts.getViewState.get(viewName);
    const lastSeq = state ? Number(state.last_processed_sequence) : 0;
    const currentSeq = this.ledger.getMaxSequence();
    if (currentSeq <= lastSeq) return 0;

    const events = this.ledger.getEvents({ fromSequence: lastSeq, toSequence: currentSeq, order: "asc", limit: 0 });
    let count = 0;
    for (const event of events) {
      const payload = typeof event.payload === "object" ? event.payload : {};
      switch (event.event_type) {
        case "profile_update":
        case "memory_import":
          if (payload.fieldKey && payload.value) {
            this.updateProfileField({
              fieldKey: payload.fieldKey,
              value: payload.value,
              category: payload.category || "other",
              confidence: event.confidence,
              validFrom: event.valid_time,
              sourceEventId: event.event_id,
            });
          }
          break;
        case "memory_write":
          if (payload.key && payload.value) {
            this.addTimelineOrProfile(event);
          }
          break;
        case "memory_forget":
          this.removeFromFTS(event.event_id);
          break;
      }
      count++;
    }

    const now = nowIso();
    stmts.upsertViewState.run(viewName, currentSeq, now);
    return count;
  }

  addTimelineOrProfile(event) {
    const payload = typeof event.payload === "object" ? event.payload : {};
    const title = payload.key || "记忆";
    const detail = payload.value || "";
    this.addToTimeline({
      eventTime: event.valid_time,
      eventType: event.event_type,
      title,
      detail,
      importance: 3,
      sourceEventId: event.event_id,
      conversationId: event.conversation_id,
    });
    // Profile 类型同时也写入 profile_fields
    if (payload.type === "profile" || payload.type === "preference") {
      const fieldKey = `${payload.type || "fact"}.${title}`;
      this.updateProfileField({
        fieldKey,
        value: detail,
        category: mapTypeToCategory(payload.type),
        confidence: event.confidence,
        validFrom: event.valid_time,
        sourceEventId: event.event_id,
      });
    }
  }

  rebuildAll() {
    // 清空视图并重放所有事件
    this._db(); // ensure statements are initialized
    const tables = ["memory_profile_fields", "memory_profile_history", "memory_timeline", "memory_sliding_window", "memory_conversation_summaries", "memory_session_metadata", "memory_view_state"];
    for (const t of tables) {
      if (this.database.tableExists(t)) this.database.prepare(`DELETE FROM ${t}`).run();
    }
    if (this.database.tableExists("memory_fts")) this.database.prepare("DELETE FROM memory_fts").run();
    this._statements = null; // reset prepared statements
    this._db();

    const events = this.ledger.getEvents({ order: "asc", limit: 0 });
    for (const event of events) {
      const payload = typeof event.payload === "object" ? event.payload : {};
      switch (event.event_type) {
        case "profile_update": case "memory_import":
          if (payload.fieldKey) this.updateProfileField({ fieldKey: payload.fieldKey, value: payload.value || "", category: payload.category || "other", confidence: event.confidence, validFrom: event.valid_time, sourceEventId: event.event_id });
          break;
        case "memory_write":
          if (payload.key) this.addTimelineOrProfile(event);
          break;
        case "session_start":
          if (payload.sessionId) this.startSession({ sessionId: payload.sessionId, conversationId: event.conversation_id, timezone: payload.timezone, language: payload.language, device: payload.device, model: payload.model });
          break;
        case "session_end":
          if (payload.sessionId) this.endSession(payload.sessionId);
          break;
      }
    }
    return events.length;
  }
}

function mapTypeToCategory(type) {
  switch (String(type || "").toLowerCase()) {
    case "profile": return "identity";
    case "preference": return "preference";
    case "goal": return "work";
    case "activity": return "other";
    case "fact": return "knowledge";
    default: return "other";
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}
