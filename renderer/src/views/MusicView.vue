<script setup lang="ts">
import { computed, onMounted } from "vue";
import { useRoute } from "vue-router";
import EmbeddedLegacyView from "./EmbeddedLegacyView.vue";
import NativeMusicCandidate from "./NativeMusicCandidate.vue";
import { useMusicRuntimeStore } from "../stores/music-runtime";

// The original Music DOM, styles and controller remain the visual and
// behavioural source of truth; Vue owns their route lifetime and data bridge.
const musicRuntime = useMusicRuntimeStore();
const route = useRoute();
// The original Music document contains global `body` and state selectors.
// Running it in an isolated document is the only way to preserve its DOM,
// stylesheet and motion byte-for-byte while Vue continues to own the route,
// state bridge and persistent shell. The prior same-document candidate is
// retained solely for a diagnostic comparison, never as a visible default.
const useSourceDocument = computed(() => route.query.candidate !== "1");
onMounted(() => { void musicRuntime.load(); });
</script>

<template>
  <EmbeddedLegacyView v-if="useSourceDocument" page="music" />
  <NativeMusicCandidate v-else />
</template>
