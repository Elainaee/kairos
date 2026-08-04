<script setup lang="ts">
import { computed, nextTick, onMounted, reactive, ref } from "vue";
import { useAppStateStore } from "../stores/app-state";
import { useToastsStore } from "../stores/toasts";
import { formatTime } from "../i18n";

type Status = "todo" | "doing" | "done" | "overdue";
type Schedule = { id:string; title:string; notes?:string; date:string; end_date?:string; type?:string; status?:Status; all_day?:boolean; start_time?:string; end_time?:string; priority?:string; reminder?:string; created_at?:string; updated_at?:string };
type CalendarDay = { key:string; day:number; inMonth:boolean };

const appState = useAppStateStore();
const toasts = useToastsStore();
const activeFilter = ref("all");
const typeFilter = ref("all");
const typeMenuOpen = ref(false);
const query = ref("");
const editorOpen = ref(false);
const editorDialog = ref<HTMLDialogElement>();
const editingId = ref("");
const rangeOpen = ref(false);
const rangeAnchor = ref<string | null>(null);
const rangeCursor = ref(new Date());
const form = reactive<Schedule>({ id:"", title:"", notes:"", date:"", end_date:"", type:"task", status:"todo", all_day:false, start_time:"", end_time:"", priority:"medium", reminder:"none" });
const typeLabels:Record<string,string> = { task:"Task", deadline:"Deadline", event:"Event", match:"Match", holiday:"Holiday", other:"Other" };
const statusLabels:Record<string,string> = { todo:"To Do", doing:"In Progress", done:"Completed", overdue:"Overdue" };
const weekDays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const monthFormatter = new Intl.DateTimeFormat("en-US", { month:"long", year:"numeric" });
const dateFormatter = new Intl.DateTimeFormat("en-US", { month:"short", day:"numeric", year:"numeric" });
const today = () => new Date().toISOString().slice(0,10);
const schedules = computed<Schedule[]>(() => Array.isArray(appState.state.schedules) ? appState.state.schedules as Schedule[] : []);
const normalizedStatus = (item:Schedule):Status => {
  if (item.status === "done" || item.status === "doing") return item.status;
  const end = `${item.end_date || item.date}T${item.all_day ? "23:59" : item.end_time || item.start_time || "23:59"}`;
  return end < new Date().toISOString().slice(0,16) ? "overdue" : "todo";
};
const filtered = computed(() => schedules.value.filter(item => {
  const status = normalizedStatus(item);
  const matchesFilter = activeFilter.value === "all" || status === activeFilter.value;
  const text = `${item.title} ${item.notes || ""} ${typeLabels[item.type || ""] || ""}`.toLowerCase();
  return matchesFilter && (typeFilter.value === "all" || item.type === typeFilter.value) && text.includes(query.value.trim().toLowerCase());
}).sort((a,b) => `${b.date || ""}${b.start_time || ""}`.localeCompare(`${a.date || ""}${a.start_time || ""}`)));
const counts = computed(() => ({
  doing:schedules.value.filter(item => normalizedStatus(item) === "doing").length,
  done:schedules.value.filter(item => normalizedStatus(item) === "done").length,
  todo:schedules.value.filter(item => normalizedStatus(item) === "todo").length,
  overdue:schedules.value.filter(item => normalizedStatus(item) === "overdue").length
}));
const rangeMonths = computed(() => [0, 1].map(offset => {
  const date = new Date(rangeCursor.value.getFullYear(), rangeCursor.value.getMonth() + offset, 1);
  return { label:monthFormatter.format(date), days:monthGrid(date.getFullYear(), date.getMonth()) };
}));
const rangeLabel = computed(() => {
  if (!form.date) return "Select a date range";
  const start = dateFormatter.format(fromKey(form.date));
  return !form.end_date || form.end_date === form.date ? start : `${start} – ${dateFormatter.format(fromKey(form.end_date))}`;
});

