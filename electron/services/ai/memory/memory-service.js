import crypto from "node:crypto";
import { nowIso, sourceWeight } from "./bitemporal.js";

// AgentMemoryService — 记忆系统统一门面
//
// 对外暴露高层 API，Agent 工具和 IPC 处理器都调用它。
// 内部整合 Ledger（写入） + Views（读取） + 兼容层（读取旧 memories[] 数组）。

export class AgentMemoryService {
  constructor({ database, ledger, views, legacyStore = null }) {
    this.database = database;
    this.ledger = ledger;
    this.views = views;
    this.legacyStore = legacyStore;  // AiDataStore 引用，双写双读兼容用
  }

  // ====== 写入 ======

  recordEvent({ eventType, conversationId, sessionId, validTime, source = "system", confidence = 0.7, payload = {}, correlationId }) {
    return this.ledger.append({
      eventType,
      conversationId,
      sessionId,
      validTime: validTime || nowIso(),
      source,
      confidence,
      payload,
      correlationId,
    });
  }

  rememberFact({ type = "fact", key, value, confidence = 0.7, source = "conversation", validTime } = {}) {
    if (!key || !value) throw new Error("memory_key_value_required");
    const eventType = "memory_write";
    const vTime = validTime || nowIso();

    // 写入 Ledger
    const result = this.ledger.append({
      eventType,
      validTime: vTime,
      source,
      confidence,
      payload: { type, key: String(key).slice(0, 80), value: String(value).slice(0, 500) },
    });

    // 更新 Views
    this.views.addToTimeline({
      eventTime: vTime,
      eventType,
      title: String(key).slice(0, 80),
      detail: String(value).slice(0, 500),
      importance: Math.ceil(confidence * 5),
      sourceEventId: result.event_id,
    });

    // 更新 FTS 索引
    this.views.addToFTS(
      `${key} ${value}`,
      type,
      result.event_id
    );

    // 双写：写入旧系统
    if (this.legacyStore) {
      this.legacyStore.remember({
        type,
        key: String(key).slice(0, 80),
        value: String(value).slice(0, 500),
        confidence,
        source,
      }).catch(() => { /* 旧系统写入失败不影响新系统 */ });
    }

    return {
      event_id: result.event_id,
      sequence_id: result.sequence_id,
      key: String(key).slice(0, 80),
      value: String(value).slice(0, 500),
    };
  }

  updateProfileField({ fieldKey, value, category = "other", confidence = 0.7, source = "conversation", validTime } = {}) {
    if (!fieldKey || value == null) throw new Error("profile_field_required");
    const vTime = validTime || nowIso();

    // 写入 Ledger
    const result = this.ledger.append({
      eventType: "profile_update",
      validTime: vTime,
      source,
      confidence,
      payload: { fieldKey, value, category },
    });

    // 更新 Profile Views
    this.views.updateProfileField({
      fieldKey,
      value,
      category,
      confidence,
      validFrom: vTime,
      sourceEventId: result.event_id,
    });

    return { event_id: result.event_id, field_key: fieldKey, value };
  }

  startSession({ sessionId, conversationId, timezone, language, device, model, modelVersion } = {}) {
    const sid = sessionId || crypto.randomUUID();
    this.views.startSession({ sessionId: sid, conversationId, timezone, language, device, model, modelVersion });

    // 写入 Ledger
    this.ledger.append({
      eventType: "session_start",
      conversationId,
      sessionId: sid,
      source: "system",
      confidence: 1.0,
      payload: { sessionId: sid, timezone, language, device, model, modelVersion },
    });

    return { sessionId: sid };
  }

  endSession(sessionId) {
    this.views.endSession(sessionId);
    this.ledger.append({
      eventType: "session_end",
      sessionId,
      source: "system",
      confidence: 1.0,
      payload: { sessionId },
    });
  }

  // ====== 读取/召回 ======

