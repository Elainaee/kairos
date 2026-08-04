import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAppState } from "../../data/app-state/index.js";
import { KairosAppDatabase } from "../../data/sqlite/index.js";

const JSON_FILES = [
  ["app-state.json", true],
  ["ai-data.json", false],
  ["music-state.json", false],
  ["netease-api-state.json", false],
  ["ai-settings.json", false],
  ["pet-state.json", false],
  ["window-state.json", false]
];

function defaultUserDataDir() {
  if (process.platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Kairos");
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Kairos");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Kairos");
}

async function readJsonFile(file) {
  const text = (await fs.readFile(file, "utf8")).replace(/^\uFEFF/, "");
  return JSON.parse(text);
}

async function inspectJsonFile(dir, name, required) {
  const file = path.join(dir, name);
  const stat = await fs.stat(file).catch(error => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (!stat) return { name, path: file, required, exists: false, ok: !required, issue: required ? "missing_required_file" : "missing_optional_file" };
  try {
    const json = await readJsonFile(file);
    const result = { name, path: file, required, exists: true, ok: true, size: stat.size, modified_at: stat.mtime.toISOString() };
    if (name === "app-state.json") result.appState = auditAppState(json);
    if (result.appState && !result.appState.ok) {
      result.ok = false;
      result.issue = "app_state_issues";
    }
    return result;
  } catch (error) {
    return { name, path: file, required, exists: true, ok: false, size: stat.size, modified_at: stat.mtime.toISOString(), issue: "invalid_json", message: error?.message || String(error) };
  }
}

async function inspectDatabase(dir) {
  const name = "kairos.sqlite";
  const file = path.join(dir, name);
  const stat = await fs.stat(file).catch(error => error?.code === "ENOENT" ? null : Promise.reject(error));
  if (!stat) return { name, path: file, required: false, exists: false, ok: true, issue: "missing_optional_file" };
  const database = new KairosAppDatabase(file);
  try {
    const initialized = await database.initialize();
    const audit = initialized.available ? database.audit() : initialized;
    return { name, path: file, required: false, exists: true, ok: audit.available === true, size: stat.size, modified_at: stat.mtime.toISOString(), database: audit, issue: audit.available === true ? "" : "sqlite_unavailable" };
  } catch (error) {
    return { name, path: file, required: false, exists: true, ok: false, size: stat.size, modified_at: stat.mtime.toISOString(), issue: "invalid_sqlite", message: error?.message || String(error) };
  } finally {
    database.close();
  }
}

export async function auditDesktopDataDir(dir = defaultUserDataDir()) {
  const userDataDir = path.resolve(dir);
  const files = await Promise.all(JSON_FILES.map(([name, required]) => inspectJsonFile(userDataDir, name, required)));
  const database = await inspectDatabase(userDataDir);
  const issues = files.filter(file => !file.ok || file.issue === "missing_optional_file");
  return {
    ok: files.every(file => file.ok) && database.ok,
    userDataDir,
    files,
    database,
    issues: database.issue ? [...issues, database] : issues,
    appState: files.find(file => file.name === "app-state.json")?.appState || null
  };
}

function printReport(report) {
  console.log(`Kairos desktop data audit: ${report.ok ? "OK" : "ISSUES_FOUND"}`);
  console.log(`User data: ${report.userDataDir}`);
  for (const file of report.files) {
    const status = file.ok ? file.exists ? "OK" : "MISSING_OPTIONAL" : "ISSUE";
    const size = file.exists ? ` ${file.size} B` : "";
    console.log(`- ${file.name}: ${status}${size}${file.issue ? ` ${file.issue}` : ""}`);
  }
  if (report.database) {
    const status = report.database.ok ? report.database.exists ? "OK" : "MISSING_OPTIONAL" : "ISSUE";
    const size = report.database.exists ? ` ${report.database.size} B` : "";
    console.log(`- ${report.database.name}: ${status}${size}${report.database.issue ? ` ${report.database.issue}` : ""}`);
  }
  const s = report.appState?.summary;
  if (s) console.log(`App-state: ${s.schedules} schedules, ${s.tasks} tasks, ${s.habits} habits`);
  if (!report.appState?.issues?.length) return;
  console.log(`App-state issues: ${report.appState.issues.length}`);
  for (const issue of report.appState.issues) console.log(`  - ${issue.code}: ${issue.message}`);
}

async function main() {
  const arg = process.argv.slice(2).find(value => value !== "--");
  const report = await auditDesktopDataDir(arg || defaultUserDataDir());
  printReport(report);
  process.exitCode = report.ok ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Kairos desktop data audit failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
