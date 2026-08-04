import { nowIso, daysBetween, recencyFactor, sourceWeight } from "./bitemporal.js";

// MemoryPolicy — 记忆策略引擎
//
// 决定：是否写入 / 写入哪一层 / 何时召回 / 何时遗忘
// v1 全部基于规则和统计，不调用 LLM，保证低延迟和确定性

const DEFAULT_HALF_LIFE_DAYS = 90;
const DEFAULT_RECALL_LIMIT = 20;
const MIN_AUTO_REMEMBER_CONFIDENCE = 0.6;
const MIN_IMPORTANCE_FOR_DURABLE = 0.3;
const STALE_THRESHOLD_DAYS = 365;

export class MemoryPolicy {
  constructor({ views, ledger, options = {} } = {}) {
    this.views = views;
    this.ledger = ledger;
    this.halfLifeDays = options.halfLifeDays || DEFAULT_HALF_LIFE_DAYS;
    this.recallLimit = options.recallLimit || DEFAULT_RECALL_LIMIT;
  }

  // ========== 写入策略 ==========

  // 判断一条候选事实是否值得写入长期记忆
  // 返回 { should: true/false, reason, layer, importance, recommendedCategory }
  shouldRemember({ type, key, value, source, confidence }) {
    const conf = Number(confidence) || 0.7;
    const src = String(source || "conversation");

    // 1. 置信度过低，不写入
    if (conf < MIN_AUTO_REMEMBER_CONFIDENCE) {
      return {
        should: false,
        reason: `confidence too low: ${conf.toFixed(2)} < ${MIN_AUTO_REMEMBER_CONFIDENCE}`,
        importance: Math.round(conf * 3),
      };
    }

    // 2. 太短/太泛化的值，不写入
    const text = `${key} ${value}`.trim();
    if (text.length < 4) {
      return {
        should: false,
        reason: "content too short or generic",
        importance: 1,
      };
    }

    // 3. 检测冲突
    const conflict = this.detectConflict({ type, key, value });

    // 4. 计算重要性
    let importance = Math.round(conf * 4);
    const category = mapTypeToCategory(type);
    if (category === "identity" || category === "preference") importance = Math.min(5, importance + 1);
    if (src === "user_explicit") importance = Math.min(5, importance + 1);

    // 5. 确定写入层
    let layer = 3; // default: timeline
    if (category === "identity" || category === "preference") layer = 2; // profile
    if (type === "goal") layer = 3;

    return {
      should: true,
      reason: conflict.conflict
        ? `conflict resolved: ${conflict.resolution}`
        : "new durable fact",
      layer,
      importance,
      recommendedCategory: category,
      conflict,
      targetHalfLifeDays: this.halfLifeDays,
    };
  }

  // 检测与现有记忆的冲突
  // 返回 { conflict: true/false, existing, resolution }
  detectConflict({ type, key, value }) {
    // 只在 profile/preference 类型时检测（结构化字段可精确匹配）
    const isProfileLike = type === "profile" || type === "preference";
    if (!isProfileLike) {
      // 普通记忆：检查是否有相同 key 的已有记忆
      const timeline = this.views.getTimeline({ limit: 100 });
      const sameKey = timeline.filter(t => t.title === key);
      if (sameKey.length > 0) {
        return {
          conflict: true,
          existing: sameKey[0],
          resolution: "supplement", // 同 key 不同 value → 补充
        };
      }
      return { conflict: false, existing: null, resolution: null };
    }

    // Profile 类型：精确字段匹配
    const fieldKey = `${type}.${key}`;
    const profile = this.views.getProfileField(fieldKey);
    if (!profile || profile.validTo) {
      return { conflict: false, existing: null, resolution: null };
    }

    // 值相同 → 不是冲突，是重复，不更新
    if (profile.value === value) {
      return { conflict: false, existing: profile, resolution: "duplicate" };
    }

    // 值不同 → 冲突，需要 supersede
    return {
      conflict: true,
      existing: profile,
      resolution: "supersede",
    };
  }

  // ========== 召回策略 ==========

