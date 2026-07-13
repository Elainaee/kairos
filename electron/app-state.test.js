import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { AppStateStore, createAppAdapters } from "./app-state.js";

test("legacy study plans become visible schedules with an existing type", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-study-migration-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [], studyPlans: [{ id: "legacy-study", title: "Summer learning", start_date: "2026-07-01", end_date: "2026-08-31", type: "study" }] });
  await store.migrateStudyPlansToSchedules();
  const state = await store.read();
  assert.equal(state.studyPlans.length, 0);
  assert.equal(state.schedules.length, 1);
  assert.equal(state.schedules[0].type, "other");
  assert.equal(state.schedules[0].date, "2026-07-01");
  await fs.rm(dir, { recursive: true, force: true });
});

test("schedule adapters reject invented schedule types", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-type-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [] });
  await assert.rejects(() => createAppAdapters(store).schedules.create({ title: "Meeting", date: "2026-07-17", type: "schedule" }), /invalid_schedule_type/);
  await assert.rejects(() => createAppAdapters(store).schedules.create({ title: "Study", date: "2026-07-17", type: "study" }), /invalid_schedule_type/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("legacy recurring schedules with missing dates are repaired into visible date ranges", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-recurring-repair-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [{ id: "summer-friday", title: "Friday meeting", type: "event", date: "", end_date: "", created_at: "2026-07-12T08:00:47.443Z", recurrence: { frequency: "weekly", weekdays: [5], until: "2026-08-31" } }] });
  await store.migrateStudyPlansToSchedules();
  const item = (await store.read()).schedules[0];
  assert.equal(item.date, "2026-07-12");
  assert.equal(item.end_date, "2026-08-31");
  assert.equal(item.type, "event");
  await fs.rm(dir, { recursive: true, force: true });
});

test("schedule adapters reject a missing start date", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-date-required-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [] });
  await assert.rejects(() => createAppAdapters(store).schedules.create({ title: "Missing date", type: "event" }), /schedule_date_required/);
  await fs.rm(dir, { recursive: true, force: true });
});
