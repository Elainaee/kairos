import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { analyzeScheduleIntent } from "../ai-intent.js";
import { createKairosLangChainTools } from "./langchain-tools.js";

const DOUBAO_OPENAI_BASE_URL = "https://ark.cn-beijing.volces.com/api/v3";

function cleanJson(text = "") {
  return String(text).trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
}

function extractContent(result) {
  if (typeof result?.content === "string") return result.content;
  const messages = result?.messages || result?.state?.messages || [];
  const last = [...messages].reverse().find(message => message?._getType?.() === "ai" || message?.role === "assistant" || message?.content);
  if (typeof last?.content === "string") return last.content;
  if (Array.isArray(last?.content)) return last.content.map(part => part.text || part.content || "").join("");
  return "";
}

function normalizeAgentResult(value) {
  if (!value || typeof value !== "object") return { type: "chat", message: String(value || "") };
  const type = value.type || "chat";
  return {
    type,
    message: String(value.message || ""),
    cards: Array.isArray(value.cards) ? value.cards : [],
    sources: Array.isArray(value.sources) ? value.sources : [],
    warnings: Array.isArray(value.warnings) ? value.warnings : []
  };
}

function createModel({ provider, apiKey, model }) {
  if (provider !== "doubao") throw new Error("agent_provider_not_supported");
  if (!apiKey) throw new Error("missing_key");
  return new ChatOpenAI({
    apiKey,
    model,
    temperature: 0,
    configuration: { baseURL: DOUBAO_OPENAI_BASE_URL }
  });
}

function fallbackFromIntent(intent) {
  if (intent.action === "clarify_game") return { type: "clarification", message: `你说的是 ${intent.teamCode} 哪个项目？无畏契约、英雄联盟，还是其他？如果是无畏契约，可以直接说“${intent.teamCode} 瓦里最近比赛”。` };
  if (intent.action === "clarify_range") return { type: "clarification", message: `你想看 ${intent.teamCode} 最近已结束的比赛，还是接下来将要打的比赛？` };
  return null;
}

async function ensureExternalSearchPermission(deps) {
  if (!deps.permissions) return;
  const permissions = await deps.permissions.getPermissions();
  if (permissions.externalSearch !== "read") {
    const error = new Error("permission_denied");
    error.permission = "externalSearch";
    throw error;
  }
}

async function runDeterministicScheduleFlow(input, intent, deps) {
  if (intent.action === "extract_attachments") {
    const cards = await deps.extractSchedules({ provider: input.provider, model: input.model, text: input.text, attachmentIds: input.attachmentIds || [] });
    return { type: "schedule_cards", message: `识别到 ${cards.length} 项日程，请确认后保存。`, cards };
  }
  if (intent.action === "extract_text") {
    const cards = await deps.extractSchedules({ provider: input.provider, model: input.model, text: input.text, attachmentIds: [] });
    return { type: "schedule_cards", message: `识别到 ${cards.length} 项日程，请确认后保存。`, cards };
  }
  if (intent.action === "fetch_url") {
    await ensureExternalSearchPermission(deps);
    const source = await deps.fetchUrlText({ url: intent.sourceUrl });
    const cards = await deps.extractSchedules({ provider: input.provider, model: input.model, text: input.text, attachmentIds: [], sourceText: source?.text || "", sourceLabel: source?.url || intent.sourceUrl });
    return { type: "schedule_cards", message: `识别到 ${cards.length} 项日程，请确认后保存。`, cards, sources: source?.url ? [{ url: source.url, name: source.title || source.url }] : [] };
  }
  return null;
}

export async function runKairosLangChainAgent(input, deps) {
  const intent = analyzeScheduleIntent(input.text || "", input.attachmentIds || []);
  const fallback = fallbackFromIntent(intent);
  if (fallback) return fallback;
  try {
    const deterministic = await runDeterministicScheduleFlow(input, intent, deps);
    if (deterministic) return deterministic;
    if (intent.action === "search_esports") await ensureExternalSearchPermission(deps);
  } catch (error) {
    if (error.permission === "externalSearch" || error.message === "permission_denied") return { type: "permission_required", permission: "externalSearch", message: "查询公开网页、VLR 或 Valorant Esports 赛事信息需要授权 AI 读取外部公开来源。是否授权并继续？" };
    return { type: "tool_error", message: `Agent 工具执行失败：${error.message}` };
  }
  if (!["search_esports", "none"].includes(intent.action)) return { type: "pass" };

  const tools = createKairosLangChainTools({
    searchEsportsMatches: async args => {
      await ensureExternalSearchPermission(deps);
      return deps.searchEsportsMatches(args);
    }
  });
  try {
    const agent = createAgent({
      model: createModel({ provider: input.provider || "doubao", apiKey: deps.apiKey, model: input.model || "doubao-seed-2-0-pro-260215" }),
      tools,
      systemPrompt: `你是 Kairos 桌面助手的 LangChain 任务规划智能体。

你必须遵守：
1. 需要实时赛事信息时，调用 search_esports_matches，不能编造比赛时间、对手、赛事名。
2. 需要写入日程时，只返回候选 cards，不要直接写入。
3. 缺少关键信息时返回 clarification。
4. 用户只是普通聊天时返回 chat。
5. 只返回 JSON，不要 Markdown。

输出格式：
{"type":"chat|clarification|schedule_cards|tool_error|pass","message":"给用户看的短消息","cards":[],"sources":[],"warnings":[]}

如果工具返回 items，转换为：
{"type":"schedule_cards","message":"找到 N 场比赛，请确认后保存。","cards":items,"sources":sources,"warnings":warnings}
`
    });
    const result = await agent.invoke({ messages: [{ role: "user", content: input.text || "" }] });
    const content = extractContent(result);
    try { return normalizeAgentResult(JSON.parse(cleanJson(content))); }
    catch { return { type: "chat", message: content }; }
  } catch (error) {
    if (error.permission === "externalSearch" || error.message === "permission_denied") return { type: "permission_required", permission: "externalSearch", message: "查询公开网页、VLR 或 Valorant Esports 赛事信息需要授权 AI 读取外部公开来源。是否授权并继续？" };
    if (error.message === "missing_key") return { type: "tool_error", message: "请先配置豆包 API Key。" };
    if (error.message === "agent_provider_not_supported") return { type: "pass" };
    return { type: "tool_error", message: `Agent 执行失败：${error.message}` };
  }
}
