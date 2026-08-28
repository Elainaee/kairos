import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../../..");

async function createI18n(languages) {
  const listeners = new Map();
  const document = {
    documentElement: { lang: "", dir: "", dataset: {} },
    querySelectorAll: () => []
  };
  const window = {
    navigator: { languages, language: languages[0] },
    addEventListener: (type, listener) => listeners.set(type, listener),
    dispatchEvent: event => listeners.get(event.type)?.(event)
  };
  const context = { window, document, navigator: window.navigator, CustomEvent: class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } } };
  vm.runInNewContext(await fs.readFile(path.join(root, "app/i18n/i18n-messages.js"), "utf8"), context);
  vm.runInNewContext(await fs.readFile(path.join(root, "app/i18n/i18n-core.js"), "utf8"), context);
  return { api: window.KairosI18n, document };
}

test("i18n resolves system locales and normalizes persisted language aliases", async () => {
  const { api, document } = await createI18n(["zh-Hans-CN", "en-US"]);
  assert.equal(api.resolveLocale("system"), "zh-CN");
  assert.equal(api.normalizeLocale("zh"), "zh-CN");
  assert.equal(api.normalizeLocale("en-GB"), "en");
  assert.equal(api.setLocale("zh"), "zh-CN");
  assert.equal(document.documentElement.lang, "zh-CN");
  assert.equal(api.t("settings.export"), "导出");
  assert.equal(api.t("time.minutesBefore", { count: 10 }), "提前 10 分钟");
});

test("i18n falls back to English for unsupported language preferences and missing keys", async () => {
  const { api, document } = await createI18n(["fr-FR"]);
  assert.equal(api.setLocale("fr-FR"), "en");
  assert.equal(document.documentElement.lang, "en");
  assert.equal(api.t("nav.calendar"), "Calendar");
  assert.equal(api.t("unknown.key"), "unknown.key");
});

test("i18n selects plural forms and exposes locale-aware date helpers", async () => {
  const { api } = await createI18n(["en-US"]);
  assert.equal(api.plural("habits.dayCount", 1), "1 day");
  assert.equal(api.plural("habits.dayCount", 2), "2 days");
  api.setLocale("zh-CN");
  assert.equal(api.plural("habits.dayCount", 2), "2 天");
  assert.match(api.formatDateRange("2026-08-13", "2026-08-14", { year: "numeric", month: "short", day: "numeric" }), /2026/);
  assert.equal(api.formatRelativeTime(-1, "day"), "昨天");
});

test("i18n applies the selected clock format without changing stored time values", async () => {
  const { api } = await createI18n(["en-US"]);
  assert.equal(api.setTimeFormat("12h"), "12h");
  assert.match(api.formatTime("13:05"), /1:05/);
  assert.equal(api.setTimeFormat("24h"), "24h");
  assert.match(api.formatTime("13:05"), /13:05/);
  assert.equal(api.getTimeFormat(), "24h");
});

test("i18n formats Date instances through the same language and clock pipeline", async () => {
  const { api } = await createI18n(["en-US"]);
  api.setTimeFormat("12h");
  assert.match(api.formatTime(new Date(2026, 7, 13, 13, 5)), /1:05/);
  api.setLocale("zh-CN");
  api.setTimeFormat("24h");
  assert.match(api.formatTime(new Date(2026, 7, 13, 13, 5)), /13:05/);
});
