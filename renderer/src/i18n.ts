import { ref } from "vue";

declare global {
  interface Window {
    KairosI18n?: {
      t: (key: string, params?: Record<string, string | number>) => string;
      setLocale: (preference?: string) => string;
      setTimeFormat: (preference?: string) => string;
      getLocale: () => string;
      getTimeFormat: () => string;
      formatDate: (value: number | Date, options?: Intl.DateTimeFormatOptions) => string;
      formatTime: (value: string, options?: Intl.DateTimeFormatOptions) => string;
    };
  }
}

export const localeVersion = ref(0);
export const timeFormatVersion = ref(0);
window.addEventListener("kairos:locale-changed", () => { localeVersion.value += 1; });
window.addEventListener("kairos:time-format-changed", () => { timeFormatVersion.value += 1; });

export function t(key: string, params?: Record<string, string | number>) {
  localeVersion.value;
  return window.KairosI18n?.t(key, params) || key;
}

export function applyLocale(preference?: string) {
  return window.KairosI18n?.setLocale(preference) || "en";
}

export function applyTimeFormat(preference?: string) {
  return window.KairosI18n?.setTimeFormat(preference) || "system";
}

export function formatDate(value: number | Date, options: Intl.DateTimeFormatOptions = {}) {
  localeVersion.value;
  timeFormatVersion.value;
  return window.KairosI18n?.formatDate(value, options) || new Intl.DateTimeFormat("en", options).format(value);
}

export function formatTime(value: string, options: Intl.DateTimeFormatOptions = {}) {
  localeVersion.value;
  timeFormatVersion.value;
  return window.KairosI18n?.formatTime(value, options) || value;
}
