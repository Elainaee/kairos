import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const reminders = require("../app/reminder-core.cjs");

const at = value => +new Date(value);

test("reminder core calculates default reminder rules and due times", () => {
  assert.equal(reminders.defaultReminderForType("deadline"), "1440");
  assert.equal(reminders.defaultReminderForType("match"), "30");
  assert.equal(reminders.defaultReminderForType("event"), "30");
  assert.equal(reminders.defaultReminderForType("task"), "none");
  assert.equal(reminders.defaultReminderForType("deadline", { deadline: "60" }), "60");
  assert.equal(reminders.defaultReminderForType("event", { defaultByType: { event: "none" } }), "none");

  assert.equal(
    +reminders.dueAt({ date: "2026-07-16", start_time: "16:00", reminder: "30" }),
    at("2026-07-16T15:30:00")
  );
  assert.equal(
    +reminders.dueAt({ date: "2026-07-16", all_day: true, reminder: "1440" }),
    at("2026-07-15T09:00:00")
  );
  assert.equal(reminders.dueAt({ date: "bad", reminder: "30" }), null);
  assert.equal(reminders.dueAt({ date: "2026-07-16", reminder: "none" }), null);
});

test("reminder core classifies restart, missed, snoozed, and dismissed reminders", () => {
  const item = { id: "a", date: "2026-07-16", start_time: "10:00", reminder: "30", status: "todo" };

  assert.equal(reminders.classifyReminder(item, {}, at("2026-07-16T09:29:00")), null);
  assert.deepEqual(reminders.classifyReminder(item, {}, at("2026-07-16T09:30:10")), {
    target: at("2026-07-16T09:30:00"),
    missed: false
  });
  assert.deepEqual(reminders.classifyReminder(item, {}, at("2026-07-16T09:31:00")), {
    target: at("2026-07-16T09:30:00"),
    missed: true
  });
  assert.equal(reminders.classifyReminder(item, { firedAt: at("2026-07-16T09:30:10") }, at("2026-07-16T09:31:00")), null);
  assert.equal(reminders.classifyReminder(item, { dismissedAt: at("2026-07-16T09:20:00") }, at("2026-07-16T09:31:00")), null);
  assert.equal(reminders.classifyReminder({ ...item, status: "done" }, {}, at("2026-07-16T09:31:00")), null);

  const snoozed = reminders.classifyReminder(
    item,
    { firedAt: at("2026-07-16T09:30:10"), snoozedUntil: at("2026-07-16T09:40:00") },
    at("2026-07-16T09:40:01")
  );
  assert.deepEqual(snoozed, { target: at("2026-07-16T09:40:00"), missed: false });
});
