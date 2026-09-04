<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import { t } from "../i18n";
import { useSceneContrast } from "../composables/useSceneContrast";
import FocusScene from "../components/focus/FocusScene.vue";
import FocusSceneCompanions from "../components/focus/FocusSceneCompanions.vue";
import FocusSessionView from "../components/focus/FocusSessionView.vue";
import AnimatedList from "../components/ui/AnimatedList.vue";
import { useAppStateStore } from "../stores/app-state";
import { useFocusStore, type FocusRecord } from "../stores/focus";
import { useMusicRuntimeStore } from "../stores/music-runtime";

const props = withDefaults(defineProps<{ mode?: "hub" | "records" }>(), { mode: "hub" });
const appState = useAppStateStore();
const focus = useFocusStore();
const music = useMusicRuntimeStore();
const summary = ref<FocusRecord | null>(null);
const starting = ref(false);
const recordHeading = ref<HTMLElement | null>(null);
const { sceneTone: recordHeadingTone } = useSceneContrast(recordHeading);
const DEFAULT_FOCUS_SCENE = Object.freeze({ source: "builtin", path: "", name: "朝早くにコーヒー 4K", kind: "video" });

const settings = computed<any>(() => appState.state?.settings || {});
const focusSettings = computed<any>(() => settings.value.focus || {});
const storedScene = computed<any>(() => focusSettings.value.scene || null);
const scene = computed<any>(() => storedScene.value?.source === "file" ? storedScene.value : DEFAULT_FOCUS_SCENE);
const scheduleVisible = computed(() => focusSettings.value.scheduleWidgetVisible !== false);
const schedules = computed<any[]>(() => Array.isArray(appState.state?.schedules) ? appState.state.schedules : []);
const records = computed<FocusRecord[]>(() => Array.isArray(appState.state?.focusSessions) ? appState.state.focusSessions : []);
const musicState = computed<any>(() => music.state || {});
const currentTrack = computed<any>(() => (musicState.value.tracks || []).find((item: any) => item.id === musicState.value.currentTrackId));
const immersive = computed(() => props.mode === "hub" && Boolean(focus.active) && focus.displayMode === "immersive");

function localDateKey(value: string | Date) {
  return new Date(value).toLocaleDateString("en-CA");
}
function formatDuration(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  if (hours) return t("focus.duration.hoursMinutes", { hours, minutes });
  return t("focus.duration.minutes", { minutes });
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "long", day: "numeric", weekday: "short" }).format(new Date(value));
}
function formatStartedAt(value: string) {
  return new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

const recordGroups = computed(() => {
  const groups = new Map<string, FocusRecord[]>();
  [...records.value].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).forEach(record => {
    const key = localDateKey(record.startedAt);
    groups.set(key, [...(groups.get(key) || []), record]);
  });
  return [...groups.entries()].map(([date, items]) => ({ date, items }));
});
const statistics = computed(() => {
  const now = new Date();
  const today = localDateKey(now);
  const sevenDaysAgo = new Date(now);
  sevenDaysAgo.setHours(0, 0, 0, 0);
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
  return {
    today: records.value.filter(item => localDateKey(item.startedAt) === today).reduce((sum, item) => sum + item.focusSeconds, 0),
    week: records.value.filter(item => new Date(item.startedAt) >= sevenDaysAgo).reduce((sum, item) => sum + item.focusSeconds, 0),
    completed: records.value.filter(item => item.status === "completed").length,
    interruptions: records.value.reduce((sum, item) => sum + Number(item.interruptionCount || 0), 0)
  };
});

async function saveFocusSettings(patch: Record<string, unknown>) {
  const next = JSON.parse(JSON.stringify(appState.state || {}));
  next.settings ||= {};
  next.settings.focus = { ...(next.settings.focus || {}), ...patch };
  await appState.save(next);
}

async function chooseScene() {
  const result = await window.kairosDesktop?.focus?.chooseScene?.();
  if (!result || result.canceled || !result.filePath || !result.kind) return;
  await saveFocusSettings({ scene: { source: "file", path: result.filePath, name: result.name, kind: result.kind } });
}

async function useDefaultScene() {
  await saveFocusSettings({ scene: { ...DEFAULT_FOCUS_SCENE } });
}

async function begin() {
  if (starting.value) return;
  if (focus.active) {
    focus.setDisplayMode("immersive");
    return;
  }
  starting.value = true;
  try {
    const track = currentTrack.value;
    await focus.start({
      scheduleId: "",
      scheduleTitle: "",
      music: { trackId: track?.id || "", title: track?.title || track?.fileName || "", artist: track?.artist || "" }
    });
  } finally {
    starting.value = false;
  }
}

async function toggleSchedule() {
  await saveFocusSettings({ scheduleWidgetVisible: !scheduleVisible.value });
}

async function selectSchedule(item: any) {
  await focus.update({ scheduleId: item?.id || "", scheduleTitle: item?.title || "" });
}

function captureSummary(record: FocusRecord | null | undefined) {
  if (!record) return;
  summary.value = record;
  if (!window.kairosDesktop?.appState?.save && !records.value.some(item => item.id === record.id)) {
    appState.sync({ ...appState.state, focusSessions: [...records.value, record] });
  }
}
function handleFinished(record: FocusRecord) { captureSummary(record || focus.lastRecord); }
watch(() => focus.lastRecord, captureSummary);

