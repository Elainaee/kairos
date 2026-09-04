<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { t } from "../../i18n";
import { useSceneContrast } from "../../composables/useSceneContrast";
import { useFocusStore } from "../../stores/focus";
import FocusRestPopover from "./FocusRestPopover.vue";
import FocusScene from "./FocusScene.vue";
import FocusSceneCompanions from "./FocusSceneCompanions.vue";
import FocusScheduleWidget from "./FocusScheduleWidget.vue";

defineProps<{ scene?: any; schedules: any[]; scheduleVisible: boolean }>();
const emit = defineEmits<{ finished: [record: any]; toggleSchedule: []; selectSchedule: [schedule: any] }>();
const focus = useFocusStore();
const restOpen = ref(false);
const maximized = ref(false);
const fullscreen = ref(false);
const restAnchor = ref<HTMLElement | null>(null);
const windowControls = ref<HTMLElement | null>(null);
const sessionClock = ref<HTMLElement | null>(null);
const { sceneTone: restTone } = useSceneContrast(restAnchor);
const { sceneTone: controlsTone } = useSceneContrast(windowControls);
const { sceneTone: clockTone } = useSceneContrast(sessionClock);
let stopMaximized: (() => void) | undefined;
let stopFullscreen: (() => void) | undefined;
const active = computed(() => focus.active);

async function beginRest() {
  if (focus.active?.phase === "focus") await focus.rest();
  restOpen.value = true;
}

async function shrink() {
  if (fullscreen.value) await window.kairosDesktop?.windowControls?.toggleFullScreen?.();
  focus.setDisplayMode("compact");
}
function toggleFullscreen() {
  void window.kairosDesktop?.windowControls?.toggleFullScreen?.();
}
function toggleMaximize() {
  void window.kairosDesktop?.windowControls?.toggleMaximize?.();
}

onMounted(async () => {
  stopMaximized = window.kairosDesktop?.windowControls?.onMaximizedChanged?.(value => { maximized.value = value; });
  stopFullscreen = window.kairosDesktop?.windowControls?.onFullScreenChanged?.(value => { fullscreen.value = value; });
  maximized.value = await window.kairosDesktop?.windowControls?.isMaximized?.() || false;
  fullscreen.value = await window.kairosDesktop?.windowControls?.isFullScreen?.() || false;
});
onBeforeUnmount(() => { stopMaximized?.(); stopFullscreen?.(); });
</script>

<template>
  <section class="focus-session" :class="{ 'is-resting': active?.phase === 'rest' }">
    <FocusScene :scene="scene" />
    <div class="focus-session__veil" aria-hidden="true" />
    <div ref="restAnchor" class="focus-session__rest-anchor" :data-scene-tone="restTone">
      <button class="focus-rest-trigger" type="button" :aria-expanded="restOpen" @click="beginRest">
        <span class="material-symbols-outlined">{{ active?.phase === 'rest' ? 'coffee' : 'arrow_back' }}</span>
        <span>{{ t(active?.phase === 'rest' ? 'focus.rest.resting' : 'focus.rest.button') }}</span>
      </button>
      <FocusRestPopover :open="restOpen" @close="restOpen = false" @finished="emit('finished', $event)" />
    </div>
    <div ref="windowControls" class="focus-session__window-controls kairos-window-controls" :data-scene-tone="controlsTone" :aria-label="t('focus.window.label')">
      <button type="button" :aria-label="t('focus.window.shrink')" :title="t('focus.window.shrink')" @click="shrink"><span class="material-symbols-outlined">arrow_back</span></button>
      <button type="button" :aria-label="t(fullscreen ? 'focus.window.exitFullscreen' : 'focus.window.fullscreen')" :title="t(fullscreen ? 'focus.window.exitFullscreen' : 'focus.window.fullscreen')" @click="toggleFullscreen"><span class="material-symbols-outlined">{{ fullscreen ? 'fullscreen_exit' : 'fullscreen' }}</span></button>
      <button class="kairos-window-maximize" :class="{ 'is-window-maximized': maximized }" type="button" :aria-label="t(maximized ? 'electron.restore' : 'electron.maximize')" :title="t(maximized ? 'electron.restore' : 'electron.maximize')" @click="toggleMaximize"><span class="kairos-window-glyph" :class="maximized ? 'kairos-window-glyph--restore' : 'kairos-window-glyph--maximize'" aria-hidden="true" /></button>
    </div>
    <FocusScheduleWidget :schedules="schedules" :selected-id="active?.scheduleId" :visible="scheduleVisible" @toggle="emit('toggleSchedule')" @select="emit('selectSchedule', $event)" />
    <FocusSceneCompanions />
    <div ref="sessionClock" class="focus-session__clock focus-glass" :data-scene-tone="clockTone" aria-live="off">
      <span>{{ t(active?.phase === 'rest' ? 'focus.rest.resting' : 'focus.session.focused') }}</span>
      <strong>{{ new Date((active?.phase === 'rest' ? focus.elapsed.restSeconds : focus.elapsed.focusSeconds) * 1000).toISOString().slice(11, 19) }}</strong>
    </div>
  </section>
</template>
