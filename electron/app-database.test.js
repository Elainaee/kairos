import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { APP_DB_SCHEMA_VERSION, KairosAppDatabase } from "./app-database.js";
import { AppStateStore } from "./app-state.js";
import { AiDataStore } from "./data-store.js";
import { MusicLibrary } from "./music-library.js";
import { NeteaseApiService } from "./netease-api-service.js";
import { auditDesktopDataDir } from "./desktop-data-audit.js";

test("SQLite app database mirrors app-state into queryable tables", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-app-db-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();

  if (!initialized.available) {
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(initialized.available, false, "SQLite driver is optional on runtimes without node:sqlite");
    return;
  }

  const store = new AppStateStore(path.join(dir, "app-state.json"), { database });
  await store.write({
    schedules: [{ id: "task-1", title: "Read", type: "task", date: "2026-07-15", end_date: "2026-07-15", status: "todo" }],
    habits: [{ id: "habit-1", name: "Reading", dates: ["2026-07-15"] }],
    notes: [{ id: "note-1", title: "Reflection", date: "2026-07-15" }]
  });

  const snapshot = database.readAppStateSnapshot();
  const audit = database.audit();
  assert.equal(snapshot.schedules[0].title, "Read");
  assert.equal(audit.version, APP_DB_SCHEMA_VERSION);
  assert.equal(audit.tables.schedules, 1);
  assert.equal(audit.tables.habits, 1);
  assert.equal(audit.tables.notes, 1);
  assert.equal(audit.migrations.some(row => row.id === `app-db-v${APP_DB_SCHEMA_VERSION}`), true);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("desktop data audit reports SQLite health when the database exists", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-desktop-db-audit-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  await fs.writeFile(path.join(dir, "app-state.json"), JSON.stringify({ schedules: [] }), "utf8");

  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(initialized.available, false, "SQLite driver is optional on runtimes without node:sqlite");
    return;
  }

  await database.saveAppStateSnapshot({ version: 2, schedules: [], habits: [], checkins: [], notes: [], studyPlans: [] });
  database.close();
  const report = await auditDesktopDataDir(dir);
  assert.equal(report.ok, true);
  assert.equal(report.database.exists, true);
  assert.equal(report.database.ok, true);
  assert.equal(report.database.database.version, APP_DB_SCHEMA_VERSION);

  await fs.rm(dir, { recursive: true, force: true });
});

test("SQLite app database indexes auxiliary desktop JSON stores", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-json-store-db-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(initialized.available, false, "SQLite driver is optional on runtimes without node:sqlite");
    return;
  }

  const aiStore = new AiDataStore(path.join(dir, "ai-data.json"), { database });
  const conversation = await aiStore.createConversation({ title: "Focus" });
  await aiStore.addMessage({ conversationId: conversation.id, role: "user", content: "Hi" });

  const audio = path.join(dir, "focus.wav");
  await fs.writeFile(audio, Buffer.from("RIFF....WAVEfmt "));
  const music = new MusicLibrary({ statePath: path.join(dir, "music-state.json"), coverDir: path.join(dir, "covers"), database });
  const imported = await music.addFiles([audio]);
  await music.updatePlayback({ queueTrackIds: [imported.state.tracks[0].id], currentTrackId: imported.state.tracks[0].id, playing: true, volume: 44 });

  const netease = new NeteaseApiService({ statePath: path.join(dir, "netease-api-state.json"), database });
  netease.cookie = "MUSIC_U=test";
  await netease.save();

  const audit = database.audit();
  const stores = new Map(audit.stores.map(row => [row.store, row.summary]));
  assert.equal(stores.get("ai-data").conversations, 1);
  assert.equal(stores.get("ai-data").messages, 1);
  assert.equal(stores.get("music-state").tracks, 1);
  assert.equal(stores.get("music-state").playing, true);
  assert.equal(stores.get("netease-api-state").loggedIn, true);

  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});