function keyFor(date:Date) { return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; }
function fromKey(key:string) { const [year, month, day] = key.split("-").map(Number); return new Date(year, month - 1, day); }
function monthGrid(year:number, month:number):CalendarDay[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length:42 }, (_, index) => {
    const day = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
    return { key:keyFor(day), day:day.getDate(), inMonth:day.getMonth() === month };
  });
}
function isRangeEdge(key:string) { return key === form.date || key === form.end_date; }
function isInRange(key:string) { return Boolean(form.date && form.end_date && key >= form.date && key <= form.end_date); }
function moveRangeMonth(offset:number) { rangeCursor.value = new Date(rangeCursor.value.getFullYear(), rangeCursor.value.getMonth() + offset, 1); }
function toggleRange() {
  rangeOpen.value = !rangeOpen.value;
  rangeAnchor.value = null;
  if (form.date) { const date = fromKey(form.date); rangeCursor.value = new Date(date.getFullYear(), date.getMonth(), 1); }
}
function selectRangeDate(key:string) {
  if (!rangeAnchor.value) { rangeAnchor.value = key; form.date = key; form.end_date = key; return; }
  form.date = key < rangeAnchor.value ? key : rangeAnchor.value;
  form.end_date = key < rangeAnchor.value ? rangeAnchor.value : key;
  rangeAnchor.value = null;
  rangeOpen.value = false;
}
async function saveSchedules(next:Schedule[]) { await appState.save({ ...appState.state, schedules:next }); }
async function setComplete(item:Schedule, complete:boolean) {
  await saveSchedules(schedules.value.map(row => row.id === item.id ? { ...row, status:complete ? "done" : "todo", updated_at:new Date().toISOString() } : row));
  toasts.show({ message:complete ? `${item.title} completed` : `${item.title} reopened`, tone:complete ? "success" : "message" });
  if (complete) await window.kairosDesktop?.pet?.react?.("happy", { title:item.title });
}
async function setVisibleComplete(event:Event) {
  const complete = (event.target as HTMLInputElement).checked;
  const ids = new Set(filtered.value.map(item => item.id));
  const now = new Date().toISOString();
  await saveSchedules(schedules.value.map(item => ids.has(item.id) ? { ...item, status:complete ? "done" : "todo", updated_at:now } : item));
  if (ids.size) toasts.show({ message:complete ? `${ids.size} schedules completed` : `${ids.size} schedules reopened`, tone:complete ? "success" : "message" });
}
async function openEditor(item?:Schedule) {
  const value = item || { id:"", title:"", notes:"", date:today(), end_date:today(), type:"task", status:"todo", all_day:false, start_time:"", end_time:"", priority:"medium", reminder:"none" };
  Object.assign(form, value); editingId.value = item?.id || ""; rangeOpen.value = false; rangeAnchor.value = null;
  const date = fromKey(form.date || today()); rangeCursor.value = new Date(date.getFullYear(), date.getMonth(), 1);
  editorOpen.value = true;
  await nextTick();
  if (editorDialog.value && !editorDialog.value.open) editorDialog.value.showModal();
}
function closeEditor() { rangeOpen.value = false; editorDialog.value?.close(); }
function onDialogClose() { editorOpen.value = false; }
async function saveEditor() {
  if (!form.title.trim() || !form.date) return;
  const now = new Date().toISOString();
  const data:Schedule = { ...form, id:editingId.value || `schedule-${Date.now().toString(36)}`, title:form.title.trim(), end_date:form.end_date || form.date, created_at:editingId.value ? form.created_at : now, updated_at:now };
  if (data.end_date! < data.date) { toasts.show({ message:"The end date cannot be earlier than the start date.", tone:"warning" }); return; }
  if (!data.all_day && data.date === data.end_date && data.start_time && data.end_time && data.end_time < data.start_time) { toasts.show({ message:"The end time cannot be earlier than the start time.", tone:"warning" }); return; }
  await saveSchedules(editingId.value ? schedules.value.map(row => row.id === editingId.value ? data : row) : [...schedules.value, data]);
  closeEditor(); toasts.show({ message:"Schedule saved", tone:"success" });
}
async function removeEditor() { if (!editingId.value) return; await saveSchedules(schedules.value.filter(row => row.id !== editingId.value)); closeEditor(); toasts.show({message:"Schedule deleted", tone:"message"}); }
function formatDate(item:Schedule) { const range=item.end_date && item.end_date!==item.date ? ` – ${item.end_date}` : ""; return `${item.date}${range}${item.all_day ? " · All day" : item.start_time ? ` · ${formatTime(item.start_time)}` : ""}`; }
onMounted(async () => { if (!appState.loaded) await appState.load(); if (location.hash.startsWith("#schedule-")) { const id=decodeURIComponent(location.hash.slice(10)); const found=schedules.value.find(item=>item.id===id); if(found) void openEditor(found); } });
</script>

