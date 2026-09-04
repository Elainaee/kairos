<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAppStateStore } from "../stores/app-state";
import { useMusicRuntimeStore } from "../stores/music-runtime";
import { useFocusStore } from "../stores/focus";
import { useToastsStore, type ToastInput } from "../stores/toasts";
import SettingsDialog from "./SettingsDialog.vue";
import ReminderPanel from "./ReminderPanel.vue";
import ReminderRuntime from "./ReminderRuntime.vue";
import ToastHost from "./ToastHost.vue";
import LegacyScheduleDialogHost from "./LegacyScheduleDialogHost.vue";
import CloseChoiceDialog from "./CloseChoiceDialog.vue";
import { applyLocale, applyTheme, applyTimeFormat, t } from "../i18n";

const route = useRoute();
const router = useRouter();
const appState = useAppStateStore();
const musicRuntime = useMusicRuntimeStore();
const focusRuntime = useFocusStore();
const toasts = useToastsStore();
const settingsOpen = ref(false);
const settingsOpener = ref<HTMLElement>();
const remindersOpen = ref(false);
const closeChoiceOpen = ref(false);
const windowMaximized = ref(false);
// Preserve the last authoritative desktop-pet state while the shell or an
// embedded legacy frame is being recreated.  Electron remains the source of
// truth; this only prevents the restore affordance from disappearing during a
// missed IPC notification.
const PET_VISIBILITY_CACHE_KEY = "kairos.desktop-pet-hidden";
// Render from the last known hidden state immediately. The preload bridge
// replays its cached native state after subscription, so a hide action that
// happened before this Vue shell mounted cannot make the restore button vanish.
const petHidden = ref(sessionStorage.getItem(PET_VISIBILITY_CACHE_KEY) === "1");
const nav = ref<HTMLElement>();
const indicatorStyle = ref<Record<string, string>>({});
let navObserver: ResizeObserver | undefined;
let calendarFrame: HTMLIFrameElement | undefined;
let calendarResizeObserver: ResizeObserver | undefined;
let calendarMutationObserver: MutationObserver | undefined;
let playerAlignmentFrame = 0;
let playerAlignmentTimers: number[] = [];
let stopStateChanges: (() => void) | undefined;
let stopPetVisibilityChanges: (() => void) | undefined;
let stopWindowMaximizedChanges: (() => void) | undefined;
let stopCloseRequested: (() => void) | undefined;
let petVisibilityPoll: number | undefined;
let appearanceSignature = "";
const links = computed(() => [
  ["calendar", "calendar_today", t("nav.calendar")], ["habits", "repeat", t("nav.habits")],
  ["schedule", "checklist", t("nav.schedule")], ["music", "queue_music", t("nav.music")], ["focus", "timer", t("nav.focus")]
] as const);
const activePage = computed(() => route.path.startsWith("/focus") ? "focus" : String(route.params.page || route.path.slice(1) || "calendar"));
const focusImmersive = computed(() => route.path === "/focus" && Boolean(focusRuntime.active) && focusRuntime.displayMode === "immersive");

function numberInRange(value: unknown, fallback: number, minimum: number, maximum: number) {
  const number = Number(value);
  return Math.max(minimum, Math.min(maximum, Number.isFinite(number) ? number : fallback));
}

function applyAppearance(settings: any = {}) {
  const raw = settings?.appearance?.calendarBackground || {};
  const source = raw.source === "custom" ? "custom" : "builtin";
  const candidate = String(raw.id || "default.jpg").normalize("NFC");
  const id = candidate && !candidate.startsWith(".") && !/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(candidate) && /\.(?:jpe?g|png|webp)$/i.test(candidate)
    ? candidate
    : "default.jpg";
  const blur = numberInRange(raw.blur, 6, 0, 32);
  const brightness = numberInRange(raw.brightness, 95, 55, 140);
  const signature = JSON.stringify({
    theme: settings?.appearance?.theme || "",
    language: settings?.general?.language || "",
    timeFormat: settings?.general?.timeFormat || "",
    reduceMotion: settings?.accessibility?.reduceMotion === true,
    source, id, blur, brightness
  });
  if (signature === appearanceSignature) return;
  appearanceSignature = signature;
  applyTheme(settings?.appearance?.theme);
  applyLocale(settings?.general?.language);
  applyTimeFormat(settings?.general?.timeFormat);
  const root = document.documentElement;
  const overlayRgb = brightness < 100 ? "0 0 0" : "255 255 255";
  const overlayOpacity = Math.abs(brightness - 100) / 100;
  root.classList.add("kairos-calendar-background-enabled");
  root.classList.toggle("kairos-reduce-motion", settings?.accessibility?.reduceMotion === true);
  root.style.setProperty("--kairos-calendar-background-image", `url("kairos-background://${source}/${encodeURIComponent(id)}")`);
  root.style.setProperty("--kairos-calendar-background-blur", `${blur}px`);
  root.style.setProperty("--kairos-calendar-background-brightness", `${brightness}%`);
  root.style.setProperty("--kairos-calendar-background-overlay-rgb", overlayRgb);
  root.style.setProperty("--kairos-calendar-background-overlay-opacity", `${overlayOpacity}`);
  syncWallpaperVisibility();
}

