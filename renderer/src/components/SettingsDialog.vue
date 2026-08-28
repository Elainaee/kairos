<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, watch } from "vue";

const props = defineProps<{
  open: boolean;
  opener?: HTMLElement;
}>();
const emit = defineEmits<{ close: [] }>();

let loader: Promise<void> | undefined;
let boundDialog: HTMLDialogElement | undefined;

function originalDialog() {
  return document.querySelector<HTMLDialogElement>("dialog.kairos-settings-dialog");
}

function onOriginalClose() {
  emit("close");
}

function bindOriginalDialog() {
  const dialog = originalDialog();
  if (!dialog || dialog === boundDialog) return;
  boundDialog?.removeEventListener("close", onOriginalClose);
  boundDialog = dialog;
  dialog.addEventListener("close", onOriginalClose);
}

function loadOriginalFeature() {
  if ((window as any).KairosSettingsFeature) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-vue-settings-feature]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Unable to load settings feature")), { once: true });
      return;
    }
    const script = document.createElement("script");
    script.dataset.vueSettingsFeature = "";
    script.src = import.meta.env.DEV
      ? "/legacy/features/settings/settings-feature.js"
      : new URL("../features/settings/settings-feature.js", window.location.href).href;
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Unable to load settings feature")), { once: true });
    document.head.append(script);
  });
  return loader;
}

async function openOriginalDialog() {
  await loadOriginalFeature();
  await (window as any).KairosSettingsFeature?.open?.(props.opener || document.activeElement);
  await nextTick();
  bindOriginalDialog();
}

function closeOriginalDialog() {
  const dialog = originalDialog();
  if (dialog?.open) dialog.close();
}

watch(() => props.open, value => {
  if (value) void openOriginalDialog().catch(() => emit("close"));
  else closeOriginalDialog();
});

onMounted(() => {
  if (props.open) void openOriginalDialog().catch(() => emit("close"));
});

onBeforeUnmount(() => {
  boundDialog?.removeEventListener("close", onOriginalClose);
  closeOriginalDialog();
});
</script>

<template>
  <!-- The original controller owns the exact dialog DOM, CSS and animations.
       Vue deliberately owns only its visible state and lifecycle. -->
  <span hidden aria-hidden="true" />
</template>