<template>
  <main class="schedule-view kairos-page-main">
    <header class="schedule-head"><div><h1>Schedule Overview</h1></div></header>
    <section class="schedule-cards" aria-label="Schedule overview">
      <button v-for="card in [{key:'doing',label:'In Progress',detail:'Current activity',caption:'Schedules currently in progress',icon:'autorenew'},{key:'done',label:'Completed',detail:'Completion status',caption:'Schedules marked as completed',icon:'done_all'},{key:'todo',label:'To Do',detail:'Pending schedules',caption:'Schedules waiting to be completed',icon:'pending_actions'},{key:'overdue',label:'Overdue',detail:'Needs attention',caption:'Unfinished items past their due time',icon:'priority_high'}]" :key="card.key" class="schedule-card" :class="{active:activeFilter===card.key}" @click="activeFilter=card.key"><span class="schedule-card-label">{{card.label}}</span><strong>{{ counts[card.key as keyof typeof counts] }}</strong><span class="schedule-card-trend"><span class="material-symbols-outlined">{{card.icon}}</span>{{card.key==='done'?'Done':card.key==='doing'?'Active':card.key==='overdue'?'Review':'Pending'}}</span><span class="schedule-card-detail">{{card.detail}}<small>{{card.caption}}</small></span></button>
    </section>
    <section class="schedule-workspace"><div class="schedule-toolbar"><div class="schedule-tabs"><button v-for="tab in [['all','All Schedules'],['doing','In Progress'],['done','Completed'],['todo','To Do'],['overdue','Overdue']]" :key="tab[0]" :class="{active:activeFilter===tab[0]}" @click="activeFilter=tab[0]">{{tab[1]}} <small v-if="tab[0]!=='all'">{{counts[tab[0] as keyof typeof counts]}}</small></button></div><div class="schedule-tools"><input v-model="query" type="search" placeholder="Search schedules..." aria-label="Search schedules"><div class="schedule-filter-control"><button id="scheduleFilterButton" class="schedule-filter-button" type="button" :class="{active:typeMenuOpen}" :aria-expanded="typeMenuOpen" aria-haspopup="menu" @click="typeMenuOpen=!typeMenuOpen"><span class="material-symbols-outlined">filter_list</span>{{typeFilter==='all'?'All Types':typeLabels[typeFilter]}}</button><div v-show="typeMenuOpen" class="schedule-filter-menu" role="menu"><button v-for="(label,key) in {all:'All Types',...typeLabels}" :key="key" type="button" role="menuitemradio" :aria-checked="typeFilter===key" @click="typeFilter=key;typeMenuOpen=false"><span>{{label}}</span><span class="material-symbols-outlined">check</span></button></div></div></div></div>
      <div class="schedule-table-wrap"><table><thead><tr><th><input type="checkbox" :checked="filtered.length>0 && filtered.every(item=>normalizedStatus(item)==='done')" aria-label="Mark visible schedules complete" @change="setVisibleComplete"></th><th>Schedule</th><th>Status</th><th>Date</th><th>Type</th><th></th></tr></thead><tbody><tr v-if="!filtered.length"><td colspan="6" class="schedule-empty">No schedules yet.</td></tr><tr v-for="item in filtered" :key="item.id" :id="`schedule-${item.id}`"><td><input type="checkbox" :checked="normalizedStatus(item)==='done'" :aria-label="`Mark ${item.title} complete`" @change="setComplete(item,($event.target as HTMLInputElement).checked)"></td><td class="schedule-title"><strong>{{item.title}}</strong><small>{{item.notes || 'Synced from the main calendar'}}</small></td><td><span class="schedule-status" :data-status="normalizedStatus(item)"><i></i>{{statusLabels[normalizedStatus(item)]}}</span></td><td>{{formatDate(item)}}</td><td><span class="schedule-type">{{typeLabels[item.type || 'task'] || 'Schedule'}}</span></td><td><button class="schedule-more" :aria-label="`Edit ${item.title}`" @click="openEditor(item)"><span class="material-symbols-outlined">more_horiz</span></button></td></tr></tbody></table></div><footer class="schedule-footer"><span>{{filtered.length}} {{filtered.length===1?'schedule':'schedules'}}</span><span class="schedule-pager">Page 1 of 1<button type="button" disabled aria-label="Previous page"><span class="material-symbols-outlined">chevron_left</span></button><button type="button" disabled aria-label="Next page"><span class="material-symbols-outlined">chevron_right</span></button></span></footer>
    </section>
  </main>
  <dialog v-if="editorOpen" ref="editorDialog" class="schedule-native-dialog" aria-labelledby="scheduleEditorTitle" @close="onDialogClose">
    <form class="schedule-form" @submit.prevent="saveEditor">
      <header class="schedule-form-head"><h2 id="scheduleEditorTitle">{{editingId?'Edit Schedule':'Add Schedule'}}</h2><button type="button" aria-label="Close" @click="closeEditor"><span class="material-symbols-outlined">close</span></button></header>
      <div class="schedule-form-body">
        <div class="schedule-form-grid">
          <label class="schedule-field full">Title<input v-model="form.title" required></label>
          <label class="schedule-field">Type<select v-model="form.type"><option v-for="(label,key) in typeLabels" :key="key" :value="key">{{label}}</option></select></label>
          <div class="schedule-field full schedule-range-field"><span>Date range</span><button class="schedule-range-trigger" type="button" :aria-expanded="rangeOpen" @click="toggleRange"><span class="material-symbols-outlined">calendar_month</span><span>{{rangeLabel}}</span></button><section v-show="rangeOpen" class="schedule-range-popover"><header><button type="button" aria-label="Previous month" @click="moveRangeMonth(-1)">‹</button><strong>Select a date range</strong><button type="button" aria-label="Next month" @click="moveRangeMonth(1)">›</button></header><div class="schedule-range-months"><section v-for="month in rangeMonths" :key="month.label" class="schedule-range-month"><h4>{{month.label}}</h4><div class="schedule-range-week"><span v-for="weekday in weekDays" :key="weekday">{{weekday}}</span></div><div class="schedule-range-days"><button v-for="day in month.days" :key="day.key" type="button" :class="{outside:!day.inMonth, edge:isRangeEdge(day.key), 'in-range':isInRange(day.key) && !isRangeEdge(day.key)}" @click="selectRangeDate(day.key)">{{day.day}}</button></div></section></div></section></div>
          <label class="schedule-field full schedule-all-day"><input v-model="form.all_day" type="checkbox"> All-day schedule</label>
          <label class="schedule-field time">Start Time<input v-model="form.start_time" type="time" :disabled="form.all_day"></label><label class="schedule-field time">End Time<input v-model="form.end_time" type="time" :disabled="form.all_day"></label>
          <label class="schedule-field">Reminder<select v-model="form.reminder"><option value="none">No reminder</option><option value="0">At start time</option><option value="10">10 minutes before</option><option value="30">30 minutes before</option><option value="60">1 hour before</option><option value="1440">1 day before</option></select></label><label class="schedule-field">Status<select v-model="form.status"><option value="todo">To Do</option><option value="doing">In Progress</option><option value="done">Completed</option></select></label>
          <label class="schedule-field full">Notes<textarea v-model="form.notes" rows="3"></textarea></label>
        </div>
      </div>
      <footer class="schedule-dialog-actions"><button v-if="editingId" class="schedule-danger" type="button" @click="removeEditor">Delete</button><span></span><button type="button" @click="closeEditor">Cancel</button><button class="schedule-primary" type="submit">Save</button></footer>
    </form>
  </dialog>
</template>
