import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { APP_STATE_SCHEMA_VERSION, AppStateRepository, AppStateStore, auditAppState, createAppAdapters, normalize } from "../../data/app-state/index.js";
import { KairosAppDatabase } from "../../data/sqlite/index.js";
import { auditDesktopDataDir } from "../../scripts/audit/desktop-data-audit.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function runNode(args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, ...options });
    let stdout = "", stderr = "";
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", reject);
    child.on("close", code => resolve({ code, stdout, stderr }));
  });
}

test("app state normalizes legacy documents into the current schema", () => {
  const state = normalize({ version: 1, schedules: "bad", moods: [], theme: "dark", settings: { ai: { provider: "none" } } });

  assert.equal(state.version, APP_STATE_SCHEMA_VERSION);
  assert.deepEqual(state.schedules, []);
  assert.deepEqual(state.moods, {});
  assert.equal(state.theme, "dark");
  assert.equal(state.settings.ai.provider, "none");
  assert.equal(state.migrations.some(item => item.id === "app-state-v2"), true);
});

test("app state audit reports migration-ready counts and data issues", () => {
  const report = auditAppState({
    version: 2,
    schedules: [
      { id: "dup", title: "Read", date: "2026-07-15", end_date: "2026-07-15", type: "task" },
      { id: "dup", title: "Broken", date: "2026-99-99", end_date: "2026-07-14", type: "study" }
    ],
    habits: [
      { id: "habit-1", name: "", dates: ["2026-07-15", "bad-date"] },
      { id: "habit-1", name: "Workout", dates: [] }
    ],
    notes: [{ id: "note-1" }],
    moods: { "2026-07-15": "calm" },
    settings: { appearance: { theme: "light" } }
  });

  assert.equal(report.ok, false);
  assert.deepEqual(report.summary, {
    version: APP_STATE_SCHEMA_VERSION,
    schedules: 2,
    tasks: 1,
    habits: 2,
    checkins: 0,
    notes: 1,
    moods: 1,
    migrations: 1,
    settings: 1
  });
  assert.equal(report.issues.some(issue => issue.code === "duplicate_ids" && issue.key === "schedules" && issue.ids.includes("dup")), true);
  assert.equal(report.issues.some(issue => issue.code === "invalid_schedule_type" && issue.type === "study"), true);
  assert.equal(report.issues.some(issue => issue.code === "habit_name_required" && issue.id === "habit-1"), true);
  assert.equal(report.issues.some(issue => issue.code === "habit_dates_invalid" && issue.dates.includes("bad-date")), true);
});

test("app state audit passes normalized core data without mutating storage", () => {
  const report = auditAppState({
    schedules: [{ id: "task-1", title: "Read", date: "2026-07-15", end_date: "2026-07-15", type: "task" }],
    habits: [{ id: "habit-1", name: "Read", dates: ["2026-07-15"] }],
    notes: [],
    moods: {}
  });

  assert.equal(report.ok, true);
  assert.equal(report.summary.tasks, 1);
  assert.deepEqual(report.issues, []);
});

