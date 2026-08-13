import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "../../..");

test("theme core keeps Claude + as the stable default", async () => {
  const events = [];
  const classes = new Set();
  const document = {
    currentScript: { src: "https://example.test/themes/theme-core.js" },
    documentElement: { dataset: {}, classList: { toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name) } },
    querySelector: () => null,
    createElement: () => ({ dataset: {} }),
    head: { append: () => {} }
  };
  const window = { dispatchEvent: event => events.push(event) };
  const CustomEvent = class { constructor(type, init = {}) { this.type = type; this.detail = init.detail; } };
  vm.runInNewContext(await fs.readFile(path.join(root, "app/themes/theme-core.js"), "utf8"), { window, document, CustomEvent, URL });

  assert.equal(window.KairosThemes.getTheme(), "claude-plus");
  assert.equal(window.KairosThemes.applyTheme("dark"), "claude-plus");
  assert.equal(document.documentElement.dataset.kairosTheme, "claude-plus");
  assert.ok(classes.has("kairos-theme-claude-plus"));
  assert.equal(JSON.stringify(window.KairosThemes.list()), JSON.stringify([{ id: "claude-plus", name: "Claude +", description: "Warm, editorial neutrals with a terracotta primary colour." }]));
  assert.ok(events.some(event => event.type === "kairos:theme-changed"));
});
