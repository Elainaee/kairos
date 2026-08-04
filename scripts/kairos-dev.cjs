const { existsSync } = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

// Keep repository launches out of the packaged application's profile. An
// explicitly supplied value is retained so test runners can use a disposable
// user-data directory.
if (!process.env.KAIROS_USER_DATA_DIR) {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  process.env.KAIROS_USER_DATA_DIR = path.join(localAppData, "KairosDev");
}

function localPath(...parts) {
  return path.join(root, ...parts);
}

function commandExists(command) {
  const probe = isWindows ? "where" : "command";
  const args = isWindows ? [command] : ["-v", command];
  return spawnSync(probe, args, { stdio: "ignore", shell: !isWindows }).status === 0;
}

function printInstallHelp() {
  const lines = [
    "Kairos could not find the local Electron runtime.",
    "",
    "Install dependencies first, then run the app again:",
    commandExists("pnpm") ? "  pnpm install" : "  corepack enable && corepack prepare pnpm@latest --activate && pnpm install",
    "",
    "Fallback if pnpm is not available:",
    commandExists("npm") ? "  npm install" : "  Install Node.js/npm, then run npm install.",
    "",
    "For environment details:",
    "  node scripts/kairos-doctor.cjs"
  ];
  console.error(lines.join("\n"));
}

function electronCommand() {
  const electronCmd = localPath("node_modules", ".bin", isWindows ? "electron.cmd" : "electron");
  const electronExe = localPath("node_modules", "electron", "dist", isWindows ? "electron.exe" : "electron");

  // Windows .cmd shims require a command shell. Prefer Electron's real binary so
  // double-click launchers surface the app instead of silently returning code 1.
  if (existsSync(electronExe)) {
    return { command: electronExe, args: ["."], shell: false };
  }
  if (existsSync(electronCmd)) {
    return { command: electronCmd, args: ["."], shell: isWindows };
  }

  printInstallHelp();
  return null;
}

function runElectron() {
  const target = electronCommand();
  if (!target) return 1;
  return spawnSync(target.command, target.args, { cwd: root, stdio: "inherit", shell: target.shell }).status ?? 1;
}

function waitForVueServer(url, timeoutMs = 15000) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    const probe = () => {
      const request = http.get(url, response => {
        response.resume();
        if (response.statusCode && response.statusCode < 500) return resolve();
        setTimeout(probe, 100);
      });
      request.on("error", () => {
        if (Date.now() - startedAt >= timeoutMs) return reject(new Error(`Vue preview did not start at ${url}`));
        setTimeout(probe, 100);
      });
      request.setTimeout(1000, () => request.destroy());
    };
    probe();
  });
}

async function runVuePreview() {
  const controllerSync = spawnSync(process.execPath, [localPath("scripts", "sync-music-native-controller.cjs")], {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  if (controllerSync.status !== 0) return controllerSync.status ?? 1;
  const viteEntry = localPath("node_modules", "vite", "bin", "vite.js");
  const target = electronCommand();
  if (!target) return 1;
  if (!existsSync(viteEntry)) {
    console.error("Kairos Vue preview requires Vite. Run pnpm install first.");
    return 1;
  }

  const previewUrl = "http://127.0.0.1:5173/";
  const vite = spawn(process.execPath, [viteEntry, "--config", "renderer/vite.config.ts", "--host", "127.0.0.1", "--port", "5173", "--strictPort"], {
    cwd: root,
    stdio: "inherit",
    shell: false
  });
  try {
    await waitForVueServer(previewUrl);
  } catch (error) {
    vite.kill();
    console.error(error.message);
    return 1;
  }

  const electron = spawn(target.command, target.args, {
    cwd: root,
    stdio: "inherit",
    shell: target.shell,
    env: { ...process.env, KAIROS_RENDERER: "vue", KAIROS_VITE_DEV_SERVER_URL: previewUrl }
  });
  electron.on("exit", code => {
    vite.kill();
    process.exitCode = code ?? 0;
  });
  electron.on("error", error => {
    vite.kill();
    console.error(`Failed to launch Electron: ${error.message}`);
    process.exitCode = 1;
  });
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.on(signal, () => {
      electron.kill(signal);
      vite.kill(signal);
    });
  }
  return undefined;
}

if (process.env.KAIROS_RENDERER === "vue") {
  runVuePreview().then(code => { if (typeof code === "number") process.exit(code); });
} else {
  process.exit(runElectron());
}
