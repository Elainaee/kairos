const { existsSync } = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const isWindows = process.platform === "win32";

function which(command) {
  const result = spawnSync(isWindows ? "where" : "command", isWindows ? [command] : ["-v", command], {
    encoding: "utf8",
    shell: !isWindows
  });
  if (result.status !== 0) return "";
  return result.stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean)[0] || "";
}

function version(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", shell: false });
  if (result.status !== 0) return "";
  return result.stdout.trim() || result.stderr.trim();
}

function row(label, value) {
  console.log(`${label.padEnd(18)} ${value || "not found"}`);
}

const localElectronCmd = path.join(root, "node_modules", ".bin", isWindows ? "electron.cmd" : "electron");
const localElectronExe = path.join(root, "node_modules", "electron", "dist", isWindows ? "electron.exe" : "electron");

console.log("Kairos desktop environment");
console.log("--------------------------");
row("Project root", root);
row("Node", `${process.execPath} ${process.version}`);
row("npm", [which("npm"), version("npm")].filter(Boolean).join(" "));
row("pnpm", [which("pnpm"), version("pnpm")].filter(Boolean).join(" "));
row("corepack", [which("corepack"), version("corepack")].filter(Boolean).join(" "));
row("Electron bin", existsSync(localElectronCmd) ? localElectronCmd : "");
row("Electron exe", existsSync(localElectronExe) ? localElectronExe : "");
console.log("");

if (existsSync(localElectronCmd) || existsSync(localElectronExe)) {
  console.log("OK: local Electron is installed. Run pnpm dev.");
} else {
  console.log("Needs install: local Electron is missing. Run pnpm install.");
}
