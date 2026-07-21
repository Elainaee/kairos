import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const habits = require("../../../app/features/habits/habit-core.cjs");

test("habit core handles date math across month leap day and year boundaries", () => {
  assert.equal(habits.shiftDateKey("2026-01-01", -1), "2025-12-31");
  assert.equal(habits.shiftDateKey("2024-02-28", 1), "2024-02-29");
  assert.equal(habits.shiftDateKey("2024-02-29", 1), "2024-03-01");
  assert.equal(habits.shiftDateKey("2026-12-31", 1), "2027-01-01");
});

test("habit core calculates current and best streaks with today or yesterday as active", () => {
  const habit = { dates: ["2025-12-31", "2026-01-01", "2026-01-02", "2026-01-04", "2026-01-05"] };
  assert.equal(habits.currentStreak(habit, "2026-01-05"), 2);
  assert.equal(habits.currentStreak(habit, "2026-01-06"), 2);
  assert.equal(habits.currentStreak(habit, "2026-01-07"), 0);
  assert.equal(habits.bestStreak(habit), 3);
});

test("habit core normalizes duplicates and enforces backfill rules", () => {
  const habit = { dates: ["2026-07-14", "2026-07-14", "bad", "2026-07-15"], allowBackfill: false };
  assert.deepEqual(habits.normalizeDates(habit.dates), ["2026-07-14", "2026-07-15"]);
  assert.deepEqual(habits.toggleDate(habit, "2026-07-13", "2026-07-15"), ["2026-07-14", "2026-07-15"]);
  assert.deepEqual(habits.toggleDate(habit, "2026-07-15", "2026-07-15"), ["2026-07-14"]);
  assert.deepEqual(habits.toggleDate({ ...habit, allowBackfill: true }, "2026-07-13", "2026-07-15"), ["2026-07-13", "2026-07-14", "2026-07-15"]);
});

test("habit core builds deterministic heatmap windows", () => {
  const cells = habits.heatmapWindow({ dates: ["2026-06-29", "2026-07-01"] }, "2026-07-01", 3);
  assert.deepEqual(cells, [
    { date: "2026-06-29", done: true },
    { date: "2026-06-30", done: false },
    { date: "2026-07-01", done: true }
  ]);
});
