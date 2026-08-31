import test from "node:test";
import assert from "node:assert/strict";
import { allProviderDefinitions, assertUniqueProviderName, createCustomDefinition, normalizeCustomBaseURL, normalizeProviderState } from "../../services/ai/provider-settings.js";

test("custom providers are named, HTTPS-only, and included alongside fixed built-ins", () => {
  const custom = createCustomDefinition({ name: "Team gateway", baseURL: "https://ai.example.com/v1/" }, new Date("2026-08-31T00:00:00.000Z"));
  const settings = normalizeProviderState({ customProviders: [custom] });
  const definitions = allProviderDefinitions(settings);
  assert.equal(definitions[custom.id].baseURL, "https://ai.example.com/v1");
  assert.equal(definitions[custom.id].protocol, "openai-compatible");
  assert.equal(Object.keys(definitions).length, 6);
  assert.throws(() => normalizeCustomBaseURL("http://localhost:8080/v1"), { code: "invalid_provider_url" });
  assert.throws(() => normalizeCustomBaseURL("https://localhost:8443/v1"), { code: "local_provider_not_allowed" });
  assert.throws(() => normalizeCustomBaseURL("https://192.168.1.20/v1"), { code: "local_provider_not_allowed" });
  assert.throws(() => normalizeCustomBaseURL("https://user:pass@example.com/v1"), { code: "invalid_provider_url" });
});

test("provider names are unique", () => {
  const custom = createCustomDefinition({ name: "Team gateway", baseURL: "https://ai.example.com/v1" });
  const settings = normalizeProviderState({ customProviders: [custom] });
  assert.throws(() => assertUniqueProviderName(settings, "team GATEWAY"), { code: "provider_name_exists" });
});