function syncWallpaperVisibility() {
  document.body.classList.toggle("kairos-calendar-background-active", activePage.value === "calendar");
}

async function loadAppearance() {
  const state = appState.loaded ? appState.state : await appState.load();
  applyAppearance(state?.settings || {});
}

function handleSettingsChanged(event: Event) {
  applyAppearance((event as CustomEvent).detail || {});
}

function syncPetVisibility(visible: unknown) {
  if (typeof visible !== "boolean") return;
  petHidden.value = !visible;
  sessionStorage.setItem(PET_VISIBILITY_CACHE_KEY, petHidden.value ? "1" : "0");
}

function handleDocumentVisibility() {
  if (!document.hidden) void refreshPetVisibility();
}

async function refreshPetVisibility() {
  try {
    const visible = await window.kairosDesktop?.pet?.getVisibility?.();
    if (typeof visible === "boolean") syncPetVisibility(visible);
  } catch {
    // Keep the last known state. A transient bridge failure must not remove
    // the only in-app way to restore a hidden desktop pet.
  }
}

async function restorePet() {
  try {
    const restored = await window.kairosDesktop?.pet?.show?.();
    if (restored !== false) syncPetVisibility(true);
  } catch {
    // Keep the recovery control visible if the bridge is temporarily
    // unavailable, so the user can retry instead of losing the only restore
    // path.
    syncPetVisibility(false);
  }
}

function resetPlayerLayout() {
  const player = document.getElementById("musicPlayer");
  if (!player) return;
  player.style.left = "0px";
  player.style.right = "0px";
  player.style.top = "auto";
  player.style.bottom = "0px";
  player.style.setProperty("height", "80px", "important");
}

function calendarElements(frame = calendarFrame) {
  try {
    const documentRoot = frame?.contentDocument;
    const content = documentRoot?.querySelector("main.kairos-page-main > div.flex.flex-1");
    const calendar =
      documentRoot?.querySelector<HTMLElement>("body > .kairos-calendar-glass") ||
      content?.querySelector<HTMLElement>(":scope > section.kairos-calendar-glass") ||
      content?.querySelector<HTMLElement>(":scope > section");
    const rail = content?.querySelector<HTMLElement>(":scope > section:nth-of-type(2)");
    return { content, calendar, rail };
  } catch {
    return {};
  }
}

function alignPlayer() {
  playerAlignmentFrame = 0;
  if (activePage.value !== "calendar") {
    resetPlayerLayout();
    return;
  }
  const player = document.getElementById("musicPlayer");
  const frame = calendarFrame;
  const { calendar } = calendarElements(frame);
  if (!player || !frame || !calendar) return;
  const frameRect = frame.getBoundingClientRect();
  const calendarRect = calendar.getBoundingClientRect();
  const left = frameRect.left + calendarRect.left;
  const right = frameRect.left + calendarRect.right;
  // The Calendar content row itself reserves the player footprint. The
  // original player stays fixed at the window bottom; only its horizontal
  // edges follow the left Calendar column.
  player.style.left = `${Math.max(0, left)}px`;
  player.style.right = `${Math.max(0, window.innerWidth - right)}px`;
  player.style.top = "auto";
  player.style.bottom = "0px";
  player.style.setProperty("height", "80px", "important");
}

