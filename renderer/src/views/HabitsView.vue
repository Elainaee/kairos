<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { bestStreak, currentStreak, dateKey, shiftDateKey, type Habit, useHabitsStore } from "../stores/habits";
import { useToastsStore } from "../stores/toasts";
import { plural, t } from "../i18n";

const store = useHabitsStore();
const toasts = useToastsStore();
const editor = ref<HTMLDialogElement>();
const editingId = ref("");
const iconPickerOpen = ref(false);
const draggingId = ref("");
const dropTargetId = ref("");
const dropPosition = ref<"before" | "after">("before");
const displayedRate = ref(0);
const ringProgress = ref(0);
const progressAnimating = ref(false);
let progressFrame = 0;
let glowFrame = 0;
let glowCard: HTMLElement | null = null;
let glowPointerX = 0;
let glowPointerY = 0;
const icons = ["📚", "🏋️", "🧠", "🌙", "💧", "🧘", "✍️", "🥗", "🏃", "🧹"];
const form = reactive({ name: "", description: "", icon: icons[0], allowBackfill: false });
const today = computed(() => dateKey());
const completed = computed(() => store.habits.filter(habit => habit.dates.includes(today.value)).length);
const rate = computed(() => store.habits.length ? Math.round(completed.value / store.habits.length * 100) : 0);
const longest = computed(() => Math.max(0, ...store.habits.map(habit => currentStreak(habit, today.value))));
const personalBest = computed(() => Math.max(0, ...store.habits.map(bestStreak)));
const historyDays = computed(() => Array.from({ length: 30 }, (_, index) => shiftDateKey(today.value, index - 29)));
const editingHabit = computed(() => store.habits.find(habit => habit.id === editingId.value));

