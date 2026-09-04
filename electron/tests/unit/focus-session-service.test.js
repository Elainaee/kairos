import test from "node:test";
import assert from "node:assert/strict";
import { FocusSessionService } from "../../services/focus/focus-session-service.js";

function memoryStore(initial = {}) {
  let state = structuredClone({ focusSessions: [], activeFocusSession: null, ...initial });
  return {
    async read() { return structuredClone(state); },
    async mutate(change) {
      const next = structuredClone(state);
      const result = await change(next);
      state = next;
      return { state: structuredClone(state), result };
    },
    value() { return structuredClone(state); }
  };
}

test("focus session accumulates open-ended focus and rest time", async () => {
  let current = new Date("2026-09-01T01:00:00.000Z");
  const store = memoryStore();
  const service = new FocusSessionService({ store, now: () => current });

  await service.start({ scheduleId: "schedule-1", scheduleTitle: "Read", music: { trackId: "track-1", title: "Rain" } });
  current = new Date("2026-09-01T01:02:05.000Z");
  const resting = await service.enterRest({ musicWasPausedByFocus: true });
  assert.equal(resting.active.focusSeconds, 125);
  assert.equal(resting.active.interruptionCount, 1);

  current = new Date("2026-09-01T01:02:35.000Z");
  await service.resumeFocus();
  current = new Date("2026-09-01T01:03:10.000Z");
  const result = await service.finish({ status: "completed" });

  assert.equal(result.record.focusSeconds, 160);
  assert.equal(result.record.restSeconds, 30);
  assert.equal(result.record.interruptionCount, 1);
  assert.equal(result.record.scheduleTitle, "Read");
  assert.equal(store.value().activeFocusSession, null);
  assert.deepEqual(store.value().focusSessions, [result.record]);
});

test("away reminder fires once per absence and resets after returning", async () => {
  const reminders = [];
  const service = new FocusSessionService({
    store: memoryStore(),
    awayDelayMs: 10,
    onAwayReminder: payload => reminders.push(payload)
  });
  await service.start();

  service.handleWindowBlur();
  await new Promise(resolve => setTimeout(resolve, 25));
  service.handleWindowBlur();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(reminders.length, 1);

  service.handleWindowFocus();
  service.handleWindowBlur();
  await new Promise(resolve => setTimeout(resolve, 25));
  assert.equal(reminders.length, 2);
  service.dispose();
});

test("resting and startup recovery do not count unknown away time", async () => {
  const stale = {
    id: "stale-focus",
    phase: "focus",
    startedAt: "2026-09-01T01:00:00.000Z",
    phaseStartedAt: "2026-09-01T01:00:30.000Z",
    checkpointAt: "2026-09-01T01:01:00.000Z",
    accumulatedFocusSeconds: 30,
    accumulatedRestSeconds: 0,
    interruptionCount: 0,
    music: {}
  };
  const store = memoryStore({ activeFocusSession: stale });
  const service = new FocusSessionService({ store, now: () => new Date("2026-09-01T08:00:00.000Z") });

  await service.initialize();
  const [record] = store.value().focusSessions;
  assert.equal(record.status, "interrupted");
  assert.equal(record.focusSeconds, 60);
  assert.equal(store.value().activeFocusSession, null);
});
