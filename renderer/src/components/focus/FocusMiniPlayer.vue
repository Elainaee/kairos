<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { t } from "../../i18n";
import { useSceneContrast } from "../../composables/useSceneContrast";
import { useMusicRuntimeStore } from "../../stores/music-runtime";

const music = useMusicRuntimeStore();
const playerBody = ref<HTMLElement | null>(null);
const { sceneTone } = useSceneContrast(playerBody);
const state = computed<any>(() => music.state || {});
const tracks = computed<any[]>(() => Array.isArray(state.value.tracks) ? state.value.tracks : []);
const queue = computed<string[]>(() => Array.isArray(state.value.queueTrackIds) ? state.value.queueTrackIds : []);
const current = computed(() => tracks.value.find(track => track.id === state.value.currentTrackId) || tracks.value.find(track => track.id === queue.value[0]));
const playing = computed(() => state.value.playing === true);
const currentTime = computed(() => Number(state.value.currentTime || state.value.positions?.[current.value?.id] || 0));
const duration = computed(() => Number(current.value?.duration || 0));
const progress = computed(() => duration.value > 0 ? Math.min(100, currentTime.value / duration.value * 100) : 0);
const cover = computed(() => {
  const track = current.value;
  if (!track) return "";
  if (track.coverAssetId || track.coverPath) return `kairos-media://cover/${encodeURIComponent(track.id)}`;
  return String(track.coverUrl || "");
});

function formatTime(value: number) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

async function select(offset: number) {
  const sharedControl = document.getElementById(offset < 0 ? "musicPrevious" : "musicNext") as HTMLButtonElement | null;
  if (sharedControl) {
    sharedControl.click();
    return;
  }
  if (!queue.value.length) return;
  const index = Math.max(0, queue.value.indexOf(state.value.currentTrackId));
  const next = queue.value[(index + offset + queue.value.length) % queue.value.length];
  await music.apply({ currentTrackId: next, playing: true });
}

onMounted(() => { if (!music.loaded) void music.load(); });
</script>

<template>
  <section class="focus-mini-player focus-glass" :data-scene-tone="sceneTone" :aria-label="t('focus.player.label')">
    <div class="focus-mini-player__cover" aria-hidden="true">
      <img v-if="cover" :src="cover" alt="" />
      <span v-else class="material-symbols-outlined">music_note</span>
    </div>
    <div ref="playerBody" class="focus-mini-player__body">
      <div class="focus-mini-player__copy">
        <strong class="focus-mini-player__title">{{ current?.title || current?.fileName || t('focus.player.empty') }}</strong>
        <span class="focus-mini-player__artist">{{ current?.artist || t('focus.player.ambience') }}</span>
        <div class="focus-mini-player__timeline">
          <div class="focus-mini-player__progress" role="progressbar" :aria-label="t('focus.player.progress')" aria-valuemin="0" aria-valuemax="100" :aria-valuenow="Math.round(progress)"><i :style="{ width: `${progress}%` }" /></div>
          <span class="focus-mini-player__time">{{ formatTime(currentTime) }} / {{ formatTime(duration) }}</span>
        </div>
      </div>
      <div class="focus-mini-player__controls">
        <button type="button" :aria-label="t('focus.player.previous')" @click="select(-1)"><span class="material-symbols-outlined">skip_previous</span></button>
        <button class="focus-mini-player__play" type="button" :aria-label="t(playing ? 'focus.player.pause' : 'focus.player.play')" @click="music.apply({ playing: !playing })"><span class="material-symbols-outlined">{{ playing ? 'pause' : 'play_arrow' }}</span></button>
        <button type="button" :aria-label="t('focus.player.next')" @click="select(1)"><span class="material-symbols-outlined">skip_next</span></button>
      </div>
    </div>
  </section>
</template>
