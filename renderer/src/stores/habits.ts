import { computed, ref } from "vue";
import { defineStore } from "pinia";
import { useAppStateStore } from "./app-state";

export type Habit = {
  id: string;
  name: string;
  description: string;
  icon: string;
  dates: string[];
  allowBackfill: boolean;
};

const pad = (value: number) => String(value).padStart(2, "0");
export const dateKey = (date = new Date()) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const fromDateKey = (key: string) => {
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day);
};
export const shiftDateKey = (key: string, days: number) => {
  const date = fromDateKey(key);
  date.setDate(date.getDate() + days);
  return dateKey(date);
};
const normalizeDates = (dates: unknown) => [...new Set((Array.isArray(dates) ? dates : []).map(String).filter(value => /^\d{4}-\d{2}-\d{2}$/.test(value)))].sort();
const normalizeHabit = (habit: Partial<Habit>): Habit => ({
  id: String(habit.id || `habit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
  name: String(habit.name || "Untitled habit").trim().slice(0, 24) || "Untitled habit",
  description: String(habit.description || "").trim().slice(0, 40),
  icon: String(habit.icon || "📚"),
  dates: normalizeDates(habit.dates),
  allowBackfill: Boolean(habit.allowBackfill)
});

export function currentStreak(habit: Habit, today = dateKey()) {
  const dates = new Set(normalizeDates(habit.dates));
  let cursor = dates.has(today) ? today : shiftDateKey(today, -1);
  let count = 0;
  while (dates.has(cursor)) { count += 1; cursor = shiftDateKey(cursor, -1); }
  return count;
}

export function bestStreak(habit: Habit) {
  let maximum = 0, count = 0, last = "";
  for (const date of normalizeDates(habit.dates)) {
    count = last && shiftDateKey(last, 1) === date ? count + 1 : 1;
    maximum = Math.max(maximum, count);
    last = date;
  }
  return maximum;
}

export const useHabitsStore = defineStore("habits", () => {
  const appState = useAppStateStore();
  const habits = ref<Habit[]>([]);
  const today = computed(() => dateKey());

  async function load() {
    const state = appState.loaded ? appState.state : await appState.load();
    habits.value = (Array.isArray(state.habits) ? state.habits : []).map(normalizeHabit);
  }
  async function persist() { await appState.save({ ...appState.state, habits: habits.value }); }
  async function upsert(input: Partial<Habit>) {
    const next = normalizeHabit(input);
    const exists = habits.value.some(habit => habit.id === next.id);
    habits.value = exists ? habits.value.map(habit => habit.id === next.id ? next : habit) : [...habits.value, next];
    await persist();
  }
  async function remove(id: string) { habits.value = habits.value.filter(habit => habit.id !== id); await persist(); }
  async function toggle(id: string, key = today.value) {
    const habit = habits.value.find(item => item.id === id);
    if (!habit || (key !== today.value && !habit.allowBackfill)) return;
    const dates = new Set(habit.dates);
    dates.has(key) ? dates.delete(key) : dates.add(key);
    habit.dates = [...dates].sort();
    await persist();
  }
  async function reorder(ids: string[]) {
    const byId = new Map(habits.value.map(habit => [habit.id, habit]));
    habits.value = ids.map(id => byId.get(id)).filter((habit): habit is Habit => Boolean(habit));
    await persist();
  }
  return { habits, today, load, upsert, remove, toggle, reorder };
});
