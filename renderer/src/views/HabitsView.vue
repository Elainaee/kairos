<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { bestStreak, currentStreak, dateKey, shiftDateKey, type Habit, useHabitsStore } from "../stores/habits";
import { useToastsStore } from "../stores/toasts";

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
  toasts.show({ message: wasEditing ? "Habit updated" : "Habit added", tone: "success" });
}
async function deleteHabit() {
  if (!editingId.value || !window.confirm("Delete this habit and all of its check-in history?")) return;
  await store.remove(editingId.value);
  closeEditor();
  toasts.show({ message: "Habit deleted", tone: "message" });
}
function pointerGlow(event: PointerEvent) {
  const card = event.currentTarget as HTMLElement;
  if (document.documentElement.classList.contains("kairos-reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    card.style.setProperty("--magic-intensity", "0");
    return;
  }
  const rect = card.getBoundingClientRect();
  card.style.setProperty("--magic-x", `${(event.clientX - rect.left) / rect.width * 100}%`);
  card.style.setProperty("--magic-y", `${(event.clientY - rect.top) / rect.height * 100}%`);
  card.style.setProperty("--magic-intensity", "1");
}
function pointerLeave(event: PointerEvent) { (event.currentTarget as HTMLElement).style.setProperty("--magic-intensity", "0"); }
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
  toasts.show({ message: "Habit order updated", tone: "success" });
}
async function toggleHabit(habit: Habit) {
  const wasDone = habit.dates.includes(today.value);
  await store.toggle(habit.id);
  toasts.show({ message: wasDone ? `${habit.name} marked incomplete` : `${habit.name} completed`, tone: wasDone ? "message" : "success" });
  if (!wasDone) await window.kairosDesktop?.pet?.react?.("happy", { title: habit.name }).catch(() => {});
}

function animateProgress(target: number) {
  cancelAnimationFrame(progressFrame);
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
          <div><span class="habit-kicker">DAILY RHYTHM</span><h1>My Habits</h1><p>{{ completed }} of {{ store.habits.length }} completed today. Every small step counts.</p></div>
          <button class="habit-primary" type="button" data-add @click="openEditor()"><span class="material-symbols-outlined">add</span>Add Habit</button>
        </header>
        <div class="habit-columns">
          <section>
            <h2>Active Habits</h2>
            <div class="habit-cards">
              <article v-for="habit in store.habits" :key="habit.id" class="real-habit-card habit-magic-card" :class="{ 'is-dragging': draggingId === habit.id, 'is-drop-before': dropTargetId === habit.id && dropPosition === 'before', 'is-drop-after': dropTargetId === habit.id && dropPosition === 'after' }" :data-id="habit.id" @pointermove="pointerGlow" @pointerleave="pointerLeave" @dragover="dragOver(habit.id, $event)" @dragleave="dropTargetId === habit.id && (dropTargetId = '')" @drop.prevent="dropHabit(habit.id)">
                <button class="habit-drag-handle" type="button" draggable="true" aria-label="Drag to reorder" @dragstart="startDrag(habit.id, $event)" @dragend="endDrag"><span class="material-symbols-outlined">drag_indicator</span></button>
                <button class="habit-check-button" :class="{ done: habit.dates.includes(today) }" type="button" :aria-label="habit.dates.includes(today) ? 'Mark incomplete' : 'Mark complete'" @click="toggleHabit(habit)"><span aria-hidden="true">{{ habit.dates.includes(today) ? "✓" : "" }}</span></button>
                <div class="habit-card-copy"><span class="habit-card-icon" aria-hidden="true">{{ habit.icon }}</span><div><h3>{{ habit.name }}</h3><p>{{ habit.description || "A little progress every day" }}</p></div></div>
                <strong>{{ currentStreak(habit, today) }}<small>day streak</small></strong>
                <button class="habit-more" type="button" aria-label="Edit habit" @click="openEditor(habit)"><span class="material-symbols-outlined">more_vert</span></button>
              </article>
              <div v-if="!store.habits.length" class="habit-empty">No habits yet. Add a small goal to get started.</div>
            </div>
          </section>
          <section class="habit-progress-column">
            <h2 aria-hidden="true">&nbsp;</h2>
            <div class="habit-momentum habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave">
              <span>Today's Progress</span>
              <div class="habit-ring" :class="{ 'is-progressing': progressAnimating }" :style="{ '--progress': `${ringProgress * 3.6}deg` }"><div><strong class="habit-count-up-text" :class="{ 'is-counting': progressAnimating }">{{ displayedRate }}%</strong><small>completion</small></div></div>
              <dl><div class="habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave"><dt>Current Longest Streak</dt><dd>{{ longest }} days</dd></div><div class="habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave"><dt>Personal Best</dt><dd>{{ personalBest }} days</dd></div></dl>
            </div>
          </section>
          <section>
            <h2>Last 12 Weeks</h2>
            <div class="habit-heatmaps">
              <article v-for="habit in store.habits" :key="habit.id" class="habit-magic-card" @pointermove="pointerGlow" @pointerleave="pointerLeave">
                <header><span class="habit-heatmap-icon" aria-hidden="true">{{ habit.icon }}</span><strong>{{ habit.name }}</strong><small>{{ heatmap(habit).filter(cell => cell.done).length }}/84 days</small></header>
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
          <header><div><small>ROUTINE</small><h2>{{ editingId ? "Edit Habit" : "Add Habit" }}</h2></div><button type="button" data-cancel aria-label="Close" @click="closeEditor">×</button></header>
          <label>Name<input v-model="form.name" name="name" maxlength="24" required /></label>
          <label>Short Description<input v-model="form.description" name="description" maxlength="40" /></label>
          <label>Icon<div class="habit-icon-picker"><button class="habit-icon-trigger" type="button" :aria-expanded="iconPickerOpen" @click="iconPickerOpen = !iconPickerOpen"><span>{{ form.icon }}</span><span class="material-symbols-outlined">expand_more</span></button><div class="habit-emoji-grid" :hidden="!iconPickerOpen"><button v-for="icon in icons" :key="icon" class="habit-emoji-option" :class="{ selected: form.icon === icon }" type="button" :aria-pressed="form.icon === icon" @click="form.icon = icon; iconPickerOpen = false">{{ icon }}</button></div></div></label>
          <label class="schedule-all-day" style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:11px"><input v-model="form.allowBackfill" name="backfill" type="checkbox" />Allow check-ins for past dates</label>
          <section class="editor-history" :class="{ collapsed: !form.allowBackfill }"><strong>Last 30 Days</strong><div><button v-for="day in historyDays" :key="day" type="button" :class="{ done: editingHabit?.dates.includes(day) }" :disabled="!editingHabit" @click="editingHabit && store.toggle(editingHabit.id, day)">{{ Number(day.slice(-2)) }}</button></div></section>
          <footer><button v-if="editingId" type="button" class="habit-danger" @click="deleteHabit">Delete Habit</button><span v-else></span><button type="button" @click="closeEditor">Cancel</button><button type="submit" class="habit-primary">Save</button></footer>
        </form>
      </dialog>
  </Teleport>
</template>
