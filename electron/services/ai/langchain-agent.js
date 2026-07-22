import { createAgent, tool } from "langchain";
import * as z from "zod";
import { createProviderChatModel, normalizeProviderError } from "./provider-registry.js";

const domains = ["schedules", "tasks", "habits", "notes"];
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

会话命名：当本会话仍是“新对话”或主题发生明显变化时，调用 set_conversation_title，生成 4～18 个字的简洁中文标题。标题应总结对话主题，不要使用“新对话”“聊天”“求助”等空泛词，也不要逐字复制用户输入。

所有 propose_* 工具仅创建“待确认提案”，绝不会直接写入数据。你可以补全合理的缺失信息：没有具体时间时使用全天；“今晚”可推测为 19:00-22:00；“暑假”可按当前年份 7 月 1 日至 8 月 31 日推测。所有推测须写入 notes，最终回复也要明确说明推测与待确认状态。绝不可假装已保存日程。

联网后的二次决策：调用 web_search 后，优先阅读每项的 content（由 Firecrawl 提取的网页 Markdown 正文），而不是仅依赖搜索标题或 snippet。只有 contentSource 为 firecrawl_markdown 的内容可以确认具体事实；搜索摘要与网页正文冲突时，以可核验的正文和官方来源为准；若正文不可用，必须明确说明证据不足，不能补写事实。先审阅结果是否包含与用户有关、可靠且尚未过去的具体事件、截止日或时间范围。仅当用户的意图包括“提醒我、加到日程、不要错过、帮我安排”，或上下文明显表明这是需要跟进的未来事项时，才调用 propose_schedule 或 propose_task。若搜索结果是过去事件、无日期/时间、只是背景知识/新闻，或用户仅在提问而没有安排意图，则不要创建提案，要直接解释为何不建议写入日程。若从搜索结果创建提案，必须填写 source_url、source_title，并在 notes 中标明哪些日期或时间来自来源、哪些是你的推测。联网答案必须附上工具返回的来源 URL。`;

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

export async function runKairosAgent({ provider = "openai", apiKey, model, chatModel, messages, conversationTitle = "新对话", store, toolRuntime, appAdapters, searchWeb, ensureExternalSearch, ensureDomainAccess, onToolEvent = () => {}, onSetTitle = async () => {}, replyStyle = "companion", memoryEnabled = true, signal, now = new Date() }) {
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
    const rows = matchingMemories(await store.listMemories(), query).slice(0, 30);
    onToolEvent({ type: "tool_result", tool: "search_memories", count: rows.length });
    return JSON.stringify({ items: rows });
  }, { name: "search_memories", description: "Search user-approved long-term memories before making a personal inference.", schema: z.object({ query: z.string().optional().describe("Memory keywords, or omit to list recent memories") }) });
  const remember = tool(async ({ type, key, value, confidence }) => {
    const item = await store.remember({ type, key, value, confidence, source: "agent" });
    onToolEvent({ type: "memory_saved", item });
    return { saved: true, id: item.id, key: item.key, value: item.value };
  }, { name: "remember_memory", description: "Save an explicit, durable user fact, preference, goal, or completed activity. Do not save guesses.", schema: z.object({ type: z.enum(["profile", "preference", "goal", "activity", "fact"]), key: z.string().min(1).max(80), value: z.string().min(1).max(500), confidence: z.number().min(0).max(1).default(0.8) }) });
  const forget = tool(async ({ query }) => {
    const rows = matchingMemories(await store.listMemories(), query); for (const row of rows) await store.forgetMemory(row.id);
    onToolEvent({ type: "memory_forgotten", query, count: rows.length }); return { forgotten: rows.length };
  }, { name: "forget_memory", description: "Forget memories only when the user asks to forget or delete a memory.", schema: z.object({ query: z.string().min(1).max(200) }) });
  const setConversationTitle = tool(async ({ title }) => {
    const saved = await onSetTitle(title.trim()); onToolEvent({ type: "conversation_title", title: saved?.title || title.trim() }); return { updated: true, title: saved?.title || title.trim() };
  }, { name: "set_conversation_title", description: "Set a concise, meaningful Chinese title for the current conversation after understanding its topic. Use this for a new or substantially changed conversation topic.", schema: z.object({ title: z.string().min(4).max(18) }) });
  const webSearch = tool(async ({ query, limit }) => {
    try { await ensureExternalSearch(); const result = await searchWeb({ query, limit }); onToolEvent({ type: "search_results", result }); return result; }
    catch (error) { return { error: error?.message || String(error || "web_search_unavailable") }; }
  }, { name: "web_search", description: "Search the public web for current facts, news, documentation, recommendations, or event timing. Top results include Firecrawl-extracted Markdown page content; only use contentSource firecrawl_markdown as evidence for concrete claims, rather than relying on search snippets. Review dates and sources before deciding whether a future event merits a schedule proposal.", schema: z.object({ query: z.string().min(1).max(300), limit: z.number().int().min(1).max(10).default(5) }) });
  const queryData = tool(async ({ domain, dateFrom, dateTo, limit }) => {
    try { await allowDomainRead(domain); const result = await toolRuntime.query(domain, { dateFrom, dateTo, limit }, appAdapters); onToolEvent({ type: "tool_result", tool: "query_kairos_data", domain, count: result.length }); return JSON.stringify({ domain, items: result }); }
    catch (error) { return { error: error?.message || String(error || "local_data_unavailable"), domain }; }
  }, { name: "query_kairos_data", description: "Read authorized local schedules, tasks, habits, notes, or study plans when needed for a personalized answer or conflict check.", schema: z.object({ domain: z.enum(domains), dateFrom: z.string().optional(), dateTo: z.string().optional(), limit: z.number().int().min(1).max(100).default(20) }) });
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
  const styles = { companion: "Reply with warm companionship: acknowledge feelings first when appropriate, then offer grounded help.", concise: "Reply concisely and action-first. Prefer clear conclusions, short steps, and no unnecessary preamble.", learning: "Reply as a focused learning partner: explain the reasoning clearly, structure the material, and encourage deliberate practice." };
  const chat = chatModel || createProviderChatModel(provider, { apiKey, model, temperature: 0.35 });
  const tools = [setConversationTitle, webSearch, queryData, proposeSchedule, proposeTask, proposeUpdateSchedule, proposeDeleteSchedules];
  if (memoryEnabled) tools.unshift(readMemories, remember, forget);
  const memoryInstruction = memoryEnabled ? "Long-term memory is enabled. Use memory tools only for explicit, durable user facts." : "Long-term memory is disabled. Do not imply that you remember or save anything beyond this conversation.";
  const agent = createAgent({ model: chat, tools, systemPrompt: `${KAIROS_AGENT_PROMPT.replace("{now}", now.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false }))}\n${styles[replyStyle] || styles.companion}\n${memoryInstruction}\nCurrent conversation title: ${conversationTitle}\nFor any request to change, move, rename, reschedule, or retype an existing calendar item, first call query_kairos_data for schedules, identify the exact ID, then call propose_update_schedule. For requests to cancel, remove, or delete schedules, first query schedules, identify all exact matching IDs, then call propose_delete_schedules once with those IDs. When the user provides attachment text containing dates, times, meetings, tasks, or schedules, extract every concrete item with model reasoning and create separate pending schedule/task proposals; use attachment provenance in notes. Never create a replacement schedule unless the user explicitly asks for a new one. A weekly recurrence must be encoded as recurrence.frequency='weekly' and recurrence.weekdays (Sunday=0 through Saturday=6), never only as prose in notes or cadence.` });
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
  } catch (error) { throw normalizeProviderError(provider, error); }
  const final = [...(result?.messages || [])].reverse().find(isFinalAiMessage);
  const text = contentOf(final).trim() || streamedText.trim();
  return { text, proposals, usage: usage || usageOf(final) };
}
