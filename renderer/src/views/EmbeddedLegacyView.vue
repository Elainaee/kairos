<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteUpdate } from "vue-router";
import { useAppStateStore } from "../stores/app-state";
import { useToastsStore } from "../stores/toasts";
import { useMusicRuntimeStore } from "../stores/music-runtime";
import { t } from "../i18n";

const props = defineProps<{ page: "calendar" | "schedule" | "music" }>();
const frame = ref<HTMLIFrameElement>();
const frameSource = ref("");
const frameName = ref("");
const appState = useAppStateStore();
const toasts = useToastsStore();
const musicRuntime = useMusicRuntimeStore();
let calendarHomeParent: Node | null = null;
let calendarHomeNext: ChildNode | null = null;
let fullscreenButton: HTMLButtonElement | null = null;
let stateSyncTimers: number[] = [];
type EmbeddedLegacyWindow = Window & {
  CustomEvent: typeof CustomEvent;
  KairosPendingState?: Record<string, unknown>;
  KairosScheduleSyncState?: (state: Record<string, unknown>) => void;
  KairosI18n?: { setLocale?: (preference?: string) => string };
};
const source = computed(() => import.meta.env.DEV
  ? `/legacy/pages/${props.page}/index.html?embed=1`
  : `${new URL(`../pages/${props.page}/index.html`, window.location.href).href}?embed=1`);

function seedLegacyState(state: Record<string, unknown>) {
  try {
    // The original embedded controller already uses this key when it is hosted
    // in a shell.  It is a non-visual hand-off only; the desktop database stays
    // the source of truth through the Vue state store.
    localStorage.setItem("kairos-mvp-state", JSON.stringify(state));
    (window as EmbeddedLegacyWindow).KairosPendingState = state;
  } catch {}
}

async function mountFrame() {
  const state = await appState.load();
  appState.sync(state);
  seedLegacyState(state);
  const bootstrap = JSON.stringify({
    schedules: Array.isArray(state.schedules) ? state.schedules : [],
    habits: Array.isArray(state.habits) ? state.habits : []
  });
  // The original controller consumes this bootstrap before it renders its
  // first calendar frame.  Keep the later postMessage bridge for edits made
  // after initial render.
  frameName.value = ["calendar", "schedule"].includes(props.page) ? `kairos-state:${bootstrap}` : "";
  frameSource.value = ["calendar", "schedule"].includes(props.page)
    ? `${source.value}&scheduleState=${encodeURIComponent(bootstrap)}`
    : source.value;
}

async function syncFrame() {
  const state = await appState.load();
  const payload = JSON.parse(JSON.stringify(state));
  seedLegacyState(payload);
  const target = frame.value?.contentWindow as EmbeddedLegacyWindow | null;
  target?.postMessage({ type: "kairos:state-sync", state: payload }, "*");
  target?.postMessage({ type: "kairos:motion-preference", reduce: document.documentElement.classList.contains("kairos-reduce-motion") }, "*");
  const localePreference = String(payload.settings && typeof payload.settings === "object" && (payload.settings as any).general?.language || "en");
  target?.postMessage({ type: "kairos:locale-sync", preference: localePreference }, "*");
  // `file:`-backed embedded pages can miss the first postMessage while their
  // legacy controllers are being attached.  They expose this state bridge so
  // the Vue shell can deliver the same desktop snapshot once initialization is
  // complete, without changing any legacy DOM, CSS, or calendar behaviour.
  try {
    if (target) {
      target.KairosPendingState = payload;
      target.KairosI18n?.setLocale?.(localePreference);
      target.KairosScheduleSyncState?.(payload);
      target.dispatchEvent(
        new target.CustomEvent("kairos:state-changed", { detail: payload }),
      );
    }
  } catch {
    // The Vite and packaged variants may be cross-origin; postMessage above is
    // still the compatible delivery path in that case.
  }
}

function calendarSection() {
  const documentRoot = frame.value?.contentDocument;
  const content = documentRoot?.querySelector("main.kairos-page-main > div.flex.flex-1");
  return (
    documentRoot?.querySelector<HTMLElement>("body > .kairos-calendar-glass") ||
    content?.querySelector<HTMLElement>(":scope > section.kairos-calendar-glass") ||
    content?.querySelector<HTMLElement>(":scope > section") ||
    null
  );
}

function syncFullscreenButton(active: boolean) {
  if (!fullscreenButton) return;
  fullscreenButton.setAttribute("aria-pressed", String(active));
  fullscreenButton.setAttribute("aria-label", active ? t("calendar.fullscreenExit") : t("calendar.fullscreen"));
  const icon = fullscreenButton.querySelector(".material-symbols-outlined");
  if (icon) icon.textContent = active ? "fullscreen_exit" : "fullscreen";
}

function toggleCalendarFullscreen(force?: boolean) {
  const targetFrame = frame.value;
  const frameDocument = targetFrame?.contentDocument;
  const calendar = calendarSection() || frameDocument?.querySelector<HTMLElement>("body > .kairos-calendar-glass");
  if (!targetFrame || !frameDocument || !calendar) return;
  const active = typeof force === "boolean" ? force : !targetFrame.classList.contains("vue-calendar-frame-fullscreen");
  const applyState = () => {
    if (active) {
      calendarHomeParent ||= calendar.parentNode;
      calendarHomeNext = calendar.nextSibling;
      frameDocument.body.append(calendar);
    } else if (calendarHomeParent) {
      calendarHomeParent.insertBefore(calendar, calendarHomeNext);
    }
    targetFrame.classList.toggle("vue-calendar-frame-fullscreen", active);
    document.body.classList.toggle("vue-calendar-fullscreen", active);
    frameDocument.body.classList.toggle("calendar-fullscreen-fallback", active);
    calendar.classList.toggle("calendar-fullscreen-fallback-active", active);
    calendar.classList.toggle("calendar-is-fullscreen", active);
    syncFullscreenButton(active);
    window.dispatchEvent(new CustomEvent("kairos:calendar-frame-ready", { detail: { frame: targetFrame } }));
  };
  const startViewTransition = (document as any).startViewTransition;
  if (startViewTransition && !document.documentElement.classList.contains("kairos-reduce-motion") && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    const transition = startViewTransition.call(document, applyState);
    transition?.ready?.catch?.(() => {});
    transition?.finished?.catch?.(() => {});
  } else applyState();
}

