import crypto from "node:crypto";
import { nowIso } from "./bitemporal.js";

// MemoryLedger — 事件账本：记忆系统唯一事实源
//
// 设计原则：
//   1. 只追加不修改（append-only），绝不 UPDATE/DELETE 已有事件
//   2. 双时态：valid_time（现实世界时间）+ transaction_time（系统写入时间）
//   3. transaction_time 由系统自动填充，调用方不可指定
//   4. event_id 是 UUID，重复 append 会被 UNIQUE 约束拒绝（幂等）

const VALID_EVENT_TYPES = new Set([
  "memory_write",
  "memory_forget",
  "profile_update",
  "profile_delete",
  "goal_update",
  "goal_delete",
  "conversation_summary",
  "user_message",
  "agent_reply",
  "tool_call",
  "tool_result",
  "session_start",
  "session_end",
  "memory_import",
  "system_note",
]);

export class MemoryLedger {
  constructor(database) {
    this.database = database;
    this._statements = null;
  }

  _db() {
    if (!this.database?.available) throw new Error("sqlite_unavailable");
    if (!this._statements) {
      const db = this.database;
      this._statements = {
        append: db.prepare(
          "INSERT INTO memory_ledger (event_id, event_type, conversation_id, session_id, valid_time, transaction_time, source, confidence, payload, correlation_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
        ),
        getById: db.prepare(
          "SELECT sequence_id, event_id, event_type, conversation_id, session_id, valid_time, transaction_time, source, confidence, payload, correlation_id FROM memory_ledger WHERE event_id = ?"
        ),
        maxSeq: db.prepare(
          "SELECT COALESCE(MAX(sequence_id), 0) AS max_seq FROM memory_ledger"
        ),
      };
    }
    return this._statements;
  }

  append(event = {}) {
    const stmts = this._db();
    const eventType = event.eventType || event.event_type;
    if (!eventType) throw new Error("event_type_required");
    if (!VALID_EVENT_TYPES.has(eventType)) throw new Error("invalid_event_type: " + eventType);

    const eventId = event.eventId || event.event_id || crypto.randomUUID();
    const txTime = nowIso();
    const validTime = event.validTime || event.valid_time || txTime;
    const source = event.source || "conversation";
    const confidence = Number.isFinite(event.confidence) ? Number(event.confidence) : 0.7;
    const payload = JSON.stringify(event.payload ?? {});
    const conversationId = event.conversationId || event.conversation_id || null;
    const sessionId = event.sessionId || event.session_id || null;
    const correlationId = event.correlationId || event.correlation_id || null;

    stmts.append.run(
      eventId, eventType, conversationId, sessionId,
      validTime, txTime, source, confidence, payload, correlationId
    );

    const row = stmts.getById.get(eventId);
    return {
      sequence_id: row.sequence_id,
      event_id: row.event_id,
      transaction_time: row.transaction_time,
      valid_time: row.valid_time,
    };
  }

  getEventById(eventId) {
    this._db();
    const row = this._statements.getById.get(eventId);
    if (!row) return null;
    return { ...row, payload: parseJson(row.payload) };
  }

  getMaxSequence() {
    this._db();
    return Number(this._statements.maxSeq.get().max_seq) || 0;
  }

  // 按条件查询事件，支持 filter 对象的下列字段：
  //   eventType, conversationId, sessionId, validFrom, validTo,
  //   recordedBefore, recordedAfter, fromSequence, toSequence,
  //   limit (default 1000), order ("asc"|"desc", default "desc")
  getEvents(filter = {}) {
    this._db();
    const conditions = [];
    const params = [];

    const eq = (col, val) => { conditions.push(`${col} = ?`); params.push(val); };
    if (filter.eventType || filter.event_type) eq("event_type", filter.eventType || filter.event_type);
    if (filter.conversationId || filter.conversation_id) eq("conversation_id", filter.conversationId || filter.conversation_id);
    if (filter.sessionId || filter.session_id) eq("session_id", filter.sessionId || filter.session_id);
    if (filter.validFrom || filter.valid_from) { conditions.push("valid_time >= ?"); params.push(filter.validFrom || filter.valid_from); }
    if (filter.validTo || filter.valid_to) { conditions.push("valid_time <= ?"); params.push(filter.validTo || filter.valid_to); }
    if (filter.recordedBefore) { conditions.push("transaction_time < ?"); params.push(filter.recordedBefore); }
    if (filter.recordedAfter) { conditions.push("transaction_time > ?"); params.push(filter.recordedAfter); }
    if (filter.fromSequence || filter.from_sequence) { conditions.push("sequence_id > ?"); params.push(Number(filter.fromSequence || filter.from_sequence)); }
    if (filter.toSequence || filter.to_sequence) { conditions.push("sequence_id <= ?"); params.push(Number(filter.toSequence || filter.to_sequence)); }

    const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const order = filter.order === "asc" ? "ASC" : "DESC";
    const limit = Math.min(Number(filter.limit) || 1000, 10000);

    const sql = `SELECT sequence_id, event_id, event_type, conversation_id, session_id, valid_time, transaction_time, source, confidence, payload, correlation_id FROM memory_ledger ${where} ORDER BY sequence_id ${order} LIMIT ${limit}`;
    const rows = this.database.prepare(sql).all(...params);
    return rows.map(row => ({ ...row, payload: parseJson(row.payload) }));
  }

  countByType(eventType) {
    this._db();
    const row = this.database.prepare("SELECT COUNT(*) AS cnt FROM memory_ledger WHERE event_type = ?").get(eventType);
    return row ? Number(row.cnt) : 0;
  }

  count() {
    this._db();
    return Number(this.database.prepare("SELECT COUNT(*) AS cnt FROM memory_ledger").get().cnt) || 0;
  }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { return {}; }
}
