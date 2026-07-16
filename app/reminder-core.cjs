(function (root, factory) {
  const core = factory();
  if (typeof module === "object" && module.exports) module.exports = core;
  if (root) root.KairosReminderCore = core;
})(typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : null, function () {
  const GRACE_MS = 24 * 60 * 60 * 1000;
  const CHECK_MS = 30000;
  const DEFAULT_REMINDERS = { deadline: "1440", match: "30", event: "30" };

  function defaultReminderForType(type, settings = {}) {
    const configured = settings?.defaultByType?.[type] ?? settings?.[type];
    if (configured === "none" || configured === "" || Number.isFinite(Number(configured))) return String(configured);
    return DEFAULT_REMINDERS[type] || "none";
  }

  function reminderMinutes(item = {}) {
    const value = item.reminder;
    if (value === "none" || value == null || value === "") return null;
    const minutes = Number(value);
    return Number.isFinite(minutes) ? minutes : null;
  }

  function dueAt(item = {}) {
    const minutes = reminderMinutes(item);
    if (minutes == null || !item.date) return null;
    const time = item.all_day ? "09:00" : item.start_time || "09:00";
    const date = new Date(`${item.date}T${time}:00`);
    if (Number.isNaN(+date)) return null;
    return new Date(+date - minutes * 60000);
  }

  function targetTime(item = {}, meta = {}) {
    if (meta.snoozedUntil) return Number(meta.snoozedUntil);
    const due = dueAt(item);
    return due ? +due : 0;
  }

  function shouldFireReminder(item = {}, meta = {}, now = Date.now(), graceMs = GRACE_MS) {
    if (item.status === "done") return false;
    if (meta.dismissedAt) return false;
    if (meta.firedAt && !meta.snoozedUntil) return false;
    const target = targetTime(item, meta);
    return Boolean(target && target <= now && target >= now - graceMs);
  }

  function isMissedReminder(target, now = Date.now(), checkMs = CHECK_MS) {
    return now - Number(target || 0) > checkMs * 1.5;
  }

  function classifyReminder(item = {}, meta = {}, now = Date.now(), graceMs = GRACE_MS, checkMs = CHECK_MS) {
    if (!shouldFireReminder(item, meta, now, graceMs)) return null;
    const target = targetTime(item, meta);
    return { target, missed: isMissedReminder(target, now, checkMs) };
  }

  return {
    GRACE_MS,
    CHECK_MS,
    DEFAULT_REMINDERS,
    defaultReminderForType,
    reminderMinutes,
    dueAt,
    targetTime,
    shouldFireReminder,
    isMissedReminder,
    classifyReminder
  };
});