function settlePlayerAlignment() {
  cancelAnimationFrame(playerAlignmentFrame);
  playerAlignmentTimers.forEach(timer => window.clearTimeout(timer));
  playerAlignmentTimers = [];
  playerAlignmentFrame = requestAnimationFrame(() => {
    playerAlignmentFrame = requestAnimationFrame(alignPlayer);
  });
  playerAlignmentTimers = [0, 60, 180, 420].map(delay => window.setTimeout(alignPlayer, delay));
}

function observeCalendarFrame(frame: HTMLIFrameElement) {
  calendarFrame = frame;
  calendarResizeObserver?.disconnect();
  calendarMutationObserver?.disconnect();
  const { content, calendar, rail } = calendarElements(frame);
  if ("ResizeObserver" in window) {
    calendarResizeObserver = new ResizeObserver(settlePlayerAlignment);
    calendarResizeObserver.observe(frame);
    if (calendar) calendarResizeObserver.observe(calendar);
    if (rail) calendarResizeObserver.observe(rail);
  }
  // ResizeObserver and the iframe-ready event cover every layout change we
  // care about here. A parent-realm MutationObserver cannot reliably observe
  // a node owned by an embedded document in Electron's isolated worlds.
  settlePlayerAlignment();
}

function handleCalendarFrameReady(event: Event) {
  const frame = (event as CustomEvent<{ frame?: HTMLIFrameElement }>).detail?.frame;
  if (frame) observeCalendarFrame(frame);
}

function handleCalendarDialog(event: Event) {
  const detail = (event as CustomEvent<{ open?: boolean; host?: boolean }>).detail;
  const isOpen = Boolean(detail?.open);
  if (!detail?.host) calendarFrame?.classList.toggle("vue-legacy-dialog-open", isOpen);
  document.body.classList.toggle("vue-schedule-dialog-open", isOpen);
  const player = document.getElementById("musicPlayer");
  if (isOpen) player?.style.setProperty("z-index", "1", "important");
  else player?.style.removeProperty("z-index");
}

async function placeIndicator() {
  await nextTick();
  const root = nav.value;
  const link = root?.querySelector<HTMLElement>(`a[data-page="${activePage.value}"]`);
  if (!root || !link) return;
  const navRect = root.getBoundingClientRect();
  const linkRect = link.getBoundingClientRect();
  indicatorStyle.value = {
    "--gooey-x": `${linkRect.left - navRect.left}px`, "--gooey-y": `${linkRect.top - navRect.top}px`,
    "--gooey-w": `${linkRect.width}px`, "--gooey-h": `${linkRect.height}px`
  };
}

function reducedMotion() {
  return document.documentElement.classList.contains("kairos-reduce-motion") || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function gooeyPoint(distance: number, index: number, total: number) {
  const noise = (amount: number) => amount / 2 - Math.random() * amount;
  const angle = ((360 + noise(8)) / total) * index * (Math.PI / 180);
  return [distance * Math.cos(angle), distance * Math.sin(angle)];
}

function burstParticles() {
  const effect = nav.value?.querySelector<HTMLElement>(".kairos-gooey-effect");
  if (!effect || reducedMotion()) return;
  effect.querySelectorAll(".kairos-gooey-particle").forEach(node => node.remove());
  const count = 12;
  for (let index = 0; index < count; index += 1) {
    const start = gooeyPoint(48, count - index, count);
    const end = gooeyPoint(8 + (2.5 - Math.random() * 5), count - index, count);
    const particle = document.createElement("span");
    particle.className = "kairos-gooey-particle";
    particle.style.cssText = `--start-x:${start[0]}px;--start-y:${start[1]}px;--end-x:${end[0]}px;--end-y:${end[1]}px;--particle-time:${520 + (80 - Math.random() * 160)}ms;--particle-scale:${.75 + Math.random() * .35}`;
    particle.append(document.createElement("i"));
    effect.append(particle);
    particle.addEventListener("animationend", () => particle.remove(), { once: true });
  }
  effect.classList.remove("is-bursting");
  void effect.offsetWidth;
  effect.classList.add("is-bursting");
}

function navigateWithTransition(event: MouseEvent, page: string) {
  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || activePage.value === page) return;
  event.preventDefault();
  burstParticles();
  const navigate = () => router.push(`/${page}`);
  const startViewTransition = (document as any).startViewTransition;
  if (startViewTransition && !reducedMotion()) {
    const transition = startViewTransition.call(document, navigate);
    transition?.ready?.catch?.(() => {});
    transition?.finished?.catch?.(() => {});
  } else navigate();
}