test("app state audit CLI reports healthy and invalid exports", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-app-state-audit-cli-"));
  const good = path.join(dir, "good.json");
  const bad = path.join(dir, "bad.json");
  await fs.writeFile(good, JSON.stringify({ schedules: [{ id: "ok", title: "Read", date: "2026-07-15", end_date: "2026-07-15", type: "task" }], habits: [{ id: "h", name: "Read", dates: ["2026-07-15"] }] }), "utf8");
  await fs.writeFile(bad, JSON.stringify({ schedules: [{ id: "broken", date: "bad", type: "study" }] }), "utf8");

  const healthy = await runNode(["electron/scripts/audit/app-state-audit.js", good]);
  const invalid = await runNode(["electron/scripts/audit/app-state-audit.js", bad]);

  assert.equal(healthy.code, 0);
  assert.match(healthy.stdout, /Kairos app-state audit: OK/);
  assert.match(healthy.stdout, /1 schedules, 1 tasks, 1 habits/);
  assert.equal(invalid.code, 2);
  assert.match(invalid.stdout, /ISSUES_FOUND/);
  assert.match(invalid.stdout, /invalid_schedule_type/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("desktop data audit summarizes required and optional userData files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-desktop-data-audit-"));
  await fs.writeFile(path.join(dir, "app-state.json"), JSON.stringify({ schedules: [{ id: "task-1", title: "Read", date: "2026-07-15", end_date: "2026-07-15", type: "task" }] }), "utf8");
  await fs.writeFile(path.join(dir, "ai-data.json"), JSON.stringify({ conversations: [] }), "utf8");
  await fs.writeFile(path.join(dir, "music-state.json"), JSON.stringify({ tracks: [], playlists: [] }), "utf8");

  const report = await auditDesktopDataDir(dir);
  const cli = await runNode(["electron/scripts/audit/desktop-data-audit.js", dir]);
  await fs.rm(path.join(dir, "app-state.json"));
  const missing = await runNode(["electron/scripts/audit/desktop-data-audit.js", dir]);

  assert.equal(report.ok, true);
  assert.equal(report.files.find(file => file.name === "app-state.json").ok, true);
  assert.equal(report.files.find(file => file.name === "netease-api-state.json").issue, "missing_optional_file");
  assert.equal(cli.code, 0);
  assert.match(cli.stdout, /Kairos desktop data audit: OK/);
  assert.match(cli.stdout, /app-state\.json: OK/);
  assert.equal(missing.code, 2);
  assert.match(missing.stdout, /app-state\.json: ISSUE/);
  assert.match(missing.stdout, /missing_required_file/);
  await fs.rm(dir, { recursive: true, force: true });
});

test.skip("initialize persists a migrated app-state schema once", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-schema-migration-"));
  const file = path.join(dir, "app.json");
  await fs.writeFile(file, JSON.stringify({ version: 1, schedules: [{ id: "old" }], theme: "dark" }), "utf8");
  const store = new AppStateStore(file);

  const state = await store.initialize();
  const disk = JSON.parse(await fs.readFile(file, "utf8"));

  assert.equal(state.version, APP_STATE_SCHEMA_VERSION);
  assert.equal(disk.version, APP_STATE_SCHEMA_VERSION);
  assert.equal(disk.schedules[0].id, "old");
  assert.equal(disk.theme, "dark");
  assert.equal(disk.migrations.some(item => item.id === "app-state-v2"), true);
  assert.match(disk.last_migration_backup, /backups[\\/]+app-state-v1-/);
  await fs.rm(dir, { recursive: true, force: true });
});

test.skip("schema migration keeps a pre-upgrade backup next to app-state", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-schema-backup-"));
  const file = path.join(dir, "app.json");
  await fs.writeFile(file, JSON.stringify({ version: 1, schedules: [{ id: "legacy" }], theme: "dark" }), "utf8");
  const store = new AppStateStore(file);

  const state = await store.initialize();
  const backups = await fs.readdir(path.join(dir, "backups"));
  const backup = JSON.parse(await fs.readFile(path.join(dir, "backups", backups[0]), "utf8"));

  assert.equal(backups.length, 1);
  assert.match(backups[0], /^app-state-v1-/);
  assert.equal(backup.version, 1);
  assert.equal(backup.schedules[0].id, "legacy");
  assert.equal(state.last_migration_backup.endsWith(backups[0]), true);
  await fs.rm(dir, { recursive: true, force: true });
});

