<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { t } from "../../i18n";
import { useSceneContrast } from "../../composables/useSceneContrast";
import { useFocusStore } from "../../stores/focus";
import { useMusicRuntimeStore } from "../../stores/music-runtime";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ close: []; finished: [record: any] }>();
const focus = useFocusStore();
const music = useMusicRuntimeStore();
const popover = ref<HTMLElement | null>(null);
const { sceneTone } = useSceneContrast(popover);
const musicState = computed<any>(() => music.state || {});
const tracks = computed<any[]>(() => Array.isArray(musicState.value.tracks) ? musicState.value.tracks : []);
const track = computed(() => tracks.value.find(item => item.id === musicState.value.currentTrackId));

function formatDuration(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

async function resume() {
  await focus.resume();
  emit("close");
}

async function finish() {
  const record = await focus.finish("completed");
  emit("finished", record);
  emit("close");
}

onMounted(() => { if (!music.loaded) void music.load(); });
</script>

<template>
<Transition name="focus-popover">
  <section v-if="open" ref="popover" class="focus-rest-popover focus-glass" :data-scene-tone="sceneTone" role="dialog" :aria-label="t('focus.rest.title')">
    <header>
      <div><span class="focus-rest-popover__eyebrow">{{ t('focus.rest.nowPlaying') }}</span><strong>{{ track?.title || track?.fileName || t('focus.player.empty') }}</strong><small>{{ track?.artist || t('focus.player.ambience') }}</small></div>
      <button type="button" :aria-label="t('common.close')" @click="emit('close')"><span class="material-symbols-outlined">close</span></button>
    </header>
    <dl>
      <div><dt>{{ t('focus.rest.focused') }}</dt><dd>{{ formatDuration(focus.elapsed.focusSeconds) }}</dd></div>
      <div><dt>{{ t('focus.rest.rested') }}</dt><dd>{{ formatDuration(focus.elapsed.restSeconds) }}</dd></div>
    </dl>
    <div class="focus-rest-popover__actions">
      <button class="focus-rest-popover__continue" type="button" @click="resume"><span class="material-symbols-outlined" aria-hidden="true">play_circle</span>{{ t('focus.rest.continue') }}</button>
      <button class="focus-end-button" type="button" @click="finish"><span class="material-symbols-outlined" aria-hidden="true">stop_circle</span>{{ t('focus.rest.end') }}</button>
    </div>
  </section>
</Transition>
</template>
