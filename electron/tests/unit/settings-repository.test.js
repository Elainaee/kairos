import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SettingsRepository } from "../../data/settings/index.js";

test("settings repository serializes SQLite writes without creating a JSON state file", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-settings-"));
  const filePath = path.join(dir, "settings.json");
  const snapshots = [];
  let saved = null;
  const repository = new SettingsRepository({
    filePath,
    defaults: { theme: "light", count: 0 },
    normalize: value => ({ theme: value?.theme || "light", count: Number(value?.count || 0) }),
    database: { saveStorePayload: (...args) => { snapshots.push(args); saved = args[1]; }, readStorePayload: () => saved },
    storeKey: "desktop-settings",
    summarize: value => ({ theme: value.theme })
  });

  await Promise.all([
    repository.write({ theme: "dark", count: 1 }),
    repository.write({ theme: "light", count: 2 })
  ]);

  assert.deepEqual(await repository.read(), { theme: "light", count: 2 });
  assert.equal(snapshots.length, 2);
  assert.deepEqual(snapshots.at(-1), ["desktop-settings", { theme: "light", count: 2 }, { theme: "light" }]);
  await assert.rejects(fs.access(filePath));
  await fs.rm(dir, { recursive: true, force: true });
});

test("settings repository restores the SQLite snapshot when its JSON state is unavailable", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-settings-"));
  const filePath = path.join(dir, "settings.json");
  const repository = new SettingsRepository({
    filePath,
    defaults: { theme: "light" },
    normalize: value => ({ theme: value?.theme || "light" }),
    database: { readStorePayload: key => key === "desktop-settings" ? { theme: "dark" } : null },
    storeKey: "desktop-settings"
  });

  assert.deepEqual(await repository.read(), { theme: "dark" });
  await assert.rejects(fs.access(filePath));
  await fs.rm(dir, { recursive: true, force: true });
});
