import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fakeModel } from "../node_modules/@langchain/core/dist/testing/fake_model_builder.js";
import { AIMessage } from "@langchain/core/messages";
import { AiDataStore } from "./data-store.js";
import { ToolRuntime } from "./tool-runtime.js";
import { AppStateStore, createAppAdapters } from "./app-state.js";
import { runKairosAgent } from "./langchain-agent.js";

test("agent reads an existing schedule and proposes a confirmed update", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-agent-update-"));
  const aiStore = new AiDataStore(path.join(dir, "ai.json"));
  const appStore = new AppStateStore(path.join(dir, "app.json"));
  await appStore.initialize({ schedules: [{ id: "weekly-meeting", title: "Weekly meeting", type: "event", date: "2026-07-17", end_date: "2026-07-17", start_time: "15:00", end_time: "16:00", all_day: false, notes: "Original" }] });
  const runtime = new ToolRuntime(aiStore);
  await runtime.setPermissions({ schedules: "write" });
  const adapters = createAppAdapters(appStore);
  const model = fakeModel()
    .respondWithTools([{ name: "query_kairos_data", args: { domain: "schedules", limit: 10 } }])
    .respondWithTools([{ name: "propose_update_schedule", args: { id: "weekly-meeting", date: "2026-07-18", end_date: "2026-07-18", type: "event" } }])
    .respond(new AIMessage("I prepared an update proposal."));
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "Move the weekly meeting to Saturday" }], store: aiStore, toolRuntime: runtime, appAdapters: adapters, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {} });
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].operation, "update");
  assert.equal(result.proposals[0].payload.id, "weekly-meeting");
  assert.equal(result.proposals[0].payload.date, "2026-07-18");
  assert.equal(result.proposals[0].payload.title, "Weekly meeting");
  const pending = await runtime.propose({ conversationId: "test", domain: "schedules", operation: result.proposals[0].operation, payload: result.proposals[0].payload });
  await runtime.decide({ id: pending.id, approved: true }, adapters);
  const saved = (await appStore.read()).schedules[0];
  assert.equal(saved.date, "2026-07-18");
  assert.equal(saved.title, "Weekly meeting");
  await fs.rm(dir, { recursive: true, force: true });
});

test("agent grants schedule read access only when it needs to inspect schedules", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-agent-read-"));
  const aiStore = new AiDataStore(path.join(dir, "ai.json"));
  const appStore = new AppStateStore(path.join(dir, "app.json"));
  await appStore.initialize({ schedules: [{ id: "meeting", title: "Meeting", type: "event", date: "2026-07-17" }] });
  const runtime = new ToolRuntime(aiStore);
  const events = [];
  const model = fakeModel().respondWithTools([{ name: "query_kairos_data", args: { domain: "schedules", limit: 10 } }]).respond(new AIMessage("Found the meeting."));
  await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "Show my schedule" }], store: aiStore, toolRuntime: runtime, appAdapters: createAppAdapters(appStore), searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {}, onToolEvent: event => events.push(event) });
  assert.equal((await runtime.getPermissions()).schedules, "read");
  assert.ok(events.some(event => event.type === "permission_granted" && event.domain === "schedules"));
  await fs.rm(dir, { recursive: true, force: true });
});

test("agent update proposal keeps a weekly recurrence as structured schedule data", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-agent-recurrence-"));
  const aiStore = new AiDataStore(path.join(dir, "ai.json"));
  const appStore = new AppStateStore(path.join(dir, "app.json"));
  await appStore.initialize({ schedules: [{ id: "summer-meeting", title: "Summer meeting", type: "event", date: "2026-07-01", end_date: "2026-08-31", all_day: true }] });
  const runtime = new ToolRuntime(aiStore);
  await runtime.setPermissions({ schedules: "write" });
  const model = fakeModel()
    .respondWithTools([{ name: "query_kairos_data", args: { domain: "schedules", limit: 10 } }])
    .respondWithTools([{ name: "propose_update_schedule", args: { id: "summer-meeting", recurrence: { frequency: "weekly", weekdays: [5] }, type: "event" } }])
    .respond(new AIMessage("I prepared the Friday-only update."));
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "Only keep Friday meetings during summer" }], store: aiStore, toolRuntime: runtime, appAdapters: createAppAdapters(appStore), searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {} });
  assert.deepEqual(result.proposals[0].payload.recurrence, { frequency: "weekly", weekdays: [5] });
  const pending = await runtime.propose({ conversationId: "test", domain: "schedules", operation: "update", payload: result.proposals[0].payload });
  await runtime.decide({ id: pending.id, approved: true }, createAppAdapters(appStore));
  assert.deepEqual((await appStore.read()).schedules[0].recurrence, { frequency: "weekly", weekdays: [5] });
  await fs.rm(dir, { recursive: true, force: true });
});

