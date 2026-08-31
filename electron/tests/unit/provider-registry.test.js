import test from "node:test";
import assert from "node:assert/strict";
import { PROVIDERS, createProviderChatModel, listProviderModels, normalizeProviderError, resolveProviderConfig, resolveSelectableModels } from "../../services/ai/provider-registry.js";

test("the fixed built-in provider list keeps MiMo API and MiMo Token Plan separate", () => {
  assert.deepEqual(Object.keys(PROVIDERS), ["openai", "doubao", "deepseek", "mimo-api", "mimo-token-plan"]);
  assert.notEqual(PROVIDERS["mimo-api"].baseURL, PROVIDERS["mimo-token-plan"].baseURL);
});

test("Doubao uses the central OpenAI-compatible provider definition", () => {
  const config = resolveProviderConfig("doubao", { apiKey: "test-key" });
  assert.equal(config.protocol, "openai-compatible");
  assert.equal(config.baseURL, "https://ark.cn-beijing.volces.com/api/v3");
  assert.equal(config.model, PROVIDERS.doubao.defaultModel);
  assert.ok(config.capabilities.includes("tool_call"));
  assert.equal(config.timeout, 60_000);
  assert.equal(config.maxRetries, 2);
});

test("the LangChain chat model inherits the same Doubao transport settings", () => {
  const model = createProviderChatModel("doubao", { apiKey: "test-key" });
  assert.equal(model.model, PROVIDERS.doubao.defaultModel);
  assert.equal(model.clientConfig.baseURL, PROVIDERS.doubao.baseURL);
  assert.equal(model.timeout, PROVIDERS.doubao.timeout);
  assert.equal(model.clientConfig.maxRetries, PROVIDERS.doubao.maxRetries);
});

test("provider errors are normalized independently of the OpenAI-compatible client", () => {
  const error = normalizeProviderError("doubao", { status: 429, request_id: "request-1" });
  assert.equal(error.code, "rate_limit");
  assert.equal(error.details.requestId, "request-1");
});

test("account model refresh keeps chat candidates and excludes non-chat endpoints", async () => {
  const models = await listProviderModels("doubao", { client: { models: { list: async () => ({ data: [{ id: "doubao-seed-2-0-lite-260215" }, { id: "doubao-embedding-large" }, { id: "doubao-seedream-5-0" }, { id: "deepseek-v3" }, { id: "deepseek-v3" }] }) } } });
  assert.deepEqual(models, ["deepseek-v3", "doubao-seed-2-0-lite-260215"]);
});

test("enabled models are the only models exposed to the chat selector", () => {
  const selection = resolveSelectableModels(PROVIDERS.doubao, {
    model: "deepseek-v3",
    discoveredModels: ["deepseek-v3", "doubao-seed-2-0-lite-260428"],
    modelCatalogUpdatedAt: "2026-08-31T00:00:00.000Z",
    enabledModels: ["deepseek-v3"],
  });
  assert.deepEqual(selection.availableModels, [
    "deepseek-v3",
    "doubao-seed-2-0-lite-260428",
  ]);
  assert.deepEqual(selection.enabledModels, ["deepseek-v3"]);
  assert.equal(selection.defaultModel, "deepseek-v3");
});

test("an unavailable default never silently falls back", () => {
  const selection = resolveSelectableModels(PROVIDERS.openai, {
    model: "gpt-4.1",
    enabledModels: ["gpt-4.1-mini"],
  });
  assert.equal(selection.defaultModel, "");
});

test("legacy verification metadata does not block a selected model", () => {
  const selection = resolveSelectableModels(PROVIDERS.openai, {
    discoveredModels: ["gpt-4.1-mini"], modelCatalogUpdatedAt: "2026-08-31T00:00:00.000Z",
    enabledModels: ["gpt-4.1-mini"], model: "gpt-4.1-mini",
    verifiedModels: { "gpt-4.1-mini": { verified: false, fingerprint: "same" } },
  });
  assert.deepEqual(selection.enabledModels, ["gpt-4.1-mini"]);
  assert.equal(selection.defaultModel, "gpt-4.1-mini");
});

test("a provider starts with no chat models enabled", () => {
  const selection = resolveSelectableModels(PROVIDERS.openai, {});
  assert.deepEqual(selection.enabledModels, []);
  assert.equal(selection.defaultModel, "");
});
