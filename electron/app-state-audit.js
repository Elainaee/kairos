import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { auditAppState } from "./app-state.js";

function defaultAppStatePath() {
  const platform = process.platform;
  if (platform === "win32") return path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "Kairos", "app-state.json");
  if (platform === "darwin") return path.join(os.homedir(), "Library", "Application Support", "Kairos", "app-state.json");
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "Kairos", "app-state.json");
}

function printReport(report, source) {
  const s = report.summary || {};
  console.log(`Kairos app-state audit: ${report.ok ? "OK" : "ISSUES_FOUND"}`);
  console.log(`Source: ${source}`);
  console.log(`Version: ${s.version}`);
  console.log(`Counts: ${s.schedules} schedules, ${s.tasks} tasks, ${s.habits} habits, ${s.checkins} checkins, ${s.notes} notes, ${s.studyPlans} studyPlans, ${s.moods} moods`);
  if (!report.issues.length) {
    console.log("Issues: none");
    return;
  }
  console.log(`Issues: ${report.issues.length}`);
  for (const issue of report.issues) {
    const detail = Object.entries(issue).filter(([key]) => !["code", "message"].includes(key)).map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(",") : value}`).join(" ");
    console.log(`- ${issue.code}: ${issue.message}${detail ? ` (${detail})` : ""}`);
  }
}

async function main() {
  const arg = process.argv.slice(2).find(value => value !== "--");
  const source = path.resolve(arg || defaultAppStatePath());
  const raw = JSON.parse((await fs.readFile(source, "utf8")).replace(/^\uFEFF/, ""));
  const report = auditAppState(raw);
  printReport(report, source);
  process.exitCode = report.ok ? 0 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(`Kairos app-state audit failed: ${error?.message || error}`);
    process.exitCode = 1;
  });
}
