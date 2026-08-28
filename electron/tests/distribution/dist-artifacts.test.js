import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";
import { listPackage } from "@electron/asar";
import { auditDesktopDataDir } from "../../scripts/audit/desktop-data-audit.js";

const root = path.resolve(".");
const releaseDir = path.join(root, "release");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));
const product = `${packageJson.productName}-${packageJson.version}-win-x64`;
const execFileAsync = promisify(execFile);

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function fileSize(filePath) {
  const stat = await fs.stat(filePath);
  return stat.size;
}

async function sha256(filePath) {
  const hash = crypto.createHash("sha256");
  hash.update(await fs.readFile(filePath));
  return hash.digest("hex");
}

async function listKairosProcesses() {
  const command = "Get-CimInstance Win32_Process -Filter \"name = 'Kairos.exe'\" | Select-Object ProcessId,ExecutablePath,CommandLine | ConvertTo-Json -Compress";
  try {
    const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", command], { windowsHide: true });
    const text = stdout.trim();
    if (!text) return [];
    const parsed = JSON.parse(text);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter(Boolean);
  } catch {
    return [];
  }
}

async function stopNewTempKairosProcesses(beforeIds) {
  const tempRoot = path.resolve(os.tmpdir()).toLowerCase();
  const rows = await listKairosProcesses();
  const targets = rows
    .filter(row => !beforeIds.has(Number(row.ProcessId)))
    .filter(row => String(row.ExecutablePath || "").toLowerCase().startsWith(tempRoot));
  if (!targets.length) return;
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${targets.map(row => Number(row.ProcessId)).join(",")} -Force`], { windowsHide: true }).catch(() => {});
}

async function waitForNoNewTempKairosProcesses(beforeIds, timeoutMs = 10_000) {
  const started = Date.now();
  const tempRoot = path.resolve(os.tmpdir()).toLowerCase();
  while (Date.now() - started < timeoutMs) {
    const rows = await listKairosProcesses();
    const active = rows
      .filter(row => !beforeIds.has(Number(row.ProcessId)))
      .filter(row => String(row.ExecutablePath || "").toLowerCase().startsWith(tempRoot));
    if (!active.length) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  await stopNewTempKairosProcesses(beforeIds);
}

function runSmokeTest(executablePath, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executablePath, [], {
      env: { ...process.env, KAIROS_SMOKE_TEST: "1", ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    let done = false;
    const finish = (callback, value) => {
      if (done) return;
      done = true;
      clearTimeout(timeout);
      if (!child.killed) child.kill();
      callback(value);
    };
    const timeout = setTimeout(() => {
      finish(reject, new Error(`Kairos smoke test timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, options.timeoutMs || 30_000);
    const poll = options.successWhen ? setInterval(async () => {
      try {
        if (await options.successWhen()) {
          clearInterval(poll);
          if (options.waitForExitAfterSuccess) return;
          finish(resolve, { stdout, stderr });
        }
      } catch {
        // Keep waiting until timeout; intermittent file access failures are normal while the app starts.
      }
    }, 250) : null;
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => {
      if (poll) clearInterval(poll);
      finish(reject, error);
    });
    child.on("exit", async code => {
      if (poll) clearInterval(poll);
      if (done) return;
      // The portable self-extractor can return a nonzero wrapper exit code
      // after the spawned Electron process has already completed the smoke run.
      // The result file is the authoritative signal for that launch mode.
      if (code !== 0 && options.successWhen) {
        try {
          if (await options.successWhen()) {
            finish(resolve, { stdout, stderr });
            return;
          }
        } catch {
          // Fall through to the process failure below.
        }
      }
      if (code === 0) {
        finish(resolve, { stdout, stderr });
        return;
      }
      finish(reject, new Error(`Kairos smoke test exited with ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

test("Windows distribution artifacts are generated with distinct release names", async () => {
  const setup = path.join(releaseDir, `${product}-setup.exe`);
  const setupBlockmap = path.join(releaseDir, `${product}-setup.exe.blockmap`);
  const portable = path.join(releaseDir, `${product}-portable.exe`);
  const unpacked = path.join(releaseDir, "win-unpacked", "Kairos.exe");
  const asar = path.join(releaseDir, "win-unpacked", "resources", "app.asar");

  assert.equal(await exists(setup), true, "NSIS setup exe should exist");
  assert.equal(await exists(setupBlockmap), true, "NSIS blockmap should exist");
  assert.equal(await exists(portable), true, "portable exe should exist");
  assert.equal(await exists(unpacked), true, "unpacked desktop exe should exist");
  assert.equal(await exists(asar), true, "runtime app.asar should exist");

  assert.ok(await fileSize(setup) > 50 * 1024 * 1024, "setup exe should not be an empty stub");
  assert.ok(await fileSize(portable) > 50 * 1024 * 1024, "portable exe should not be an empty stub");
});

test("Windows app.asar contains runtime files without local secrets or source docs", async () => {
  const asar = path.join(releaseDir, "win-unpacked", "resources", "app.asar");
  const entries = listPackage(asar).map(entry => entry.replaceAll("\\", "/").replace(/^\/+/, ""));

  assert.ok(entries.includes("package.json"), "runtime package metadata should be bundled");
  assert.ok(entries.includes("app/vue-preview/index.html"), "production Vue renderer should be bundled");
  assert.ok(entries.includes("electron/main/index.js"), "main process should be bundled");
  assert.ok(entries.some(entry => entry.startsWith("node_modules/")), "runtime dependencies should be bundled");

  const forbiddenPatterns = [
    /^\.env(?:\.|$)/,
    /^docs(?:\/|$)/,
    /^Brainstorm(?:\/|$)/,
    /^references(?:\/|$)/,
    /(?:^|\/).*\.test\.js$/,
    /^electron\/.*\.test\.js$/,
    /^start-kairos\./
  ];

  const forbiddenEntries = entries.filter(entry => forbiddenPatterns.some(pattern => pattern.test(entry)));
  assert.deepEqual(forbiddenEntries, [], "release asar should not include secrets, project docs, design sources, or tests");
});

test("release manifest records artifact sizes and hashes", async () => {
  const manifestPath = path.join(releaseDir, "manifest.json");
  assert.equal(await exists(manifestPath), true, "release manifest should exist");

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  assert.equal(manifest.productName, packageJson.productName);
  assert.equal(manifest.version, packageJson.version);
  assert.equal(manifest.appId, "app.kairos.desktop");
  assert.equal(manifest.artifacts.length, 4);

  for (const item of manifest.artifacts) {
    const filePath = path.join(releaseDir, item.name);
    assert.equal(await exists(filePath), true, `${item.name} should exist`);
    assert.equal(item.size, await fileSize(filePath), `${item.name} size should match manifest`);
    assert.equal(item.sha256, await sha256(filePath), `${item.name} sha256 should match manifest`);
  }
});

function assertSmokePersistence(result, options = {}) {
  assert.equal(result.persistence.available, true, "desktop app-state bridge should be available in renderer smoke");
  if (options.expectExisting) assert.equal(result.persistence.existing, true, "renderer smoke should read data persisted by a previous launch");
  if (options.expectSaved !== false) assert.equal(result.persistence.saved, true, "renderer smoke should save app-state data");
  assert.equal(result.music.available, true, "desktop music bridge should be available in renderer smoke");
  if (options.expectExisting) assert.equal(result.music.existing, true, "renderer smoke should read music data persisted by a previous launch");
  if (options.expectSaved !== false) assert.equal(result.music.saved, true, "renderer smoke should save music playback data");
  if (options.expectMusicUnavailable) {
    assert.equal(result.music.unavailable, true, "renderer smoke should mark a moved or deleted local music file as unavailable");
    assert.equal(result.music.unavailableReason, "missing_file", "renderer smoke should expose a missing-file reason for unavailable local music");
  }
  assert.equal(result.aiData.available, true, "desktop AI conversation bridge should be available in renderer smoke");
  if (options.expectExisting) assert.equal(result.aiData.existing, true, "renderer smoke should read AI conversation data persisted by a previous launch");
  if (options.expectSaved !== false) assert.equal(result.aiData.saved, true, "renderer smoke should save AI conversation data");
}

async function runFileBackedSmokeTest(executablePath, environment, resultPath) {
  return runSmokeTest(executablePath, {
    env: environment,
    successWhen: async () => await exists(resultPath),
    waitForExitAfterSuccess: true,
    timeoutMs: 90_000
  });
}

async function verifyExecutableStartup(executablePath) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-smoke-user-data-"));
  const marker = `smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const musicFile = path.join(userDataDir, `${marker}.wav`);
  await fs.writeFile(musicFile, Buffer.from("RIFF....WAVEfmt "));
  const resultPath = path.join(userDataDir, "smoke-result.json");
  await runFileBackedSmokeTest(executablePath, { KAIROS_USER_DATA_DIR: userDataDir, KAIROS_SMOKE_RESULT_PATH: resultPath, KAIROS_SMOKE_STATE_MARKER: marker, KAIROS_SMOKE_MUSIC_FILE: musicFile }, resultPath);
  const first = await verifySmokeFiles(userDataDir, resultPath);
  assertSmokePersistence(first);

  const secondResultPath = path.join(userDataDir, "smoke-result-second.json");
  await runFileBackedSmokeTest(executablePath, { KAIROS_USER_DATA_DIR: userDataDir, KAIROS_SMOKE_RESULT_PATH: secondResultPath, KAIROS_SMOKE_STATE_MARKER: marker, KAIROS_SMOKE_EXPECT_STATE_MARKER: "1", KAIROS_SMOKE_MUSIC_FILE: musicFile }, secondResultPath);
  const restarted = await verifySmokeFiles(userDataDir, secondResultPath);
  assertSmokePersistence(restarted, { expectExisting: true });

  await fs.rm(musicFile);
  const unavailableMusicResultPath = path.join(userDataDir, "smoke-result-unavailable-music.json");
  await runFileBackedSmokeTest(executablePath, { KAIROS_USER_DATA_DIR: userDataDir, KAIROS_SMOKE_RESULT_PATH: unavailableMusicResultPath, KAIROS_SMOKE_STATE_MARKER: marker, KAIROS_SMOKE_EXPECT_STATE_MARKER: "1", KAIROS_SMOKE_MUSIC_FILE: musicFile, KAIROS_SMOKE_EXPECT_MUSIC_MISSING: "1" }, unavailableMusicResultPath);
  const unavailableMusicResult = await verifySmokeFiles(userDataDir, unavailableMusicResultPath);
  assertSmokePersistence(unavailableMusicResult, { expectExisting: true, expectMusicUnavailable: true });

}

async function verifySmokeFiles(userDataDir, resultPath, options = {}) {
  const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
  assert.equal(result.ok, true, "renderer smoke should report success");
  assert.equal(result.renderer, "vue", "release should load the Vue renderer");
  assert.equal(result.checks.calendar, true, "calendar should mount");
  assert.equal(result.checks.habits, true, "habits should mount");
  assert.equal(result.checks.calendarQueue, true, "calendar queue should mount");
  assert.equal(result.checks.sharedPlayer, true, "shared bottom music player should mount");
  assert.equal(result.checks.reminderPanel, true, "reminder panel should mount");
  assert.equal(await exists(path.join(userDataDir, "kairos.sqlite")), true, "SQLite app database should initialize in clean userData");
  const audit = await auditDesktopDataDir(userDataDir);
  assert.equal(audit.ok, true, "smoke userData should pass desktop data audit");
  assert.equal(audit.database?.ok, true, "smoke SQLite app database should pass desktop data audit");
  assert.ok(audit.database?.database?.snapshot, "smoke SQLite database should record an app state snapshot");
  const storeNames = new Set((audit.database?.database?.stores || []).map(store => store.store));
  assert.equal(storeNames.has("ai-data"), true, "smoke SQLite database should index AI data store");
  assert.equal(storeNames.has("music-state"), true, "smoke SQLite database should index music data store");
  if (options.requirePreferences !== false) {
    assert.equal(await exists(path.join(userDataDir, "Preferences")), true, "Electron should write runtime preferences in clean userData");
  }
  return result;
}

async function verifyPortableStartup(executablePath) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-portable-smoke-user-data-"));
  const marker = `portable-smoke-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const musicFile = path.join(userDataDir, `${marker}.wav`);
  await fs.writeFile(musicFile, Buffer.from("RIFF....WAVEfmt "));
  const resultPath = path.join(userDataDir, "smoke-result.json");
  const before = new Set((await listKairosProcesses()).map(row => Number(row.ProcessId)));
  try {
    await runSmokeTest(executablePath, {
      env: { KAIROS_USER_DATA_DIR: userDataDir, KAIROS_SMOKE_RESULT_PATH: resultPath, KAIROS_SMOKE_STATE_MARKER: marker, KAIROS_SMOKE_MUSIC_FILE: musicFile },
      successWhen: async () => await exists(resultPath),
      timeoutMs: 90_000
    });
    await waitForNoNewTempKairosProcesses(before);
    const result = await verifySmokeFiles(userDataDir, resultPath, { requirePreferences: false });
    assertSmokePersistence(result);
    const secondResultPath = path.join(userDataDir, "smoke-result-second.json");
    await runSmokeTest(executablePath, {
      env: { KAIROS_USER_DATA_DIR: userDataDir, KAIROS_SMOKE_RESULT_PATH: secondResultPath, KAIROS_SMOKE_STATE_MARKER: marker, KAIROS_SMOKE_EXPECT_STATE_MARKER: "1", KAIROS_SMOKE_MUSIC_FILE: musicFile },
      successWhen: async () => await exists(secondResultPath),
      timeoutMs: 90_000
    });
    await waitForNoNewTempKairosProcesses(before);
    const restarted = await verifySmokeFiles(userDataDir, secondResultPath, { requirePreferences: false });
    assertSmokePersistence(restarted, { expectExisting: true });
  } finally {
    await stopNewTempKairosProcesses(before);
  }
}

async function verifyPetWindowStartup(executablePath) {
  const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-pet-smoke-user-data-"));
  const resultPath = path.join(userDataDir, "pet-smoke-result.json");
  await runFileBackedSmokeTest(executablePath, {
    KAIROS_SMOKE_TEST: "0",
    KAIROS_PET_SMOKE_TEST: "1",
    KAIROS_USER_DATA_DIR: userDataDir,
    KAIROS_SMOKE_RESULT_PATH: resultPath
  }, resultPath);
  const result = JSON.parse(await fs.readFile(resultPath, "utf8"));
  assert.equal(result.ok, true, "packaged pet smoke should report success");
  assert.equal(result.window.visible, true, "packaged pet window should be natively visible");
  assert.equal(result.window.destroyed, false, "packaged pet window should remain alive until smoke completion");
  assert.equal(result.window.title, "桌宠", "packaged pet page should finish loading");
  assert.match(result.window.url, /app\/pages\/pet\/index\.html$/, "packaged pet window should load the pet renderer");
  assert.ok(Math.abs(result.window.bounds.width - 260) <= 2, "packaged pet width should reserve its context-menu surface within Windows DPI rounding tolerance");
  assert.ok(Math.abs(result.window.bounds.height - 280) <= 2, "packaged pet height should reserve its context-menu surface within Windows DPI rounding tolerance");
  assert.equal(result.page.readyState, "complete");
  assert.equal(result.page.imageComplete, true);
  assert.ok(result.page.imageNaturalWidth > 0 && result.page.imageNaturalHeight > 0, "packaged pet image should decode");
  assert.equal(result.page.htmlBackgroundColor, "rgba(0, 0, 0, 0)", "packaged pet document canvas should be transparent");
  assert.equal(result.page.bodyBackgroundColor, "rgba(0, 0, 0, 0)", "packaged pet body should be transparent");
  assert.equal(result.chat.page.panelBorderRadius, "32px", "packaged AI chat should retain its CSS-rendered radius");
  assert.equal(result.chat.page.panelOverflow, "hidden", "packaged AI chat content should stay inside its smooth CSS radius");
}

test("Windows unpacked executable starts the packaged app and loads the main window", async () => {
  await verifyExecutableStartup(path.join(releaseDir, "win-unpacked", "Kairos.exe"));
});

test("Windows unpacked executable creates and shows the packaged desktop pet", async () => {
  await verifyPetWindowStartup(path.join(releaseDir, "win-unpacked", "Kairos.exe"));
});

test("Windows portable executable starts and mounts the main renderer", async () => {
  await verifyPortableStartup(path.join(releaseDir, `${product}-portable.exe`));
});
