import fs from "node:fs/promises";
import path from "node:path";

const EMPTY = { version: 1, schedules: [], checkins: [], habits: [], moods: {}, notes: [], studyPlans: [], theme: "light" };
const arrays = ["schedules", "checkins", "habits", "notes", "studyPlans"];
const SCHEDULE_TYPES = new Set(["task", "deadline", "event", "match", "holiday", "other"]);
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function normalize(input = {}) { const out = { ...structuredClone(EMPTY), ...input, version: 1 }; for (const key of arrays) if (!Array.isArray(out[key])) out[key] = []; if (!out.moods || typeof out.moods !== "object" || Array.isArray(out.moods)) out.moods = {}; return out; }
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

export class AppStateStore {
  constructor(filePath) { this.filePath = filePath; this.queue = Promise.resolve(); }
  async exists() { try { await fs.access(this.filePath); return true; } catch { return false; } }
  async read() { try { return normalize(JSON.parse(await fs.readFile(this.filePath, "utf8"))); } catch { return normalize(); } }
  async write(input) { const state = normalize(input); this.queue = this.queue.then(async () => { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.tmp`; await fs.writeFile(temp, JSON.stringify(state, null, 2), "utf8"); await fs.rename(temp, this.filePath); return state; }); return this.queue; }
  async initialize(legacy) { if (!(await this.exists())) return this.write(legacy || {}); return this.read(); }
  async mutate(change) { const state = await this.read(); const result = await change(state); await this.write(state); return { state, result }; }
  async migrateStudyPlansToSchedules() {
    return this.mutate(data => {
      const now = new Date().toISOString(); const plans = data.studyPlans || [];
      const moved = plans.map(plan => repairedSchedule({ ...plan, date: plan.date || plan.start_date, end_date: plan.end_date || plan.start_date, type: plan.type || "other", migrated_from: "studyPlans" }, now));
      if (moved.length) data.schedules.push(...moved); data.studyPlans = [];
      const before = JSON.stringify(data.schedules);
      data.schedules = data.schedules.map(item => repairedSchedule(item, now));
      return { moved: moved.length, repaired: before === JSON.stringify(data.schedules) ? 0 : data.schedules.length };
    });
  }
}

const scheduleDomains = new Set(["schedules", "tasks"]);
export function createAppAdapters(store, onChange = () => {}) {
  const listFor = (state, domain) => scheduleDomains.has(domain) ? state.schedules : (state[domain] || []);
  const matches = (item, domain) => domain !== "tasks" || ["task", "deadline"].includes(item.type);
  const notify = state => { onChange(state); return state; };
  return new Proxy({}, { get: (_target, domain) => ({
    query: async query => { const state = await store.read(); let rows = listFor(state, domain).filter(item => matches(item, domain)); if (query?.id) rows = rows.filter(item => item.id === query.id); if (query?.dateFrom) rows = rows.filter(item => (item.date || "") >= query.dateFrom); if (query?.dateTo) rows = rows.filter(item => (item.date || "") <= query.dateTo); return rows.slice(0, Math.min(query?.limit || 100, 100)); },
    create: async payload => { const { state, result } = await store.mutate(data => { const target = scheduleDomains.has(domain) ? data.schedules : (data[domain] ||= []); const now = new Date().toISOString(); const item = { id: crypto.randomUUID(), ...payload, created_at: payload.created_at || now, updated_at: now }; if (domain === "tasks" && !item.type) item.type = "task"; if (scheduleDomains.has(domain)) assertSchedule(item, domain); target.push(item); return item; }); notify(state); return result; },
    update: async payload => { const { state, result } = await store.mutate(data => { const item = listFor(data, domain).find(row => row.id === payload.id && matches(row, domain)); if (!item) throw new Error("entity_not_found"); Object.assign(item, payload, { updated_at: new Date().toISOString() }); if (scheduleDomains.has(domain)) assertSchedule(item, domain); return item; }); notify(state); return result; },
    delete: async payload => { const { state, result } = await store.mutate(data => { const key = scheduleDomains.has(domain) ? "schedules" : domain; const rows = data[key] || []; const item = rows.find(row => row.id === payload.id && matches(row, domain)); if (!item) throw new Error("entity_not_found"); data[key] = rows.filter(row => row.id !== payload.id); return item; }); notify(state); return result; },
    delete_many: async payload => { const ids = new Set(payload.ids || []); const { state, result } = await store.mutate(data => { const key = scheduleDomains.has(domain) ? "schedules" : domain; const rows = data[key] || []; const removed = rows.filter(row => ids.has(row.id) && matches(row, domain)); if (!removed.length || removed.length !== ids.size) throw new Error("entity_not_found"); data[key] = rows.filter(row => !ids.has(row.id)); return removed; }); notify(state); return result; },
  }) });
}
