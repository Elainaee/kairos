<script setup lang="ts">
import { t } from "../i18n";

defineProps<{ open: boolean }>();
const emit = defineEmits<{ choose: [action: "tray" | "exit" | "cancel"] }>();

function choose(action: "tray" | "exit" | "cancel") {
  emit("choose", action);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === "Escape") choose("cancel");
}

</script>

<template>
  <Teleport to="body">
    <Transition name="vue-close-choice">
      <div v-if="open" class="vue-close-choice-backdrop" role="presentation" @click.self="choose('cancel')">
        <section class="vue-close-choice-dialog" role="alertdialog" aria-modal="true" :aria-label="t('tray.closeTitle')" tabindex="-1" @keydown="handleKeydown">
          <div class="vue-close-choice-icon" aria-hidden="true"><span class="material-symbols-outlined">pets</span></div>
          <div class="vue-close-choice-copy">
            <h2>{{ t("tray.closeTitle") }}</h2>
            <p>{{ t("tray.closeMessage") }}</p>
          </div>
          <footer>
            <button class="vue-close-choice-cancel" type="button" @click="choose('cancel')">{{ t("common.cancel") }}</button>
            <button class="vue-close-choice-tray" type="button" @click="choose('tray')">{{ t("tray.minimizeToTray") }}</button>
            <button class="vue-close-choice-exit" type="button" @click="choose('exit')">{{ t("tray.exitKairos") }}</button>
          </footer>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>
