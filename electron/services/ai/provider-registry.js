import OpenAI from "openai";
import { ChatOpenAI } from "@langchain/openai";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 2;
const fallbackTranslate = (_key, _params, fallback = "") => fallback;
const providerText = (translate, key, fallback, params = {}) => (typeof translate === "function" ? translate(key, params, fallback) : fallbackTranslate(key, params, fallback));

const builtin = definition => Object.freeze({
  kind: "builtin",
  protocol: "openai-compatible",
  capabilities: ["text", "stream", "tool_call"],
  timeout: DEFAULT_TIMEOUT_MS,
  maxRetries: DEFAULT_MAX_RETRIES,
  ...definition,
});

export const PROVIDERS = Object.freeze({
  openai: builtin({
    id: "openai", name: "OpenAI", defaultModel: "gpt-4.1-mini",
    models: ["gpt-4.1-mini", "gpt-4.1", "gpt-4.1-nano", "gpt-4o", "gpt-4o-mini", "o3", "o4-mini"],
    capabilities: ["text", "vision", "stream", "tool_call"],
  }),
  doubao: builtin({
    id: "doubao", name: "豆包（火山方舟）", baseURL: "https://ark.cn-beijing.volces.com/api/v3",
    defaultModel: "doubao-seed-2-0-pro-260215", models: ["doubao-seed-2-0-mini-260428", "doubao-seed-2-0-lite-260428", "doubao-seed-2-0-pro-260215"],
    capabilities: ["text", "vision", "stream", "tool_call"],
  }),
  deepseek: builtin({
    id: "deepseek", name: "DeepSeek", baseURL: "https://api.deepseek.com",
    defaultModel: "deepseek-v4-flash", models: ["deepseek-v4-flash", "deepseek-v4-pro"],
  }),
  "mimo-api": builtin({
    id: "mimo-api", name: "MiMo API", baseURL: "https://api.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5", models: ["mimo-v2.5", "mimo-v2.5-pro"],
  }),
  "mimo-token-plan": builtin({
    id: "mimo-token-plan", name: "MiMo Token Plan", baseURL: "https://token-plan-cn.xiaomimimo.com/v1",
    defaultModel: "mimo-v2.5", models: ["mimo-v2.5", "mimo-v2.5-pro"],
  }),
});

export const BUILTIN_PROVIDER_IDS = Object.freeze(Object.keys(PROVIDERS));

export class ProviderError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "ProviderError"; this.code = code; this.details = details; }
}

export function providerDefinition(provider, options = {}) {
  const definition = options.definition || PROVIDERS[provider];
  if (!definition || definition.id !== provider) throw new ProviderError("unknown_provider", providerText(options.t, "errors.unknownProvider", "Unknown AI provider."));
  return definition;
}

export function resolveProviderConfig(provider, options = {}) {
  const { apiKey, model, t: translate } = options;
  const definition = providerDefinition(provider, options);
  if (definition.protocol !== "openai-compatible") throw new ProviderError("not_implemented", providerText(translate, "errors.providerNotImplemented", "{provider} is not connected through the OpenAI-compatible transport.", { provider: definition.name }));
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
  if (!config.apiKey) throw new ProviderError("missing_key", providerText(options.t, "errors.missingApiKey", "Please configure an API key first."));
  return new OpenAI(openAIOptions(config));
}

export function createProviderChatModel(provider, options = {}) {
  const config = resolveProviderConfig(provider, options);
  if (!config.apiKey) throw new ProviderError("missing_key", providerText(options.t, "errors.missingApiKey", "Please configure an API key first."));
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
 * Model discovery is authoritative after the first successful refresh. A
 * configured model stays visible when it later disappears, but it is not
 * selectable. Selected models never silently fall back to another default.
 */
export function resolveSelectableModels(provider, settings = {}, options = {}) {
  const definition = typeof provider === "string" ? providerDefinition(provider, options) : provider;
  if (!definition) throw new ProviderError("unknown_provider", providerText(options.t, "errors.unknownProvider", "Unknown AI provider."));
  const discoveredModels = modelIds(settings.discoveredModels);
  const catalogModels = settings.modelCatalogUpdatedAt ? discoveredModels : modelIds(definition.models);
  const configuredModels = modelIds(settings.enabledModels);
  const availableModels = modelIds([...catalogModels, ...configuredModels, settings.model]);
  const catalogSet = new Set(catalogModels);
  const unavailableModels = settings.modelCatalogUpdatedAt ? configuredModels.filter(model => !catalogSet.has(model)) : [];
  const unavailableSet = new Set(unavailableModels);
  const enabledModels = configuredModels.filter(model => !unavailableSet.has(model));
  const preferredDefault = String(settings.model || "").trim();
  const defaultModel = enabledModels.includes(preferredDefault) ? preferredDefault : "";
  return { availableModels, catalogModels, configuredModels, enabledModels, unavailableModels, defaultModel };
}

export async function listProviderModels(provider, options = {}) {
  const client = options.client || createProviderClient(provider, options);
  try {
    const page = await client.models.list();
    return filterAccountModels(page?.data || []);
  } catch (error) {
    throw normalizeProviderError(provider, error, options.t, options.definition);
  }
}

export function normalizeProviderError(provider, error, translate, explicitDefinition) {
  if (error instanceof ProviderError) return error;
  const definition = explicitDefinition || PROVIDERS[provider];
  const providerName = definition?.name || providerText(translate, "errors.providerFallbackName", "provider");
  const status = error?.status ?? error?.statusCode ?? error?.httpStatusCode;
  const details = { status, requestId: error?.request_id || error?.requestId, providerCode: error?.code };
  if (status === 401 || status === 403) return new ProviderError("authentication", providerText(translate, "errors.providerAuthentication", "{provider} API key is invalid or the current project has no access.", { provider: providerName }), details);
  if (status === 429) return new ProviderError("rate_limit", providerText(translate, "errors.providerRateLimit", "{provider} request rate is too high or the account quota is exhausted.", { provider: providerName }), details);
  if (status === 404) return new ProviderError("model_not_found", providerText(translate, "errors.providerModelNotFound", "The selected model does not exist or this project has no access."), details);
  if (error?.name === "APIConnectionError" || error?.code === "ECONNRESET" || error?.code === "ETIMEDOUT") return new ProviderError("network", providerText(translate, "errors.providerNetwork", "Unable to connect to {provider}.", { provider: providerName }), details);
  return new ProviderError("provider_error", error?.message || providerText(translate, "errors.providerRequestFailed", "{provider} request failed.", { provider: providerName }), details);
}
