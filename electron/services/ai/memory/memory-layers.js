// MemoryLayers — 四层记忆上下文组装器
//
// Layer 1: 会话元数据（时间/设备/模型）
// Layer 2: 用户结构化画像（当前有效字段）
// Layer 3: 近期对话摘要 + 活跃目标
// Layer 4: 滑动窗口（最近 N 条消息原文）
//
// buildContext() 输出可直接插入 LLM system prompt 的结构化文本

const PROFILE_CATEGORY_NAMES = {
  identity: "身份",
  preference: "偏好",
  relationship: "关系",
  work: "工作/学习",
  health: "健康",
  knowledge: "知识",
  other: "其他",
};

export class MemoryLayers {
  constructor({ views, policy, options = {} } = {}) {
    this.views = views;
    this.policy = policy;
    this.maxProfileFields = options.maxProfileFields || 20;
    this.maxGoals = options.maxGoals || 10;
    this.slidingWindowSize = options.slidingWindowSize || 15;
    this.slidingWindowTokenBudget = options.slidingWindowTokenBudget || 3000;
  }

  // 组装完整上下文，返回可直接注入 system prompt 的字符串
  buildContext({ sessionId, conversationId, query, provider, tokenBudget } = {}) {
    const parts = [];

    // Layer 1: Metadata
    const metadata = this.getMetadata(sessionId);
    if (metadata) {
      parts.push(`[会话元数据]\n${metadata}`);
    }

    // Layer 2: Profile
    const profile = this.getProfileSnapshot();
    if (profile) {
      parts.push(`[用户画像]\n${profile}`);
    }

    // Layer 3: Summary + Goals
    if (conversationId) {
      const summary = this.getConversationSummary(conversationId);
      if (summary) {
        parts.push(`[对话摘要与目标]\n${summary}`);
      }
    }

    // Layer 4: Sliding window
    if (query && conversationId) {
      const window = this.getSlidingWindowText(conversationId);
      if (window) {
        parts.push(`[近期对话]\n${window}`);
      }
    }

    // 如果有 token budget，裁剪到预算内
    let context = parts.join("\n\n");
    if (tokenBudget > 0 && context.length > tokenBudget * 3) {
      // 粗略按 3 chars ≈ 1 token 裁剪，优先保留前面的层
      const maxChars = tokenBudget * 3;
      if (context.length > maxChars) {
        context = context.slice(0, maxChars) + "\n[...truncated]";
      }
    }

    return context;
  }

  // Layer 1: 会话元数据
  getMetadata(sessionId) {
    if (!sessionId) return null;
    const meta = this.views.getSessionMetadata(sessionId);
    if (!meta) return null;

    const lines = [];
    if (meta.timezone) lines.push(`  时区: ${meta.timezone}`);
    if (meta.language) lines.push(`  语言: ${meta.language}`);
    if (meta.model) lines.push(`  模型: ${meta.model}`);
    if (meta.device) lines.push(`  设备: ${meta.device}`);
    if (!lines.length) return null;
    return lines.join("\n");
  }

  // Layer 2: 用户结构化画像
  getProfileSnapshot(asOf = null) {
    const profile = this.views.getProfile({ asOf });
    if (!profile || !profile.length) return null;

    // 按类别分组
    const byCategory = {};
    for (const field of profile) {
      const cat = field.category || "other";
      if (!byCategory[cat]) byCategory[cat] = [];
      byCategory[cat].push(field);
    }

    const lines = [];
    for (const [cat, fields] of Object.entries(byCategory)) {
      const label = PROFILE_CATEGORY_NAMES[cat] || cat;
      const fieldTexts = fields.slice(0, 10).map(f => {
        const keyParts = f.fieldKey.split(".");
        const shortKey = keyParts[keyParts.length - 1];
        return `  ${shortKey}: ${f.value}${f.confidence < 0.7 ? " (推测)" : ""}`;
      });
      lines.push(`  ${label}:\n${fieldTexts.join("\n")}`);
    }

    return lines.slice(0, this.maxProfileFields).join("\n");
  }

  // Layer 3: 对话摘要 + 目标
  getConversationSummary(conversationId) {
    if (!conversationId) return null;
    const profile = this.views.getProfile();
    const timeline = this.views.getTimeline({ limit: 20 });

    // 从 profile 和 timeline 构建轻量摘要
    const lines = [];

    // 用户关键词
    const keywords = new Set();
    for (const field of profile) {
      if (field.category === "identity" || field.category === "preference") {
        keywords.add(`${field.fieldKey}: ${field.value}`);
      }
    }
    if (keywords.size > 0) {
      lines.push("  已知: " + [...keywords].slice(0, 8).join("; "));
    }

    // 近期主题
    const recentTopics = timeline
      .filter(t => t.importance >= 3)
      .slice(0, 5)
      .map(t => t.title);
    if (recentTopics.length > 0) {
      lines.push("  近期话题: " + recentTopics.join("、"));
    }

    if (!lines.length) return null;
    return lines.join("\n");
  }

  // Layer 4: 滑动窗口消息文本
  getSlidingWindowText(conversationId, limit = null) {
    if (!conversationId) return null;
    const size = limit || this.slidingWindowSize;
    const window = this.views.getSlidingWindow(conversationId, { limit: size });
    if (!window || !window.length) return null;

    const lines = [];
    let charCount = 0;
    const maxChars = this.slidingWindowTokenBudget * 3;

    // 从旧到新遍历，从新到旧取最相关
    const recent = window.slice(-size);
    for (const msg of recent.reverse()) {
      const prefix = msg.role === "user" ? "用户" : msg.role === "assistant" ? "Kairos" : msg.role;
      const line = `  [${prefix}] ${msg.content?.slice(0, 200) || ""}`;
      if (charCount + line.length > maxChars) break;
      lines.unshift(line); // 保持从旧到新的顺序
      charCount += line.length;
    }

    if (!lines.length) return null;
    return lines.join("\n");
  }

  // ====== 便捷方法：获取当前活跃目标列表 ======

  listGoals({ conversationId = null, status = "open" } = {}) {
    const results = [];
    const timeline = conversationId
      ? this.views.getTimeline({ limit: 200 })
      : this.views.getTimeline({ limit: 200, eventType: "goal_update" });

    for (const item of timeline) {
      if (item.event_type === "goal_update" && item.title) {
        results.push({
          id: item.source_event_id || item.timeline_id,
          title: item.title,
          detail: item.detail,
          status: status || "open",
          createdAt: item.event_time,
          importance: item.importance,
        });
      }
    }

    return results.slice(0, 50);
  }
}
