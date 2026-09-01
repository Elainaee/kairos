import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../../..");
const read = file => fs.readFile(path.join(root, file), "utf8");

test("personal profile uses narrow IPC capabilities and an internal-only portrait commit", async () => {
  const main = await read("electron/main/index.js");
  const preload = await read("electron/preload/index.cjs");
  assert.match(preload, /personalProfile: Object\.freeze\(\{[\s\S]*?get:[\s\S]*?update:[\s\S]*?refresh:[\s\S]*?finalize:[\s\S]*?clearPortrait:/);
  assert.doesNotMatch(preload, /commitPortrait|setPortraitText|savePersonalProfile/);
  assert.match(main, /commitPortrait\(await readPersonalProfile\(\)/);
  assert.match(main, /ai:personal-profile:update[\s\S]*?updatePersonalProfile\(current, \{[\s\S]*?manual: input\.manual[\s\S]*?interaction: input\.interaction/);
  assert.doesNotMatch(main, /ai:personal-profile:update[\s\S]{0,500}portrait: input\.portrait/);
});

test("one personal memory switch controls UI visibility, prompt injection, tools, and portrait refresh", async () => {
  const settings = await read("app/features/settings/settings-feature.js");
  const main = await read("electron/main/index.js");
  const agent = await read("electron/services/ai/langchain-agent.js");
  assert.match(settings, /data-profile-memory-enabled/);
  assert.match(settings, /if \(!memoryEnabled\) return `<section class="kairos-ai-card kairos-profile-card is-disabled"/);
  assert.doesNotMatch(settings, /kairosReplyStyle|kairosMemoryEnabled/);
  assert.match(main, /memoryEnabled:personalProfile\.memoryEnabled/);
  assert.match(main, /if \(!snapshot\.memoryEnabled\) return \{ updated: false, reason: "memory_disabled" \}/);
  assert.match(agent, /if \(memoryEnabled\) \{[\s\S]*?tools\.unshift/);
});

test("conversation closing, switching, and replacement finalize the active portrait without summarizing deletion", async () => {
  const chat = await read("app/features/assistant/ai-chat.js");
  assert.match(chat, /finalizeActiveConversation[\s\S]*?personalProfile\.finalize\(active\.id\)/);
  assert.match(chat, /createConversation = async \(\) => \{[\s\S]*?await finalizeActiveConversation\(\)/);
  assert.match(chat, /ui\.session[\s\S]*?await finalizeActiveConversation\(\); await loadConversation/);
  assert.match(chat, /closeAiPanel[\s\S]*?void finalizeActiveConversation\(\)/);
  assert.match(chat, /conversations\.delete\(id\)[^\n]*active = null/);
});

test("personal profile controls use semantic surfaces, visible focus, and foreground-only button hover", async () => {
  const css = await read("app/features/settings/settings-feature.css");
  assert.match(css, /\.kairos-profile-card\{[^}]*var\(--surface-raised\)[^}]*var\(--border\)/);
  assert.match(css, /\.kairos-profile-field input:focus-visible[\s\S]*?outline:2px solid var\(--ring\)/);
  assert.match(css, /\.kairos-profile-portrait>footer button:hover:not\(:disabled\)\{border-color:var\(--primary\);background:transparent;color:var\(--primary\);box-shadow:none\}/);
});
