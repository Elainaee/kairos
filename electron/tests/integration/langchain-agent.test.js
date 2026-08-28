import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fakeModel } from "../../../node_modules/@langchain/core/dist/testing/fake_model_builder.js";
import { AIMessage } from "@langchain/core/messages";
import { AiDataStore } from "../../services/ai/data-store.js";
import { ToolRuntime } from "../../services/ai/tool-runtime.js";
import { AppStateStore, createAppAdapters } from "../../data/app-state/index.js";
import { runKairosAgent } from "../../services/ai/langchain-agent.js";

function callText(call) {
  return call.messages.map(message => Array.isArray(message.content) ? message.content.map(part => part.text || part.content || "").join("\n") : message.content).join("\n");
}

test("LangChain model selects the schedule proposal tool and no write occurs", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const appStore = new AppStateStore(path.join(dir, "app.json")); await appStore.initialize({ schedules: [] });
  const model = fakeModel()
    .respondWithTools([{ name: "propose_schedule", args: { title: "例会", date: "2026-07-17", all_day: true, inferred_fields: ["time"] } }])
    .respond(new AIMessage("我已生成一张待确认的例会日程卡。"));
  const events = [];
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "我这周五要开例会" }], store, toolRuntime: new ToolRuntime(store), appAdapters: createAppAdapters(appStore), searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, onToolEvent: event => events.push(event), now: new Date(2026, 6, 11) });
  assert.equal(model.callCount, 2);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].domain, "schedules");
  assert.equal(result.text, "我已生成一张待确认的例会日程卡。");
  assert.equal((await appStore.read()).schedules.length, 0);
  assert.ok(events.some(event => event.type === "tool_proposal"));
  assert.ok(events.some(event => event.type === "text_delta" && event.delta.includes("待确认")));
  await fs.rm(dir, { recursive: true, force: true });
});

test("LangChain model chooses web search instead of frontend keyword routing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-search-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel()
    .respondWithTools([{ name: "web_search", args: { query: "Kairos 最新文档", limit: 2 } }])
    .respond(new AIMessage("我找到了两条来源。"));
  let query = "";
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "帮我看看 Kairos 最新文档" }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async input => { query = input.query; return { query, items: [{ title: "文档", url: "https://example.test", snippet: "ok" }] }; }, ensureExternalSearch: async () => {}, now: new Date() });
  assert.equal(model.callCount, 2);
  assert.equal(query, "Kairos 最新文档");
  assert.equal(result.text, "我找到了两条来源。");
  await fs.rm(dir, { recursive: true, force: true });
});

test("Agent infers a sourced future event merits a pending schedule only after web search", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-search-calendar-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel()
    .respondWithTools([{ name: "web_search", args: { query: "EDG 下一场比赛时间", limit: 3 } }])
    .respondWithTools([{ name: "propose_schedule", args: { title: "EDG 比赛", date: "2026-07-18", start_time: "19:00", source_url: "https://example.test/match", source_title: "赛事官方赛程", notes: "比赛时间来自赛事官方赛程。" } }])
    .respond(new AIMessage("搜索结果显示这是未来的具体比赛，因此我生成了待确认日程。"));
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "查一下 EDG 下一场比赛，值得加到日程吗？" }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ query: "EDG 下一场比赛时间", searchedAt: "2026-07-11T00:00:00.000Z", items: [{ title: "赛事官方赛程", url: "https://example.test/match", snippet: "EDG 将于 2026-07-18 19:00 对阵 AAA。" }] }), ensureExternalSearch: async () => {}, now: new Date() });
  assert.equal(model.callCount, 3);
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].payload.source_url, "https://example.test/match");
  await fs.rm(dir, { recursive: true, force: true });
});

