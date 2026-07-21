import test from "node:test";
import assert from "node:assert/strict";
import { createWebSearch } from "../../services/web/web-search.js";

test("Firecrawl search returns Markdown body as agent evidence", async () => {
  let request;
  const search = createWebSearch({ apiKey: "test-key", fetchImpl: async (url, init) => {
    request = { url, init };
    return Response.json({ success: true, data: { web: [{ title: "Official schedule", url: "https://official.example/schedule", description: "Schedule overview", markdown: "# Official schedule\n\nEDG vs TYL — 2026-07-15 20:00 CST" }] } });
  } });
  const result = await search({ query: "EDG upcoming match", limit: 1 });
  assert.equal(request.url, "https://api.firecrawl.dev/v2/search");
  assert.equal(request.init.headers.authorization, "Bearer test-key");
  assert.deepEqual(JSON.parse(request.init.body), { query: "EDG upcoming match", limit: 1, sources: ["web"], scrapeOptions: { formats: [{ type: "markdown" }], onlyMainContent: true } });
  assert.equal(result.reader.provider, "firecrawl");
  assert.equal(result.reader.successful, 1);
  assert.equal(result.items[0].contentSource, "firecrawl_markdown");
  assert.match(result.items[0].content, /2026-07-15 20:00/);
});

test("Firecrawl search marks results without Markdown as snippets", async () => {
  const search = createWebSearch({ apiKey: "test-key", fetchImpl: async () => Response.json({ success: true, data: { web: [{ title: "Result", url: "https://example.test", description: "Only description" }] } }) });
  const result = await search({ query: "test", limit: 1 });
  assert.equal(result.reader.successful, 0);
  assert.equal(result.items[0].contentSource, "search_snippet");
  assert.equal(result.items[0].readerError, "firecrawl_markdown_empty");
});

test("Firecrawl search retries a transient rate limit", async () => {
  let calls = 0;
  const search = createWebSearch({ apiKey: "test-key", fetchImpl: async () => {
    calls += 1;
    if (calls === 1) return new Response("slow down", { status: 429 });
    return Response.json({ success: true, data: { web: [{ title: "Result", url: "https://example.test", markdown: "Readable evidence" }] } });
  } });
  const result = await search({ query: "test", limit: 1 });
  assert.equal(calls, 2);
  assert.equal(result.reader.successful, 1);
  assert.equal(result.items[0].readerAttempts, 2);
});

test("Firecrawl search does not retry invalid credentials", async () => {
  let calls = 0;
  const search = createWebSearch({ apiKey: "bad-key", fetchImpl: async () => { calls += 1; return new Response("invalid key", { status: 401 }); } });
  await assert.rejects(() => search({ query: "test" }), /firecrawl_search_failed_401/);
  assert.equal(calls, 1);
});

test("Firecrawl search requires a key", async () => {
  const search = createWebSearch({ apiKey: "" });
  await assert.rejects(() => search({ query: "test" }), /firecrawl_api_key_missing/);
});

test("Firecrawl reads an environment key when the request starts, not when the module loads", async () => {
  const original = process.env.FIRECRAWL_API_KEY;
  delete process.env.FIRECRAWL_API_KEY;
  const search = createWebSearch({ fetchImpl: async (_url, init) => {
    assert.equal(init.headers.authorization, "Bearer late-loaded-key");
    return Response.json({ success: true, data: { web: [{ title: "Result", url: "https://example.test", markdown: "Readable evidence" }] } });
  } });
  try {
    process.env.FIRECRAWL_API_KEY = "late-loaded-key";
    const result = await search({ query: "test" });
    assert.equal(result.reader.successful, 1);
  } finally {
    if (original === undefined) delete process.env.FIRECRAWL_API_KEY;
    else process.env.FIRECRAWL_API_KEY = original;
  }
});