function handleToast(event: Event) {
  // Original page features (including the shared player) publish
  // `{ type, title, description }`; the Vue toast host uses
  // `{ tone, title, message }`.  Preserve both contracts while the legacy
  // controllers remain the source of behaviour.
  const detail = (event as CustomEvent<ToastInput & { type?: ToastInput["tone"]; description?: string }>).detail;
  if (!detail) return;
  const message = String(detail.message || detail.description || detail.title || "").trim();
  if (!message) return;
  const tone = detail.tone || detail.type || "message";
  toasts.show({
    title: detail.message || detail.description ? detail.title : undefined,
    message,
    tone,
    duration: detail.duration
  });
}

/**
 * The legacy #musicPlayer remains the only audio owner.  It publishes this
 * event after every queue, track, progress, or play-state transition; Vue
 * mirrors that authoritative snapshot without creating another player.
 */
function handleMusicStateChanged(event: Event) {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail;
  if (detail) musicRuntime.sync(detail);
}

function handleMusicCommand(event: Event) {
  const detail = (event as CustomEvent<Record<string, unknown>>).detail;
  if (detail) void musicRuntime.apply(detail);
}

function syncLegacyPlayerRoute() {
  const view = activePage.value;
  document.body.dataset.kairosVuePage = view;
  document.body.classList.toggle("kairos-secondary-view", view !== "calendar");
  document.body.classList.toggle("kairos-music-view", view === "music");
  window.dispatchEvent(new CustomEvent("kairos:player-route-layout", { detail: { view } }));
}

function syncDocumentTitle() {
  // Route ownership lives in the Vue shell. Remove the legacy static title
  // binding so a later locale pass cannot reset Focus to Calendar.
  document.querySelector("title")?.removeAttribute("data-i18n");
  document.title = activePage.value === "music"
    ? t("app.title.music")
    : activePage.value === "focus"
      ? t("app.title.focus")
    : activePage.value === "schedule"
      ? t("app.title.schedule")
      : activePage.value === "habits"
        ? t("app.title.habits")
        : t("app.title.calendar");
}

