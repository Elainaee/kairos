<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from "vue";
import { useAppStateStore } from "../stores/app-state";
import { localePreference, t } from "../i18n";

const props = defineProps<{ page: string }>();
const appState = useAppStateStore();
const frame = ref<HTMLIFrameElement>();
const open = ref(false);
const loaded = ref(false);
const ready = ref(false);
let requestedScheduleId: string | null = null;
let openRequestTimers: number[] = [];
const source = computed(() => import.meta.env.DEV
  ? "/legacy/pages/calendar/index.html?embed=1&dialogHost=1"
  : `${new URL("../pages/calendar/index.html", window.location.href).href}?embed=1&dialogHost=1`);

function syncFrame() {
  const target = frame.value?.contentWindow;
  if (!target) return;
  const state = JSON.parse(JSON.stringify(appState.state));
  target.postMessage({ type: "kairos:state-sync", state }, "*");
  target.postMessage({ type: "kairos:locale-sync", preference: state?.settings?.general?.language || localePreference() }, "*");
  try {
    (target as any).KairosPendingState = state;
    (target as any).KairosScheduleSyncState?.(state);
  } catch {}
}

function openOriginalDialog(event: Event) {
  const requestedPage = (event as CustomEvent<{ page?: string }>).detail?.page;
  if (requestedPage && requestedPage !== props.page) return;
  if (open.value) return;
  requestedScheduleId = null;
  loaded.value = false;
  ready.value = false;
  open.value = true;
}

function openScheduleDialog(event: Event) {
  const detail = (event as CustomEvent<{ page?: string; id?: string | null }>).detail;
  if (detail?.page && detail.page !== props.page) return;
  if (open.value) return;
  requestedScheduleId = typeof detail?.id === "string" ? detail.id : null;
  loaded.value = false;
  ready.value = false;
  open.value = true;
}

function requestDialogOpen() {
  openRequestTimers.forEach(timer => window.clearTimeout(timer));
  const send = () => {
    if (!open.value || ready.value) return;
    const target = frame.value?.contentWindow;
    if (!target) return;
    target.postMessage(requestedScheduleId
      ? { type: "kairos:open-schedule", id: requestedScheduleId }
      : { type: "kairos:create-new" }, "*");
  };
  openRequestTimers = [0, 80, 220, 500, 900].map(delay => window.setTimeout(send, delay));
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
  requestDialogOpen();
}

function handleMessage(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || event.data?.type !== "kairos:calendar-dialog") return;
  const isOpen = event.data.open === true;
  window.dispatchEvent(new CustomEvent("kairos:calendar-dialog", { detail: { open: isOpen, host: true } }));
  ready.value = isOpen;
  if (isOpen) {
    openRequestTimers.forEach(timer => window.clearTimeout(timer));
    openRequestTimers = [];
  }
  if (!isOpen) {
    open.value = false;
    loaded.value = false;
    ready.value = false;
    requestedScheduleId = null;
  }
}

window.addEventListener("kairos:create-new", openOriginalDialog);
window.addEventListener("kairos:open-schedule-dialog", openScheduleDialog);
window.addEventListener("message", handleMessage);
window.addEventListener("kairos:locale-changed", syncFrame);
onBeforeUnmount(() => {
  openRequestTimers.forEach(timer => window.clearTimeout(timer));
  window.removeEventListener("kairos:create-new", openOriginalDialog);
  window.removeEventListener("kairos:open-schedule-dialog", openScheduleDialog);
  window.removeEventListener("message", handleMessage);
  window.removeEventListener("kairos:locale-changed", syncFrame);
});
</script>

<template>
  <Teleport to="body">
    <iframe v-if="open" ref="frame" class="vue-legacy-schedule-dialog-host" :class="{ 'is-ready': ready }" :title="t('schedule.add')" :src="source" @load="handleLoad" />
  </Teleport>
</template>
