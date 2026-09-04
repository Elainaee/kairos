import { computed, ref } from "vue";
import { defineStore } from "pinia";

export type FocusPhase = "focus" | "rest";
export type FocusDisplayMode = "immersive" | "compact";

export interface FocusMusicSnapshot {
  trackId: string;
  title: string;
  artist: string;
}

export interface ActiveFocusSession {
  id: string;
  phase: FocusPhase;
  startedAt: string;
  phaseStartedAt: string;
  checkpointAt: string;
  accumulatedFocusSeconds: number;
  accumulatedRestSeconds: number;
  interruptionCount: number;
  scheduleId: string;
  scheduleTitle: string;
  music: FocusMusicSnapshot;
  pauseMusicDuringRest: boolean;
  musicWasPausedByFocus: boolean;
}

export interface FocusRecord {
  id: string;
  startedAt: string;
  endedAt: string;
  focusSeconds: number;
  restSeconds: number;
  interruptionCount: number;
  status: "completed" | "interrupted";
  scheduleId: string;
  scheduleTitle: string;
  music: FocusMusicSnapshot;
}

export const useFocusStore = defineStore("focus", () => {
  const active = ref<ActiveFocusSession | null>(null);
  const lastRecord = ref<FocusRecord | null>(null);
  const displayMode = ref<FocusDisplayMode>(sessionStorage.getItem("kairos.focus-display") === "compact" ? "compact" : "immersive");
  const now = ref(Date.now());
  const initialized = ref(false);
  let unsubscribe: (() => void) | undefined;
  let ticker: number | undefined;

  const elapsed = computed(() => {
    const session = active.value;
    if (!session) return { focusSeconds: 0, restSeconds: 0 };
    const phaseStarted = new Date(session.phaseStartedAt).valueOf();
    const running = Number.isFinite(phaseStarted) ? Math.max(0, Math.floor((now.value - phaseStarted) / 1000)) : 0;
    return {
      focusSeconds: Math.max(0, Number(session.accumulatedFocusSeconds || 0) + (session.phase === "focus" ? running : 0)),
      restSeconds: Math.max(0, Number(session.accumulatedRestSeconds || 0) + (session.phase === "rest" ? running : 0))
    };
  });

  function sync(snapshot: any) {
    active.value = snapshot?.active ? JSON.parse(JSON.stringify(snapshot.active)) : null;
    if (snapshot?.record) lastRecord.value = JSON.parse(JSON.stringify(snapshot.record));
    now.value = Date.now();
  }

  async function initialize() {
    if (initialized.value) return;
    initialized.value = true;
    sync(await window.kairosDesktop?.focus?.get?.());
    unsubscribe = window.kairosDesktop?.focus?.onChanged?.(sync);
    ticker = window.setInterval(() => { now.value = Date.now(); }, 1000);
  }

  function setDisplayMode(mode: FocusDisplayMode) {
    displayMode.value = mode;
    sessionStorage.setItem("kairos.focus-display", mode);
  }

  async function start(input: Record<string, unknown> = {}) {
    if (window.kairosDesktop?.focus?.start) {
      sync(await window.kairosDesktop.focus.start(input));
    } else {
      const timestamp = new Date().toISOString();
      active.value = {
        id: crypto.randomUUID(), phase: "focus", startedAt: timestamp, phaseStartedAt: timestamp, checkpointAt: timestamp,
        accumulatedFocusSeconds: 0, accumulatedRestSeconds: 0, interruptionCount: 0,
        scheduleId: String(input.scheduleId || ""), scheduleTitle: String(input.scheduleTitle || ""),
        music: (input.music || { trackId: "", title: "", artist: "" }) as FocusMusicSnapshot,
        pauseMusicDuringRest: true, musicWasPausedByFocus: false
      };
      now.value = Date.now();
    }
    setDisplayMode("immersive");
    return active.value;
  }

  async function rest(input: Record<string, unknown> = {}) {
    if (window.kairosDesktop?.focus?.rest) sync(await window.kairosDesktop.focus.rest(input));
    else if (active.value && active.value.phase === "focus") {
      active.value.accumulatedFocusSeconds = elapsed.value.focusSeconds;
      active.value.phase = "rest";
      active.value.phaseStartedAt = new Date().toISOString();
      active.value.interruptionCount += 1;
    }
  }

  async function resume(input: Record<string, unknown> = {}) {
    if (window.kairosDesktop?.focus?.resume) sync(await window.kairosDesktop.focus.resume(input));
    else if (active.value && active.value.phase === "rest") {
      active.value.accumulatedRestSeconds = elapsed.value.restSeconds;
      active.value.phase = "focus";
      active.value.phaseStartedAt = new Date().toISOString();
    }
  }

  async function update(input: Record<string, unknown> = {}) {
    if (window.kairosDesktop?.focus?.update) sync(await window.kairosDesktop.focus.update(input));
    else if (active.value) {
      if (input.scheduleId !== undefined) active.value.scheduleId = String(input.scheduleId || "");
      if (input.scheduleTitle !== undefined) active.value.scheduleTitle = String(input.scheduleTitle || "");
    }
  }

  async function finish(status: "completed" | "interrupted" = "completed") {
    let result: any;
    if (window.kairosDesktop?.focus?.finish) result = await window.kairosDesktop.focus.finish({ status });
    else if (active.value) {
      const totals = elapsed.value;
      result = { active: null, record: { ...active.value, endedAt: new Date().toISOString(), focusSeconds: totals.focusSeconds, restSeconds: totals.restSeconds, status } };
    } else result = { active: null, record: null };
    sync(result);
    setDisplayMode("compact");
    return result?.record as FocusRecord | undefined;
  }

  function dispose() {
    unsubscribe?.();
    unsubscribe = undefined;
    if (ticker) window.clearInterval(ticker);
    ticker = undefined;
  }

  return { active, lastRecord, displayMode, elapsed, initialized, initialize, setDisplayMode, start, rest, resume, update, finish, dispose };
});
