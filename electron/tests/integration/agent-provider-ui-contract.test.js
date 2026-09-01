import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const read = file => fs.readFile(path.join(root, file), "utf8");

test("Agent settings keep provider, web search, and personal profile as three themed areas", async () => {
  const source = await read("app/features/settings/settings-feature.js");
  assert.match(source, /card\(t\('settings\.providerConfiguration'[\s\S]*?card\(t\('settings\.searchConfiguration'[\s\S]*?personalProfileMarkup\(\)/);
  assert.match(source, /kairos-provider-list[\s\S]*?kairos-provider-detail/);
  assert.match(source, /credentialRow\('firecrawl'[\s\S]*?kairosWebSearchMode/);
  assert.match(source, /data-profile-memory-enabled/);
  assert.match(source, /data-profile-field="longTermGoals"/);
  assert.match(source, /data-refresh-personal-portrait/);
  assert.doesNotMatch(source, /kairosReplyStyle|kairosMemoryEnabled/);
  assert.doesNotMatch(source, /data-test-firecrawl|testFirecrawl|test-firecrawl/i);
});

test("Provider workspace has narrow navigation, visible focus, and foreground-only hover", async () => {
  const css = await read("app/features/settings/settings-feature.css");
  assert.match(css, /\.kairos-provider-workspace\{[^}]*grid-template-columns:minmax\(176px, \.72fr\) minmax\(0,1\.8fr\)/);
  assert.doesNotMatch(css, /\.kairos-provider-workspace\{[^}]*overflow:hidden/);
  assert.match(css, /@media\(max-width:760px\)[\s\S]*?\.kairos-provider-workspace\.is-detail-open \.kairos-provider-list\{display:none\}/);
  assert.match(css, /\.kairos-provider-list-item:focus-visible[^{]*\{outline:2px solid var\(--ring\)/);
  assert.match(css, /\.kairos-provider-list-item:hover\{border-color:var\(--primary\);background:transparent;color:var\(--primary\);box-shadow:none\}/);
  assert.match(css, /data-settings-panel="agent"[\s\S]*?background:transparent;color:var\(--primary\);box-shadow:none/);
});

test("Provider models use one collapsible visibility picker without per-model verification buttons", async () => {
  const source = await read("app/features/settings/settings-feature.js");
  const css = await read("app/features/settings/settings-feature.css");
  const main = await read("electron/main/index.js");
  const preload = await read("electron/preload/index.cjs");
  const toggleHandlerStart = source.indexOf("dialog.querySelectorAll('[data-provider-model-toggle]').forEach");
  const toggleHandlerEnd = source.indexOf("dialog.querySelector('[data-provider-default-model]')", toggleHandlerStart);
  const toggleHandler = source.slice(toggleHandlerStart, toggleHandlerEnd);
  assert.match(source, /<section class="kairos-model-picker kairos-provider-models" data-model-picker>/);
  assert.match(source, /data-model-picker-toggle aria-expanded="false"/);
  assert.match(source, /data-model-picker-drawer hidden/);
  assert.doesNotMatch(source, /<details class="kairos-model-picker kairos-provider-models"/);
  assert.match(source, /data-provider-model-toggle/);
  assert.match(source, /data-provider-default-model/);
  assert.doesNotMatch(source, /data-verify-provider-model|verifyProviderModel|Verify & enable|modelAutoVerifying/);
  assert.doesNotMatch(source, /providerModelsSelectedHint|modelVerification/);
  assert.doesNotMatch(`${main}\n${preload}`, /ai:verify-provider-model|verifyProviderModel|verifyProviderToolCalling/);
  assert.doesNotMatch(source, /catalogEntry\?\.enabledModels\?\.length/);
  assert.doesNotMatch(toggleHandler, /\brender\s*\(/);
  assert.doesNotMatch(toggleHandler, /querySelectorAll\('\[data-provider-model-toggle\]'\)[\s\S]*?control\.disabled/);
  assert.match(toggleHandler, /providerModelSaveQueue\.then\(\(\) => saveProvider/);
  assert.match(toggleHandler, /syncModelPickerUi\(changedInput, scrollSnapshot\)/);
  assert.doesNotMatch(source, /inputs\.forEach\(input => \{[\s\S]*?check_box_outline_blank/);
  assert.doesNotMatch(source, /select\.replaceChildren\(\.\.\.options\)/);
  assert.match(source, /providerModelScrollSnapshot = readProviderModelScroll\(\)/);
  assert.match(source, /requestAnimationFrame\(\(\) => restoreProviderModelScroll\(scrollSnapshot\)\)/);
  assert.match(css, /\.kairos-provider-model-choice input\{grid-area:1\/1;[^}]*opacity:0/);
  assert.match(source, /saveProvider\(\{ provider, model, enabledModels: checkedModels \}, \{ rerender: false \}\)/);
  assert.match(source, /data-make-default-provider>\$\{t\('settings\.makeDefaultProvider'/);
  assert.match(css, /\.kairos-provider-model-list\{max-height:232px;overflow:auto/);
  assert.doesNotMatch(css, /\.kairos-provider-model-choice:has\(/);
  assert.match(css, /\.kairos-provider-model-choice\.is-selected>\.material-symbols-outlined/);
});

test("Settings rebuilds off-DOM so a large provider catalog cannot expose an empty content frame", async () => {
  const source = await read("app/features/settings/settings-feature.js");
  assert.match(source, /const template = document\.createElement\('template'\);\s*template\.innerHTML = `/);
  assert.match(source, /dialog\.replaceChildren\(template\.content\);/);
  assert.doesNotMatch(source, /dialog\.innerHTML = `/);
  assert.match(source, /data-settings-panel="\$\{id\}" \$\{id === activeSection \? '' : 'hidden'\}/);
});
