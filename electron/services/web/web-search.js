const MAX_RESULTS = 10;
const DEFAULT_LIMIT = 5;
const DEFAULT_CONTENT_CHARS = 7000;
const REQUEST_ATTEMPTS = 3;

function clamp(value, fallback, maximum) { return Math.min(Math.max(Number(value) || fallback, 1), maximum); }
function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
function errorText(error) {
  const cause = error && typeof error === "object" ? error.cause : null;
  return [error?.message || String(error || "firecrawl_unavailable"), cause?.code, cause?.message].filter(Boolean).join(" | ");
}
function isRetryable(error) { const status = Number(error?.status || 0); return !status || status === 408 || status === 429 || status >= 500; }
function retryDelay(response, attempt) {
  const seconds = Number(response?.headers?.get?.("retry-after"));
  return Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, 8000) : 400 * (2 ** (attempt - 1));
}
function searchError(status, body = "") {
  const error = new Error(`firecrawl_search_failed_${status}${body ? `: ${body.slice(0, 180)}` : ""}`);
  error.status = status;
  return error;
}
function asWebResults(payload) {
  const data = payload?.data || payload || {};
  if (Array.isArray(data.web)) return data.web;
  if (Array.isArray(data)) return data;
  return [];
}

export function createWebSearch({ fetchImpl = fetch, apiKey, apiUrl = "https://api.firecrawl.dev/v2/search", t } = {}) {
  return async function searchWeb(input = {}) {
    const query = String(input.query || "").trim();
    if (!query) throw new Error("empty_query");
    const resolvedApiKey = apiKey === undefined ? process.env.FIRECRAWL_API_KEY || "" : apiKey;
    if (!resolvedApiKey) throw new Error("firecrawl_api_key_missing");
    const limit = clamp(input.limit, DEFAULT_LIMIT, MAX_RESULTS);
    const maxChars = clamp(input.readerMaxChars, DEFAULT_CONTENT_CHARS, 12000);
    const readContent = input.firecrawlReader !== false;
    const body = { query, limit, sources: ["web"], ...(readContent ? { scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true } } : {}) };
    let lastError;
    for (let attempt = 1; attempt <= REQUEST_ATTEMPTS; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 35000);
      let response;
      try {
        response = await fetchImpl(apiUrl, { method: "POST", signal: controller.signal, headers: { authorization: `Bearer ${resolvedApiKey}`, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) });
        if (!response.ok) throw searchError(response.status, await response.text());
        const results = asWebResults(await response.json());
        const items = results.slice(0, limit).map(result => {
          const content = readContent ? String(result.markdown || "").trim() : "";
          return { title: String(result.title || result.url || t?.("assistant.untitledSource", {}, "Untitled source") || "Untitled source"), url: String(result.url || ""), snippet: String(result.description || ""), content: content.slice(0, maxChars), contentSource: content ? "firecrawl_markdown" : "search_snippet", readerAttempts: attempt, readerError: readContent && !content ? "firecrawl_markdown_empty" : undefined };
        }).filter(item => item.url);
        const readable = items.filter(item => item.contentSource === "firecrawl_markdown");
        return { query, searchedAt: new Date().toISOString(), reader: { provider: "firecrawl", attempted: items.length, successful: readable.length, failures: items.filter(item => item.contentSource !== "firecrawl_markdown").map(item => ({ url: item.url, error: item.readerError })) }, items };
      } catch (error) {
        lastError = error;
        if (attempt < REQUEST_ATTEMPTS && isRetryable(error)) await delay(retryDelay(response, attempt)); else break;
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error(errorText(lastError));
  };
}

export const searchWeb = createWebSearch();
