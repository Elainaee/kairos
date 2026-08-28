<script setup lang="ts">
import { computed, ref } from "vue";
import { t } from "../i18n";

const bridgeStatusKey = ref("shellPreview.notChecked");
const bridgeStatusParams = ref<Record<string, string | number>>({});
const bridgeStatus = computed(() => t(bridgeStatusKey.value, bridgeStatusParams.value));
async function checkBridge() {
  const api = window.kairosDesktop?.appState;
  if (!api) { bridgeStatusKey.value = "shellPreview.browserPreview"; bridgeStatusParams.value = {}; return; }
  const state = await api.get();
  bridgeStatusKey.value = "shellPreview.bridgeReady";
  bridgeStatusParams.value = { count: Object.keys(state).length };
}
</script>

<template>
  <section class="vue-preview-notice" aria-labelledby="preview-title">
      <h1 id="preview-title">{{ t("shellPreview.title") }}</h1>
      <p>{{ t("shellPreview.description", { command: "npm start" }) }}</p>
      <p class="vue-bridge-status" data-testid="bridge-status" aria-live="polite">{{ bridgeStatus }}</p>
      <div><button class="kairos-create" data-testid="bridge-check" type="button" @click="checkBridge">{{ t("shellPreview.checkBridge") }}</button></div>
  </section>
</template>
