import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import { promisify } from "node:util";

const root = path.resolve(".");
const releaseDir = path.join(root, "release");
const installerPath = path.join(releaseDir, "Kairos-0.1.0-win-x64-setup.exe");
const execFileAsync = promisify(execFile);
const desktopShortcut = path.join(os.homedir(), "Desktop", "Kairos.lnk");
const startMenuShortcut = path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Kairos.lnk");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function runProcess(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error(`${path.basename(command)} timed out.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, options.timeoutMs || 120_000);
    child.stdout.on("data", chunk => { stdout += chunk; });
    child.stderr.on("data", chunk => { stderr += chunk; });
    child.on("error", error => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("exit", code => {
      clearTimeout(timeout);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      reject(new Error(`${path.basename(command)} exited with ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });
}

async function waitForFile(filePath, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await exists(filePath)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

async function waitForMissing(filePath, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (!(await exists(filePath))) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for removal of ${filePath}`);
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

function isProcessRunning(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null) return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitForRunningProcess(child, label, timeoutMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (isProcessRunning(child)) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for ${label} to keep running`);
}

function waitForExit(child, timeoutMs = 8_000) {
  return new Promise((resolve, reject) => {
    if (!isProcessRunning(child)) {
      resolve({ code: child.exitCode, signal: child.signalCode });
      return;
    }
    const timeout = setTimeout(() => {
      reject(new Error(`Process ${child.pid} did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    child.once("exit", (code, signal) => {
      clearTimeout(timeout);
      resolve({ code, signal });
    });
  });
}

async function stopInstalledProcesses(installedExe) {
  const normalized = path.normalize(installedExe).toLowerCase();
  const rows = await listKairosProcesses();
  const targets = rows.filter(row => path.normalize(String(row.ExecutablePath || "")).toLowerCase() === normalized);
  if (!targets.length) return;
  await execFileAsync("powershell.exe", ["-NoProfile", "-Command", `Stop-Process -Id ${targets.map(row => Number(row.ProcessId)).join(",")} -Force`], { windowsHide: true }).catch(() => {});
}

async function lockDebug(userDataDir) {
  const filePath = path.join(userDataDir, "kairos-instance.lock");
  const lockExists = await exists(filePath);
  const lockPid = lockExists ? Number(await fs.readFile(filePath, "utf8").catch(() => 0)) : 0;
  let lockPidRunning = false;
  if (lockPid > 0) {
    try {
      process.kill(lockPid, 0);
      lockPidRunning = true;
    } catch {}
  }
  return { lockExists, lockPid, lockPidRunning };
}

async function shortcutTarget(shortcutPath) {
  const script = "$s=(New-Object -ComObject WScript.Shell).CreateShortcut($env:KAIROS_SHORTCUT_PATH);$s.TargetPath";
  const { stdout } = await execFileAsync("powershell.exe", ["-NoProfile", "-Command", script], { env: { ...process.env, KAIROS_SHORTCUT_PATH: shortcutPath }, windowsHide: true });
  return stdout.trim();
}

async function assertShortcutTarget(shortcutPath, targetPath) {
  await waitForFile(shortcutPath);
  assert.equal(path.normalize(await shortcutTarget(shortcutPath)).toLowerCase(), path.normalize(targetPath).toLowerCase(), `${shortcutPath} should point to installed Kairos.exe`);
}

async function runAppSmoke(executablePath, userDataDir) {
  const child = spawn(executablePath, [], {
    env: { ...process.env, KAIROS_SMOKE_TEST: "1", KAIROS_USER_DATA_DIR: userDataDir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  try {
    await waitForFile(path.join(userDataDir, "ai-data.json"));
    await waitForFile(path.join(userDataDir, "app-state.json"));
    await waitForFile(path.join(userDataDir, "Preferences"));
  } finally {
    if (!child.killed) child.kill();
  }
}

async function assertSingleInstanceFocus(executablePath, userDataDir) {
  await fs.mkdir(userDataDir, { recursive: true });
  await stopInstalledProcesses(executablePath);
  const first = spawn(executablePath, [], {
    env: { ...process.env, KAIROS_USER_DATA_DIR: userDataDir },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let firstStderr = "";
  first.stderr.on("data", chunk => { firstStderr += chunk; });
  try {
    await waitForRunningProcess(first, "first installed Kairos process");
    await waitForFile(path.join(userDataDir, "Preferences"));
    const firstLock = await lockDebug(userDataDir);
    assert.equal(firstLock.lockExists, true, "first installed Kairos process should create a userData process lock");
    assert.equal(firstLock.lockPidRunning, true, `first installed Kairos process lock should point to a running pid: ${JSON.stringify(firstLock)}`);
    const second = spawn(executablePath, [], {
      env: { ...process.env, KAIROS_USER_DATA_DIR: userDataDir },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true
    });
    let secondStderr = "";
    second.stderr.on("data", chunk => { secondStderr += chunk; });
    try {
      await waitForExit(second);
    } catch (error) {
      const secondLock = await lockDebug(userDataDir);
      if (!second.killed) second.kill();
      throw new Error(`second launch should focus the existing installed app and exit quickly.\n${error.message}\nlock:${JSON.stringify(secondLock)}\nstderr:\n${secondStderr}`);
    }
    assert.equal(isProcessRunning(first), true, `first installed Kairos process should remain running after second launch.\nstderr:\n${firstStderr}`);
  } finally {
    if (!first.killed) first.kill();
    await stopInstalledProcesses(executablePath);
  }
}

assert.equal(await exists(installerPath), true, "installer must exist before running installer smoke");

const installDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-install-smoke-app-"));
const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-install-smoke-user-data-"));
const dataRetentionSentinel = path.join(userDataDir, "kairos-data-retention-smoke.txt");
const installedExe = path.join(installDir, "Kairos.exe");
const uninstaller = path.join(installDir, "Uninstall Kairos.exe");
let installed = false;

async function installKairos() {
  console.log(`Installing Kairos to ${installDir}`);
  await runProcess(installerPath, ["/S", `/D=${installDir}`], { timeoutMs: 180_000 });

  assert.equal(await exists(installedExe), true, "installed Kairos.exe should exist");
  assert.equal(await exists(uninstaller), true, "installed uninstaller should exist");
  installed = true;
  await assertShortcutTarget(desktopShortcut, installedExe);
  await assertShortcutTarget(startMenuShortcut, installedExe);
}

async function uninstallKairos() {
  if (!installed) return;
  console.log("Uninstalling Kairos smoke installation");
  await runProcess(uninstaller, ["/S"], { timeoutMs: 180_000 });
  await waitForMissing(installedExe);
  await waitForMissing(desktopShortcut);
  await waitForMissing(startMenuShortcut);

  assert.equal(await exists(installedExe), false, "installed Kairos.exe should be removed by uninstaller");
  assert.equal(await exists(desktopShortcut), false, "desktop shortcut should be removed by uninstaller");
  assert.equal(await exists(startMenuShortcut), false, "start menu shortcut should be removed by uninstaller");
  installed = false;
}

try {
  await installKairos();

  console.log("Starting installed Kairos with isolated userData");
  await runAppSmoke(installedExe, userDataDir);
  console.log("Verifying installed Kairos single-instance behavior");
  await assertSingleInstanceFocus(installedExe, path.join(userDataDir, "single-instance"));
  await fs.writeFile(dataRetentionSentinel, "Kairos installer smoke data retention sentinel\n", "utf8");

  await uninstallKairos();
  assert.equal(await exists(dataRetentionSentinel), true, "uninstaller should preserve userData");

  await installKairos();
  console.log("Starting reinstalled Kairos with the same isolated userData");
  await runAppSmoke(installedExe, userDataDir);
  assert.equal(await exists(dataRetentionSentinel), true, "reinstall should preserve existing userData");

  await uninstallKairos();
} finally {
  await uninstallKairos().catch(error => console.warn(`Installer smoke cleanup uninstall failed: ${error.message}`));
  await fs.rm(desktopShortcut, { force: true }).catch(() => {});
  await fs.rm(startMenuShortcut, { force: true }).catch(() => {});
  await fs.rm(installDir, { recursive: true, force: true }).catch(() => {});
  await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => {});
}

console.log("Installer smoke passed.");
