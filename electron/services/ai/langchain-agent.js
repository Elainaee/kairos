import { createAgent, tool } from "langchain";
import * as z from "zod";
import { createProviderChatModel, normalizeProviderError } from "./provider-registry.js";

const domains = ["schedules", "tasks", "habits"];
const weeklyRecurrenceSchema = z.object({ frequency: z.literal("weekly"), weekdays: z.array(z.number().int().min(0).max(6)).min(1), until: z.string().optional() });
const operationSchema = z.object({
  title: z.string().min(1).max(120),
  date: z.string().optional(),
  end_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  notes: z.string().max(500).optional(),
  all_day: z.boolean().optional(),
  type: z.enum(["task", "deadline", "event", "match", "holiday", "other"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  reminder: z.string().optional(),
  cadence: z.string().max(120).optional(),
  recurrence: weeklyRecurrenceSchema.optional(),
  source_url: z.string().url().optional(),
  source_title: z.string().max(240).optional(),
});
const scheduleCreateSchema = operationSchema.extend({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() });

export const KAIROS_AGENT_PROMPT = `你是 Kairos，一个温和、诚实的个人陪伴与效率助手。现在是 {now}，时区是 Asia/Shanghai。

你必须自己判断是否、何时调用工具；不要把工具调用交给用户，也不要根据关键词或固定规则猜测。普通倾诉时优先共情、鼓励与倾听，不调用创建日程工具。需要外部最新信息时调用 web_search；需要了解用户时先调用 search_memories 或 query_kairos_data；用户表达计划、约会、会议、提醒、待办或长期学习意图时，一律创建日程或任务：有日期/时间范围、固定星期或长期学习安排时调用 propose_schedule，只有明确的作业/截止/待办才调用 propose_task。绝不创建学习计划数据。

{conversationTitleInstruction}

所有 propose_* 工具仅创建“待确认提案”，绝不会直接写入数据。你可以补全合理的缺失信息：没有具体时间时使用全天；“今晚”可推测为 19:00-22:00；“暑假”可按当前年份 7 月 1 日至 8 月 31 日推测。所有推测须写入 notes，最终回复也要明确说明推测与待确认状态。绝不可假装已保存日程。

联网后的二次决策：调用 web_search 后，优先阅读每项的 content（由 Firecrawl 提取的网页 Markdown 正文），而不是仅依赖搜索标题或 snippet。只有 contentSource 为 firecrawl_markdown 的内容可以确认具体事实；搜索摘要与网页正文冲突时，以可核验的正文和官方来源为准；若正文不可用，必须明确说明证据不足，不能补写事实。先审阅结果是否包含与用户有关、可靠且尚未过去的具体事件、截止日或时间范围。仅当用户的意图包括”提醒我、加到日程、不要错过、帮我安排”，或上下文明显表明这是需要跟进的未来事项时，才调用 propose_schedule 或 propose_task。若搜索结果是过去事件、无日期/时间、只是背景知识/新闻，或用户仅在提问而没有安排意图，则不要创建提案，要直接解释为何不建议写入日程。若从搜索结果创建提案，必须填写 source_url、source_title，并在 notes 中标明哪些日期或时间来自来源、哪些是你的推测。联网答案必须附上工具返回的来源 URL。

分层记忆机制（当记忆工具可用时）：
- 用户结构化属性必须走 update_user_profile（如姓名、职业、偏好、关系），尽量提供 validFrom 追溯事实生效时间（如”去年入职”→validFrom 填去年日期）。
- 需要了解用户时优先用 get_user_profile 查当前画像，不要先搜 search_memories。
- 用户询问”那年/之前/曾经”等历史状态时，用 query_memory_timeline 指定时间范围浏览。
- 用户表达目标/愿望/待办时，用 track_goal 或 list_goals 管理，不要用普通记忆存储。
- search_memories_semantic 用于全文探索型查询（不知道精确字段名或时间范围时）。
- 普通对话中读到的分散事实（如”我喜欢吃辣””我养了一只猫”）才用 remember_memory。
- 同一事实不要同时写入普通记忆和画像字段；画像字段优先。`;

export const KAIROS_AGENT_PROMPT_EN = `You are Kairos, a gentle, honest personal companion and productivity assistant. The current time is {now}, in the Asia/Shanghai time zone.

Decide yourself whether and when to call tools. Do not delegate tool use to the user, and do not infer it from keywords or fixed rules. For ordinary emotional sharing, lead with empathy, encouragement, and listening; do not create schedules. Use web_search for current external information. To understand the user, first use search_memories or query_kairos_data. When the user expresses an intent to plan, meet, schedule, be reminded, complete a task, or study long term, always create a pending schedule or task: use propose_schedule for a date/time range, a fixed weekday, or a long-term study arrangement; use propose_task only for an explicit assignment, deadline, or to-do. Never create study-plan data.

{conversationTitleInstruction}

Every propose_* tool creates a pending proposal only and never writes data directly. You may fill reasonable missing information: use all-day when no specific time is given; infer “tonight” as 19:00–22:00; infer “summer vacation” as July 1 through August 31 of the current year. Record every inference in notes, and clearly state both the inference and pending-confirmation status in the final reply. Never claim a schedule has already been saved.

Second-stage decisions after browsing: after web_search, read each result's content (the Firecrawl-extracted Markdown body) instead of relying only on the title or snippet. Only content whose contentSource is firecrawl_markdown can establish a specific fact. When summaries conflict with page content, prefer verifiable body text and official sources. If page content is unavailable, state that the evidence is insufficient and do not invent facts. Review whether results contain reliable, future, user-relevant events, deadlines, or time ranges. Call propose_schedule or propose_task only when the user's intent includes “remind me”, “add it to my calendar”, “don't let me miss it”, “help me arrange it”, or the context clearly shows a future item needing follow-up. Do not create a proposal for past events, results without a date/time, background knowledge/news, or questions without planning intent; explain directly why it should not be added. A proposal created from search results must include source_url and source_title, and notes must distinguish source-derived dates/times from your inferences. Browsing answers must include the source URLs returned by the tool.

Layered memory, when memory tools are available:
- Send structured user attributes through update_user_profile (such as name, occupation, preferences, or relationships). Supply validFrom whenever it can trace when a fact became true (for example, “started last year” → last year's date).
- To understand the user, prefer get_user_profile for the current profile rather than beginning with search_memories.
- When the user asks about a historical state such as “that year”, “before”, or “used to”, use query_memory_timeline with a time range.
- When the user expresses a goal, wish, or to-do, manage it with track_goal or list_goals rather than ordinary memory.
- Use search_memories_semantic for exploratory full-text queries when the exact field name or time range is unknown.
- Use remember_memory only for separate facts learned in ordinary conversation (for example, “I like spicy food” or “I have a cat”).
- Do not store the same fact in both ordinary memory and a profile field; profile fields take precedence.`;

function contentOf(message) {
  if (typeof message?.content === "string") return message.content;
  if (Array.isArray(message?.content)) return message.content.map(item => item?.text || item?.content || "").join("");
  return "";
}
function isFinalAiMessage(message) {
  const type = message?._getType?.() || message?.getType?.();
  return type === "ai" && !message?.tool_calls?.length && Boolean(contentOf(message).trim());
}
function usageOf(message) {
  const usage = message?.usage_metadata || message?.response_metadata?.tokenUsage || message?.response_metadata?.token_usage;
  if (!usage) return null;
  return {
    input_tokens: usage.input_tokens ?? usage.prompt_tokens ?? 0,
    output_tokens: usage.output_tokens ?? usage.completion_tokens ?? 0,
    total_tokens: usage.total_tokens ?? (usage.input_tokens ?? usage.prompt_tokens ?? 0) + (usage.output_tokens ?? usage.completion_tokens ?? 0),
  };
}
function streamEnvelope(chunk) {
  if (!Array.isArray(chunk) || typeof chunk[0] !== "string") return { mode: null, payload: chunk };
  return { mode: chunk[0], payload: chunk[1] };
}
function matchingMemories(rows, query) {
  const needle = String(query || "").trim().toLowerCase();
  return !needle ? rows : rows.filter(row => `${row.key} ${row.value}`.toLowerCase().includes(needle));
}
function agentLanguageInstruction(locale) {
  return locale === "zh-CN"
    ? "使用简体中文回复，除非用户明确要求其他语言。"
    : "Reply in English unless the user explicitly asks for another language.";
}
function conversationTitleInstruction(locale) {
  return locale === "zh-CN"
    ? "会话命名：当本会话仍是“新对话”或主题发生明显变化时，调用 set_conversation_title，生成 4～18 个字的简洁中文标题。标题应总结对话主题，不要使用“新对话”“聊天”“求助”等空泛词，也不要逐字复制用户输入。"
    : "Conversation naming: when this conversation is still named ‘New conversation’ or its topic changes materially, call set_conversation_title and create a concise 4–18 word English title. Summarize the topic; do not use vague names such as ‘New conversation’, ‘Chat’, or ‘Help’, and do not copy the user’s wording verbatim.";
}

const scheduleUpdateSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(120).optional(),
  date: z.string().optional(),
  end_date: z.string().optional(),
  start_time: z.string().optional(),
  end_time: z.string().optional(),
  notes: z.string().max(500).optional(),
  all_day: z.boolean().optional(),
  type: z.enum(["event", "match", "holiday", "other"]).optional(),
  priority: z.enum(["low", "medium", "high"]).optional(),
  reminder: z.string().optional(),
  cadence: z.string().max(120).optional(),
  recurrence: weeklyRecurrenceSchema.optional(),
});

