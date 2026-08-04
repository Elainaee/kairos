<script setup lang="ts">
import { ref } from "vue";

const bridgeStatus = ref("尚未检查");
async function checkBridge() {
  const api = window.kairosDesktop?.appState;
  if (!api) { bridgeStatus.value = "浏览器预览模式：Electron 接口不可用"; return; }
  const state = await api.get();
  bridgeStatus.value = `Electron 接口正常 · 已读取 ${Object.keys(state).length} 个状态域`;
}
</script>

<template>
  <section class="vue-preview-notice" aria-labelledby="preview-title">
      <h1 id="preview-title">迁移预览入口</h1>
      <p>当前已按原 UI 迁移公共顶栏和 Settings-General。默认 <code>npm start</code> 仍启动完整原界面。</p>
      <p class="vue-bridge-status" data-testid="bridge-status" aria-live="polite">{{ bridgeStatus }}</p>
      <div><button class="kairos-create" data-testid="bridge-check" type="button" @click="checkBridge">检查 Electron 接口</button></div>
  </section>
</template>
