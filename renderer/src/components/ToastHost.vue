<script setup lang="ts">
import { useToastsStore } from "../stores/toasts";
import { t } from "../i18n";

const store = useToastsStore();
</script>

<template>
  <aside class="vue-toast-stack" :aria-label="t('common.notifications')" aria-live="polite">
    <TransitionGroup name="vue-toast">
      <article v-for="toast in store.items" :key="toast.id" class="vue-toast" :data-tone="toast.tone">
        <span class="material-symbols-outlined" aria-hidden="true">{{ toast.tone === "success" ? "check_circle" : toast.tone === "error" ? "error" : toast.tone === "warning" ? "warning" : toast.tone === "reminder" ? "notifications_active" : "info" }}</span>
        <div><strong v-if="toast.title">{{ toast.title }}</strong><p>{{ toast.message }}</p><footer v-if="toast.actions?.length"><button v-for="action in toast.actions" :key="action.label" type="button" @click="store.runAction(toast.id, action)">{{ action.label }}</button></footer></div>
        <button class="vue-toast-close" type="button" :aria-label="t('common.dismissNotification')" @click="store.remove(toast.id)"><span class="material-symbols-outlined">close</span></button>
      </article>
    </TransitionGroup>
  </aside>
</template>
