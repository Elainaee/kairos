(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.KairosHabitCore = core;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : null, function () {
  const pad = value => String(value).padStart(2, "0");

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromDateKey(key) {
    const [year, month, day] = String(key || "").split("-").map(Number);
    const date = new Date(year, month - 1, day);
    return Number.isNaN(+date) ? null : date;
  }

  function shiftDateKey(key, days) {
    const date = fromDateKey(key);
    if (!date) return "";
    date.setDate(date.getDate() + days);
    return dateKey(date);
  }

  function normalizeDates(dates = []) {
    return [...new Set((Array.isArray(dates) ? dates : []).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(String(value))))].sort();
  }

  function currentStreak(habit = {}, todayKey = dateKey()) {
    const dates = new Set(normalizeDates(habit.dates));
    let cursor = todayKey;
    if (!dates.has(cursor)) cursor = shiftDateKey(cursor, -1);
    let count = 0;
    while (cursor && dates.has(cursor)) {
      count += 1;
      cursor = shiftDateKey(cursor, -1);
    }
    return count;
  }

  function bestStreak(habit = {}) {
    let maximum = 0;
    let count = 0;
    let last = "";
    for (const date of normalizeDates(habit.dates)) {
      count = last && shiftDateKey(last, 1) === date ? count + 1 : 1;
      maximum = Math.max(maximum, count);
      last = date;
    }
    return maximum;
  }

  function canToggleDate(habit = {}, key = dateKey(), todayKey = dateKey()) {
    return Boolean(habit && (key === todayKey || habit.allowBackfill));
  }

  function toggleDate(habit = {}, key = dateKey(), todayKey = dateKey()) {
    if (!canToggleDate(habit, key, todayKey)) return normalizeDates(habit.dates);
    const dates = new Set(normalizeDates(habit.dates));
    dates.has(key) ? dates.delete(key) : dates.add(key);
    return [...dates].sort();
  }

  function heatmapWindow(habit = {}, todayKey = dateKey(), days = 84) {
    const dates = new Set(normalizeDates(habit.dates));
    const cells = [];
    for (let index = days - 1; index >= 0; index -= 1) {
      const key = shiftDateKey(todayKey, -index);
      cells.push({ date: key, done: dates.has(key) });
    }
    return cells;
  }

  return {
    dateKey,
    fromDateKey,
    shiftDateKey,
    normalizeDates,
    currentStreak,
    bestStreak,
    canToggleDate,
    toggleDate,
    heatmapWindow
  };
});
