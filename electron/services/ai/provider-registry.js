import OpenAI from "openai";
import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;

export const PROVIDERS = Object.freeze({
  openai: Object.freeze({
    id: "openai", name: "OpenAI", protocol: "openai-compatible", defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
    capabilities: ["text", "vision", "stream", "tool_call"], timeout: DEFAULT_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES,
  }),
  anthropic: Object.freeze({
    id: "anthropic", name: "Anthropic", protocol: "native", defaultModel: "claude-opus-4-7",
    models: ["claude-opus-4-7", "claude-sonnet-4-5", "claude-haiku-4-5", "claude-opus-4-1-20250805"],
    capabilities: ["text", "vision", "files", "stream"], timeout: DEFAULT_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES,
  }),
  gemini: Object.freeze({
    id: "gemini", name: "Google Gemini", protocol: "native", defaultModel: "gemini-2.5-flash",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-flash-lite", "gemini-2.0-flash"],
    capabilities: ["text", "vision", "files", "stream"], timeout: DEFAULT_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES,
  }),
  doubao: Object.freeze({
    id: "doubao", name: "豆包（火山方舟）", protocol: "openai-compatible", baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-2-0-pro-260215", models: ["doubao-seed-2-0-mini-260428", "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-pro-260215"],
    capabilities: ["text", "vision", "stream", "tool_call"], timeout: DEFAULT_TIMEOUT_MS, maxRetries: DEFAULT_MAX_RETRIES,
  }),
});

export class ProviderError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "ProviderError"; this.code = code; this.details = details; }
}

export function resolveProviderConfig(provider, { apiKey, model } = {}) {
  const definition = PROVIDERS[provider];
  if (!definition) throw new ProviderError("unknown_provider", "未知模型提供商");
  if (definition.protocol !== "openai-compatible") throw new ProviderError("not_implemented", `${definition.name} 尚未接入 OpenAI 兼容传输层`);
  return { ...definition, apiKey, model: model || definition.defaultModel };
}

function openAIOptions(config) {
  return {
    apiKey: config.apiKey,
    ...(config.baseURL ? { baseURL: config.baseURL } : {}),
    timeout: config.timeout,
    maxRetries: config.maxRetries,
  };
}

export function createProviderClient(provider, options = {}) {
  const config = resolveProviderConfig(provider, options);
  if (!config.apiKey) throw new ProviderError("missing_key", "请先配置 API Key");
  return new OpenAI(openAIOptions(config));
}

export function createProviderChatModel(provider, options = {}) {
  const config = resolveProviderConfig(provider, options);
  if (!config.apiKey) throw new ProviderError("missing_key", "请先配置 API Key");
  return new ChatOpenAI({
    model: config.model,
    temperature: options.temperature ?? 0.35,
    timeout: config.timeout,
    maxRetries: config.maxRetries,
    streamUsage: true,
    configuration: openAIOptions(config),
  });
}

const NON_CHAT_MODEL_ID = /(?:audio|embedding|image|moderation|realtime|seedance|seedream|speech|transcri(?:be|ption)|tts|whisper)/i;

export function filterAccountModels(models = []) {
  return [...new Set(models.map(item => typeof item === "string" ? item : item?.id).filter(id => typeof id === "string" && id.trim() && !NON_CHAT_MODEL_ID.test(id)).map(id => id.trim()))].sort((left, right) => left.localeCompare(right));
}

function modelIds(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean))];
}

/**
 * Combines a provider's built-in and account-discovered catalogue with the
 * user's model selection. A missing or empty `enabledModels` list means that
 * the account has not enabled a chat model yet.
 */
export function resolveSelectableModels(provider, settings = {}) {
  const definition = typeof provider === "string" ? PROVIDERS[provider] : provider;
  if (!definition) throw new ProviderError("unknown_provider", "未知模型提供商");
  const requested = modelIds(settings.enabledModels);
  const availableModels = modelIds([
    ...(definition.models || []),
    ...(settings.discoveredModels || []),
    settings.model,
    ...requested,
  ]);
  const enabledModels = requested;
  const preferredDefault = String(settings.model || definition.defaultModel || "").trim();
  const defaultModel = enabledModels.includes(preferredDefault) ? preferredDefault : enabledModels[0] || "";
  return { availableModels, enabledModels, defaultModel };
}

export async function listProviderModels(provider, options = {}) {
  const client = options.client || createProviderClient(provider, options);
  try {
    const page = await client.models.list();
    return filterAccountModels(page?.data || []);
  } catch (error) {
    throw normalizeProviderError(provider, error);
  }
}

export function normalizeProviderError(provider, error) {
  if (error instanceof ProviderError) return error;
  const definition = PROVIDERS[provider];
  const status = error?.status ?? error?.statusCode ?? error?.httpStatusCode;
  const details = { status, requestId: error?.request_id || error?.requestId, providerCode: error?.code };
  if (status === 401 || status === 403) return new ProviderError("authentication", `${definition?.name || "提供商"} API Key 无效或当前项目无访问权限`, details);
  if (status === 429) return new ProviderError("rate_limit", `${definition?.name || "提供商"} 请求频率过高或账户额度不足`, details);
  if (status === 404) return new ProviderError("model_not_found", "模型不存在或当前项目无访问权限", details);
  if (error?.name === "APIConnectionError" || error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") return new ProviderError("network", `无法连接${definition?.name || "模型提供商"}服务`, details);
  return new ProviderError("provider_error", error?.message || `${definition?.name || "模型提供商"}请求失败`, details);
}
