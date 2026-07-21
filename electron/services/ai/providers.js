import OpenAI from "openai";
import { ArkRuntimeClient, ArkAPIError, ArkRequestError } from "@volcengine/ark-runtime";

export const PROVIDERS = Object.freeze({
  openai: { id: "openai", name: "OpenAI", defaultModel: "gpt-4.1-mini", models: ["gpt-4.1-mini","gpt-4.1","gpt-4.1-nano","gpt-4o","gpt-4o-mini","o3","o4-mini"], capabilities: ["text", "vision", "stream"] },
  anthropic: { id: "anthropic", name: "Anthropic", defaultModel: "claude-opus-4-7", models: ["claude-opus-4-7","claude-sonnet-4-5","claude-haiku-4-5","claude-opus-4-1-20250805"], capabilities: ["text", "vision", "files", "stream"] },
  gemini: { id: "gemini", name: "Google Gemini", defaultModel: "gemini-2.5-flash", models: ["gemini-2.5-flash","gemini-2.5-pro","gemini-2.5-flash-lite","gemini-2.0-flash"], capabilities: ["text", "vision", "files", "stream"] },
  doubao: { id: "doubao", name: "豆包（火山方舟）", defaultModel: "doubao-seed-2-0-pro-260215", models: ["doubao-seed-2-0-mini-260428","doubao-seed-2-0-lite-260428","doubao-seed-2-0-pro-260215"], capabilities: ["text", "vision", "stream"] }
});

export class ProviderError extends Error {
  constructor(code, message, details = {}) { super(message); this.name = "ProviderError"; this.code = code; this.details = details; }
}

function normalizeOpenAIError(error) {
  if (error?.status === 401) return new ProviderError("authentication", "API Key 无效或已失效");
  if (error?.status === 429) return new ProviderError("rate_limit", "请求过于频繁或额度不足");
  if (error?.status === 404) return new ProviderError("model_not_found", "模型不存在或当前项目无权访问");
  return new ProviderError("provider_error", error?.message || "OpenAI 请求失败", { status: error?.status });
}

async function* streamOpenAI({ apiKey, model, messages, images=[], signal }) {
  const client = new OpenAI({ apiKey });
  try {
    const stream = await client.responses.create({
      model,
      input: [...messages.map(({ role, content }) => ({ role, content })),...images.map(image=>({role:"user",content:[{type:"input_image",image_url:image.dataUrl}]}))],
      stream: true
    }, { signal });
    for await (const event of stream) {
      if (event.type === "response.output_text.delta") yield { type: "text_delta", delta: event.delta };
      if (event.type === "response.completed") yield { type: "completed", usage: event.response?.usage || null };
    }
  } catch (error) { if (signal?.aborted) yield { type: "stopped" }; else throw normalizeOpenAIError(error); }
}

function normalizeArkError(error) {
  const status = error?.httpStatusCode;
  if (status === 401 || status === 403) return new ProviderError("authentication", "方舟 API Key 无效或当前项目无权访问", { requestId: error.requestId });
  if (status === 429) return new ProviderError("rate_limit", "豆包请求频率过高或账户额度不足", { requestId: error.requestId });
  if (status === 404) return new ProviderError("model_not_found", "模型或推理接入点不存在", { requestId: error.requestId });
  if (error instanceof ArkRequestError) return new ProviderError("network", "无法连接火山方舟服务", { requestId: error.requestId });
  if (error instanceof ArkAPIError) return new ProviderError("provider_error", error.message, { status, requestId: error.requestId, providerCode: error.code });
  return new ProviderError("provider_error", error?.message || "豆包请求失败");
}

async function* streamDoubao({ apiKey, model, messages, images=[], signal }) {
  const client = new ArkRuntimeClient({ apiKey });
  try {
    const imageMessages=images.map(image=>({role:"user",content:[{type:"image_url",image_url:{url:image.dataUrl}}]}));const stream = await client.createChatCompletionStream({ model, messages:[...messages,...imageMessages],stream_options:{include_usage:true} }, { signal });
    let usage = null;
    for await (const chunk of stream) {
      const delta = chunk?.choices?.[0]?.delta?.content || "";
      if (delta) yield { type: "text_delta", delta };
      if (chunk?.usage) usage = chunk.usage;
    }
    yield { type: "completed", usage };
  } catch (error) { if (signal?.aborted) yield { type: "stopped" }; else throw normalizeArkError(error); }
}

export async function* streamProviderRequest(request) {
  if (!PROVIDERS[request.provider]) throw new ProviderError("unknown_provider", "未知模型提供商");
  if (!request.apiKey) throw new ProviderError("missing_key", "请先配置 API Key");
  if (request.provider === "openai") yield* streamOpenAI(request);
  else if (request.provider === "doubao") yield* streamDoubao(request);
  else throw new ProviderError("not_implemented", `${PROVIDERS[request.provider].name} 适配器将在下一阶段接入`);
}

export async function testProvider({ provider, apiKey, model }) {
  if (!PROVIDERS[provider]) throw new ProviderError("unknown_provider", "未知模型提供商");
  if (!apiKey) throw new ProviderError("missing_key", "请先配置 API Key");
  if (provider === "openai") { const client = new OpenAI({ apiKey }); try { await client.models.list(); return { ok: true }; } catch (error) { throw normalizeOpenAIError(error); } }
  if (provider === "doubao") { const client = new ArkRuntimeClient({ apiKey }); try { await client.createChatCompletion({ model: model || PROVIDERS.doubao.defaultModel, messages: [{ role: "user", content: "回复 OK" }], max_tokens: 4 }); return { ok: true }; } catch (error) { throw normalizeArkError(error); } }
  return { ok: false, code: "not_implemented" };
}
