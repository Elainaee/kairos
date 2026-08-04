<script setup lang="ts">
import { onMounted } from "vue";
import { useRouter } from "vue-router";
import { useRemindersStore } from "../stores/reminders";
import { formatDate } from "../i18n";
defineProps<{open:boolean}>();
const emit=defineEmits<{close:[]}>();
const store=useRemindersStore();
const router=useRouter();
onMounted(store.load);
const timeText=(item:any)=>{const due=store.dueAt(item);return due?formatDate(due,{month:"short",day:"numeric",hour:"2-digit",minute:"2-digit"}):"";};
function details(id:string){emit("close");router.push({path:"/schedule",hash:`#schedule-${encodeURIComponent(id)}`});}
</script>
<template>
  <section v-if="open" id="kairosReminderPanel" class="kairos-reminder-panel" aria-label="Reminders panel">
    <div class="kairos-reminder-head"><h2>Reminders</h2><button type="button" aria-label="Close" @click="emit('close')">×</button></div>
    <div class="kairos-reminder-list">
      <article v-for="item in store.items" :key="item.id" class="kairos-reminder-item"><button class="kairos-reminder-dismiss" type="button" aria-label="Dismiss reminder" @click="store.dismiss(item.id)">×</button><strong>{{item.title}}</strong><p>Scheduled · {{timeText(item)}}</p><div class="kairos-reminder-actions"><button type="button" @click="store.complete(item.id)">Complete</button><button type="button" @click="store.snooze(item.id)">10 minutes</button><button type="button" @click="details(item.id)">Details</button></div></article>
      <div v-if="!store.items.length" class="kairos-reminder-empty">No reminders<br><small>Upcoming reminders will appear here.</small></div>
    </div>
  </section>
</template>