  // 综合评分召回
  // 评分公式：score = relevance × isCurrent × sourceWeight × importance × recencyFactor
  recall({ query, context = {}, layers = [2, 3, 4], limit = null } = {}) {
    const maxResults = limit || this.recallLimit;
    const now = nowIso();
    const results = [];

    // 从 Views 获取候选集
    const candidates = this._gatherCandidates(query, layers, maxResults);

    // 对每个候选项计算综合得分
    for (const candidate of candidates) {
      const feat = this._extractFeatures(candidate, query, now);
      const score = this._computeScore(feat);
      if (score > 0.05) {
        results.push({
          ...candidate,
          score,
          features: feat,
        });
      }
    }

    // 按得分降序排列
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, maxResults);
  }

  // 收集候选集
  _gatherCandidates(query, layers, limit) {
    const candidates = [];

    if (layers.includes(2)) {
      const profile = this.views.getProfile();
      for (const field of profile) {
        candidates.push({
          type: "profile",
          key: field.fieldKey,
          value: field.value,
          confidence: field.confidence,
          validFrom: field.validFrom,
          validTo: field.validTo,
          lastAccessedAt: field.lastAccessedAt,
          importance: mapCategoryToImportance(field.category),
          sourceEventId: field.sourceEventId,
          layer: 2,
        });
      }
    }

    if (layers.includes(3) || layers.includes(2)) {
      // FTS search
      const ftsResults = query
        ? this.views.searchFTS(query, { limit: limit * 2 })
        : [];
      for (const r of ftsResults) {
        if (!candidates.find(c => c.sourceEventId === r.source_id)) {
          candidates.push({
            type: "fts_result",
            content: r.content,
            contentType: r.content_type,
            ftsRank: r.rank,
            sourceEventId: r.source_id,
            relevance: r.rank ? 1 / (1 + Math.abs(r.rank)) : 0.5,
            layer: r.content_type === "profile" ? 2 : 3,
          });
        }
      }
    }

    if (layers.includes(3) || layers.includes(4) || !candidates.length) {
      const timeline = this.views.getTimeline({ limit: limit * 2 });
      for (const item of timeline) {
        if (!candidates.find(c => c.sourceEventId === item.source_event_id)) {
          candidates.push({
            type: "timeline",
            key: item.title,
            value: item.detail,
            importance: item.importance,
            eventTime: item.event_time,
            validFrom: item.event_time,
            sourceEventId: item.source_event_id,
            layer: 3,
          });
        }
      }
    }

    return candidates;
  }

  // 提取特征（用于评分）
  _extractFeatures(candidate, query, now) {
    const relevance = this._computeRelevance(candidate, query);
    const isCurrent = candidate.validTo == null ? 1 : 0;
    const srcWeight = sourceWeight(candidate.source || "conversation");
    const importance = (candidate.importance || 3) / 5;
    const daysAgo = candidate.validFrom ? daysBetween(now, candidate.validFrom) : 30;
    const timeDecay = recencyFactor(daysAgo, this.halfLifeDays);
    const accessBoost = candidate.lastAccessedAt
      ? recencyFactor(daysBetween(now, candidate.lastAccessedAt), 30)
      : 0.5;

    return { relevance, isCurrent, srcWeight, importance, timeDecay, accessBoost };
  }

  // 计算相关性（简单关键词匹配 + FTS 排名）
  _computeRelevance(candidate, query) {
    if (!query) return 0.5;
    const q = String(query).toLowerCase();
    if (candidate.relevance !== undefined) return candidate.relevance;

    const text = [
      candidate.key || "",
      candidate.value || "",
      candidate.content || "",
    ].join(" ").toLowerCase();

    if (text.includes(q)) return 0.9;
    const terms = q.split(/\s+/);
    let matches = 0;
    for (const term of terms) {
      if (term && text.includes(term)) matches++;
    }
    if (matches === 0) return 0.1;
    return matches / terms.length * 0.7;
  }

  // 综合评分
  _computeScore(feat) {
    const { relevance, isCurrent, srcWeight, importance, timeDecay, accessBoost } = feat;
    return (
      relevance * 0.35 +
      isCurrent * 0.2 +
      srcWeight * 0.15 +
      importance * 0.15 +
      timeDecay * 0.1 +
      accessBoost * 0.05
    );
  }

  // ========== 遗忘/降级策略 ==========

  forgetStale({ olderThanDays = STALE_THRESHOLD_DAYS, minImportance = 2 } = {}) {
    const now = nowIso();
    const timeline = this.views.getTimeline({ limit: 500 });
    const expired = [];

    for (const item of timeline) {
      const daysOld = daysBetween(now, item.event_time);
      if (daysOld > olderThanDays && item.importance <= minImportance) {
        this.ledger.append({
          eventType: "memory_forget",
          source: "system",
          confidence: 1.0,
          payload: {
            reason: "stale",
            title: item.title,
            days_old: daysOld,
          },
          correlationId: item.source_event_id,
        });
        this.views.removeFromFTS(item.source_event_id);
        expired.push(item);
      }
    }

    return { cleared: expired.length, items: expired };
  }

  markExpired() {
    const now = nowIso();
    // 查询所有字段（包括已过期的），不通过 getProfile()（它只返回当前有效字段）
    if (!this.views.database?.available) return { expiredCount: 0 };
    const rows = this.views.database.prepare(
      "SELECT field_key, valid_from, valid_to, field_value FROM memory_profile_fields"
    ).all();
    let count = 0;
    for (const row of rows) {
      if (row.valid_to != null && row.valid_to <= now) {
        count++;
      }
    }
    return { expiredCount: count };
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

function mapCategoryToImportance(category) {
  switch (category) {
    case "identity": return 5;
    case "preference": return 4;
    case "work": return 4;
    case "health": return 5;
    case "relationship": return 4;
    case "knowledge": return 3;
    default: return 3;
  }
}
