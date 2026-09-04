<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { t } from "../../i18n";
import { useSceneContrast } from "../../composables/useSceneContrast";

const props = defineProps<{ schedules: any[]; selectedId?: string; visible: boolean }>();
const emit = defineEmits<{ select: [schedule: any]; toggle: [] }>();
const coreVersion = ref(0);
const widget = ref<HTMLElement | null>(null);
const { sceneTone } = useSceneContrast(widget);
const todayKey = new Date().toLocaleDateString("en-CA");
const fallbackToday = () => props.schedules.filter(item => {
  const start = String(item.date || item.start_date || "");
  const end = String(item.end_date || start);
  return start <= todayKey && end >= todayKey;
}).sort((a, b) => String(a.start_time || "99:99").localeCompare(String(b.start_time || "99:99")));
const calendarCore = () => (window as any).KairosCalendarCore;
const today = computed(() => {
  coreVersion.value;
  return calendarCore()?.schedulesForDate?.(props.schedules, todayKey) || fallbackToday();
});
const timeLabel = (item: any) => calendarCore()?.timeForDate?.(item, todayKey) || item.start_time || t("focus.schedule.allDay");

onMounted(() => {
  if (calendarCore()) return;
  const existing = document.querySelector<HTMLScriptElement>("script[data-focus-calendar-core]");
  const script = existing || document.createElement("script");
  if (!existing) {
    script.dataset.focusCalendarCore = "";
    script.src = import.meta.env.DEV ? "/legacy/features/calendar/calendar-core.cjs" : new URL("../features/calendar/calendar-core.cjs", window.location.href).href;
    document.head.append(script);
  }
  script.addEventListener("load", () => { coreVersion.value += 1; }, { once: true });
});
</script>

<template>
  <button v-if="!visible" ref="widget" class="focus-widget-reveal focus-glass" :data-scene-tone="sceneTone" type="button" :aria-label="t('focus.schedule.show')" :title="t('focus.schedule.show')" @click="emit('toggle')"><span class="material-symbols-outlined">event_note</span></button>
  <section v-else ref="widget" class="focus-schedule-widget focus-glass" :data-scene-tone="sceneTone" :aria-label="t('focus.schedule.today')">
    <header>
      <div><span class="material-symbols-outlined">calendar_today</span><strong>{{ t('focus.schedule.today') }}</strong></div>
      <button type="button" :aria-label="t('focus.schedule.hide')" :title="t('focus.schedule.hide')" @click="emit('toggle')"><span class="material-symbols-outlined">visibility_off</span></button>
    </header>
    <div v-if="today.length" class="focus-schedule-widget__list">
      <button v-for="item in today" :key="item.id" type="button" :class="{ selected: item.id === selectedId }" @click="emit('select', item)">
        <span class="focus-schedule-widget__time">{{ timeLabel(item) }}</span>
        <span>{{ item.title || t('focus.schedule.untitled') }}</span>
        <span v-if="item.id === selectedId" class="material-symbols-outlined">check</span>
      </button>
    </div>
    <p v-else>{{ t('focus.schedule.empty') }}</p>
  </section>
</template>