test("agent proposes one confirmed batch deletion for matching schedules", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-agent-delete-"));
  const aiStore = new AiDataStore(path.join(dir, "ai.json"));
  const appStore = new AppStateStore(path.join(dir, "app.json"));
  await appStore.initialize({ schedules: [
    { id: "meeting-a", title: "Meeting A", type: "event", date: "2026-07-17" },
    { id: "meeting-b", title: "Meeting B", type: "event", date: "2026-07-24" },
    { id: "match", title: "Match", type: "match", date: "2026-07-25" },
  ] });
  const runtime = new ToolRuntime(aiStore);
  await runtime.setPermissions({ schedules: "write" });
  const adapters = createAppAdapters(appStore);
  const model = fakeModel()
    .respondWithTools([{ name: "query_kairos_data", args: { domain: "schedules", limit: 100 } }])
    .respondWithTools([{ name: "propose_delete_schedules", args: { ids: ["meeting-a", "meeting-b"], reason: "User cancelled all meetings" } }])
    .respond(new AIMessage("I prepared one cancellation proposal."));
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "Cancel all my meetings" }], store: aiStore, toolRuntime: runtime, appAdapters: adapters, searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {} });
  assert.equal(result.proposals.length, 1);
  assert.equal(result.proposals[0].operation, "delete_many");
  assert.equal(result.proposals[0].payload.items.length, 2);
  const pending = await runtime.propose({ conversationId: "test", domain: "schedules", operation: "delete_many", payload: result.proposals[0].payload });
  await runtime.decide({ id: pending.id, approved: true }, adapters);
  assert.deepEqual((await appStore.read()).schedules.map(item => item.id), ["match"]);
  await fs.rm(dir, { recursive: true, force: true });
});

test("agent turns attachment-derived schedule text into pending schedule proposals", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-agent-recognize-"));
  const aiStore = new AiDataStore(path.join(dir, "ai.json"));
  const appStore = new AppStateStore(path.join(dir, "app.json"));
  await appStore.initialize({ schedules: [] });
  const model = fakeModel()
    .respondWithTools([{ name: "propose_schedule", args: { title: "Project review", type: "event", date: "2026-07-20", start_time: "14:00", end_time: "15:00", notes: "Recognized from the attached agenda." } }])
    .respondWithTools([{ name: "propose_task", args: { title: "Submit report", type: "deadline", date: "2026-07-22", notes: "Recognized from the attached agenda." } }])
    .respond(new AIMessage("I prepared two proposals."));
  const result = await runKairosAgent({ chatModel: model, model: "test", messages: [{ role: "user", content: "Attached agenda text: Project review 2026-07-20 14:00; submit report by 2026-07-22." }], store: aiStore, toolRuntime: new ToolRuntime(aiStore), appAdapters: createAppAdapters(appStore), searchWeb: async () => ({ items: [] }), ensureExternalSearch: async () => {} });
  assert.equal(result.proposals.length, 2);
  assert.deepEqual(result.proposals.map(proposal => proposal.domain), ["schedules", "tasks"]);
  assert.equal(result.proposals[0].payload.date, "2026-07-20");
  assert.equal(result.proposals[1].payload.type, "deadline");
  await fs.rm(dir, { recursive: true, force: true });
});
