import crypto from "node:crypto";

const PHASES = new Set(["focus", "rest"]);
const STATUSES = new Set(["completed", "interrupted"]);

const clone = value => structuredClone(value || null);
const secondsBetween = (from, to) => Math.max(0, Math.floor((to.valueOf() - from.valueOf()) / 1000));
const asDate = value => value instanceof Date ? value : new Date(value);
const safeText = (value, maximum = 240) => String(value || "").trim().slice(0, maximum);

function musicSnapshot(value = {}) {
  return {
    trackId: safeText(value.trackId),
    title: safeText(value.title),
    artist: safeText(value.artist)
  };
}

function runningTotals(active, now) {
  const focusSeconds = Number(active?.accumulatedFocusSeconds || 0);
  const restSeconds = Number(active?.accumulatedRestSeconds || 0);
  const phaseStartedAt = asDate(active?.phaseStartedAt || now);
  const elapsed = secondsBetween(phaseStartedAt, now);
  return {
    focusSeconds: Math.max(0, Math.floor(focusSeconds + (active?.phase === "focus" ? elapsed : 0))),
    restSeconds: Math.max(0, Math.floor(restSeconds + (active?.phase === "rest" ? elapsed : 0)))
  };
}

export class FocusSessionService {
  constructor({ store, onChange = () => {}, onAwayReminder = () => {}, now = () => new Date(), awayDelayMs = 10 * 60 * 1000 } = {}) {
    if (!store?.read || !store?.mutate) throw new Error("focus_store_required");
    this.store = store;
    this.onChange = onChange;
    this.onAwayReminder = onAwayReminder;
    this.now = now;
    this.awayDelayMs = awayDelayMs;
    this.active = null;
    this.awayTimer = null;
    this.awayNotified = false;
  }

  publicSnapshot(at = this.now()) {
    if (!this.active) return { active: null };
    return { active: { ...clone(this.active), ...runningTotals(this.active, at), now: at.toISOString() } };
  }

  async initialize() {
    const state = await this.store.read();
    const stale = state.activeFocusSession;
    if (!stale) {
      this.active = null;
      return this.publicSnapshot();
    }
    // A clean exit finalizes first. If the process previously died, stop at
    // the last persisted checkpoint instead of counting unknown offline time.
    this.active = clone(stale);
    await this.finish({ status: "interrupted", at: stale.checkpointAt || stale.phaseStartedAt });
    return this.publicSnapshot();
  }

  async start(input = {}) {
    if (this.active) throw new Error("focus_session_already_active");
    const now = this.now();
    this.active = {
      id: crypto.randomUUID(),
      phase: "focus",
      startedAt: now.toISOString(),
      phaseStartedAt: now.toISOString(),
      checkpointAt: now.toISOString(),
      accumulatedFocusSeconds: 0,
      accumulatedRestSeconds: 0,
      interruptionCount: 0,
      scheduleId: safeText(input.scheduleId),
      scheduleTitle: safeText(input.scheduleTitle),
      music: musicSnapshot(input.music),
      pauseMusicDuringRest: input.pauseMusicDuringRest !== false,
      musicWasPausedByFocus: false
    };
    await this.persistActive();
    return this.publish();
  }

  async enterRest(input = {}) {
    if (!this.active) throw new Error("focus_session_not_active");
    if (this.active.phase === "rest") return this.publish();
    const now = this.now();
    const totals = runningTotals(this.active, now);
    Object.assign(this.active, {
      phase: "rest",
      phaseStartedAt: now.toISOString(),
      checkpointAt: now.toISOString(),
      accumulatedFocusSeconds: totals.focusSeconds,
      accumulatedRestSeconds: totals.restSeconds,
      interruptionCount: Number(this.active.interruptionCount || 0) + 1,
      pauseMusicDuringRest: input.pauseMusicDuringRest ?? this.active.pauseMusicDuringRest,
      musicWasPausedByFocus: input.musicWasPausedByFocus === true
    });
    this.clearAwayTimer();
    await this.persistActive();
    return this.publish();
  }

