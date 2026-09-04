<script setup lang="ts">
import { computed, ref, watch } from "vue";
import defaultFocusVideo from "../../assets/focus/default-focus.mp4?url";

const props = defineProps<{ scene?: { source?: string; path?: string; name?: string; kind?: string } }>();
const failed = ref(false);
const customScene = computed(() => !failed.value && props.scene?.source === "file" && ["video", "image", "html"].includes(props.scene?.kind || ""));
const kind = computed(() => customScene.value ? props.scene?.kind : "video");
const source = computed(() => customScene.value
  ? `kairos-focus-scene://selected/scene?v=${encodeURIComponent(props.scene?.path || "")}`
  : defaultFocusVideo);
watch(() => [props.scene?.source, props.scene?.path], () => { failed.value = false; });
</script>

<template>
  <div class="focus-scene" :data-kind="kind">
    <video v-if="kind === 'video'" :src="source" autoplay loop muted playsinline @error="failed = true" />
    <img v-else-if="kind === 'image'" :src="source" alt="" @error="failed = true" />
    <iframe v-else-if="kind === 'html'" :src="source" title="Focus scene" sandbox="allow-scripts" referrerpolicy="no-referrer" @error="failed = true" />
    <video v-else :src="defaultFocusVideo" autoplay loop muted playsinline />
  </div>
</template>
