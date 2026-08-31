import crypto from "node:crypto";
import net from "node:net";
import { PROVIDERS, ProviderError } from "./provider-registry.js";

const CUSTOM_ID = /^custom-[0-9a-f-]{36}$/i;

function strings(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => String(value || "").trim()).filter(Boolean))];
}

export function normalizeCustomBaseURL(value) {
  let url;
  try { url = new URL(String(value || "").trim()); } catch { throw new ProviderError("invalid_provider_url", "Enter a valid HTTPS API base URL."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new ProviderError("invalid_provider_url", "Custom providers require a credential-free HTTPS base URL without query parameters or fragments.");
  const hostname = url.hostname.toLocaleLowerCase().replace(/^\[|\]$/g, "");
  const localName = hostname === "localhost" || hostname.endsWith(".localhost") || hostname.endsWith(".local");
  const privateIpv4 = address => {
    const [a, b] = address.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || a >= 224;
  };
  const privateIpv6 = address => address === "::" || address === "::1" || /^f[cd]/i.test(address) || /^fe[89ab]/i.test(address) || /^::ffff:(?:0\.|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.)/i.test(address);
  const ipVersion = net.isIP(hostname);
  if (localName || (ipVersion === 4 && privateIpv4(hostname)) || (ipVersion === 6 && privateIpv6(hostname))) throw new ProviderError("local_provider_not_allowed", "Custom providers must use a public HTTPS endpoint; local and private-network addresses are not supported.");
  return url.href.replace(/\/$/, "");
}

export function normalizeCustomDefinition(value = {}) {
  const id = String(value.id || "").trim();
  const name = String(value.name || "").trim().slice(0, 60);
  if (!CUSTOM_ID.test(id) || !name) return null;
  let baseURL;
  try { baseURL = normalizeCustomBaseURL(value.baseURL); } catch { return null; }
  return {
    id,
    name,
    kind: "custom",
    protocol: "openai-compatible",
    baseURL,
    defaultModel: "",
    models: [],
    capabilities: ["text", "stream", "tool_call"],
    timeout: 60_000,
    maxRetries: 2,
    createdAt: String(value.createdAt || ""),
    updatedAt: String(value.updatedAt || ""),
  };
}

export function createCustomDefinition({ name, baseURL }, now = new Date()) {
  const definition = normalizeCustomDefinition({
    id: `custom-${crypto.randomUUID()}`,
    name,
    baseURL,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  });
  if (!definition) throw new ProviderError("invalid_custom_provider", "Enter a provider name and a valid HTTPS API base URL.");
  return definition;
}

export function normalizeProviderEntry(value = {}) {
  return {
    model: String(value.model || "").trim(),
    enabledModels: strings(value.enabledModels),
    discoveredModels: strings(value.discoveredModels),
    modelCatalogUpdatedAt: String(value.modelCatalogUpdatedAt || ""),
    credentialMode: "saved",
    encryptedKey: String(value.encryptedKey || ""),
    createdAt: String(value.createdAt || ""),
    keyHint: String(value.keyHint || ""),
    environmentDisabled: Boolean(value.environmentDisabled),
    credentialVersion: Math.max(0, Number(value.credentialVersion) || 0),
  };
}

export function normalizeProviderState(value = {}) {
  const customProviders = (Array.isArray(value.customProviders) ? value.customProviders : []).map(normalizeCustomDefinition).filter(Boolean);
  const definitions = { ...PROVIDERS, ...Object.fromEntries(customProviders.map(item => [item.id, item])) };
  const providers = Object.fromEntries(Object.keys(definitions).map(id => [id, normalizeProviderEntry(value.providers?.[id] || { model: definitions[id].defaultModel || "" })]));
  const retiredProviders = value.retiredProviders && typeof value.retiredProviders === "object" && !Array.isArray(value.retiredProviders)
    ? Object.fromEntries(Object.entries(value.retiredProviders).map(([id, item]) => [id, { name: String(item?.name || id), deletedAt: String(item?.deletedAt || "") }]))
    : {};
  return {
    defaultProvider: definitions[value.defaultProvider] ? value.defaultProvider : "",
    providers,
    customProviders,
    retiredProviders,
  };
}

export function allProviderDefinitions(settings = {}) {
  const custom = (settings.customProviders || []).map(normalizeCustomDefinition).filter(Boolean);
  return { ...PROVIDERS, ...Object.fromEntries(custom.map(item => [item.id, item])) };
}

export function definitionFromSettings(settings, id) {
  return allProviderDefinitions(settings)[id] || null;
}

export function assertUniqueProviderName(settings, name, exceptId = "") {
  const target = String(name || "").trim().toLocaleLowerCase();
  if (!target) throw new ProviderError("provider_name_required", "Enter a provider name.");
  const duplicate = Object.values(allProviderDefinitions(settings)).some(item => item.id !== exceptId && item.name.toLocaleLowerCase() === target);
  if (duplicate) throw new ProviderError("provider_name_exists", "A provider with this name already exists.");
}