function heatmap(habit: Habit) {
  const dates = new Set(habit.dates);
  return Array.from({ length: 84 }, (_, index) => {
    const date = shiftDateKey(today.value, index - 83);
    return { date, done: dates.has(date) };
  });
}
function openEditor(habit?: Habit) {
  editingId.value = habit?.id || "";
  form.name = habit?.name || "";
  form.description = habit?.description || "";
  form.icon = habit?.icon || icons[0];
  form.allowBackfill = habit?.allowBackfill ?? false;
  iconPickerOpen.value = false;
  nextTick(() => editor.value?.showModal());
}
function closeEditor() { editor.value?.close(); }
async function saveHabit() {
  const wasEditing = Boolean(editingId.value);
  await store.upsert({
    id: editingId.value || undefined,
    name: form.name,
    description: form.description,
    icon: form.icon,
    dates: editingHabit.value?.dates || [],
    allowBackfill: form.allowBackfill
  });
  closeEditor();
  toasts.show({ message: t(wasEditing ? "habits.updated" : "habits.added"), tone: "success" });
}
async function deleteHabit() {
  if (!editingId.value || !window.confirm(t("habits.deleteConfirm"))) return;
  await store.remove(editingId.value);
  closeEditor();
  toasts.show({ message: t("habits.deleted"), tone: "message" });
}
function pointerGlow(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement;
  if (document.documentElement.classList.contains("kairos-reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    card.style.setProperty("--magic-intensity", "0");
    return;
  }
  glowCard = card;
  glowPointerX = event.clientX;
  glowPointerY = event.clientY;
  if (glowFrame) return;
  glowFrame = requestAnimationFrame(() => {
    glowFrame = 0;
    if (!glowCard) return;
    const rect = glowCard.getBoundingClientRect();
    glowCard.style.setProperty("--magic-x", `${(glowPointerX - rect.left) / rect.width * 100}%`);
    glowCard.style.setProperty("--magic-y", `${(glowPointerY - rect.top) / rect.height * 100}%`);
    glowCard.style.setProperty("--magic-intensity", "1");
  });
}
function pointerLeave(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement;
  if (glowCard === card) {
    cancelAnimationFrame(glowFrame);
    glowFrame = 0;
    glowCard = null;
  }
  card.style.setProperty("--magic-intensity", "0");
}
function startDrag(id: string, event: DragEvent) {
  draggingId.value = id;
  if (event.dataTransfer) { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", id); }
}
function dragOver(targetId: string, event: DragEvent) {
  event.preventDefault();
  if (!draggingId.value || draggingId.value === targetId) { dropTargetId.value = ""; return; }
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dropTargetId.value = targetId;
  dropPosition.value = event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}
function endDrag() { draggingId.value = ""; dropTargetId.value = ""; }
async function dropHabit(targetId: string) {
  if (!draggingId.value || draggingId.value === targetId) return;
  const ids = store.habits.map(habit => habit.id).filter(id => id !== draggingId.value);
  const targetIndex = ids.indexOf(targetId);
  ids.splice(targetIndex + (dropPosition.value === "after" ? 1 : 0), 0, draggingId.value);
  await store.reorder(ids);
  endDrag();
  toasts.show({ message: t("habits.orderUpdated"), tone: "success" });
}
async function toggleHabit(habit: Habit) {
  const wasDone = habit.dates.includes(today.value);
  await store.toggle(habit.id);
  toasts.show({ message: t(wasDone ? "habits.markedIncomplete" : "habits.markedComplete", { name: habit.name }), tone: wasDone ? "message" : "success" });
  if (!wasDone) await window.kairosDesktop?.pet?.react?.("happy", { title: habit.name }).catch(() => {});
}

function animateProgress(target: number) {
  cancelAnimationFrame(progressFrame);
  cancelAnimationFrame(glowFrame);
  const from = displayedRate.value;
  if (document.documentElement.classList.contains("kairos-reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches || from === target) {
    displayedRate.value = target;
    ringProgress.value = target;
    progressAnimating.value = false;
    return;
  }
  progressAnimating.value = true;
  const started = performance.now();
  const tick = (now: number) => {
    const elapsed = Math.min(1, (now - started) / 900);
    const eased = 1 - Math.pow(1 - elapsed, 3);
    const value = from + (target - from) * eased;
    displayedRate.value = Math.round(value);
    ringProgress.value = value;
    if (elapsed < 1) progressFrame = requestAnimationFrame(tick);
    else { displayedRate.value = target; ringProgress.value = target; progressAnimating.value = false; }
  };
  progressFrame = requestAnimationFrame(tick);
}
watch(rate, animateProgress);

onMounted(async () => {
  document.body.classList.add("kairos-embedded");
  document.body.dataset.page = "habits";
  await store.load();
});
onBeforeUnmount(() => {
  cancelAnimationFrame(progressFrame);
  document.body.classList.remove("kairos-embedded");
  delete document.body.dataset.page;
});
</script>

<template>
  <div class="kairos-page-main vue-habits-page">
      <div class="habit-dashboard">
        <header class="habit-page-head">
          <div><span class="habit-kicker">{{ t("habits.dailyRhythm") }}</span><h1>{{ t("habits.myHabits") }}</h1><p>{{ t("habits.completedToday", { completed, total: store.habits.length }) }}</p></div>
          <button class="habit-primary" type="button" data-add @click="openEditor()"><span class="material-symbols-outlined">add</span>{{ t("habits.add") }}</button>
        </header>
        <div class="habit-columns">
          <section>
            <h2>{{ t("habits.active") }}</h2>
            <div class="habit-cards">
              <article v-for="habit in store.habits" :key="habit.id" class="real-habit-card habit-magic-card" :class="{ 'is-dragging': draggingId === habit.id, 'is-drop-before': dropTargetId === habit.id && dropPosition === 'before', 'is-drop-after': dropTargetId === habit.id && dropPosition === 'after' }" :data-id="habit.id" @pointermove="pointerGlow" @pointerleave="pointerLeave" @dragover="dragOver(habit.id, $event)" @dragleave="dropTargetId === habit.id && (dropTargetId = '')" @drop.prevent="dropHabit(habit.id)">
                <button class="habit-drag-handle" type="button" draggable="true" :aria-label="t('habits.dragToReorder')" @dragstart="startDrag(habit.id, $event)" @dragend="endDrag"><span class="material-symbols-outlined">drag_indicator</span></button>
                <button class="habit-check-button" :class="{ done: habit.dates.includes(today) }" type="button" :aria-label="habit.dates.includes(today) ? t('habits.markIncomplete') : t('habits.markComplete')" @click="toggleHabit(habit)"><span aria-hidden="true">{{ habit.dates.includes(today) ? "✓" : "" }}</span></button>
                <div class="habit-card-copy"><span class="habit-card-icon" aria-hidden="true">{{ habit.icon }}</span><div><h3>{{ habit.name }}</h3><p>{{ habit.description || t("habits.defaultDescription") }}</p></div></div>
                <strong>{{ currentStreak(habit, today) }}<small>{{ t("habits.streak") }}</small></strong>
                <button class="habit-more" type="button" :aria-label="t('habits.editAction')" @click="openEditor(habit)"><span class="material-symbols-outlined">more_vert</span></button>
              </article>
              <div v-if="!store.habits.length" class="habit-empty">{{ t("habits.none") }}</div>
            </div>
          </section>
          <section class="habit-progress-column">
            <h2 aria-hidden="true">&nbsp;</h2>
            <div class="habit-momentum habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave">
              <span>{{ t("habits.todayProgress") }}</span>
              <div class="habit-ring" :class="{ 'is-progressing': progressAnimating }" :style="{ '--progress': `${ringProgress * 3.6}deg` }"><div><strong class="habit-count-up-text" :class="{ 'is-counting': progressAnimating }">{{ displayedRate }}%</strong><small>{{ t("habits.completion") }}</small></div></div>
              <dl><div class="habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave"><dt>{{ t("habits.currentLongestStreak") }}</dt><dd>{{ plural("habits.dayCount", longest) }}</dd></div><div class="habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave"><dt>{{ t("habits.personalBest") }}</dt><dd>{{ plural("habits.dayCount", personalBest) }}</dd></div></dl>
            </div>
          </section>
          <section>
            <h2>{{ t("habits.last12Weeks") }}</h2>
            <div class="habit-heatmaps">
              <article v-for="habit in store.habits" :key="habit.id" class="habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave">
                <header><span class="habit-heatmap-icon" aria-hidden="true">{{ habit.icon }}</span><strong>{{ habit.name }}</strong><small>{{ t("habits.heatmapCount", { completed: heatmap(habit).filter(cell => cell.done).length }) }}</small></header>
                <div class="real-heatmap"><span v-for="cell in heatmap(habit)" :key="cell.date" class="heat-cell" :class="{ done: cell.done }" :title="cell.date" /></div>
              </article>
            </div>
          </section>
        </div>
      </div>
  </div>
  <Teleport to="body">
      <dialog ref="editor" class="habit-editor">
        <form method="dialog" @submit.prevent="saveHabit">
          <header><div><small>{{ t("habits.routine") }}</small><h2>{{ t(editingId ? "habits.edit" : "habits.add") }}</h2></div><button type="button" data-cancel :aria-label="t('common.close')" @click="closeEditor">×</button></header>
          <label>{{ t("habits.name") }}<input v-model="form.name" name="name" maxlength="24" required /></label>
          <label>{{ t("habits.shortDescription") }}<input v-model="form.description" name="description" maxlength="40" /></label>
          <label>{{ t("habits.icon") }}<div class="habit-icon-picker"><button class="habit-icon-trigger" type="button" :aria-expanded="iconPickerOpen" @click="iconPickerOpen = !iconPickerOpen"><span>{{ form.icon }}</span><span class="material-symbols-outlined">expand_more</span></button><div class="habit-emoji-grid" :hidden="!iconPickerOpen"><button v-for="icon in icons" :key="icon" class="habit-emoji-option" :class="{ selected: form.icon === icon }" type="button" :aria-pressed="form.icon === icon" @click="form.icon = icon; iconPickerOpen = false">{{ icon }}</button></div></div></label>
          <label class="schedule-all-day" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px"><input v-model="form.allowBackfill" name="backfill" type="checkbox" />{{ t("habits.allowBackfill") }}</label>
          <section class="editor-history" :class="{ collapsed: !form.allowBackfill }"><strong>{{ t("habits.last30Days") }}</strong><div><button v-for="day in historyDays" :key="day" type="button" :class="{ done: editingHabit?.dates.includes(day) }" :disabled="!editingHabit" @click="editingHabit && store.toggle(editingHabit.id, day)">{{ Number(day.slice(-2)) }}</button></div></section>
          <footer><button v-if="editingId" type="button" class="habit-danger" @click="deleteHabit">{{ t("habits.delete") }}</button><span v-else></span><button type="button" @click="closeEditor">{{ t("common.cancel") }}</button><button type="submit" class="habit-primary">{{ t("common.save") }}</button></footer>
        </form>
      </dialog>
  </Teleport>
</template>
