import fs from "node:fs/promises";
import path from "node:path";
import { normalize as normalizeAppState } from "../data/app-state/index.js";

const LEGACY_FILES = {
  "ai-data": "ai-data.json",
  "music-state": "music-state.json",
  "netease-api-state": "netease-api-state.json",
  "ai-settings": "ai-settings.json",
  "pet-state": "pet-state.json",
  "window-state": "window-state.json"
};

async function readJson(filePath) {
  try {
    return JSON.parse((await fs.readFile(filePath, "utf8")).replace(/^\uFEFF/, ""));
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw new Error(`legacy_json_invalid:${path.basename(filePath)}:${error?.message || error}`);
  }
}

async function preserveLegacyFile(source, targetDir) {
  const name = path.basename(source);
  try {
    await fs.mkdir(targetDir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    await fs.copyFile(source, path.join(targetDir, `${stamp}-${name}`));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

export async function migrateLegacyJsonToSqlite({ userDataDir, database }) {
  if (!database?.available) throw new Error("sqlite_unavailable");
  const alreadyMigrated = database.audit().migrations.some(item => item.id === "legacy-json-to-sqlite-v1");
  if (alreadyMigrated) return { migrated: false, reason: "already_migrated" };

  const databaseAlreadyHasData = database.hasAppState() || Object.keys(LEGACY_FILES).some(store => database.hasStore(store));
  if (databaseAlreadyHasData) {
    database.importLegacyData({});
    return { migrated: false, reason: "existing_sqlite_data" };
  }

  const appStatePath = path.join(userDataDir, "app-state.json");
  const appStateRaw = await readJson(appStatePath);
  const stores = {};
  for (const [store, name] of Object.entries(LEGACY_FILES)) {
    const raw = await readJson(path.join(userDataDir, name));
    if (raw !== null) stores[store] = raw;
  }

  if (appStateRaw === null && Object.keys(stores).length === 0) {
    database.importLegacyData({ appState: normalizeAppState({}) });
    return { migrated: true, reason: "fresh_install" };
  }

  const legacyDir = path.join(userDataDir, "legacy-json");
  await Promise.all([
    preserveLegacyFile(appStatePath, legacyDir),
    ...Object.values(LEGACY_FILES).map(name => preserveLegacyFile(path.join(userDataDir, name), legacyDir))
  ]);
  database.importLegacyData({ appState: appStateRaw ? normalizeAppState(appStateRaw) : normalizeAppState({}), stores });
  return { migrated: true, reason: "legacy_json_imported", stores: Object.keys(stores) };
}