test("Agent can search without proposing a schedule when evidence is not actionable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-search-no-calendar-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel()
    .respondWithTools([{ name: "web_search", args: { query: "LangChain 是什么", limit: 2 } }])
    .respond(new AIMessage("这是背景资料，没有未来的具体安排，因此不建议写入日程。"));
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "帮我查 LangChain 是什么，要加到日程吗？" }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ query: "LangChain 是什么", items: [{ title: "LangChain 文档", url: "https://example.test/docs", snippet: "LangChain is a framework." }] }), ensureExternalSearch: async () => {}, now: new Date() });
  assert.equal(model.callCount, 2);
  assert.equal(result.proposals.length, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test("LangChain model decides when to save a durable memory", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-memory-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel()
    .respondWithTools([{ name: "remember_memory", args: { type: "profile", key: "identity", value: "学生", confidence: 0.95 } }])
    .respond(new AIMessage("我会记住你是学生。"));
  await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "我是学生" }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, now: new Date() });
  assert.equal((await store.listMemories())[0].value, "学生");
  assert.equal(model.callCount, 2);
  await fs.rm(dir, { recursive: true, force: true });
});

test("Agent reply style is included in the runtime system prompt", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-style-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel().respond(new AIMessage("Done."));
  await runKairosAgent({ chatModel: model, model: "test", replyStyle: "concise", messages: [{ role: "user", content: "Please help." }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, now: new Date() });
  assert.match(callText(model.calls[0]), /Reply concisely and action-first/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("English agent sessions use the English base prompt", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-en-prompt-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel().respond(new AIMessage("Done."));
  await runKairosAgent({ chatModel: model, model: "test", locale: "en", messages: [{ role: "user", content: "Please help." }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, now: new Date(2026, 6, 11) });
  const prompt = callText(model.calls[0]);
  assert.match(prompt, /You are Kairos, a gentle, honest personal companion/);
  assert.doesNotMatch(prompt, /你是 Kairos/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("Agent memory setting removes memory tools when disabled", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-no-memory-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel().respond(new AIMessage("I will not store that."));
  await runKairosAgent({ chatModel: model, model: "test", memoryEnabled: false, messages: [{ role: "user", content: "Remember that I like quiet mornings." }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, now: new Date() });
  assert.match(callText(model.calls[0]), /Long-term memory is disabled/);
  assert.equal((await store.listMemories()).length, 0);
  await fs.rm(dir, { recursive: true, force: true });
});

test("Agent web search tool respects disabled external search before calling Firecrawl", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-search-off-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const model = fakeModel()
    .respondWithTools([{ name: "web_search", args: { query: "current news", limit: 2 } }])
    .respond(new AIMessage("Search is disabled."));
  let searchCalls = 0;
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "Search current news." }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => { searchCalls += 1; return { items: [] }; }, ensureExternalSearch: async () => { throw new Error("external_search_disabled"); }, now: new Date() });
  assert.equal(searchCalls, 0);
  assert.equal(result.text, "Search is disabled.");
  await fs.rm(dir, { recursive: true, force: true });
});

test("LangChain model summarizes the conversation into a session title", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-langchain-title-"));
  const store = new AiDataStore(path.join(dir, "ai.json"));
  const conversation = await store.createConversation({ title: "新对话" });
  const model = fakeModel()
    .respondWithTools([{ name: "set_conversation_title", args: { title: "EWC 无畏契约赛程" } }])
    .respond(new AIMessage("我会帮你关注 EWC 的赛程。"));
  await runKairosAgent({ chatModel: model, model: "test", conversationTitle: conversation.title, messages: [{ role: "user", content: "EWC 无畏契约最近有什么比赛？" }], store, toolRuntime: new ToolRuntime(store), appAdapters: {}, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, onSetTitle: title => store.updateConversation(conversation.id, { title }), now: new Date() });
  assert.equal((await store.getConversation(conversation.id)).title, "EWC 无畏契约赛程");
  assert.equal(model.callCount, 2);
  await fs.rm(dir, { recursive: true, force: true });
});