test.skip("app state backups can be listed read and restored safely", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-backup-restore-"));
  const file = path.join(dir, "app.json");
  await fs.writeFile(file, JSON.stringify({ version: 1, schedules: [{ id: "backup" }], theme: "dark" }), "utf8");
  const store = new AppStateStore(file);
  await store.initialize();
  await store.write({ schedules: [{ id: "current" }], theme: "light" });

  const backups = await store.listBackups();
  const backup = await store.readBackup(backups[0].name);
  const restored = await store.restoreBackup(backups[0].name);
  const disk = await store.read();
  const afterRestoreBackups = await store.listBackups();
  const currentBackup = JSON.parse(await fs.readFile(restored.last_restore_backup, "utf8"));

  assert.equal(backups.length, 1);
  assert.equal(backup.schedules[0].id, "backup");
  assert.equal(restored.schedules[0].id, "backup");
  assert.equal(restored.theme, "dark");
  assert.equal(restored.restored_from_backup, backups[0].name);
  assert.match(path.basename(restored.last_restore_backup), /^app-state-v3-.+-before-restore\.json$/);
  assert.equal(afterRestoreBackups.some(item => item.path === restored.last_restore_backup), true);
  assert.equal(currentBackup.schedules[0].id, "current");
  assert.equal(disk.schedules[0].id, "backup");
  await assert.rejects(() => store.readBackup("../app.json"), /invalid_backup_path/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("app state can create a current backup before destructive imports", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-before-import-backup-"));
  const file = path.join(dir, "app.json");
  const store = new AppStateStore(file);
  await store.write({ schedules: [{ id: "current" }], theme: "dark" });

  const backupPath = await store.backupCurrent("before-import");
  await store.write({ schedules: [{ id: "imported" }], theme: "light", last_import_backup: backupPath });
  const backups = await store.listBackups();
  const backup = JSON.parse(await fs.readFile(backupPath, "utf8"));
  const state = await store.read();

  assert.match(path.basename(backupPath), /^app-state-v3-.+-before-import\.json$/);
  assert.equal(backups.some(item => item.path === backupPath), true);
  assert.equal(backup.schedules[0].id, "current");
  assert.equal(state.schedules[0].id, "imported");
  assert.equal(state.last_import_backup, backupPath);
  await fs.rm(dir, { recursive: true, force: true });
});

test.skip("app state restores from SQLite snapshot when the JSON file is missing", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-sqlite-restore-missing-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(initialized.available, false, "SQLite driver is optional on runtimes without node:sqlite");
    return;
  }
  const file = path.join(dir, "app.json");
  const store = new AppStateStore(file, { database });
  await store.write({ schedules: [{ id: "saved-in-db", title: "Recovered", date: "2026-07-15", end_date: "2026-07-15", type: "task" }], habits: [{ id: "habit", name: "Read" }] });
  await fs.rm(file);

  const recovered = await store.initialize();
  const disk = JSON.parse(await fs.readFile(file, "utf8"));

  assert.equal(recovered.schedules[0].id, "saved-in-db");
  assert.equal(recovered.recovered_from_sqlite, true);
  assert.ok(recovered.restored_from_sqlite_at);
  assert.equal(disk.schedules[0].id, "saved-in-db");
  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test.skip("app state restores from SQLite snapshot when the JSON file is corrupt", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-sqlite-restore-corrupt-"));
  const database = new KairosAppDatabase(path.join(dir, "kairos.sqlite"));
  const initialized = await database.initialize();
  if (!initialized.available) {
    database.close();
    await fs.rm(dir, { recursive: true, force: true });
    assert.equal(initialized.available, false, "SQLite driver is optional on runtimes without node:sqlite");
    return;
  }
  const file = path.join(dir, "app.json");
  const store = new AppStateStore(file, { database });
  await store.write({ schedules: [{ id: "before-corruption", title: "Safe", date: "2026-07-15", end_date: "2026-07-15", type: "task" }] });
  await fs.writeFile(file, "{broken json", "utf8");

  const readFallback = await store.read();
  const initializedState = await store.initialize();
  const disk = JSON.parse(await fs.readFile(file, "utf8"));

  assert.equal(readFallback.schedules[0].id, "before-corruption");
  assert.equal(readFallback.recovered_from_sqlite, true);
  assert.equal(initializedState.schedules[0].id, "before-corruption");
  assert.ok(initializedState.restored_from_sqlite_at);
  assert.equal(disk.schedules[0].id, "before-corruption");
  database.close();
  await fs.rm(dir, { recursive: true, force: true });
});