onMounted(() => {
  document.body.classList.add("kairos-vue-shell");
  syncDocumentTitle();
  placeIndicator();
  document.fonts?.ready.then(placeIndicator);
  window.setTimeout(placeIndicator, 180);
  loadAppearance();
  void focusRuntime.initialize();
  syncLegacyPlayerRoute();
  ensureMusicPlayer();
  if (nav.value) { navObserver = new ResizeObserver(placeIndicator); navObserver.observe(nav.value); }
  window.addEventListener("resize", placeIndicator);
  window.addEventListener("resize", settlePlayerAlignment);
  window.addEventListener("kairos:settings-changed", handleSettingsChanged);
  window.addEventListener("kairos:locale-changed", syncDocumentTitle);
  window.addEventListener("kairos:calendar-frame-ready", handleCalendarFrameReady);
  window.addEventListener("kairos:calendar-dialog", handleCalendarDialog);
  window.addEventListener("kairos:toast", handleToast);
  window.addEventListener("kairos:music-state-changed", handleMusicStateChanged);
  window.addEventListener("kairos:music-command", handleMusicCommand);
  window.addEventListener("focus", refreshPetVisibility);
  window.addEventListener("pageshow", refreshPetVisibility);
  document.addEventListener("visibilitychange", handleDocumentVisibility);
  stopPetVisibilityChanges = window.kairosDesktop?.pet?.onVisibilityChanged?.(syncPetVisibility);
  stopWindowMaximizedChanges = window.kairosDesktop?.windowControls?.onMaximizedChanged?.(maximized => { windowMaximized.value = maximized; });
  stopCloseRequested = window.kairosDesktop?.windowControls?.onCloseRequested?.(() => { closeChoiceOpen.value = true; });
  void window.kairosDesktop?.windowControls?.isMaximized?.().then(maximized => { windowMaximized.value = maximized; });
  void refreshPetVisibility();
  // IPC events normally update this immediately.  The small reconciliation
  // loop covers the one edge case where a pet is hidden while Vite recreates
  // the shell and the one-shot event is missed.
  petVisibilityPoll = window.setInterval(refreshPetVisibility, 2000);
  stopStateChanges = (window.kairosDesktop?.appState as any)?.onChanged?.((state: any) => { appState.sync(state); applyAppearance(state?.settings || {}); });
});
onBeforeUnmount(() => {
  document.body.classList.remove("vue-schedule-dialog-open");
  document.getElementById("musicPlayer")?.style.removeProperty("z-index");
  navObserver?.disconnect();
  calendarResizeObserver?.disconnect();
  calendarMutationObserver?.disconnect();
  cancelAnimationFrame(playerAlignmentFrame);
  playerAlignmentTimers.forEach(timer => window.clearTimeout(timer));
  stopStateChanges?.();
  stopPetVisibilityChanges?.();
  stopWindowMaximizedChanges?.();
  stopCloseRequested?.();
  if (petVisibilityPoll) window.clearInterval(petVisibilityPoll);
  window.removeEventListener("resize", placeIndicator);
  window.removeEventListener("resize", settlePlayerAlignment);
  window.removeEventListener("kairos:settings-changed", handleSettingsChanged);
  window.removeEventListener("kairos:locale-changed", syncDocumentTitle);
  window.removeEventListener("kairos:calendar-frame-ready", handleCalendarFrameReady);
  window.removeEventListener("kairos:calendar-dialog", handleCalendarDialog);
  window.removeEventListener("kairos:toast", handleToast);
  window.removeEventListener("kairos:music-state-changed", handleMusicStateChanged);
  window.removeEventListener("kairos:music-command", handleMusicCommand);
  window.removeEventListener("focus", refreshPetVisibility);
  window.removeEventListener("pageshow", refreshPetVisibility);
  document.removeEventListener("visibilitychange", handleDocumentVisibility);
  document.body.classList.remove("kairos-secondary-view", "kairos-music-view", "kairos-vue-shell", "kairos-calendar-background-active", "kairos-focus-immersive");
  delete document.body.dataset.kairosVuePage;
});
watch(activePage, () => {
  syncWallpaperVisibility();
  syncDocumentTitle();
  placeIndicator();
  syncLegacyPlayerRoute();
  syncPlayerVisibility();
  settlePlayerAlignment();
});
watch(focusImmersive, value => {
  document.body.classList.toggle("kairos-focus-immersive", value);
}, { immediate: true });
function triggerCreate() {
  // Keep the current page in place; the receiver opens the original Calendar
  // dialog over the current surface.
  window.dispatchEvent(new CustomEvent("kairos:create-new", { detail: { page: activePage.value } }));
}
function openSettings(event: MouseEvent) {
  settingsOpener.value = event.currentTarget instanceof HTMLElement ? event.currentTarget : undefined;
  settingsOpen.value = true;
}
function minimizeAppWindow() {
  void window.kairosDesktop?.windowControls?.minimize?.();
}
function toggleAppWindowMaximize() {
  void window.kairosDesktop?.windowControls?.toggleMaximize?.();
}
function closeAppWindow() {
  void window.kairosDesktop?.windowControls?.close?.();
}
function chooseCloseAction(action: "tray" | "exit" | "cancel") {
  closeChoiceOpen.value = false;
  void window.kairosDesktop?.windowControls?.closeAction?.(action);
}
function syncPlayerVisibility() {
  const player = document.getElementById("musicPlayer");
  if (player) {
    // The original Music page owns the same bottom player as Calendar. Other
    // Vue routes keep it absent, matching their original page surfaces.
    const showPlayer = activePage.value === "calendar" || activePage.value === "music";
    player.hidden = !showPlayer;
    if (showPlayer) {
      player.style.removeProperty("display");
      settlePlayerAlignment();
    } else {
      // The original player stylesheet declares its flex layout as !important,
      // so the semantic `hidden` attribute alone cannot suppress it outside
      // the Calendar page.
      player.style.setProperty("display", "none", "important");
      resetPlayerLayout();
    }
  }
}
function ensureMusicPlayer() {
  const mountAndSync = () => {
    try { (window as any).KairosMusicPlayer?.mount?.(); } catch {}
    syncPlayerVisibility();
    settlePlayerAlignment();
  };
  if ((window as any).KairosMusicPlayer) { mountAndSync(); return; }
  const existingScript = document.querySelector<HTMLScriptElement>("script[data-vue-music-player]");
  if (existingScript) {
    existingScript.addEventListener("load", mountAndSync, { once: true });
    syncPlayerVisibility();
    settlePlayerAlignment();
    return;
  }
  const script = document.createElement("script");
  script.dataset.vueMusicPlayer = "";
  script.src = import.meta.env.DEV ? "/legacy/shell/player/music-player.js" : new URL("../shell/player/music-player.js", window.location.href).href;
  script.addEventListener("load", mountAndSync, { once: true });
  document.head.append(script);
}
</script>

