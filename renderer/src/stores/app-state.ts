import { defineStore } from "pinia";
import { ref } from "vue";

export const useAppStateStore = defineStore("app-state", () => {
  const state = ref<Record<string, any>>({});
  const loaded = ref(false);

  async function load() {
    state.value = await window.kairosDesktop?.appState?.get?.() ?? {};
    loaded.value = true;
    return state.value;
  }

  async function save(next: Record<string, any>) {
    const payload = JSON.parse(JSON.stringify(next)) as Record<string, any>;
    state.value = window.kairosDesktop?.appState?.save
      ? await window.kairosDesktop.appState.save(payload)
      : payload;
    return state.value;
  }

  function sync(next: Record<string, any>) {
    state.value = JSON.parse(JSON.stringify(next || {}));
    loaded.value = true;
  }

  return { state, loaded, load, save, sync };
});