function setupCalendarFrame() {
  if (props.page !== "calendar") return;
  const targetFrame = frame.value;
  const frameDocument = targetFrame?.contentDocument;
  const calendar = calendarSection();
  if (!targetFrame || !frameDocument || !calendar) return;
  calendar.classList.add("kairos-calendar-glass");
  const toolbar = calendar.firstElementChild;
  const todayButton = toolbar?.querySelector("#scheduleTodayButton");
  fullscreenButton = frameDocument.getElementById("calendarFullscreenButton") as HTMLButtonElement | null;
  if (!fullscreenButton) {
    fullscreenButton = frameDocument.createElement("button");
    fullscreenButton.id = "calendarFullscreenButton";
    fullscreenButton.type = "button";
    fullscreenButton.className = "calendar-fullscreen-button";
    fullscreenButton.innerHTML = '<span class="material-symbols-outlined">fullscreen</span>';
    if (toolbar && todayButton) {
      const actions = frameDocument.createElement("div");
      actions.className = "calendar-toolbar-actions";
      toolbar.insertBefore(actions, todayButton);
      actions.append(todayButton, fullscreenButton);
    } else {
      toolbar?.append(fullscreenButton);
    }
  }
  fullscreenButton.onclick = () => toggleCalendarFullscreen();
  syncFullscreenButton(false);
  requestAnimationFrame(() => window.dispatchEvent(new CustomEvent("kairos:calendar-frame-ready", { detail: { frame: targetFrame } })));
}

async function handleFrameLoad() {
  await syncFrame();
  stateSyncTimers.forEach(timer => window.clearTimeout(timer));
  stateSyncTimers = [80, 260, 700].map(delay => window.setTimeout(syncFrame, delay));
  setupCalendarFrame();
}
async function handleMessage(event: MessageEvent) {
  if (!event.data) return;
  if (event.data.type === "kairos:calendar-dialog") {
    frame.value?.classList.toggle("vue-legacy-dialog-open", event.data.open === true);
    window.dispatchEvent(new CustomEvent("kairos:calendar-dialog", { detail: { open: event.data.open === true } }));
    return;
  }
  if (event.data.type === "kairos:embedded-ready") {
    await syncFrame();
    setupCalendarFrame();
  }
  if (event.data.type === "kairos:state-request") await syncFrame();
  if (event.data.type === "kairos:state-sync" && event.data.state) await appState.save(event.data.state);
  if (event.data.type === "kairos:toast" && event.data.toast?.message) {
    const payload = event.data.toast;
    toasts.show({
      id: payload.id,
      message: String(payload.message),
      tone: payload.tone || "message",
      duration: Number(payload.duration) || undefined,
      actions: payload.action ? [{ label: String(payload.action), run: () => frame.value?.contentWindow?.postMessage({ type: "kairos:toast-action", id: payload.id }, "*") }] : undefined
    });
  }
  if (event.data.type === "kairos:pet-react") {
    const api = (window.kairosDesktop as any)?.pet;
    await api?.react?.(event.data.action, event.data.payload || {}).catch?.(() => {});
  }
}
onBeforeRouteUpdate(() => {
  toggleCalendarFullscreen(false);
  window.dispatchEvent(new CustomEvent("kairos:calendar-dialog", { detail: { open: false } }));
  frame.value?.contentDocument?.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach(dialog => dialog.close());
});
function handleSettingsChanged() { void syncFrame(); }
function handleMusicContentReady() {
  if (props.page === "music") void musicRuntime.load();
}
function handleEscape(event: KeyboardEvent) { if (event.key === "Escape") toggleCalendarFullscreen(false); }
onMounted(async () => {
  window.addEventListener("message", handleMessage);
  window.addEventListener("kairos:settings-changed", handleSettingsChanged);
  window.addEventListener("kairos:locale-changed", handleSettingsChanged);
  window.addEventListener("kairos:music-content-ready", handleMusicContentReady);
  window.addEventListener("keydown", handleEscape);
  await mountFrame();
});
onBeforeUnmount(() => {
  toggleCalendarFullscreen(false);
  window.dispatchEvent(new CustomEvent("kairos:calendar-dialog", { detail: { open: false } }));
  stateSyncTimers.forEach(timer => window.clearTimeout(timer));
  window.removeEventListener("message", handleMessage);
  window.removeEventListener("kairos:settings-changed", handleSettingsChanged);
  window.removeEventListener("kairos:locale-changed", handleSettingsChanged);
  window.removeEventListener("kairos:music-content-ready", handleMusicContentReady);
  window.removeEventListener("keydown", handleEscape);
});
watch(() => appState.state, () => {
  if (frame.value?.contentWindow) syncFrame();
}, { deep: true });
</script>

<template>
  <iframe v-if="frameSource" ref="frame" class="vue-legacy-frame" :name="frameName" :title="t(`${page}.workspace`)" :src="frameSource" @load="handleFrameLoad" />
</template>
