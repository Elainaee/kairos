import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const source = file => fs.readFile(path.join(root, file), "utf8");

test("settings migration contract: Vue hosts the original dialog instead of a duplicate", async () => {
  const original = await source("app/features/settings/settings-feature.js");
  const styles = await source("app/features/settings/settings-feature.css");
  const host = await source("renderer/src/components/SettingsDialog.vue");
  const shell = await source("renderer/src/components/AppShell.vue");

  assert.match(original, /window\.KairosSettingsFeature = Object\.freeze\(\{ open, read: \(\) => state, save: persist \}\);/,
    "the authoritative settings controller must retain its original public lifecycle");
  assert.match(original, /const buildDialog = async \(\) => \{[\s\S]*?dialog\.showModal\(\);/,
    "the authoritative settings DOM must retain its native modal lifecycle");
  assert.match(original, /const featureAssetUrl = path => new URL\(path, featureScriptUrl\)\.href;/,
    "source-owned settings assets must resolve from the original controller, not the Vue document");
  assert.match(original, /<img src="\$\{featureAssetUrl\('\.\.\/\.\.\/assets\/icons\/netease-format\.ico'\)\}" alt="" aria-hidden="true">Netease Music/,
    "the original NetEase title markup must keep its source icon in Vue hosting");
  assert.match(styles, /\.kairos-settings-dialog\[open\]\{animation:kairos-settings-enter \.16s cubic-bezier\(\.2,\.8,\.2,1\) both\}/,
    "the original settings enter animation must remain the visual source of truth");
  assert.match(host, /loadOriginalFeature\(\)[\s\S]*?\/legacy\/features\/settings\/settings-feature\.js/,
    "Vue must load the original controller rather than recreate its markup");
  assert.match(host, /KairosSettingsFeature\?\.open\?\.\(props\.opener \|\| document\.activeElement\)/,
    "Vue must pass the source button to the original focus-management contract");
  assert.match(host, /dialog\.addEventListener\("close", onOriginalClose\)/,
    "Vue visible state must follow the original dialog close event");
  assert.doesNotMatch(host, /<dialog\b|kairos-settings-panel|vue-settings-backdrop/,
    "the Vue host must not ship a second visible settings dialog");
  assert.match(shell, /<SettingsDialog :open="settingsOpen" :opener="settingsOpener" @close="settingsOpen = false"\s*\/>/,
    "the persistent Vue shell must own only the original dialog's open state");
  assert.doesNotMatch(shell, /function ensureSettingsFeature|KairosSettingsFeature/,
    "the shell must not compete with the Vue host to open a second controller instance");
});
