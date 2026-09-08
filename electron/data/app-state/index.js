import fs from "node:fs/promises";
import path from "node:path";
import { KairosAppDatabase } from "../sqlite/index.js";

export const APP_STATE_SCHEMA_VERSION = 5;
const DEFAULT_SETTINGS = { general: { language: "en", timeFormat: "system" } };
const EMPTY = { version: APP_STATE_SCHEMA_VERSION, revision: 0, migrations: [], schedules: [], checkins: [], habits: [], focusSessions: [], activeFocusSession: null, theme: "light", settings: DEFAULT_SETTINGS };
const arrays = ["schedules", "checkins", "habits", "focusSessions"];
const SCHEDULE_TYPES = new Set(["task", "deadline", "event", "match", "holiday", "other"]);
const FOCUS_PHASES = new Set(["focus", "rest"]);
const FOCUS_STATUSES = new Set(["completed", "interrupted"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;
function migrationEntry(id, from, to) {
  return { id, from, to, applied_at: new Date().toISOString() };
}
function backupName(version, reason = "") {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = reason ? `-${String(reason).replace(/[^a-z0-9-]/gi, "-").toLowerCase()}` : "";
  return `app-state-v${version || 0}-${stamp}${suffix}.json`;
}
function backupSortValue(name) {
  const match = String(name || "").match(/app-state-v\d+-(.+)\.json$/);
  return match?.[1] || "";
}
function assertBackupName(name) {
  const value = String(name || "");
  if (value !== path.basename(value) || !/^app-state-v\d+-.+\.json$/.test(value)) throw new Error("invalid_backup_path");
  return value;
}
export function normalize(input = {}) {
  const previousVersion = Number(input?.version || 0);
  const legacyStudyPlans = Array.isArray(input?.studyPlans) ? input.studyPlans : [];
  const out = { ...structuredClone(EMPTY), ...input, version: APP_STATE_SCHEMA_VERSION };
  out.revision = Math.max(0, Math.floor(Number(input?.revision) || 0));
  const requestedLanguage = input?.settings?.general?.language;
  const language = ["en", "zh-CN", "system"].includes(requestedLanguage) ? requestedLanguage : "en";
  out.settings = {
    ...(input?.settings || {}),
    general: {
      ...DEFAULT_SETTINGS.general,
      ...(input?.settings?.general || {}),
      language
    }
  };
  for (const key of arrays) if (!Array.isArray(out[key])) out[key] = [];
  out.migrations = Array.isArray(out.migrations) ? out.migrations.filter(item => item && typeof item === "object") : [];
  if (previousVersion < 2 && !out.migrations.some(item => item.id === "app-state-v2")) {
    out.migrations.push(migrationEntry("app-state-v2", previousVersion || 1, APP_STATE_SCHEMA_VERSION));
  }
  if (legacyStudyPlans.length) {
    const now = new Date().toISOString();
    out.schedules.push(...legacyStudyPlans.map(plan => repairedSchedule({ ...plan, date: plan.date || plan.start_date, end_date: plan.end_date || plan.start_date, type: "event", migrated_from: "studyPlans" }, now)));
  }
  delete out.studyPlans;
  if (previousVersion < 3 && !out.migrations.some(item => item.id === "app-state-v3-remove-study-plans")) {
    out.migrations.push(migrationEntry("app-state-v3-remove-study-plans", Math.max(previousVersion, 2), APP_STATE_SCHEMA_VERSION));
  }
  // Notes and mood journals were intentionally removed from Kairos. Strip
  // both keys during every read, import, and write so old exports cannot
  // restore deleted Notes data.
  const hadNotesData = Array.isArray(out.notes) && out.notes.length > 0 || out.moods && Object.keys(out.moods).length > 0;
  delete out.notes;
  delete out.moods;
  if (hadNotesData && !out.migrations.some(item => item.id === "app-state-v4-remove-notes")) {
    out.migrations.push(migrationEntry("app-state-v4-remove-notes", Math.min(previousVersion || 3, 3), APP_STATE_SCHEMA_VERSION));
  }
  out.focusSessions = out.focusSessions.map(repairedFocusSession).filter(Boolean);
  out.activeFocusSession = repairedActiveFocusSession(out.activeFocusSession);
  if (previousVersion < 5 && !out.migrations.some(item => item.id === "app-state-v5-focus-sessions")) {
    out.migrations.push(migrationEntry("app-state-v5-focus-sessions", Math.max(previousVersion, 4), APP_STATE_SCHEMA_VERSION));
  }
  return out;
}
function nonNegativeInteger(value) { const number = Math.floor(Number(value || 0)); return Number.isFinite(number) ? Math.max(0, number) : 0; }
function validIso(value) { const date = new Date(value); return value && !Number.isNaN(date.valueOf()) ? date.toISOString() : ""; }
function cleanFocusMusic(value = {}) {
  return {
    trackId: String(value?.trackId || "").slice(0, 240),
    title: String(value?.title || "").slice(0, 240),
    artist: String(value?.artist || "").slice(0, 240)
  };
}
function repairedFocusSession(item) {
  if (!item || typeof item !== "object" || !String(item.id || "").trim()) return null;
  const startedAt = validIso(item.startedAt || item.created_at);
  const endedAt = validIso(item.endedAt || item.updated_at);
  if (!startedAt || !endedAt) return null;
  return {
    ...item,
    id: String(item.id),
    startedAt,
    endedAt,
    focusSeconds: nonNegativeInteger(item.focusSeconds),
    restSeconds: nonNegativeInteger(item.restSeconds),
    interruptionCount: nonNegativeInteger(item.interruptionCount),
    status: FOCUS_STATUSES.has(item.status) ? item.status : "interrupted",
    scheduleId: String(item.scheduleId || ""),
    scheduleTitle: String(item.scheduleTitle || "").slice(0, 240),
    music: cleanFocusMusic(item.music)
  };
}
function repairedActiveFocusSession(item) {
  if (!item || typeof item !== "object" || !String(item.id || "").trim()) return null;
  const startedAt = validIso(item.startedAt);
  const phaseStartedAt = validIso(item.phaseStartedAt);
  const checkpointAt = validIso(item.checkpointAt || item.phaseStartedAt);
  if (!startedAt || !phaseStartedAt || !checkpointAt) return null;
  return {
    ...item,
    id: String(item.id),
    phase: FOCUS_PHASES.has(item.phase) ? item.phase : "focus",
    startedAt,
    phaseStartedAt,
    checkpointAt,
    accumulatedFocusSeconds: nonNegativeInteger(item.accumulatedFocusSeconds),
    accumulatedRestSeconds: nonNegativeInteger(item.accumulatedRestSeconds),
    interruptionCount: nonNegativeInteger(item.interruptionCount),
    scheduleId: String(item.scheduleId || ""),
    scheduleTitle: String(item.scheduleTitle || "").slice(0, 240),
    music: cleanFocusMusic(item.music),
    pauseMusicDuringRest: item.pauseMusicDuringRest !== false,
    musicWasPausedByFocus: item.musicWasPausedByFocus === true
  };
}
function validDate(value) { return DATE.test(String(value || "")); }
function scheduleType(value, item = {}) {
  if (SCHEDULE_TYPES.has(value)) return value;
  const text = `${value || ""} ${item.title || ""} ${item.notes || ""}`;
  if (/赛事|比赛|观赛|vs\b/i.test(text)) return "match";
  if (/截止|due/i.test(text)) return "deadline";
  if (/作业|任务|待办/i.test(text)) return "task";
  if (/节日|假期/.test(text)) return "holiday";
  if (/会议|例会|提醒|约会|学习/.test(text)) return "event";
  return "other";
}
function repairedSchedule(item, now) {
  const fallback = validDate(item.created_at?.slice(0, 10)) ? item.created_at.slice(0, 10) : now.slice(0, 10);
  const date = validDate(item.date) ? item.date : validDate(item.start_date) ? item.start_date : fallback;
  const recurrenceUntil = item.recurrence?.frequency === "weekly" ? item.recurrence.until : "";
  const endDate = validDate(item.end_date) ? item.end_date : validDate(recurrenceUntil) ? recurrenceUntil : validDate(item.start_date) ? item.start_date : date;
  return { ...item, date, end_date: endDate >= date ? endDate : date, type: scheduleType(item.type, item), all_day: item.all_day ?? !item.start_time, updated_at: item.updated_at || now };
}
function assertSchedule(item, domain) {
  if (!validDate(item.date)) throw new Error("schedule_date_required");
  if (!validDate(item.end_date)) item.end_date = item.date;
  if (item.end_date < item.date) throw new Error("schedule_date_range_invalid");
  if (!SCHEDULE_TYPES.has(item.type)) throw new Error("invalid_schedule_type");
  if (domain === "tasks" && !["task", "deadline"].includes(item.type)) throw new Error("invalid_task_type");
  return item;
}
function duplicateIds(rows = []) {
  const seen = new Set(), duplicates = new Set();
  for (const row of rows) {
    const id = String(row?.id || "");
    if (!id) continue;
    if (seen.has(id)) duplicates.add(id);
    seen.add(id);
  }
  return [...duplicates];
}
function addIssue(issues, code, message, detail = {}) {
  issues.push({ code, message, ...detail });
}
export function auditAppState(input = {}) {
  const state = normalize(input);
  const issues = [];
  const summary = {
    version: state.version,
    schedules: state.schedules.length,
    tasks: state.schedules.filter(item => ["task", "deadline"].includes(item.type)).length,
    habits: state.habits.length,
    checkins: state.checkins.length,
    focusSessions: state.focusSessions.length,
    migrations: state.migrations.length,
    settings: state.settings && typeof state.settings === "object" ? 1 : 0
  };
  for (const key of arrays) {
    const duplicates = duplicateIds(state[key]);
    if (duplicates.length) addIssue(issues, "duplicate_ids", `${key} contains duplicate ids`, { key, ids: duplicates });
  }
  state.schedules.forEach((item, index) => {
    if (!validDate(item.date)) addIssue(issues, "schedule_date_required", "schedule is missing a valid date", { index, id: item.id || "" });
    if (item.end_date && !validDate(item.end_date)) addIssue(issues, "schedule_end_date_invalid", "schedule has an invalid end date", { index, id: item.id || "" });
    if (validDate(item.date) && validDate(item.end_date) && item.end_date < item.date) addIssue(issues, "schedule_date_range_invalid", "schedule end date is before start date", { index, id: item.id || "" });
    if (!SCHEDULE_TYPES.has(item.type)) addIssue(issues, "invalid_schedule_type", "schedule has an unsupported type", { index, id: item.id || "", type: item.type || "" });
  });
  state.habits.forEach((item, index) => {
    if (!String(item?.name || "").trim()) addIssue(issues, "habit_name_required", "habit is missing a name", { index, id: item.id || "" });
    const dates = Array.isArray(item?.dates) ? item.dates : [];
    const invalidDates = dates.filter(date => !validDate(date));
    if (invalidDates.length) addIssue(issues, "habit_dates_invalid", "habit contains invalid completion dates", { index, id: item.id || "", dates: invalidDates });
  });
  state.focusSessions.forEach((item, index) => {
    if (!FOCUS_STATUSES.has(item.status)) addIssue(issues, "invalid_focus_status", "focus session has an unsupported status", { index, id: item.id || "", status: item.status || "" });
    if (item.endedAt < item.startedAt) addIssue(issues, "invalid_focus_range", "focus session ends before it starts", { index, id: item.id || "" });
  });
  return { ok: issues.length === 0, summary, issues };
}

export class AppStateStore {
  constructor(legacyPath, options = {}) { this.legacyPath = legacyPath; this.queue = Promise.resolve(); this.database = options.database || null; this.databaseReady = null; this.databasePath = options.databasePath || ":memory:"; }
  async ensureDatabase() {
    if (this.database?.available) return this.database;
    if (!this.databaseReady) this.databaseReady = (async () => { this.database ||= new KairosAppDatabase(this.databasePath); const status = await this.database.initialize(); if (!status.available) throw new Error("sqlite_unavailable"); return this.database; })();
    return this.databaseReady;
  }
  backupDir() { return path.join(path.dirname(this.legacyPath), "backups"); }
  backupPath(name) { return path.join(this.backupDir(), assertBackupName(name)); }
  async exists() { try { await fs.access(this.legacyPath); return true; } catch { return false; } }
  readDatabaseSnapshot() {
    try {
      const snapshot = this.database?.readAppStateSnapshot?.();
      return snapshot ? normalize(snapshot) : null;
    } catch {
      return null;
    }
  }
  async read() { await this.ensureDatabase(); const snapshot = this.readDatabaseSnapshot(); if (snapshot) return snapshot; try { const legacy = normalize(JSON.parse(await fs.readFile(this.legacyPath, "utf8"))); await this.write(legacy); return legacy; } catch { const empty = normalize(); await this.write(empty); return empty; } }
  async backupBeforeMigration(raw) {
    const backupDir = this.backupDir();
    await fs.mkdir(backupDir, { recursive: true });
    const backupPath = path.join(backupDir, backupName(raw?.version));
    await fs.copyFile(this.legacyPath, backupPath);
    return backupPath;
  }
  async backupCurrent(reason = "manual") {
    const backupDir = this.backupDir();
    await fs.mkdir(backupDir, { recursive: true });
    const raw = await this.read();
    const backupPath = path.join(backupDir, backupName(raw?.version, reason));
    await fs.writeFile(backupPath, JSON.stringify(raw, null, 2), "utf8");
    return backupPath;
  }
  async listBackups() {
    let names = [];
    try { names = await fs.readdir(this.backupDir()); } catch { return []; }
    const rows = await Promise.all(names.filter(name => /^app-state-v\d+-.+\.json$/.test(name)).map(async name => {
      const fullPath = this.backupPath(name);
      const stat = await fs.stat(fullPath).catch(() => null);
      return stat ? { name, path: fullPath, size: stat.size, created_at: stat.birthtime?.toISOString?.() || stat.mtime.toISOString() } : null;
    }));
    return rows.filter(Boolean).sort((a, b) => backupSortValue(b.name).localeCompare(backupSortValue(a.name)));
  }
  async readBackup(name) {
    const file = this.backupPath(name);
    const backupDir = path.resolve(this.backupDir());
    const resolved = path.resolve(file);
    if (!resolved.startsWith(`${backupDir}${path.sep}`)) throw new Error("invalid_backup_path");
    return JSON.parse(await fs.readFile(resolved, "utf8"));
  }
  async restoreBackup(name) {
    const raw = await this.readBackup(name);
    const currentBackup = await this.backupCurrent("before-restore");
    const restored = normalize({ ...raw, restored_from_backup: path.basename(String(name || "")), restored_at: new Date().toISOString(), last_restore_backup: currentBackup });
    return this.write(restored, { force: true });
  }
  async write(input, options = {}) { const state = normalize(input); await this.ensureDatabase(); this.queue = this.queue.catch(() => {}).then(async () => { if (!this.database?.saveAppStateSnapshot) throw new Error("sqlite_unavailable"); const current = this.readDatabaseSnapshot(); if (!options.force && current && state.revision < current.revision) throw new Error("stale_app_state"); state.revision = Math.max(current?.revision || 0, state.revision) + 1; await this.database.saveAppStateSnapshot(state); return state; }); return this.queue; }
  async initialize(legacy) {
    const snapshot = this.readDatabaseSnapshot();
    if (snapshot) return snapshot;
    if (await this.exists()) {
      try { return this.write(JSON.parse(await fs.readFile(this.legacyPath, "utf8"))); } catch {}
    }
    return this.write(legacy || {});
  }
  async mutate(change) { const state = await this.read(); const result = await change(state); await this.write(state); return { state, result }; }
  async repairSchedules() {
    return this.mutate(data => {
      const now = new Date().toISOString();
      const before = JSON.stringify(data.schedules);
      data.schedules = data.schedules.map(item => repairedSchedule(item, now));
      return { repaired: before === JSON.stringify(data.schedules) ? 0 : data.schedules.length };
    });
  }
}

const scheduleDomains = new Set(["schedules", "tasks"]);
export class AppStateRepository {
  constructor(store, domain, onChange = () => {}) { this.store = store; this.domain = domain; this.onChange = onChange; }
  key() { return scheduleDomains.has(this.domain) ? "schedules" : this.domain; }
  listFor(state) { return scheduleDomains.has(this.domain) ? state.schedules : (state[this.domain] || []); }
  matches(item) { return this.domain !== "tasks" || ["task", "deadline"].includes(item.type); }
  notify(state) { this.onChange(state); return state; }
  async query(query = {}) {
    const state = await this.store.read();
    let rows = this.listFor(state).filter(item => this.matches(item));
    if (query?.id) rows = rows.filter(item => item.id === query.id);
    if (query?.dateFrom) rows = rows.filter(item => (item.date || "") >= query.dateFrom);
    if (query?.dateTo) rows = rows.filter(item => (item.date || "") <= query.dateTo);
    return rows.slice(0, Math.min(query?.limit || 100, 100));
  }
  async create(payload = {}) {
    const { state, result } = await this.store.mutate(data => {
      const target = scheduleDomains.has(this.domain) ? data.schedules : (data[this.domain] ||= []);
      const now = new Date().toISOString();
      const item = { id: crypto.randomUUID(), ...payload, created_at: payload.created_at || now, updated_at: now };
      if (this.domain === "tasks" && !item.type) item.type = "task";
      if (scheduleDomains.has(this.domain)) assertSchedule(item, this.domain);
      target.push(item);
      return item;
    });
    this.notify(state);
    return result;
  }
  async update(payload = {}) {
    const { state, result } = await this.store.mutate(data => {
      const item = this.listFor(data).find(row => row.id === payload.id && this.matches(row));
      if (!item) throw new Error("entity_not_found");
      Object.assign(item, payload, { updated_at: new Date().toISOString() });
      if (scheduleDomains.has(this.domain)) assertSchedule(item, this.domain);
      return item;
    });
    this.notify(state);
    return result;
  }
  async delete(payload = {}) {
    const { state, result } = await this.store.mutate(data => {
      const key = this.key(), rows = data[key] || [];
      const item = rows.find(row => row.id === payload.id && this.matches(row));
      if (!item) throw new Error("entity_not_found");
      data[key] = rows.filter(row => row.id !== payload.id);
      return item;
    });
    this.notify(state);
    return result;
  }
  async delete_many(payload = {}) {
    const ids = new Set(payload.ids || []);
    const { state, result } = await this.store.mutate(data => {
      const key = this.key(), rows = data[key] || [];
      const removed = rows.filter(row => ids.has(row.id) && this.matches(row));
      if (!removed.length || removed.length !== ids.size) throw new Error("entity_not_found");
      data[key] = rows.filter(row => !ids.has(row.id));
      return removed;
    });
    this.notify(state);
    return result;
  }
}

export function createAppAdapters(store, onChange = () => {}) {
  return new Proxy({}, { get: (_target, domain) => {
    const repository = new AppStateRepository(store, domain, onChange);
    return {
      query: repository.query.bind(repository),
      create: repository.create.bind(repository),
      update: repository.update.bind(repository),
      delete: repository.delete.bind(repository),
      delete_many: repository.delete_many.bind(repository)
    };
  } });
}