<template>
  <div class="vue-shell" :class="{ 'vue-shell--focus': activePage === 'focus', 'vue-shell--focus-immersive': focusImmersive }">
    <div class="kairos-wallpaper" aria-hidden="true" />
    <header v-show="!focusImmersive" class="kairos-topbar">
      <nav ref="nav" class="kairos-nav kairos-gooey-nav" :aria-label="t('nav.primary')">
        <span class="kairos-gooey-effect" :style="indicatorStyle" aria-hidden="true" />
        <RouterLink v-for="link in links" :key="link[0]" :data-page="link[0]" :class="{ active: activePage === link[0] }" :to="`/${link[0]}`" @click="navigateWithTransition($event, link[0])">
          <span class="material-symbols-outlined">{{ link[1] }}</span><span>{{ link[2] }}</span>
        </RouterLink>
      </nav>
      <div class="kairos-actions">
        <button class="kairos-create" type="button" @click="triggerCreate"><span class="material-symbols-outlined">add</span>{{ t('common.createNew') }}</button>
        <button class="kairos-icon-button kairos-reminder-button" type="button" :aria-label="t('common.reminders')" :title="t('common.reminders')" :aria-expanded="remindersOpen" @click="remindersOpen = !remindersOpen"><span class="material-symbols-outlined">notifications</span></button>
        <button class="kairos-icon-button kairos-settings-button" data-settings-bound="1" type="button" :aria-label="t('common.settings')" :title="t('common.settings')" @click="openSettings"><span class="material-symbols-outlined">settings</span></button>
        <div class="kairos-window-controls" aria-label="Window controls">
          <button class="kairos-window-minimize" type="button" :aria-label="t('electron.minimize')" :title="t('electron.minimize')" @click="minimizeAppWindow"><span class="kairos-window-glyph kairos-window-glyph--minimize" aria-hidden="true" /></button>
          <button class="kairos-window-maximize" :class="{ 'is-window-maximized': windowMaximized }" type="button" :aria-label="t(windowMaximized ? 'electron.restore' : 'electron.maximize')" :title="t(windowMaximized ? 'electron.restore' : 'electron.maximize')" @click="toggleAppWindowMaximize"><span class="kairos-window-glyph" :class="windowMaximized ? 'kairos-window-glyph--restore' : 'kairos-window-glyph--maximize'" aria-hidden="true" /></button>
          <button class="kairos-window-close" type="button" :aria-label="t('common.close')" :title="t('common.close')" @click="closeAppWindow"><span class="kairos-window-glyph kairos-window-glyph--close" aria-hidden="true" /></button>
        </div>
      </div>
    </header>
    <main class="vue-shell-content" :class="{ 'vue-shell-content--music': activePage === 'music', 'vue-shell-content--focus-immersive': focusImmersive }" :data-view="activePage"><slot /></main>
    <SettingsDialog :open="settingsOpen" :opener="settingsOpener" @close="settingsOpen = false" />
    <ReminderPanel :open="remindersOpen" @close="remindersOpen = false" />
    <ReminderRuntime />
    <ToastHost />
    <CloseChoiceDialog :open="closeChoiceOpen" @choose="chooseCloseAction" />
    <LegacyScheduleDialogHost :page="activePage" />
    <Teleport to="body">
      <button v-show="petHidden && activePage !== 'focus'" class="vue-pet-restore" type="button" :aria-label="t('pet.restore')" :title="t('pet.restore')" @click="restorePet">
        <span class="material-symbols-outlined" aria-hidden="true">pets</span>
      </button>
    </Teleport>
  </div>
</template>