export async function runKairosAgent({ provider = "openai", providerDefinition, apiKey, model, chatModel, messages, conversationTitle = "", store, toolRuntime, appAdapters, musicController = null, searchWeb, ensureExternalSearch, ensureDomainAccess, onToolEvent = () => {}, onSetTitle = async () => {}, personalizationInstruction = "", memoryEnabled = true, memoryService = null, signal, now = new Date(), locale = "zh-CN", hour12 = false, t }) {
  if (!apiKey && !chatModel) throw new Error("missing_key");
  const proposals = [];
  const allowDomainRead = ensureDomainAccess || (async domain => {
    const permissions = await toolRuntime.getPermissions();
    if (permissions[domain] !== "none") return;
    if (domain !== "schedules") throw new Error("permission_denied");
    await toolRuntime.setPermissions({ schedules: "read" });
    onToolEvent({ type: "permission_granted", domain: "schedules", level: "read" });
  });
  const readMemories = tool(async ({ query }) => {
    if (memoryService?.isMigrated()) {
      const results = memoryService.recall({ query, layers: [2, 3], limit: 30 });
      const items = results.map(r => ({ id: r.sourceEventId || r.key, type: r.type || "fact", key: r.key || r.title, value: r.value || r.detail || r.content || "", confidence: r.confidence || 0.5, score: r.score }));
      onToolEvent({ type: "tool_result", tool: "search_memories", count: items.length });
      return JSON.stringify({ items });
    }
    const rows = matchingMemories(await store.listMemories(), query).slice(0, 30);
    onToolEvent({ type: "tool_result", tool: "search_memories", count: rows.length });
    return JSON.stringify({ items: rows });
  }, { name: "search_memories", description: "Search user-approved long-term memories before making a personal inference. Use this for broad recall; prefer get_user_profile for specific user attributes.", schema: z.object({ query: z.string().optional().describe("Memory keywords, or omit to list recent memories") }) });
  const rememberMemory = tool(async ({ type, key, value, confidence }) => {
    if (memoryService?.isMigrated()) {
      const result = memoryService.rememberFact({ type, key, value, confidence, source: "agent" });
      onToolEvent({ type: "memory_saved", item: { id: result.event_id, key: result.key, value: result.value } });
      return { saved: true, id: result.event_id, key: result.key, value: result.value };
    }
    const item = await store.remember({ type, key, value, confidence, source: "agent" });
    onToolEvent({ type: "memory_saved", item });
    return { saved: true, id: item.id, key: item.key, value: item.value };
  }, { name: "remember_memory", description: "Save an explicit, durable user fact, preference, goal, or completed activity. Do not save guesses. For structured user attributes (name, occupation, preferences), prefer update_user_profile instead.", schema: z.object({ type: z.enum(["profile", "preference", "goal", "activity", "fact"]), key: z.string().min(1).max(80), value: z.string().min(1).max(500), confidence: z.number().min(0).max(1).default(0.8) }) });
  const forgetMemory = tool(async ({ query }) => {
    if (memoryService?.isMigrated()) {
      const results = memoryService.recall({ query, layers: [2, 3], limit: 100 });
      let count = 0;
      for (const r of results) { if (r.sourceEventId) { memoryService.forgetMemory(r.sourceEventId); count++; } }
      onToolEvent({ type: "memory_forgotten", query, count }); return { forgotten: count };
    }
    const rows = matchingMemories(await store.listMemories(), query); for (const row of rows) await store.forgetMemory(row.id);
    onToolEvent({ type: "memory_forgotten", query, count: rows.length }); return { forgotten: rows.length };
  }, { name: "forget_memory", description: "Forget memories only when the user asks to forget or delete a memory.", schema: z.object({ query: z.string().min(1).max(200) }) });

  // ====== 新增分层记忆工具（仅在 memoryService 可用时注册） ======
  const profileCategories = ["identity", "preference", "relationship", "work", "health", "knowledge", "other"];

  const getUserProfile = tool(async ({ category, fieldKey }) => {
    if (!memoryService) return JSON.stringify({ error: "memory_service_unavailable" });
    const profile = memoryService.getProfile({ category: category || null });
    if (fieldKey) {
      const field = memoryService.getProfileField(fieldKey, { includeHistory: true });
      return JSON.stringify(field ? { field, historyIncluded: true } : { error: "field_not_found" });
    }
    return JSON.stringify({ fields: profile, total: profile.length });
  }, { name: "get_user_profile", description: "Get the user's structured profile fields (identity, preferences, occupation, etc.). Use this before asking about user attributes rather than relying on fuzzy memory search. Pass category to filter by type, or fieldKey for a specific field with history.", schema: z.object({ category: z.enum(profileCategories).optional().describe("Filter by category, or omit for all"), fieldKey: z.string().optional().describe("Specific field key like 'user.occupation' to get with bitemporal history") }) });

  const updateUserProfile = tool(async ({ fieldKey, value, category, confidence, validFrom }) => {
    if (!memoryService) return JSON.stringify({ error: "memory_service_unavailable" });
    const protectedFields = new Set(["user.name", "user.nickname", "user.age", "user.occupation", "user.long_term_goals"]);
    if (protectedFields.has(String(fieldKey || "").toLowerCase())) return JSON.stringify({ error: "manual_profile_field_protected", fieldKey });
    const result = memoryService.updateProfileField({ fieldKey, value, category: category || "other", confidence: confidence ?? 0.8, source: "agent", validTime: validFrom || undefined });
    onToolEvent({ type: "profile_updated", fieldKey: result.field_key, value: result.value });
    return JSON.stringify({ updated: true, fieldKey: result.field_key, value: result.value });
  }, { name: "update_user_profile", description: "Update a user profile field with bitemporal versioning. Use this for durable user attributes (name, occupation, preferences, relationships, health). Old values are preserved as history. Provide validFrom if the fact became true at a past date (e.g., 'since last year').", schema: z.object({ fieldKey: z.string().min(1).max(80).describe("Dot-notation key like 'user.occupation', 'user.name', 'pref.theme'"), value: z.string().min(1).max(500), category: z.enum(profileCategories).default("other"), confidence: z.number().min(0).max(1).default(0.8), validFrom: z.string().optional().describe("When this fact became true in reality (ISO 8601), e.g. '2025-09-01' for 'started school then'") }) });

  const queryTimeline = tool(async ({ dateFrom, dateTo, minImportance, eventType, limit }) => {
    if (!memoryService) return JSON.stringify({ error: "memory_service_unavailable" });
    const items = memoryService.getTimeline({ from: dateFrom || null, to: dateTo || null, minImportance: minImportance || 1, eventType: eventType || null, limit: limit || 20 });
    return JSON.stringify({ items, count: items.length });
  }, { name: "query_memory_timeline", description: "Query the memory timeline by date range, importance, or event type. Use this when the user asks about past events, facts over time, or wants to browse their history.", schema: z.object({ dateFrom: z.string().optional().describe("Start date (YYYY-MM-DD or ISO 8601)"), dateTo: z.string().optional().describe("End date"), minImportance: z.number().int().min(1).max(5).default(1), eventType: z.string().optional().describe("Event type filter, e.g. 'memory_write', 'profile_update'"), limit: z.number().int().min(1).max(100).default(20) }) });

  const trackGoal = tool(async ({ goalId, text, status, priority }) => {
    if (!memoryService) return JSON.stringify({ error: "memory_service_unavailable" });
    const payload = { goalId: goalId || undefined, text, status: status || "open", priority: priority || "medium" };
    const result = memoryService.recordEvent({
      eventType: "goal_update",
      source: "agent",
      confidence: 0.9,
      payload,
    });
    return JSON.stringify({ saved: true, event_id: result.event_id, goalId: goalId, text, status: status || "open" });
  }, { name: "track_goal", description: "Track or update a user goal. Create new goals (omit goalId), update existing ones, or mark as completed/abandoned. Goals persist across conversations and can be listed later.", schema: z.object({ goalId: z.string().optional().describe("Omit to create new goal, or provide existing goal ID to update"), text: z.string().min(1).max(200).describe("Goal description"), status: z.enum(["open", "completed", "abandoned"]).default("open"), priority: z.enum(["low", "medium", "high"]).default("medium") }) });

  const listGoals = tool(async ({ status, limit }) => {
    if (!memoryService) return JSON.stringify({ error: "memory_service_unavailable" });
    const goals = memoryService.getTimeline({ eventType: "goal_update", limit: limit || 50 });
    const filtered = status ? goals.filter(g => {
      const payload = g.payload || {}; return payload.status === status;
    }) : goals;
    return JSON.stringify({ goals: filtered, count: filtered.length });
  }, { name: "list_goals", description: "List the user's tracked goals. Filter by status (open/completed/abandoned). Use this when the user wants to review their goals or progress.", schema: z.object({ status: z.enum(["open", "completed", "abandoned"]).optional().describe("Filter goals by status"), limit: z.number().int().min(1).max(100).default(20) }) });

  const searchSemantic = tool(async ({ query, limit }) => {
    if (!memoryService) return JSON.stringify({ error: "memory_service_unavailable" });
    const results = memoryService.searchSemantic(query, { limit: limit || 20 });
    onToolEvent({ type: "tool_result", tool: "search_memories_semantic", count: results.length });
    return JSON.stringify({ results, count: results.length });
  }, { name: "search_memories_semantic", description: "Full-text semantic search across all memories and profile fields using FTS5. Returns ranked results by relevance. Use this for broad exploratory queries when you don't know what exact profile field or time range to query.", schema: z.object({ query: z.string().min(1).max(200), limit: z.number().int().min(1).max(50).default(20) }) });

  const setConversationTitle = tool(async ({ title }) => {
    const saved = await onSetTitle(title.trim()); onToolEvent({ type: "conversation_title", title: saved?.title || title.trim() }); return { updated: true, title: saved?.title || title.trim() };
  }, { name: "set_conversation_title", description: locale === "zh-CN" ? "在理解当前主题后，为本次对话设置简洁且有意义的中文标题。用于新会话或主题发生明显变化时。" : "Set a concise, meaningful English title for the current conversation after understanding its topic. Use this for a new or substantially changed conversation topic.", schema: z.object({ title: z.string().min(4).max(locale === "zh-CN" ? 18 : 120) }) });
  const webSearch = tool(async ({ query, limit }) => {
    try { await ensureExternalSearch(); const result = await searchWeb({ query, limit }); onToolEvent({ type: "search_results", result }); return result; }
    catch (error) { return { error: error?.message || String(error || "web_search_unavailable") }; }
  }, { name: "web_search", description: "Search the public web for current facts, news, documentation, recommendations, or event timing. Top results include Firecrawl-extracted Markdown page content; only use contentSource firecrawl_markdown as evidence for concrete claims, rather than relying on search snippets. Review dates and sources before deciding whether a future event merits a schedule proposal.", schema: z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(10).default(5) }) });
  const queryData = tool(async ({ domain, dateFrom, dateTo, limit }) => {
    try { await allowDomainRead(domain); const result = await toolRuntime.query(domain, { dateFrom, dateTo, limit }, appAdapters); onToolEvent({ type: "tool_result", tool: "query_kairos_data", domain, count: result.length }); return JSON.stringify({ domain, items: result }); }
    catch (error) { return { error: error?.message || String(error || "local_data_unavailable"), domain }; }
  }, { name: "query_kairos_data", description: "Read authorized local schedules, tasks, habits, or study plans when needed for a personalized answer or conflict check.", schema: z.object({ domain: z.enum(domains), dateFrom: z.string().optional(), dateTo: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }) });
  const propose = (domain, name, description, schema = operationSchema, operation = "create") => tool(async input => {
    const candidate = Object.fromEntries(Object.entries(input).filter(([key]) => !["confidence", "inferred_fields"].includes(key)));
    if (domain === "schedules" && operation === "create") { candidate.end_date ||= candidate.recurrence?.until || candidate.date; candidate.type ||= "other"; }
    let payload = candidate;
    if (operation === "update") {
      const existing = (await toolRuntime.query(domain, { id: input.id, limit: 1 }, appAdapters))[0];
      if (!existing) throw new Error("schedule_not_found");
      payload = { ...existing, ...candidate, id: existing.id };
    }
    const proposal = { domain, operation, confidence: input.confidence || "medium", inferredFields: input.inferred_fields || [], payload };
    proposals.push(proposal); onToolEvent({ type: "tool_proposal", proposal }); return { proposed: true, index: proposals.length, requires_user_confirmation: true };
  }, { name, description, schema: schema.extend({ confidence: z.enum(["low", "medium", "high"]).default("medium"), inferred_fields: z.array(z.string()).default([]) }) });
  const proposeSchedule = propose("schedules", "propose_schedule", "Create a pending calendar schedule proposal. A valid start date is mandatory. Use this for every future arrangement, including meetings, recurring plans, reminders, events, and long-term learning. Select exactly one existing type: event (meeting, learning, reminder), match (competition), holiday, or other. Never invent a type. For a weekly arrangement, set recurrence to { frequency: 'weekly', weekdays: [0-6], until?: 'YYYY-MM-DD' }, where Sunday is 0 and Friday is 5. Do not represent a weekly schedule as an every-day date range. For a date range, set date and end_date; preserve any weekly cadence in cadence and notes.", scheduleCreateSchema);
  const proposeTask = propose("tasks", "propose_task", "Create a pending task or deadline proposal. Use this only when the user expresses a task or due-date intent. Select task or deadline as the existing type.");
  const proposeUpdateSchedule = propose("schedules", "propose_update_schedule", "Update one existing calendar schedule. First call query_kairos_data with domain schedules to identify the exact schedule ID. Then use that ID and provide only the intended changes. For requests such as 'only every Friday', set recurrence to { frequency: 'weekly', weekdays: [5] } and keep the intended date range. The system preserves untouched fields and produces a pending confirmation; never update data directly.", scheduleUpdateSchema, "update");
  const proposeDeleteSchedules = tool(async ({ ids, reason }) => {
    const uniqueIds = [...new Set(ids)];
    const existing = await toolRuntime.query("schedules", { limit: 100 }, appAdapters);
    const items = existing.filter(item => uniqueIds.includes(item.id));
    if (!items.length || items.length !== uniqueIds.length) throw new Error("schedule_not_found");
    const proposal = { domain: "schedules", operation: "delete_many", confidence: "high", inferredFields: [], payload: { ids: uniqueIds, items, reason: reason || "" } };
    proposals.push(proposal); onToolEvent({ type: "tool_proposal", proposal });
    return { proposed: true, count: items.length, requires_user_confirmation: true };
  }, { name: "propose_delete_schedules", description: "Create one pending confirmation to delete or cancel one or more existing schedules. First query schedules, identify every exact ID matching the user's request, then pass those IDs here. Never delete without confirmation.", schema: z.object({ ids: z.array(z.string().min(1)).min(1).max(100), reason: z.string().max(300).optional() }) });
  const musicTools = musicController ? [
    tool(async input => { onToolEvent({ type: "music_action", action: "searching", result: { query: input.query } }); const result = await musicController.search(input); onToolEvent({ type: "music_action", action: "search", result }); return result; }, { name: "search_netease_music", description: "Search NetEase Music for songs, playlists, albums, or artists without changing playback. Include artist and album hints when the user provides them.", schema: z.object({ query: z.string().min(1).max(160), type: z.enum(["all", "song", "playlist", "album", "artist"]).default("all"), artist: z.string().max(120).optional(), album: z.string().max(160).optional(), limit: z.number().int().min(1).max(20).default(8) }) }),
    tool(async input => { onToolEvent({ type: "music_action", action: "searching", result: { query: input.query } }); const result = await musicController.play(input); onToolEvent({ type: "music_action", action: result.action, result }); return result; }, { name: "play_netease_music", description: "Find the best NetEase match and play it. Include artist and album hints when available. Songs may play now or be placed next. Playlists and albums replace the queue in source order; artists replace it with up to 20 hot songs. Unavailable songs are skipped.", schema: z.object({ query: z.string().min(1).max(160), type: z.enum(["song", "playlist", "album", "artist"]).default("song"), artist: z.string().max(120).optional(), album: z.string().max(160).optional(), position: z.enum(["now", "next"]).default("now") }) }),
    tool(async input => { const result = await musicController.control(input); onToolEvent({ type: "music_action", action: input.action, result: { ok: true } }); return { ok: true, playing: result?.playing, currentTrackId: result?.currentTrackId }; }, { name: "control_music_playback", description: "Directly play, pause, go to the next song, or go to the previous song without confirmation.", schema: z.object({ action: z.enum(["play", "pause", "next", "previous"]) }) }),
    tool(async input => { const result = await musicController.volume(input); onToolEvent({ type: "music_action", action: "volume", result: { volume: result?.volume, muted: result?.muted } }); return { ok: true, volume: result?.volume, muted: result?.muted }; }, { name: "set_music_volume", description: "Set absolute volume, change it by one 10-point step, mute, or unmute. Relative requests always use a 10-point step.", schema: z.object({ mode: z.enum(["absolute", "relative", "mute", "unmute"]), value: z.number().min(-100).max(100).default(0) }) }),
    tool(async input => { const result = await musicController.queue(input); onToolEvent({ type: "music_action", action: result.action, result }); return result; }, { name: "manage_music_queue", description: "Directly list, add a NetEase song as next, remove a queue song, or clear the queue without confirmation. Use trackId from a prior list when possible; otherwise provide the song title as query.", schema: z.object({ action: z.enum(["list", "add_next", "remove", "clear"]), query: z.string().max(160).default(""), trackId: z.string().max(160).default(""), artist: z.string().max(120).optional(), album: z.string().max(160).optional() }) }),
    tool(async input => { const result = await musicController.likeCurrent(input); onToolEvent({ type: "music_action", action: result.action, result }); return result; }, { name: "like_current_netease_song", description: "Like or unlike the current NetEase song and sync the action immediately. This does not operate on local tracks.", schema: z.object({ liked: z.boolean().default(true) }) }),
  ] : [];
  const chat = chatModel || createProviderChatModel(provider, { definition: providerDefinition, apiKey, model, temperature: 0.35, t });
  const tools = [setConversationTitle, webSearch, queryData, proposeSchedule, proposeTask, proposeUpdateSchedule, proposeDeleteSchedules, ...musicTools];
  if (memoryEnabled) {
    tools.unshift(readMemories, rememberMemory, forgetMemory);
    if (memoryService) tools.unshift(getUserProfile, updateUserProfile, queryTimeline, trackGoal, listGoals, searchSemantic);
  }
  const memoryInstruction = memoryEnabled
    ? "Long-term memory is enabled with layered architecture. Stable user attributes → update_user_profile (with validFrom for past dates); broad recall → search_memories or search_memories_semantic; browsing history → query_memory_timeline; goals → track_goal / list_goals. Use remember_memory only for ad-hoc durable facts that do not fit a profile field."
    : "Long-term memory is disabled. Do not imply that you remember or save anything beyond this conversation.";
  const agentNow = new Intl.DateTimeFormat(locale === "zh-CN" ? "zh-CN" : "en-US", { timeZone: "Asia/Shanghai", dateStyle: "medium", timeStyle: "short", hour12 }).format(now);
  const basePrompt = locale === "zh-CN" ? KAIROS_AGENT_PROMPT : KAIROS_AGENT_PROMPT_EN;
  const agent = createAgent({ model: chat, tools, systemPrompt: `${basePrompt.replace("{now}", agentNow).replace("{conversationTitleInstruction}", conversationTitleInstruction(locale))}\n${agentLanguageInstruction(locale)}\n${personalizationInstruction}\n${memoryInstruction}\n${locale === "zh-CN" ? `当前会话标题：${conversationTitle}` : `Current conversation title: ${conversationTitle}`}\nFor any request to change, move, rename, reschedule, or retype an existing calendar item, first call query_kairos_data for schedules, identify the exact ID, then call propose_update_schedule. For requests to cancel, remove, or delete schedules, first query schedules, identify all exact matching IDs, then call propose_delete_schedules once with those IDs. When the user provides attachment text containing dates, times, meetings, tasks, or schedules, extract every concrete item with model reasoning and create separate pending schedule/task proposals; use attachment provenance in notes. Never create a replacement schedule unless the user explicitly asks for a new one. A weekly recurrence must be encoded as recurrence.frequency='weekly' and recurrence.weekdays (Sunday=0 through Saturday=6), never only as prose in notes or cadence. Music actions are direct and do not require confirmation. Prefer NetEase versions and the best metadata match. Never claim you can download music, seek playback, change playback mode, or open the queue panel.` });
  let result = null;
  let streamedText = "";
  let usage = null;
  try {
    const stream = await agent.stream({ messages }, { signal, streamMode: ["messages", "tools", "values"] });
    for await (const chunk of stream) {
      const { mode, payload } = streamEnvelope(chunk);
      if (mode === "messages") {
        const [message] = payload || [];
        if (message?._getType?.() === "ai") {
          const delta = contentOf(message);
          if (delta) { streamedText += delta; onToolEvent({ type: "text_delta", delta }); }
          usage ||= usageOf(message);
        }
      } else if (mode === "tools" && payload) {
        const type = payload.event === "on_tool_start" ? "tool_started" : payload.event === "on_tool_end" ? "tool_completed" : payload.event === "on_tool_error" ? "tool_failed" : "tool_event";
        onToolEvent({ type, tool: payload.name, toolCallId: payload.toolCallId, ...(payload.input !== undefined ? { input: payload.input } : {}), ...(payload.output !== undefined ? { output: payload.output } : {}), ...(payload.error !== undefined ? { error: String(payload.error) } : {}) });
      } else if (mode === "values") result = payload;
    }
  } catch (error) { throw normalizeProviderError(provider, error, t, providerDefinition); }
  const final = [...(result?.messages || [])].reverse().find(isFinalAiMessage);
  const text = contentOf(final).trim() || streamedText.trim();
  return { text, proposals, usage: usage || usageOf(final) };
}
