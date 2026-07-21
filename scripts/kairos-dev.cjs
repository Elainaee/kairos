const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

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

function runElectron() {
  const electronCmd = localPath("node_modules", ".bin", isWindows ? "electron.cmd" : "electron");
  const electronExe = localPath("node_modules", "electron", "dist", isWindows ? "electron.exe" : "electron");

  // Windows .cmd shims require a command shell. Prefer Electron's real binary so
  // double-click launchers surface the app instead of silently returning code 1.
  if (existsSync(electronExe)) {
    return spawnSync(electronExe, ["."], { cwd: root, stdio: "inherit", shell: false }).status ?? 1;
  }
  if (existsSync(electronCmd)) {
    return spawnSync(electronCmd, ["."], { cwd: root, stdio: "inherit", shell: isWindows }).status ?? 1;
  }

  printInstallHelp();
  return 1;
}

process.exit(runElectron());
