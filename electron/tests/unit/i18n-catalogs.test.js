import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const root = path.resolve(import.meta.dirname, "../../..");
const validator = path.join(root, "scripts", "validate-i18n.cjs");

const flatten = (value, prefix = "", target = {}) => {
  for (const [key, child] of Object.entries(value || {})) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) flatten(child, fullKey, target);
    else target[fullKey] = child;
  }
  return target;
};

test("i18n catalog validation rejects missing and extra translation keys", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "kairos-i18n-catalog-"));
  try {
    await writeFile(path.join(directory, "en.json"), JSON.stringify({ common: { save: "Save", cancel: "Cancel" } }), "utf8");
    await writeFile(path.join(directory, "zh-CN.json"), JSON.stringify({ common: { save: "保存", extra: "多余" } }), "utf8");
    const result = spawnSync(process.execPath, [validator], {
      env: { ...process.env, KAIROS_I18N_DIR: directory },
      encoding: "utf8"
    });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /missing keys: common\.cancel/);
    assert.match(result.stderr, /extra keys: common\.extra/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("every static data-i18n annotation in the shipped UI resolves in both catalogs", async () => {
  const sources = [
    "app/pages/ai-chat/index.html",
    "app/pages/calendar/index.html",
    "app/pages/music/index.html",
    "app/pages/pet/index.html",
    "app/pages/schedule/index.html",
    "renderer/index.html"
  ];
  const [english, chinese] = await Promise.all([
    readFile(path.join(root, "app/i18n/locales/en.json"), "utf8").then(JSON.parse),
    readFile(path.join(root, "app/i18n/locales/zh-CN.json"), "utf8").then(JSON.parse)
  ]);
  const catalogs = [flatten(english), flatten(chinese)];
  const keys = new Set();
  for (const source of sources) {
    const html = await readFile(path.join(root, source), "utf8");
    for (const match of html.matchAll(/\bdata-i18n(?:-(?:placeholder|title|aria-label|alt|value))?="([\w.-]+)"/g)) keys.add(match[1]);
  }
  assert.ok(keys.size > 0, "the shipped UI should contain static i18n annotations");
  for (const key of keys) {
    for (const catalog of catalogs) assert.equal(typeof catalog[key], "string", `missing catalog entry: ${key}`);
  }
});
