import { computed } from "vue";
import { defineStore } from "pinia";
import { useAppStateStore } from "./app-state";

const offsets: Record<string,number> = { "5m":5,"10m":10,"15m":15,"30m":30,"1h":60,"2h":120,"1d":1440 };
export const useRemindersStore = defineStore("reminders", () => {
  const appState = useAppStateStore();
  const schedules = computed<any[]>(() => Array.isArray(appState.state.schedules) ? appState.state.schedules : []);
  const metadata = computed<Record<string,any>>(() => appState.state.reminders || {});
  const dueAt = (item:any) => { if(!item?.date || item.reminder === "none" || item.reminder == null || item.reminder === "") return null; const base = new Date(`${item.date}T${item.all_day ? "09:00" : item.start_time || "09:00"}:00`); if(Number.isNaN(base.valueOf())) return null; const numeric = Number(item.reminder); const minutes = Number.isFinite(numeric) ? numeric : offsets[item.reminder]; if(!Number.isFinite(minutes)) return null; return new Date(base.valueOf() - minutes*60000); };
  const targetAt = (item:any) => metadata.value[item.id]?.snoozedUntil ? new Date(metadata.value[item.id].snoozedUntil) : dueAt(item);
  const items = computed(() => schedules.value.filter(item => item.status !== "done" && !metadata.value[item.id]?.dismissedAt && targetAt(item)).sort((a,b)=>targetAt(a)!.valueOf()-targetAt(b)!.valueOf()).slice(0,8));
  async function load(){ if(!appState.loaded) await appState.load(); }
  async function complete(id:string){ await appState.save({ ...appState.state, schedules:schedules.value.map(item=>item.id===id?{...item,status:"done",updated_at:new Date().toISOString()}:item), reminders:{...metadata.value,[id]:{...metadata.value[id],dismissedAt:Date.now()}} }); }
  async function snooze(id:string){ await appState.save({ ...appState.state, reminders:{...metadata.value,[id]:{...metadata.value[id],snoozedUntil:Date.now()+10*60000,dismissedAt:null}} }); }
  async function dismiss(id:string){ const next={...metadata.value};delete next[id];await appState.save({ ...appState.state, schedules:schedules.value.map(item=>item.id===id?{...item,reminder:"none",updated_at:new Date().toISOString()}:item),reminders:next }); }
  return { items, dueAt: targetAt, load, complete, snooze, dismiss };
});
