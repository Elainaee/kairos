import { defineStore } from "pinia";
import { ref } from "vue";

export type ToastTone = "message" | "success" | "warning" | "error" | "reminder";
export type ToastAction = { label: string; run: () => void | Promise<void> };
export type ToastInput = {
  id?: string;
  title?: string;
  message: string;
  tone?: ToastTone;
  duration?: number;
  actions?: ToastAction[];
};
export type ToastItem = ToastInput & { id: string; tone: ToastTone };

export const useToastsStore = defineStore("toasts", () => {
  const items = ref<ToastItem[]>([]);
  const timers = new Map<string, number>();

  function remove(id: string) {
    const timer = timers.get(id);
    if (timer) window.clearTimeout(timer);
    timers.delete(id);
    items.value = items.value.filter(item => item.id !== id);
  }

  function show(input: ToastInput) {
    const id = input.id || `toast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
    remove(id);
    items.value.push({ ...input, id, tone: input.tone || "message" });
    const duration = input.duration ?? (input.actions?.length ? 8000 : 2800);
    if (duration > 0) timers.set(id, window.setTimeout(() => remove(id), duration));
    return id;
  }

  async function runAction(id: string, action: ToastAction) {
    try { await action.run(); } finally { remove(id); }
  }

  return { items, show, remove, runAction };
});