  recall({ query, layers = [2, 3, 4], limit = 20 } = {}) {
    const results = [];

    // Layer 2: Profile search
    if (layers.includes(2) && query) {
      const ftsResults = this.views.searchFTS(query, { limit: limit / 2, contentType: "profile" });
      results.push(...ftsResults.map(r => ({
        type: "profile",
        content: r.content,
        contentType: r.content_type,
        sourceId: r.source_id,
        score: r.rank ? 1 / (1 + Math.abs(r.rank)) : 0.5,
        layer: 2,
      })));
    }

    // Layer 2/3: FTS search over all content
    if (query) {
      const ftsResults = this.views.searchFTS(query, { limit });
      for (const r of ftsResults) {
        if (!results.find(existing => existing.sourceId === r.source_id)) {
          results.push({
            type: "memory",
            content: r.content,
            contentType: r.content_type,
            sourceId: r.source_id,
            score: r.rank ? 1 / (1 + Math.abs(r.rank)) : 0.5,
            layer: r.content_type === "profile" ? 2 : 3,
          });
        }
      }
    }

    // Layer 3/4: Timeline items (most recent)
    const timeline = this.views.getTimeline({ limit: limit / 2 });
    for (const item of timeline) {
      results.push({
        type: "timeline",
        title: item.title,
        detail: item.detail,
        eventTime: item.event_time,
        eventType: item.event_type,
        importance: item.importance,
        sourceId: item.source_event_id,
        score: (item.importance / 5) * 0.5,
        layer: 3,
      });
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  getProfile(opts) {
    return this.views.getProfile(opts);
  }

  getProfileField(fieldKey, opts) {
    return this.views.getProfileField(fieldKey, opts);
  }

  getTimeline(opts) {
    return this.views.getTimeline(opts);
  }

  searchSemantic(query, opts) {
    return this.views.searchFTS(query, opts);
  }

  // ====== 遗忘 ======

  forgetMemory(sourceEventId) {
    // 写入遗忘事件（不删除原事件，只标记）
    const result = this.ledger.append({
      eventType: "memory_forget",
      source: "system",
      confidence: 1.0,
      payload: { source_event_id: sourceEventId },
      correlationId: sourceEventId,
    });

    // 从 FTS 索引移除
    this.views.removeFromFTS(sourceEventId);

    return { event_id: result.event_id, forgotten: true };
  }

  forgetProfileField(fieldKey) {
    const ok = this.views.forgetProfileField(fieldKey);
    if (ok) {
      this.ledger.append({
        eventType: "profile_delete",
        source: "system",
        confidence: 1.0,
        payload: { field_key: fieldKey },
      });
    }
    return { forgotten: ok };
  }

  clearAll() {
    // 写入批量清除事件
    this.ledger.append({
      eventType: "system_note",
      source: "system",
      confidence: 1.0,
      payload: { action: "clear_all", timestamp: nowIso() },
    });

    // 直接清空所有视图表（不重放 Ledger，因为这会把刚刚写入的 system_note 之前的事件全部放回）
    if (this.database?.available) {
      this.views._db();
      const tables = ["memory_profile_fields", "memory_profile_history", "memory_timeline", "memory_sliding_window", "memory_conversation_summaries", "memory_session_metadata"];
      for (const t of tables) {
        if (this.database.tableExists(t)) this.database.prepare(`DELETE FROM ${t}`).run();
      }
      if (this.database.tableExists("memory_fts")) this.database.prepare("DELETE FROM memory_fts").run();
      this.database.prepare("DELETE FROM memory_view_state").run();
      // 重置缓存语句
      this.views._statements = null;
    }

    // 同步清旧系统
    if (this.legacyStore) {
      this.legacyStore.clearMemories().catch(() => {});
    }

    return { cleared: true };
  }

  // ====== 兼容层（旧 API 形状，给 AiDataStore facade 使用） ======

  listMemories() {
    // 优先从新系统（timeline + profile）取，合成旧格式
    const results = [];
    const profile = this.views.getProfile();
    for (const field of profile) {
      results.push({
        id: field.sourceEventId || field.fieldKey,
        type: "profile",
        key: field.fieldKey,
        value: field.value,
        confidence: field.confidence,
        source: "import",
        createdAt: field.validFrom,
        updatedAt: field.validFrom,
        lastUsedAt: field.lastAccessedAt,
        deletedAt: field.validTo,
      });
    }

    const timeline = this.views.getTimeline({ limit: 200 });
    for (const item of timeline) {
      if (!results.find(r => r.id === item.source_event_id)) {
        results.push({
          id: item.source_event_id || item.timeline_id,
          type: "fact",
          key: item.title,
          value: item.detail || "",
          confidence: 0.7,
          source: "import",
          createdAt: item.event_time,
          updatedAt: item.event_time,
          lastUsedAt: null,
          deletedAt: null,
        });
      }
    }

    // 如果新系统没有数据，回退到旧系统
    if (results.length === 0 && this.legacyStore) {
      try {
        return this.legacyStore.listMemories();
      } catch {
        return [];
      }
    }

    return results.filter(r => !r.deletedAt).sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }

  remember(input) {
    return this.rememberFact({
      type: input.type || "fact",
      key: input.key,
      value: input.value,
      confidence: input.confidence,
      source: input.source || "conversation",
    });
  }

  forgetMemoryById(id) {
    return this.forgetMemory(id);
  }

  // ====== 迁移 ======

  isMigrated() {
    if (!this.database?.available) return false;
    return Boolean(this.database.prepare("SELECT 1 FROM schema_migrations WHERE id = 'app-db-v4-agent-memory'").get());
  }

  getStats() {
    if (!this.database?.available) return { available: false };
    try {
      return {
        available: true,
        ledgerEventCount: this.ledger.count(),
        profileFieldCount: this.views.getProfile().length,
        migrated: this.isMigrated(),
      };
    } catch {
      return { available: false };
    }
  }
}