test("legacy study plans become event schedules during normalization", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-study-migration-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [], studyPlans: [{ id: "legacy-study", title: "Summer learning", start_date: "2026-07-01", end_date: "2026-08-31", type: "study" }] });
  const state = await store.read();
  assert.equal("studyPlans" in state, false);
  assert.equal(state.schedules.length, 1);
  assert.equal(state.schedules[0].type, "event");
  assert.equal(state.schedules[0].date, "2026-07-01");
  await fs.rm(dir, { recursive: true, force: true });
});

test("schedule adapters reject invented schedule types", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-type-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [] });
  await assert.rejects(() => createAppAdapters(store).schedules.create({ title: "Meeting", date: "2026-07-17", type: "schedule" }), /invalid_schedule_type/);
  await assert.rejects(() => createAppAdapters(store).schedules.create({ title: "Study", date: "2026-07-17", type: "study" }), /invalid_schedule_type/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("legacy recurring schedules with missing dates are repaired into visible date ranges", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-recurring-repair-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [{ id: "summer-friday", title: "Friday meeting", type: "event", date: "", end_date: "", created_at: "2026-07-12T08:00:47.443Z", recurrence: { frequency: "weekly", weekdays: [5], until: "2026-08-31" } }] });
  await store.repairSchedules();
  const item = (await store.read()).schedules[0];
  assert.equal(item.date, "2026-07-12");
  assert.equal(item.end_date, "2026-08-31");
  assert.equal(item.type, "event");
  await fs.rm(dir, { recursive: true, force: true });
});

test("schedule adapters reject a missing start date", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-date-required-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [] });
  await assert.rejects(() => createAppAdapters(store).schedules.create({ title: "Missing date", type: "event" }), /schedule_date_required/);
  await fs.rm(dir, { recursive: true, force: true });
});

test("app state repository owns collection CRUD behind adapters", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-repository-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await store.initialize({ schedules: [], notes: [] });
  let notified = 0;
  const tasks = new AppStateRepository(store, "tasks", () => { notified += 1; });
  const notes = new AppStateRepository(store, "notes", () => { notified += 1; });

  const task = await tasks.create({ title: "Read", date: "2026-07-15" });
  assert.equal(task.type, "task");
  assert.equal((await tasks.query({ dateFrom: "2026-07-15", dateTo: "2026-07-15" })).length, 1);
  await tasks.update({ id: task.id, title: "Read chapter 2", date: "2026-07-15", end_date: "2026-07-15", type: "task" });
  assert.equal((await tasks.query({ id: task.id }))[0].title, "Read chapter 2");

  const note = await notes.create({ title: "Reflection", date: "2026-07-15" });
  assert.equal((await notes.query({ id: note.id }))[0].title, "Reflection");
  await notes.delete({ id: note.id });
  await tasks.delete_many({ ids: [task.id] });
  const state = await store.read();
  assert.equal(state.schedules.length, 0);
  assert.equal(state.notes.length, 0);
  assert.equal(notified, 5);
  await fs.rm(dir, { recursive: true, force: true });
});

test("concurrent app state writes use unique temporary files", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-concurrent-app-state-"));
  const store = new AppStateStore(path.join(dir, "app.json"));
  await Promise.all(Array.from({ length: 12 }, (_item, index) => store.write({ schedules: [{ id: `s-${index}`, title: `Schedule ${index}`, date: "2026-07-14", end_date: "2026-07-14", type: "task" }] })));
  const files = await fs.readdir(dir);
  assert.equal(files.filter(name => name.endsWith(".tmp")).length, 0);
  const state = await store.read();
  assert.equal(state.schedules.length, 1);
  assert.match(state.schedules[0].id, /^s-\d+$/);
  await fs.rm(dir, { recursive: true, force: true });
});