  async resumeFocus(input = {}) {
    if (!this.active) throw new Error("focus_session_not_active");
    if (this.active.phase === "focus") return this.publish();
    const now = this.now();
    const totals = runningTotals(this.active, now);
    Object.assign(this.active, {
      phase: "focus",
      phaseStartedAt: now.toISOString(),
      checkpointAt: now.toISOString(),
      accumulatedFocusSeconds: totals.focusSeconds,
      accumulatedRestSeconds: totals.restSeconds,
      musicWasPausedByFocus: input.musicWasPausedByFocus === true
    });
    await this.persistActive();
    return this.publish();
  }

  async update(input = {}) {
    if (!this.active) throw new Error("focus_session_not_active");
    if (input.scheduleId !== undefined) this.active.scheduleId = safeText(input.scheduleId);
    if (input.scheduleTitle !== undefined) this.active.scheduleTitle = safeText(input.scheduleTitle);
    if (input.pauseMusicDuringRest !== undefined) this.active.pauseMusicDuringRest = input.pauseMusicDuringRest !== false;
    if (input.musicWasPausedByFocus !== undefined) this.active.musicWasPausedByFocus = input.musicWasPausedByFocus === true;
    if (input.music !== undefined) this.active.music = musicSnapshot(input.music);
    this.active.checkpointAt = this.now().toISOString();
    await this.persistActive();
    return this.publish();
  }

  async finish(input = {}) {
    if (!this.active) return { active: null, record: null };
    const requestedAt = asDate(input.at || this.now());
    const startedAt = asDate(this.active.startedAt);
    const endedAt = requestedAt < startedAt ? startedAt : requestedAt;
    const totals = runningTotals(this.active, endedAt);
    const record = {
      id: this.active.id,
      startedAt: this.active.startedAt,
      endedAt: endedAt.toISOString(),
      focusSeconds: totals.focusSeconds,
      restSeconds: totals.restSeconds,
      interruptionCount: Math.max(0, Math.floor(Number(this.active.interruptionCount || 0))),
      status: STATUSES.has(input.status) ? input.status : "completed",
      scheduleId: safeText(this.active.scheduleId),
      scheduleTitle: safeText(this.active.scheduleTitle),
      music: musicSnapshot(this.active.music)
    };
    const { state } = await this.store.mutate(data => {
      data.focusSessions = Array.isArray(data.focusSessions) ? data.focusSessions : [];
      data.focusSessions.push(record);
      data.activeFocusSession = null;
      return record;
    });
    this.active = null;
    this.clearAwayTimer();
    this.awayNotified = false;
    this.onChange(state, { active: null, record });
    return { active: null, record };
  }

  handleWindowBlur() {
    if (!this.active || this.active.phase !== "focus" || this.awayTimer || this.awayNotified) return false;
    this.awayTimer = setTimeout(() => {
      this.awayTimer = null;
      if (!this.active || this.active.phase !== "focus" || this.awayNotified) return;
      this.awayNotified = true;
      this.onAwayReminder({ action: "focus-away" });
    }, this.awayDelayMs);
    return true;
  }

  handleWindowFocus() {
    this.clearAwayTimer();
    this.awayNotified = false;
  }

  dispose() {
    this.clearAwayTimer();
  }

  clearAwayTimer() {
    if (this.awayTimer) clearTimeout(this.awayTimer);
    this.awayTimer = null;
  }

  async persistActive() {
    const active = clone(this.active);
    const { state } = await this.store.mutate(data => {
      data.activeFocusSession = active;
      return active;
    });
    this.onChange(state, this.publicSnapshot());
  }

  publish() {
    const snapshot = this.publicSnapshot();
    this.onChange(null, snapshot);
    return snapshot;
  }
}

export { runningTotals };
