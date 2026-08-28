<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useAppStateStore } from "../stores/app-state";
import { t } from "../i18n";

const props = defineProps<{ page: string }>();
const appState = useAppStateStore();
const frame = ref<HTMLIFrameElement>();
const open = ref(false);
const loaded = ref(false);
const ready = ref(false);
const source = computed(() => import.meta.env.DEV
  ? "/legacy/pages/calendar/index.html?embed=1&dialogHost=1"
  : `${new URL("../pages/calendar/index.html", window.location.href).href}?embed=1&dialogHost=1`);

function syncFrame() {
  const target = frame.value?.contentWindow;
  if (!target) return;
  const state = JSON.parse(JSON.stringify(appState.state));
  target.postMessage({ type: "kairos:state-sync", state }, "*");
  target.postMessage({ type: "kairos:locale-sync", preference: state?.settings?.general?.language || "en" }, "*");
  try {
    (target as any).KairosPendingState = state;
    (target as any).KairosScheduleSyncState?.(state);
  } catch {}
}

function openOriginalDialog(event: Event) {
  const requestedPage = (event as CustomEvent<{ page?: string }>).detail?.page;
  if (requestedPage && requestedPage !== props.page) return;
  if (open.value) return;
  loaded.value = false;
  ready.value = false;
  open.value = true;
}

function handleLoad() {
  loaded.value = true;
  const documentRoot = frame.value?.contentDocument;
  if (documentRoot) {
    documentRoot.documentElement.classList.add("kairos-vue-dialog-host");
    const hostStyle = documentRoot.createElement("style");
    hostStyle.dataset.kairosVueDialogHost = "";
    hostStyle.textContent = `
      html.kairos-vue-dialog-host,
      html.kairos-vue-dialog-host body {
        background: transparent !important;
        background-image: none !important;
      }
      html.kairos-vue-dialog-host body::before,
      html.kairos-vue-dialog-host body::after {
        content: none !important;
        display: none !important;
      }
      html.kairos-vue-dialog-host body > :not(dialog):not(script):not(style):not(link) {
        visibility: hidden !important;
      }
      html.kairos-vue-dialog-host #scheduleFeatureDialog {
        visibility: visible !important;
      }
    `;
    documentRoot.head.append(hostStyle);
  }
  syncFrame();
  window.setTimeout(() => frame.value?.contentWindow?.postMessage({ type: "kairos:create-new" }, "*"), 120);
}

function handleMessage(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || event.data?.type !== "kairos:calendar-dialog") return;
  const isOpen = event.data.open === true;
  window.dispatchEvent(new CustomEvent("kairos:calendar-dialog", { detail: { open: isOpen, host: true } }));
  ready.value = isOpen;
  if (!isOpen) {
    open.value = false;
    loaded.value = false;
    ready.value = false;
  }
}

window.addEventListener("kairos:create-new", openOriginalDialog);
window.addEventListener("message", handleMessage);
window.addEventListener("kairos:locale-changed", syncFrame);
onBeforeUnmount(() => {
  window.removeEventListener("kairos:create-new", openOriginalDialog);
  window.removeEventListener("message", handleMessage);
  window.removeEventListener("kairos:locale-changed", syncFrame);
});
</script>

<template>
  <Teleport to="body">
    <iframe v-if="open" ref="frame" class="vue-legacy-schedule-dialog-host" :class="{ 'is-ready': ready }" :title="t('schedule.add')" :src="source" @load="handleLoad" />
  </Teleport>
</template>