onMounted(async () => {
  await Promise.all([focus.initialize(), appState.loaded ? Promise.resolve() : appState.load(), music.loaded ? Promise.resolve() : music.load()]);
  if (storedScene.value?.source === "file") {
    const validation = await window.kairosDesktop?.focus?.validateScene?.();
    if (validation && !validation.available) await useDefaultScene();
  } else if (storedScene.value?.source !== "builtin" || storedScene.value?.kind !== "video") {
    await useDefaultScene();
  }
});
</script>

<template>
  <FocusSessionView v-if="immersive" :scene="scene" :schedules="schedules" :schedule-visible="scheduleVisible" @toggle-schedule="toggleSchedule" @select-schedule="selectSchedule" @finished="handleFinished" />
  <section v-else class="focus-page" :class="{ 'focus-page--records': mode === 'records' }">
    <FocusScene class="focus-page__background" :scene="DEFAULT_FOCUS_SCENE" />
    <header v-if="mode === 'records'" class="focus-page__header focus-page__header--records">
      <RouterLink class="focus-records-back focus-glass-button" to="/focus">
        <span class="material-symbols-outlined" aria-hidden="true">arrow_back</span>
        {{ t('common.back') }}
      </RouterLink>
      <div ref="recordHeading" :data-scene-tone="recordHeadingTone"><span class="focus-page__kicker">KAIROS / FOCUS</span><h1>{{ t('focus.records.title') }}</h1></div>
    </header>

    <main v-if="mode === 'hub'" class="focus-hub">
      <div class="focus-hub__center">
        <div class="focus-hub__actions">
          <button class="focus-glass-button focus-glass-button--primary" type="button" :disabled="starting" @click="begin"><span class="material-symbols-outlined" aria-hidden="true">play_arrow</span>{{ t('focus.hub.start') }}</button>
          <button class="focus-glass-button" type="button" @click="chooseScene"><span class="material-symbols-outlined" aria-hidden="true">wallpaper</span>{{ t('focus.hub.scene') }}</button>
          <RouterLink class="focus-glass-button" to="/focus/records"><span class="material-symbols-outlined" aria-hidden="true">history</span>{{ t('focus.records.title') }}</RouterLink>
        </div>
      </div>
      <FocusSceneCompanions />
    </main>

    <main v-else class="focus-records">
      <section class="focus-stat-grid">
        <article class="focus-glass"><span>{{ t('focus.records.today') }}</span><strong>{{ formatDuration(statistics.today) }}</strong></article>
        <article class="focus-glass"><span>{{ t('focus.records.week') }}</span><strong>{{ formatDuration(statistics.week) }}</strong></article>
        <article class="focus-glass"><span>{{ t('focus.records.completed') }}</span><strong>{{ statistics.completed }}</strong></article>
        <article class="focus-glass"><span>{{ t('focus.records.interruptions') }}</span><strong>{{ statistics.interruptions }}</strong></article>
      </section>
      <section class="focus-record-list focus-glass">
        <div v-if="!recordGroups.length" class="focus-empty"><span class="material-symbols-outlined">hourglass_empty</span><h2>{{ t('focus.records.empty') }}</h2><p>{{ t('focus.records.emptyHint') }}</p></div>
        <section v-for="group in recordGroups" v-else :key="group.date" class="focus-record-day">
          <header><h2>{{ formatDate(group.date) }}</h2><span>{{ formatDuration(group.items.reduce((sum, item) => sum + item.focusSeconds, 0)) }}</span></header>
          <AnimatedList>
            <article v-for="record in group.items" :key="record.id">
              <time>{{ formatStartedAt(record.startedAt) }}</time>
              <div><strong>{{ record.scheduleTitle || t('focus.records.untitled') }}</strong><span>{{ t('focus.records.focusRest', { focus: formatDuration(record.focusSeconds), rest: formatDuration(record.restSeconds) }) }}</span></div>
              <span class="focus-record-status" :data-status="record.status">{{ t(`focus.records.status.${record.status}`) }}</span>
            </article>
          </AnimatedList>
        </section>
      </section>
    </main>

    <Teleport to="body">
      <div v-if="summary" class="focus-modal-backdrop">
        <section class="focus-summary focus-glass" role="dialog" aria-modal="true" :aria-label="t('focus.summary.title')">
          <span class="material-symbols-outlined">auto_awesome</span><h2>{{ t('focus.summary.title') }}</h2><p>{{ t('focus.summary.description') }}</p>
          <dl><div><dt>{{ t('focus.rest.focused') }}</dt><dd>{{ formatDuration(summary.focusSeconds) }}</dd></div><div><dt>{{ t('focus.rest.rested') }}</dt><dd>{{ formatDuration(summary.restSeconds) }}</dd></div><div><dt>{{ t('focus.records.interruptions') }}</dt><dd>{{ summary.interruptionCount }}</dd></div></dl>
          <button class="focus-glass-button focus-glass-button--primary" type="button" @click="summary = null">Finish</button>
        </section>
      </div>
    </Teleport>
  </section>
</template>
