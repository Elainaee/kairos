import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const read = file => fs.readFile(path.join(root, file), "utf8");

test("SQLite is the only business persistence target", async () => {
  const [main, sqlite, appState, aiData, music, settings, preload] = await Promise.all([
    read("electron/main/index.js"), read("electron/data/sqlite/index.js"), read("electron/data/app-state/index.js"), read("electron/services/ai/data-store.js"), read("electron/services/music/music-library.js"), read("electron/data/settings/index.js"), read("electron/preload/index.cjs")
  ]);
  assert.match(sqlite, /CREATE TABLE IF NOT EXISTS store_payloads/);
  assert.match(sqlite, /CREATE TABLE IF NOT EXISTS binary_assets/);
  assert.match(sqlite, /DROP TABLE json_store_snapshots/);
  assert.match(sqlite, /DROP TABLE app_study_plans/);
  for (const source of [appState, aiData, music, settings]) assert.match(source, /save(?:AppStateSnapshot|StorePayload)/);
  assert.doesNotMatch(`${appState}\n${aiData}\n${music}\n${settings}`, /writeFile\([^\n]*(?:app-state|ai-data|music-state|ai-settings)/);
  assert.match(main, /cleanupMigratedLegacyData/);
  assert.match(preload, /updateRuntime: \(patch\) => ipcRenderer\.invoke\("music:update-runtime", patch\)/);
});

test("renderers do not persist business state in Local Storage", async () => {
  const files = ["app/features/calendar/schedule-feature.js", "app/features/habits/habits-feature.js", "app/features/notes/notes-feature.js", "app/features/reminders/reminder-feature.js", "app/features/settings/settings-feature.js", "app/shell/player/music-player.js", "app/pages/music/index.html"];
  const source = (await Promise.all(files.map(read))).join("\n");
  assert.doesNotMatch(source, /localStorage\.setItem/);
  assert.match(source, /updateRuntime/);
});
