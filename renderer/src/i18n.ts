import { ref } from "vue";

declare global {
  interface Window {
    KairosI18n?: {
      t: (key: string, params?: Record<string, string | number>) => string;
      plural: (key: string, count: number, params?: Record<string, string | number>) => string;
      setLocale: (preference?: string) => string;
      setTimeFormat: (preference?: string) => string;
      getLocale: () => string;
      getTimeFormat: () => string;
      formatDate: (value: number | Date, options?: Intl.DateTimeFormatOptions) => string;
      formatTime: (value: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
      formatDateRange: (start: string | number | Date, end?: string | number | Date, options?: Intl.DateTimeFormatOptions) => string;
      formatRelativeTime: (value: number, unit?: Intl.RelativeTimeFormatUnit, options?: Intl.RelativeTimeFormatOptions) => string;
    };
    KairosThemes?: {
      applyTheme: (theme?: string) => string;
      getTheme: () => string;
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

export function plural(key: string, count: number, params?: Record<string, string | number>) {
  localeVersion.value;
  return window.KairosI18n?.plural(key, count, params) || t(key, { ...params, count });
}

export function applyLocale(preference?: string) {
  return window.KairosI18n?.setLocale(preference) || "en";
}

export function applyTimeFormat(preference?: string) {
  return window.KairosI18n?.setTimeFormat(preference) || "system";
}

export function applyTheme(theme?: string) {
  return window.KairosThemes?.applyTheme(theme) || "claude-plus";
}

export function formatDate(value: number | Date, options: Intl.DateTimeFormatOptions = {}) {
  localeVersion.value;
  timeFormatVersion.value;
  return window.KairosI18n?.formatDate(value, options) || new Intl.DateTimeFormat(navigator.language || "en", options).format(value);
}

export function formatTime(value: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  localeVersion.value;
  timeFormatVersion.value;
  const match = typeof value === "string" && value.match(/^(\d{1,2}):(\d{2})$/);
  const date = match
    ? new Date(2000, 0, 1, Number(match[1]), Number(match[2]))
    : value instanceof Date
      ? value
      : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? "");
  return window.KairosI18n?.formatTime(value, options)
    || new Intl.DateTimeFormat(navigator.language || "en", { hour: "numeric", minute: "2-digit", ...options }).format(date);
}

export function formatDateRange(start: string | number | Date, end?: string | number | Date, options: Intl.DateTimeFormatOptions = {}) {
  localeVersion.value;
  timeFormatVersion.value;
  return window.KairosI18n?.formatDateRange(start, end, options) || formatDate(start instanceof Date || typeof start === "number" ? start : new Date(start), options);
}
