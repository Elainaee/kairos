import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { listPackage } from "@electron/asar";

const root = path.resolve(".");
const unpacked = path.join(root, "release", "win-unpacked");
const executable = path.join(unpacked, "Kairos.exe");
const asar = path.join(unpacked, "resources", "app.asar");

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

assert.equal(await exists(executable), true, "Directory package should contain release/win-unpacked/Kairos.exe");
assert.equal(await exists(asar), true, "Directory package should contain release/win-unpacked/resources/app.asar");

const entries = listPackage(asar).map(entry => entry.replaceAll("\\", "/").replace(/^\/+/, ""));
assert.ok(entries.includes("package.json"), "Directory package should contain runtime package metadata");
assert.ok(entries.includes("electron/main/index.js"), "Directory package should contain the Electron main process");
assert.ok(entries.includes("app/vue-preview/index.html"), "Directory package should contain the production Vue renderer");
assert.equal(entries.some(entry => /^\.env(?:\.|$)/.test(entry)), false, "Directory package must not contain local environment files");

console.log("Directory package verification passed.");
