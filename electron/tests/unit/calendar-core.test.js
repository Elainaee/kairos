import test from "node:test";
import assert from "node:assert/strict";
import calendar from "../../../app/features/calendar/calendar-core.cjs";

test("monthGrid creates a stable 42-day month across year boundaries", () => {
  const grid = calendar.monthGrid(2025, 0, { todayKey: "2025-01-01" });

  assert.equal(grid.length, 42);
  assert.equal(grid[0].key, "2024-12-29");
  assert.equal(grid[3].key, "2025-01-01");
  assert.equal(grid[3].isToday, true);
  assert.equal(grid.at(-1).key, "2025-02-08");
  assert.equal(grid.filter(day => day.inMonth).length, 31);
});

test("date math preserves leap days and month rollovers", () => {
  assert.equal(calendar.shiftDateKey("2024-02-28", 1), "2024-02-29");
  assert.equal(calendar.shiftDateKey("2024-02-29", 1), "2024-03-01");
  assert.equal(calendar.shiftDateKey("2025-03-01", -1), "2025-02-28");
});

test("coversDate handles multi-day and weekly recurring schedules", () => {
  const retreat = {
    date: "2026-12-31",
    end_date: "2027-01-02",
    start_time: "21:00",
    end_time: "09:00"
  };
  const weekly = {
    date: "2026-01-01",
    end_date: "2026-01-31",
    recurrence: { frequency: "weekly", weekdays: [1, 3], until: "2026-01-20" }
  };

  assert.equal(calendar.coversDate(retreat, "2027-01-01"), true);
  assert.equal(calendar.timeForDate(retreat, "2027-01-01"), "All day");
  assert.equal(calendar.timeForDate(retreat, "2027-01-02"), "Until 09:00");
  assert.equal(calendar.coversDate(weekly, "2026-01-05"), true);
  assert.equal(calendar.coversDate(weekly, "2026-01-06"), false);
  assert.equal(calendar.coversDate(weekly, "2026-01-21"), false);
});

test("schedulesForDate orders all-day and unfinished items before completed rows", () => {
  const rows = calendar.schedulesForDate(
    [
      { id: "late", date: "2026-05-12", start_time: "18:00" },
      { id: "done", date: "2026-05-12", start_time: "09:00", status: "done" },
      { id: "all", date: "2026-05-12", all_day: true }
    ],
    "2026-05-12",
    item => item.status || "todo"
  );

  assert.deepEqual(rows.map(item => item.id), ["all", "late", "done"]);
});

test("shiftTimeRange keeps duration and clamps a schedule within one day", () => {
  assert.deepEqual(calendar.shiftTimeRange("09:30", "10:45", 15), {
    start_time: "09:45",
    end_time: "11:00"
  });
  assert.deepEqual(calendar.shiftTimeRange("00:05", "01:05", -15), {
    start_time: "00:00",
    end_time: "01:00"
  });
  assert.deepEqual(calendar.shiftTimeRange("22:30", "23:30", 60), {
    start_time: "22:59",
    end_time: "23:59"
  });
  assert.equal(calendar.shiftTimeRange("09:00", "invalid", 15), null);
});
