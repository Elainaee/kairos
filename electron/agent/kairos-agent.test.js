import test from "node:test";
import assert from "node:assert/strict";
import { runKairosLangChainAgent } from "./kairos-agent.js";

test("LangChain agent keeps deterministic game clarification before model calls", async () => {
  const result = await runKairosLangChainAgent({ text: "看一下 EDG 最近比赛", provider: "doubao", model: "doubao-seed-2-0-pro-260215" }, { apiKey: "", searchEsportsMatches: async () => { throw new Error("should_not_call"); } });
  assert.equal(result.type, "clarification");
  assert.match(result.message, /哪个项目/);
});

test("LangChain agent passes unsupported providers back to legacy flow", async () => {
  const result = await runKairosLangChainAgent({ text: "你好", provider: "openai", model: "gpt-4.1-mini" }, { apiKey: "x", searchEsportsMatches: async () => ({ items: [] }) });
  assert.equal(result.type, "pass");
});

test("LangChain agent reports missing Doubao key", async () => {
  const result = await runKairosLangChainAgent({ text: "你好", provider: "doubao", model: "doubao-seed-2-0-pro-260215" }, { apiKey: "", searchEsportsMatches: async () => ({ items: [] }) });
  assert.equal(result.type, "tool_error");
  assert.match(result.message, /API Key/);
});

test("LangChain agent owns text schedule extraction instead of frontend rules", async () => {
  const result = await runKairosLangChainAgent(
    { text: "EDG vs AAA 7月5日 19:00，帮我加到日程", provider: "doubao", model: "doubao-seed-2-0-pro-260215" },
    { apiKey: "", extractSchedules: async () => [{ title: "EDG vs AAA", date: "2026-07-05", type: "match" }] }
  );
  assert.equal(result.type, "schedule_cards");
  assert.equal(result.cards.length, 1);
});

test("LangChain agent owns attachment schedule extraction instead of frontend rules", async () => {
  const result = await runKairosLangChainAgent(
    { text: "帮我整理附件里的日程", attachmentIds: ["a1"], provider: "doubao", model: "doubao-seed-2-0-pro-260215" },
    { apiKey: "", extractSchedules: async input => [{ title: input.attachmentIds[0], date: "2026-07-05" }] }
  );
  assert.equal(result.type, "schedule_cards");
  assert.equal(result.cards[0].title, "a1");
});

test("LangChain agent owns URL schedule extraction and requires external permission", async () => {
  const denied = await runKairosLangChainAgent(
    { text: "整理这个赛程 https://example.com/schedule", provider: "doubao", model: "doubao-seed-2-0-pro-260215" },
    { apiKey: "", permissions: { getPermissions: async () => ({ externalSearch: "none" }) }, fetchUrlText: async () => { throw new Error("should_not_fetch"); }, extractSchedules: async () => [] }
  );
  assert.equal(denied.type, "permission_required");

  const allowed = await runKairosLangChainAgent(
    { text: "整理这个赛程 https://example.com/schedule", provider: "doubao", model: "doubao-seed-2-0-pro-260215" },
    { apiKey: "", permissions: { getPermissions: async () => ({ externalSearch: "read" }) }, fetchUrlText: async () => ({ url: "https://example.com/schedule", text: "EDG vs AAA 7月5日" }), extractSchedules: async () => [{ title: "EDG vs AAA", date: "2026-07-05" }] }
  );
  assert.equal(allowed.type, "schedule_cards");
  assert.equal(allowed.cards.length, 1);
});
