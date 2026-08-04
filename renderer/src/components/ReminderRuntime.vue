<script setup lang="ts">
import { onBeforeUnmount, onMounted, watch } from "vue";
import { useRouter } from "vue-router";
import { useAppStateStore } from "../stores/app-state";
import { useToastsStore } from "../stores/toasts";
import { formatTime } from "../i18n";

const CHECK_MS = 30_000;
const GRACE_MS = 24 * 60 * 60 * 1000;
const appState = useAppStateStore();
const toasts = useToastsStore();
const router = useRouter();
let timer = 0;
let checking = false;

function dueAt(item: any) {
  if (!item?.date || item.reminder === "none" || item.reminder == null || item.reminder === "") return null;
  const minutes = Number(item.reminder);
  if (!Number.isFinite(minutes)) return null;
  const date = new Date(`${item.date}T${item.all_day ? "09:00" : item.start_time || "09:00"}:00`);
  return Number.isNaN(+date) ? null : +date - minutes * 60_000;
}

function snoozeMinutes() {
  const value = Number(appState.state.settings?.reminders?.snoozeMinutes || 10);
  return Number.isFinite(value) && value > 0 ? value : 10;
}

async function updateReminder(id: string, transform: (item: any, meta: any) => { item?: any; meta?: any }) {
  const schedules = Array.isArray(appState.state.schedules) ? appState.state.schedules : [];
  const reminders = { ...(appState.state.reminders || {}) };
  const current = schedules.find((item: any) => item.id === id);
  if (!current) return;
  const result = transform(current, reminders[id] || {});
  if (result.meta === null) delete reminders[id];
  else if (result.meta) reminders[id] = result.meta;
  await appState.save({
    ...appState.state,
    schedules: schedules.map((item: any) => item.id === id ? (result.item || item) : item),
    reminders
  });
}

async function notify(item: any, missed: boolean) {
  const minutes = snoozeMinutes();
  const title = missed ? "Missed reminder" : "Reminder";
  const note = item.notes || `${item.date} ${formatTime(item.start_time || "09:00")}`;
  toasts.show({
    id: `reminder-${item.id}`,
    title: `${title}: ${item.title || "Untitled schedule"}`,
    message: note,
    tone: "reminder",
    duration: 15_000,
    actions: [
      { label: "Complete", run: () => updateReminder(item.id, (schedule, meta) => ({ item: { ...schedule, status: "done", updated_at: new Date().toISOString() }, meta: { ...meta, dismissedAt: Date.now(), snoozedUntil: null } })) },
      { label: `Snooze ${minutes} min`, run: () => updateReminder(item.id, (schedule, meta) => ({ item: schedule, meta: { ...meta, snoozedUntil: Date.now() + minutes * 60_000, dismissedAt: null } })) },
      { label: "Details", run: async () => { await updateReminder(item.id, (schedule, meta) => ({ item: schedule, meta: { ...meta, dismissedAt: Date.now() } })); await router.push({ path: "/schedule", hash: `#schedule-${encodeURIComponent(item.id)}` }); } }
    ]
  });
  if (appState.state.settings?.reminders?.desktopNotifications !== false) {
    await window.kairosDesktop?.reminders?.notify?.({ scheduleId: item.id, title: item.title, note, missed }).catch(() => {});
  }
  await window.kairosDesktop?.pet?.react?.(missed ? "sleepy" : "reminder", { title: item.title }).catch(() => {});
  window.dispatchEvent(new CustomEvent("kairos:reminder", { detail: { item, missed } }));
}

async function check() {
  if (checking || document.hidden) return;
  checking = true;
  try {
    if (!appState.loaded) await appState.load();
    const now = Date.now();
    const schedules = Array.isArray(appState.state.schedules) ? appState.state.schedules : [];
    const reminders = { ...(appState.state.reminders || {}) };
    const due: Array<{ item: any; missed: boolean }> = [];
    for (const item of schedules) {
      const meta = reminders[item.id] || {};
      const target = Number(meta.snoozedUntil || dueAt(item));
      if (item.status === "done" || meta.dismissedAt || (meta.firedAt && !meta.snoozedUntil) || !target || target > now || target < now - GRACE_MS) continue;
      reminders[item.id] = { ...meta, firedAt: now, snoozedUntil: null };
      due.push({ item, missed: now - target > CHECK_MS * 1.5 });
    }
    if (due.length) await appState.save({ ...appState.state, reminders });
    for (const entry of due) await notify(entry.item, entry.missed);
  } finally { checking = false; }
}

function handleVisibility() { if (!document.hidden) check(); }
watch(() => appState.state.schedules, () => check(), { deep: true });
onMounted(async () => {
  await check();
  timer = window.setInterval(check, CHECK_MS);
  window.addEventListener("focus", check);
  document.addEventListener("visibilitychange", handleVisibility);
});
onBeforeUnmount(() => {
  window.clearInterval(timer);
  window.removeEventListener("focus", check);
  document.removeEventListener("visibilitychange", handleVisibility);
});
</script>

<template><span hidden aria-hidden="true" /></template>
