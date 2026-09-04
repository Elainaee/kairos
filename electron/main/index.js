import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, protocol, safeStorage, screen, shell, Tray } from "electron";
import crypto from "node:crypto";
import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { ProviderError, listProviderModels, resolveSelectableModels, streamProviderRequest, testProvider } from "../services/ai/providers.js";
import { allProviderDefinitions, assertUniqueProviderName, createCustomDefinition, definitionFromSettings, normalizeCustomBaseURL, normalizeProviderEntry, normalizeProviderState } from "../services/ai/provider-settings.js";
import { AiDataStore } from "../services/ai/data-store.js";
import { AttachmentService } from "../services/documents/attachments.js";
import { ToolRuntime } from "../services/ai/tool-runtime.js";
import { AppStateStore, auditAppState, createAppAdapters } from "../data/app-state/index.js";
import { KairosAppDatabase } from "../data/sqlite/index.js";
import { ContextManager } from "../services/ai/context-manager.js";
import { MusicLibrary } from "../services/music/music-library.js";
import { runKairosAgent as runKairosAgentBase } from "../services/ai/langchain-agent.js";
import { createWebSearch } from "../services/web/web-search.js";
import { NeteaseApiService } from "../services/music/netease-api-service.js";
import { NeteaseDownloadService } from "../services/music/netease-download-service.js";
import { AiMusicController } from "../services/music/ai-music-controller.js";
import { SettingsRepository } from "../data/settings/index.js";
import { initializeAssistantProfile, normalizeAssistantProfile, updateAssistantProfile } from "../data/assistant-profile.js";
import { CalendarBackgroundService } from "../services/calendar/calendar-backgrounds.js";
import { FocusSessionService } from "../services/focus/focus-session-service.js";
import { MemoryLedger } from "../services/ai/memory/memory-ledger.js";
import { MemoryViews } from "../services/ai/memory/memory-views.js";
import { AgentMemoryService } from "../services/ai/memory/memory-service.js";
import { DEFAULT_PERSONAL_PROFILE, buildPersonalizationInstruction, buildPortraitMessages, clearPortrait, commitPortrait, initializePersonalProfile, normalizePersonalProfile, parsePortraitResponse, setPortraitStatus, updatePersonalProfile } from "../data/personal-profile.js";

// Vue's development renderer is served from http://127.0.0.1, which cannot
// load a user's file: music URL directly.  The original file-based renderer
// keeps using file: URLs; this private protocol is only selected by the
// shared player when its parent window is the Vue dev server.
protocol.registerSchemesAsPrivileged([{
  scheme: "kairos-media",
  // The Vue renderer is http:-backed.  Keep the local-audio endpoint
  // explicitly CORS-capable so Chromium is allowed to consume it from the
  // parent player without falling back to a blocked file: request.
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}, {
  scheme: "kairos-focus-scene",
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const appIconPath = path.join(root, "app", "assets", "icons", "kairos.ico");
const nativeI18nMessages = JSON.parse(fsSync.readFileSync(path.join(root, "app", "i18n", "locales", "en.json"), "utf8"));
const nativeI18nChineseMessages = JSON.parse(fsSync.readFileSync(path.join(root, "app", "i18n", "locales", "zh-CN.json"), "utf8"));
let nativeLocalePreference = "en";
const nativeLocale = () => {
  const requested = nativeLocalePreference === "system" ? app.getLocale?.() || "en" : nativeLocalePreference;
  return /^zh(?:-|_)?cn|^zh/i.test(String(requested)) ? "zh-CN" : "en";
};
const nativeValue = (messages, key) => key.split(".").reduce((value, part) => value && typeof value === "object" ? value[part] : undefined, messages);
const nativeT = (key, params = {}, fallback = key) => {
  const messages = nativeLocale() === "zh-CN" ? nativeI18nChineseMessages : nativeI18nMessages;
  const value = nativeValue(messages, key) ?? nativeValue(nativeI18nMessages, key) ?? fallback;
  return String(value).replace(/\{(\w+)\}/g, (_match, name) => params[name] ?? "");
};
const setNativeLocale = state => {
  nativeLocalePreference = state?.settings?.general?.language || "en";
  // The workspace provides its own navigation.  Keeping Electron's native
  // menu would add a second, empty-looking strip above it on Windows.
  Menu.setApplicationMenu(null);
};
const runKairosAgent = input => runKairosAgentBase({ ...input, locale: nativeLocale(), t: nativeT });
// The Vue shell is the released product experience.  The static renderer is
// retained only for explicit diagnostics via KAIROS_RENDERER=legacy.
const rendererMode = process.env.KAIROS_RENDERER === "legacy" ? "legacy" : "vue";
const vueDevServerUrl = process.env.KAIROS_VITE_DEV_SERVER_URL || "";
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
dotenv.config({ path: path.join(root, ".env.firecrawl.local"), quiet: true });
const controllers = new Map();
const sessionKeys = new Map();
let mainWindow, petWindow, aiChatWindow;
let aiChatFollowTimer = null;
let aiChatTargetBounds = null;
let aiChatFadeTimer = null;
let petMoveTimer = null;
let petPendingDx = 0;
let petPendingDy = 0;
let petVisible = true;
let tray = null;
let isQuitting = false;
let focusQuitFinalized = false;
let closePromptOpen = false;
let aiStore, appStateStore, appDatabase, attachments, toolRuntime, contextManager, appAdapters, musicLibrary, neteaseService, neteaseDownloadService, aiMusicController, aiSettingsRepository, personalProfileSettingsRepository, calendarBackgrounds, agentMemoryService, focusSessionService;
const pendingMusicCommands = new Map();
const pendingCalendarBackgroundImports = new Map();
const personalPortraitJobs = new Map();
let personalProfileMutationQueue = Promise.resolve();
// Electron transparent windows must not be resized after construction. Reserve
// the largest surface needed by the pet and its context menu up front; unused
// pixels remain transparent and mouse-pass-through.
const PET_WINDOW_SIZE = Object.freeze({ width: 260, height: 280 });
const AI_CHAT_PANEL_SIZE = Object.freeze({ width: 520, height: 680 });
const AI_CHAT_TRANSPARENT_GUTTER = 4;
const OVERLAY_WINDOW_OPTIONS = Object.freeze({
  frame: false,
  transparent: true,
  resizable: false,
  hasShadow: false
});
const smokeTest = process.env.KAIROS_SMOKE_TEST === "1";
const petSmokeTest = process.env.KAIROS_PET_SMOKE_TEST === "1";
const overlayVisualTest = process.env.KAIROS_OVERLAY_VISUAL_TEST === "1";
const overlayVisualTarget = process.env.KAIROS_OVERLAY_VISUAL_TARGET || "both";
if (process.env.KAIROS_USER_DATA_DIR) app.setPath("userData", process.env.KAIROS_USER_DATA_DIR);
if (process.platform === "win32") app.setAppUserModelId("app.kairos.desktop");
function isPidRunning(pid) {
  const value = Number(pid);
  if (!Number.isInteger(value) || value <= 0) return false;
  try {
    process.kill(value, 0);
    return true;
  } catch {
    return false;
  }
}
function acquireUserDataProcessLock() {
  const filePath = path.join(app.getPath("userData"), "kairos-instance.lock");
  fsSync.mkdirSync(path.dirname(filePath), { recursive: true });
  try {
    fsSync.writeFileSync(filePath, String(process.pid), { flag: "wx" });
  } catch (error) {
    if (error?.code !== "EEXIST") return false;
    const existingPid = Number(fsSync.readFileSync(filePath, "utf8"));
    if (isPidRunning(existingPid)) return false;
    fsSync.rmSync(filePath, { force: true });
    fsSync.writeFileSync(filePath, String(process.pid), { flag: "wx" });
  }
  const cleanup = () => {
    try {
      if (Number(fsSync.readFileSync(filePath, "utf8")) === process.pid) fsSync.rmSync(filePath, { force: true });
    } catch {}
  };
  process.once("exit", cleanup);
  return true;
}
const hasUserDataProcessLock = acquireUserDataProcessLock();
const hasSingleInstanceLock = hasUserDataProcessLock && app.requestSingleInstanceLock({ userDataDir: app.getPath("userData") });
if (!hasUserDataProcessLock || !hasSingleInstanceLock) {
  app.quit();
  app.exit(0);
}
const smokeResultPath = process.env.KAIROS_SMOKE_RESULT_PATH || "";
const smokeStateMarker = process.env.KAIROS_SMOKE_STATE_MARKER || "";
const smokeExpectStateMarker = process.env.KAIROS_SMOKE_EXPECT_STATE_MARKER === "1";
const smokeMusicFile = process.env.KAIROS_SMOKE_MUSIC_FILE || "";
const smokeExpectMusicMissing = process.env.KAIROS_SMOKE_EXPECT_MUSIC_MISSING === "1";
const smokeExpectedLanguage = process.env.KAIROS_SMOKE_EXPECT_LANGUAGE || "";
const smokePersistLanguage = process.env.KAIROS_SMOKE_PERSIST_LANGUAGE || "";
const smokeCaptureVisuals = process.env.KAIROS_SMOKE_CAPTURE_VISUALS === "1";

const settingsPath = () => path.join(app.getPath("userData"), "ai-settings.json");
const personalProfilePath = () => path.join(app.getPath("userData"), "personal-profile.json");
const petStatePath = () => path.join(app.getPath("userData"), "pet-state.json");
const windowStatePath = () => path.join(app.getPath("userData"), "window-state.json");
const calendarBackgroundDir = () => path.join(app.getPath("userData"), "calendar-backgrounds");
const bundledFfmpegPath = () => app.isPackaged
  ? path.join(process.resourcesPath, "ffmpeg", "win-x64", "ffmpeg.exe")
  : path.join(root, "vendor", "ffmpeg", "win-x64", "ffmpeg.exe");
const providerDefaults = normalizeProviderState({ defaultProvider: "openai" });
const defaults = { ...providerDefaults, firecrawl: { encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false }, assistantProfile: { name: "Kairos Assistant", avatar: "", updatedAt: "", migratedAt: "" } };
function normalizeSettings(value = {}) { const base = structuredClone(defaults); const providerState = normalizeProviderState(value); return { ...base, ...value, ...providerState, firecrawl: { ...base.firecrawl, ...(value.firecrawl || {}) }, assistantProfile: normalizeAssistantProfile(value.assistantProfile) }; }
function settingsRepository() { if (!aiSettingsRepository) aiSettingsRepository = new SettingsRepository({ filePath: settingsPath(), defaults, normalize: normalizeSettings, database: appDatabase, storeKey: "ai-settings", summarize: value => ({ defaultProvider: value.defaultProvider || "", providers: Object.keys(value.providers || {}).length, firecrawlConfigured: Boolean(value.firecrawl?.encryptedKey), assistantProfileConfigured: Boolean(value.assistantProfile?.updatedAt) }) }); return aiSettingsRepository; }
async function readSettings() { return settingsRepository().read(); }
async function writeSettings(value) { return settingsRepository().write(value); }
function personalProfileRepository() {
  if (!personalProfileSettingsRepository) personalProfileSettingsRepository = new SettingsRepository({
    filePath: personalProfilePath(),
    defaults: DEFAULT_PERSONAL_PROFILE,
    normalize: normalizePersonalProfile,
    database: appDatabase,
    storeKey: "personal-profile",
    summarize: value => ({ memoryEnabled: value.memoryEnabled, manualFields: Object.values(value.manual || {}).filter(item => Array.isArray(item) ? item.length : item !== "" && item != null).length, portraitConfigured: Boolean(value.portrait?.text) })
  });
  return personalProfileSettingsRepository;
}
async function readPersonalProfile() { await personalProfileMutationQueue.catch(() => {}); return personalProfileRepository().read(); }
async function writePersonalProfile(value) {
  const operation = personalProfileMutationQueue.catch(() => {}).then(async () => {
    const saved = await personalProfileRepository().write(value);
    for (const win of [mainWindow, aiChatWindow]) if (win && !win.isDestroyed()) win.webContents.send("ai:personal-profile-changed", saved);
    return saved;
  });
  personalProfileMutationQueue = operation.catch(() => {});
  return operation;
}
async function mutatePersonalProfile(change) {
  const operation = personalProfileMutationQueue.catch(() => {}).then(async () => {
    const current = await personalProfileRepository().read();
    const saved = await personalProfileRepository().write(change(normalizePersonalProfile(current)));
    for (const win of [mainWindow, aiChatWindow]) if (win && !win.isDestroyed()) win.webContents.send("ai:personal-profile-changed", saved);
    return saved;
  });
  personalProfileMutationQueue = operation.catch(() => {});
  return operation;
}
async function readLegacyStore(store, legacyPath, fallback = null) {
  const existing = appDatabase?.readStorePayload(store);
  if (existing !== null && existing !== undefined) return existing;
  try { const legacy = JSON.parse(await fs.readFile(legacyPath, "utf8")); appDatabase.saveStorePayload(store, legacy); return legacy; } catch { return fallback; }
}
async function readPetState() { const state = await readLegacyStore("pet-state", petStatePath(), { visible: true }); return { visible: state?.visible !== false }; }
async function writePetState(value) { appDatabase.saveStorePayload("pet-state", { visible: value?.visible !== false }); }
async function readWindowState() { return readLegacyStore("window-state", windowStatePath(), null); }
async function writeWindowState(value) { appDatabase.saveStorePayload("window-state", value || {}); }
async function cleanupMigratedLegacyData(userData) {
  if (!/KairosDev$/i.test(userData) && process.env.KAIROS_MIGRATE_CLEANUP !== "1") return { skipped: true };
  const audit = appDatabase.audit();
  const stores = new Set((audit.stores || []).map(item => item.store));
  if (!audit.snapshot || !["ai-data", "ai-settings", "personal-profile", "music-state", "netease-api-state", "pet-state", "window-state"].every(store => stores.has(store))) throw new Error("sqlite_migration_verification_failed");
  const targets = ["ai-data.json", "ai-settings.json", "personal-profile.json", "app-state.json", "music-state.json", "netease-api-state.json", "pet-state.json", "window-state.json", "attachments", "blob_storage", "music-covers", "calendar-backgrounds"].map(name => path.join(userData, name));
  await Promise.all(targets.map(target => fs.rm(target, { recursive: true, force: true })));
  return { removed: targets.map(target => path.basename(target)) };
}
function calendarBackgroundService() {
  if (!calendarBackgrounds) calendarBackgrounds = new CalendarBackgroundService({ builtinDir: path.join(root, "app", "assets", "calendar-backgrounds"), legacyDir: calendarBackgroundDir(), database: appDatabase });
  return calendarBackgrounds;
}
async function registerCalendarBackgroundProtocol() {
  protocol.handle("kairos-background", async request => {
    const url = new URL(request.url);
    const source = url.hostname === "custom" ? "custom" : url.hostname === "builtin" ? "builtin" : "";
    const id = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const image = source ? await calendarBackgroundService().resolve(source, id) : null;
    if (!image) return new Response("Not found", { status: 404 });
    const payload = image.payload || await fs.readFile(image.filePath);
    return new Response(payload, { headers: { "content-type": image.mimeType, "cache-control": "no-store" } });
  });
}
async function registerMusicMediaProtocol() {
  protocol.handle("kairos-media", async request => {
    try {
      const url = new URL(request.url);
      const id = decodeURIComponent(url.pathname.replace(/^\//, ""));
      if (url.hostname === "cover") {
        // Local covers are canonical SQLite assets. Resolve them directly so
        // artwork remains available while the public music snapshot is being
        // refreshed or transferred to the Vue renderer.
        const directAsset = musicLibrary?.database?.readBinaryAsset?.(`music-cover:${id}`);
        if (directAsset?.payload?.length) {
          return new Response(directAsset.payload, {
            headers: {
              "content-type": directAsset.mimeType || "image/jpeg",
              "access-control-allow-origin": "*",
              "cache-control": "no-store"
            }
          });
        }
      }
      const state = await musicLibrary?.read();
      const track = state?.tracks?.find(item => item?.id === id);
      if (!track) return new Response("Not found", { status: 404 });
      if (url.hostname === "cover") {
        // MusicLibrary migrates local artwork into SQLite and deliberately
        // removes coverPath.  Serve that canonical asset first; coverPath is
        // only retained for a legacy record that has not migrated yet.
        const asset = track.coverAssetId ? musicLibrary?.database?.readBinaryAsset?.(track.coverAssetId) : null;
        if (asset?.payload?.length) {
          return new Response(asset.payload, {
            headers: { "content-type": asset.mimeType || "image/jpeg", "access-control-allow-origin": "*" }
          });
        }
        const coverPath = track.coverPath;
        if (!coverPath) return new Response("Not found", { status: 404 });
        const filePath = path.resolve(coverPath);
        const stat = await fs.stat(filePath);
        if (!stat.isFile()) return new Response("Not found", { status: 404 });
        const mimeType = {
          ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
          ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".avif": "image/avif"
        }[path.extname(filePath).toLowerCase()] || "image/jpeg";
        return new Response(await fs.readFile(filePath), {
          headers: { "content-type": mimeType, "access-control-allow-origin": "*" }
        });
      }
      if (url.hostname !== "track" || !track.path) return new Response("Not found", { status: 404 });
      const filePath = path.resolve(track.path);
      const stat = await fs.stat(filePath);
      if (!stat.isFile()) return new Response("Not found", { status: 404 });
      const mimeType = {
        ".mp3": "audio/mpeg", ".flac": "audio/flac", ".wav": "audio/wav",
        ".m4a": "audio/mp4", ".mp4": "audio/mp4", ".aac": "audio/aac"
      }[path.extname(filePath).toLowerCase()];
      if (!mimeType) return new Response("Unsupported media", { status: 415 });
      // Chromium requests byte ranges for media.  Serve them directly from
      // the Electron-owned protocol so the original single <audio> element
      // can decode local files from the HTTP-backed Vue renderer.
      const rangeHeader = request.headers.get("range");
      const source = await fs.readFile(filePath);
      const baseHeaders = {
        "content-type": mimeType,
        "accept-ranges": "bytes",
        "access-control-allow-origin": "*"
      };
      if (!rangeHeader) {
        return new Response(source, {
          headers: { ...baseHeaders, "content-length": String(source.length) }
        });
      }
      const match = /^bytes=(\d*)-(\d*)$/i.exec(rangeHeader.trim());
      if (!match) return new Response("Range Not Satisfiable", { status: 416, headers: { "content-range": `bytes */${source.length}` } });
      const requestedStart = match[1] ? Number(match[1]) : Math.max(0, source.length - Number(match[2] || 0));
      const requestedEnd = match[2] && match[1] ? Number(match[2]) : source.length - 1;
      if (!Number.isSafeInteger(requestedStart) || !Number.isSafeInteger(requestedEnd) || requestedStart < 0 || requestedStart >= source.length || requestedEnd < requestedStart) {
        return new Response("Range Not Satisfiable", { status: 416, headers: { "content-range": `bytes */${source.length}` } });
      }
      const end = Math.min(requestedEnd, source.length - 1);
      const payload = source.subarray(requestedStart, end + 1);
      return new Response(payload, {
        status: 206,
        headers: {
          ...baseHeaders,
          "content-length": String(payload.length),
          "content-range": `bytes ${requestedStart}-${end}/${source.length}`
        }
      });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
function restoreWindowBounds(saved) {
  const fallback = { width: 1440, height: 900 };
  const savedX = Number(saved?.x);
  const savedY = Number(saved?.y);
  const savedWidth = Number(saved?.width);
  const savedHeight = Number(saved?.height);
  const width = Math.max(900, Math.min(2200, Number.isFinite(savedWidth) ? savedWidth : fallback.width));
  const height = Math.max(650, Math.min(1600, Number.isFinite(savedHeight) ? savedHeight : fallback.height));
  const displays = screen.getAllDisplays();
  const point = { x: Number.isFinite(savedX) ? savedX : 0, y: Number.isFinite(savedY) ? savedY : 0 };
  const display = displays.find(item => {
    const area = item.workArea;
    return point.x >= area.x && point.x <= area.x + area.width && point.y >= area.y && point.y <= area.y + area.height;
  }) || screen.getPrimaryDisplay();
  const area = display.workArea;
  const finalWidth = Math.round(Math.min(width, area.width));
  const finalHeight = Math.round(Math.min(height, area.height));
  const x = Number.isFinite(savedX) ? savedX : area.x + 48;
  const y = Number.isFinite(savedY) ? savedY : area.y + 48;
  return {
    x: Math.round(Math.max(area.x, Math.min(x, area.x + area.width - finalWidth))),
    y: Math.round(Math.max(area.y, Math.min(y, area.y + area.height - finalHeight))),
    width: finalWidth,
    height: finalHeight
  };
}
function attachWindowStatePersistence(win) {
  let timer = null;
  const scheduleSave = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (!win || win.isDestroyed() || win.isMinimized()) return;
      writeWindowState(win.getBounds()).catch(error => console.error("Failed to save window state:", error));
    }, 250);
  };
  win.on("resize", scheduleSave);
  win.on("move", scheduleSave);
  win.on("close", () => {
    if (timer) clearTimeout(timer);
    if (!win.isDestroyed() && !win.isMinimized()) writeWindowState(win.getBounds()).catch(() => {});
  });
}
function sendPetVisibility() { mainWindow?.webContents.send("pet:visibility", petVisible); }
const PET_ACTIONS = new Set(["idle", "talk", "happy", "sleepy", "reminder", "focus-away"]);
const SHELL_VIEWS = new Set(["calendar", "schedule", "habits", "music", "settings"]);
function sendShellCommand(type, payload = {}) {
  if (!SHELL_VIEWS.has(type) || !mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("shell:command", { type, ...payload });
  return true;
}
function showNativeReminder(input = {}) {
  if (!Notification.isSupported()) return { shown: false, reason: "not_supported" };
  const itemTitle = typeof input.title === "string" ? input.title.trim().slice(0, 120) : nativeT("reminders.untitledSchedule", {}, "Untitled schedule");
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 220) : "";
  const missed = input.missed === true;
  const notification = new Notification({
    title: `Kairos · ${missed ? nativeT("electron.missedReminder", {}, "Missed reminder") : nativeT("electron.scheduleReminder", {}, "Schedule reminder")}`,
    body: note ? `${itemTitle}\n${note}` : itemTitle,
    silent: false
  });
  notification.on("click", () => sendShellCommand("schedule", { scheduleId: typeof input.scheduleId === "string" ? input.scheduleId.slice(0, 120) : "" }));
  notification.show();
  return { shown: true };
}
function buildApplicationMenu() {
  const navigate = (type) => () => sendShellCommand(type);
  return Menu.buildFromTemplate([
    {
      label: "Kairos",
      submenu: [
        { label: nativeT("electron.openAssistant", {}, "Open AI assistant"), accelerator: "CommandOrControl+Shift+A", click: () => { sendPetAction("talk"); showAiChatWindow(); } },
        { label: petVisible ? nativeT("electron.hidePet", {}, "Hide desktop pet") : nativeT("electron.showPet", {}, "Show desktop pet"), click: async () => { petVisible = !petVisible; await writePetState({ visible: petVisible }); if (petVisible) showPetWindow({ reposition: true }); else petWindow?.hide(); sendPetVisibility(); Menu.setApplicationMenu(null); } },
        { type: "separator" },
        { role: "quit", label: nativeT("electron.quit", {}, "Quit Kairos") }
      ]
    },
    {
      label: nativeT("electron.page", {}, "Page"),
      submenu: [
        { label: nativeT("nav.calendar", {}, "Calendar"), accelerator: "Alt+1", click: navigate("calendar") },
        { label: nativeT("nav.schedule", {}, "Schedule"), accelerator: "Alt+2", click: navigate("schedule") },
        { label: nativeT("nav.habits", {}, "Habits"), accelerator: "Alt+3", click: navigate("habits") },
        { label: nativeT("nav.music", {}, "Music"), accelerator: "Alt+4", click: navigate("music") },
        { type: "separator" },
        { label: nativeT("common.settings", {}, "Settings"), accelerator: "CommandOrControl+,", click: navigate("settings") }
      ]
    },
    {
      label: nativeT("electron.window", {}, "Window"),
      submenu: [
        { role: "minimize", label: nativeT("electron.minimize", {}, "Minimize") },
        { role: "zoom", label: nativeT("electron.zoom", {}, "Zoom") },
        { type: "separator" },
        { role: "close", label: nativeT("electron.closeWindow", {}, "Close window") }
      ]
    }
  ]);
}
function sendPetAction(action, payload = {}) {
  if (!PET_ACTIONS.has(action) || !petWindow || petWindow.isDestroyed()) return false;
  const title = typeof payload.title === "string" ? payload.title.slice(0, 80) : "";
  petWindow.webContents.send("pet:action", { action, title });
  return true;
}
function environmentKeyForProvider(provider) {
  if (provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (provider === "doubao") return process.env.ARK_API_KEY || "";
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY || "";
  if (provider === "mimo-api") return process.env.MIMO_API_KEY || "";
  if (provider === "mimo-token-plan") return process.env.MIMO_TOKEN_PLAN_API_KEY || "";
  return "";
}
function resolveProviderKey(settings, entry, provider) {
  if (sessionKeys.has(provider)) return sessionKeys.get(provider);
  if (entry?.encryptedKey && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(entry.encryptedKey, "base64"));
  if (!entry?.environmentDisabled) return environmentKeyForProvider(provider);
  return "";
}
function decryptFirecrawlKey(settings) {
  if (settings?.firecrawl?.encryptedKey && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(settings.firecrawl.encryptedKey, "base64"));
  if (!settings?.firecrawl?.environmentDisabled) return process.env.FIRECRAWL_API_KEY || "";
  return "";
}
function keyHint(apiKey) {
  const value = String(apiKey || "").trim();
  if (!value) return "";
  if (value.length <= 8) return `${value.slice(0, 2)}${"*".repeat(Math.max(2, value.length - 4))}${value.slice(-2)}`;
  const prefix = value.slice(0, Math.min(7, Math.max(4, value.indexOf("-") > 0 ? value.indexOf("-") + 5 : 6)));
  return `${prefix}${"*".repeat(Math.max(8, Math.min(24, value.length - prefix.length - 4)))}${value.slice(-4)}`;
}
function publicSettings(settings) {
  const providerIds = new Set(Object.keys(allProviderDefinitions(settings)));
  return {
    ...settings,
    firecrawl: (() => {
      const value = settings.firecrawl || {};
      const saved = Boolean(value.encryptedKey);
      const session = false;
      const environment = !value.environmentDisabled && Boolean(process.env.FIRECRAWL_API_KEY);
      return { ...value, encryptedKey: undefined, configured: saved || session || environment, hasKey: saved || session || environment, source: saved ? "saved" : environment ? "environment" : "none", createdAt: value.createdAt || "", keyHint: value.keyHint || (environment ? keyHint(process.env.FIRECRAWL_API_KEY) : "") };
    })(),
    providers: Object.fromEntries([...providerIds].map(id => {
      const value = settings.providers?.[id] || {};
      const saved = Boolean(value.encryptedKey);
      const session = sessionKeys.has(id);
      const environment = !value.environmentDisabled && Boolean(environmentKeyForProvider(id));
      return [id, { ...value, encryptedKey: undefined, configured: saved || session || environment, hasKey: saved || session || environment, source: saved ? "saved" : session ? "session" : environment ? "environment" : "none", createdAt: value.createdAt || "", keyHint: value.keyHint || (session ? keyHint(sessionKeys.get(id)) : environment ? keyHint(environmentKeyForProvider(id)) : "") }];
    }))
  };
}
function providerCatalog(settings = {}) {
  return Object.values(allProviderDefinitions(settings)).map(provider => {
    const entry = settings.providers?.[provider.id] || {};
    const selection = resolveSelectableModels(provider, entry, { t: nativeT });
    return { ...provider, models: selection.enabledModels, availableModels: selection.availableModels, catalogModels: selection.catalogModels, configuredModels: selection.configuredModels, unavailableModels: selection.unavailableModels, defaultModel: selection.defaultModel };
  });
}

const focusSceneMimeTypes = Object.freeze({
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".htm": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
});

function focusSceneKind(filePath) {
  const extension = path.extname(String(filePath || "")).toLowerCase();
  if ([".mp4", ".webm"].includes(extension)) return "video";
  if (extension === ".gif") return "image";
  if ([".html", ".htm"].includes(extension)) return "html";
  return "";
}

async function registerFocusSceneProtocol() {
  protocol.handle("kairos-focus-scene", async request => {
    try {
      if (!appStateStore) return new Response("Not ready", { status: 503 });
      const scene = (await appStateStore.read())?.settings?.focus?.scene;
      const entryPath = String(scene?.path || "");
      if (scene?.source !== "file" || !focusSceneKind(entryPath)) return new Response("Not found", { status: 404 });
      const rootDir = path.resolve(path.dirname(entryPath));
      const url = new URL(request.url);
      const requested = decodeURIComponent(url.pathname.replace(/^\//, ""));
      const filePath = !requested || requested === "scene"
        ? path.resolve(entryPath)
        : path.resolve(rootDir, requested);
      const relative = path.relative(rootDir, filePath);
      if (relative.startsWith("..") || path.isAbsolute(relative)) return new Response("Forbidden", { status: 403 });
      const payload = await fs.readFile(filePath);
      const mimeType = focusSceneMimeTypes[path.extname(filePath).toLowerCase()] || "application/octet-stream";
      return new Response(payload, { headers: { "content-type": mimeType, "access-control-allow-origin": "*", "cache-control": "no-store" } });
    } catch {
      return new Response("Not found", { status: 404 });
    }
  });
}
function requireProviderDefinition(settings, provider) {
  const definition = definitionFromSettings(settings, provider);
  if (!definition) throw new ProviderError("unknown_provider", nativeT("errors.unknownProvider", {}, "Unknown AI provider."));
  return definition;
}
async function persistProviderSettings(settings) {
  const saved = await writeSettings(settings);
  const result = publicSettings(saved);
  broadcastProviderSettings(result);
  return result;
}
async function searchWebWithSettings(input) {
  const settings = await readSettings();
  return createWebSearch({ apiKey: decryptFirecrawlKey(settings), t: nativeT })(input);
}
function errorInfo(error) { if (error && typeof error === "object") return { code: error.code || "unknown", message: error.message || String(error) }; return { code: "unknown", message: typeof error === "string" ? error : "unknown_error" }; }
function broadcastAiStream(payload) {
  for (const win of [mainWindow, aiChatWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("ai:stream", payload);
  }
}
function broadcastAppState(state) {
  setNativeLocale(state);
  refreshTrayMenu();
  for (const win of [mainWindow, aiChatWindow, petWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("app:state-changed", state);
  }
}
function broadcastProviderSettings(settings) {
  const payload = { settings, providers: providerCatalog(settings) };
  for (const win of [mainWindow, aiChatWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("ai:settings-changed", payload);
  }
}
function broadcastFocusState(snapshot) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("focus:state-changed", snapshot);
}
async function refreshPersonalPortrait(conversationId, { force = false } = {}) {
  let id = String(conversationId || "").trim();
  if (!id) id = String((await aiStore.listConversations())?.[0]?.id || "");
  if (!id) return { updated: false, reason: "conversation_required" };
  if (personalPortraitJobs.has(id)) return personalPortraitJobs.get(id);
  const job = (async () => {
    let snapshot = await readPersonalProfile();
    if (!snapshot.memoryEnabled) return { updated: false, reason: "memory_disabled" };
    const conversation = await aiStore.getConversation(id);
    if (!conversation) return { updated: false, reason: "conversation_not_found" };
    const source = buildPortraitMessages(snapshot, conversation, nativeLocale());
    const evidenceLength = source.messages[0]?.content?.length || 0;
    if (!source.messages.length || (!force && (source.evidenceCount < 1 || evidenceLength < 80))) return { updated: false, reason: "no_new_evidence" };
    await mutatePersonalProfile(current => setPortraitStatus(current, "pending"));
    try {
      const settings = await readSettings();
      const provider = conversation.provider || settings.defaultProvider;
      const definition = requireProviderDefinition(settings, provider);
      const entry = settings.providers?.[provider] || {};
      const selection = resolveSelectableModels(definition, entry, { t: nativeT });
      const model = conversation.model || selection.defaultModel;
      if (!model || !selection.enabledModels.includes(model)) throw new Error("profile_model_unavailable");
      let output = "";
      for await (const event of streamProviderRequest({ provider, definition, model, apiKey: resolveProviderKey(settings, entry, provider), messages: source.messages, signal: new AbortController().signal, t: nativeT })) {
        if (event.type === "text_delta") output += event.delta;
      }
      const parsed = parsePortraitResponse(output);
      const nextText = parsed.changed && parsed.summary ? parsed.summary : snapshot.portrait.text;
      const committed = commitPortrait(await readPersonalProfile(), {
        text: nextText,
        sourceConversationId: id,
        sourceMessageCursor: source.cursor,
        providerId: provider,
        model,
      }, snapshot.revision);
      if (!committed.committed) {
        await mutatePersonalProfile(current => current.portrait.status === "pending" ? setPortraitStatus(current, current.portrait.text ? "ready" : "empty") : current);
        return { updated: false, reason: committed.reason };
      }
      await writePersonalProfile(committed.profile);
      return { updated: parsed.changed, profile: committed.profile };
    } catch (error) {
      const failed = await mutatePersonalProfile(current => setPortraitStatus(current, "failed", error?.code || error?.message || "portrait_update_failed"));
      return { updated: false, reason: failed.portrait.lastErrorCode };
    }
  })().finally(() => personalPortraitJobs.delete(id));
  personalPortraitJobs.set(id, job);
  return job;
}
function dispatchMusicCommand(command) {
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.reject(new Error("music_player_unavailable"));
  const requestId = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { pendingMusicCommands.delete(requestId); reject(new Error("music_player_timeout")); }, 10_000);
    pendingMusicCommands.set(requestId, { resolve, reject, timer });
    mainWindow.webContents.send("music:command-request", { requestId, command });
  });
}
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
}
function refreshTrayMenu() {
  if (!tray) return;
  tray.setToolTip(nativeT("tray.tooltip", {}, "Kairos"));
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: nativeT("tray.showKairos", {}, "Show Kairos"), click: () => focusMainWindow() },
    { type: "separator" },
    { label: nativeT("tray.exitKairos", {}, "Exit Kairos"), click: () => { isQuitting = true; app.quit(); } }
  ]));
}
function ensureTray() {
  if (!tray) {
    tray = new Tray(appIconPath);
    tray.on("click", () => focusMainWindow());
  }
  refreshTrayMenu();
  return tray;
}
function minimizeToTray() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  ensureTray();
  mainWindow.hide();
  return true;
}
function sendToWindowSafely(window, channel, ...args) {
  if (!window || window.isDestroyed()) return false;
  const contents = window.webContents;
  if (!contents || contents.isDestroyed()) return false;
  try {
    contents.send(channel, ...args);
    return true;
  } catch (error) {
    // A BrowserWindow can be destroyed between the checks above and send().
    // Closing the app must remain a no-op in that short race window.
    if (error?.message?.includes("Object has been destroyed")) return false;
    throw error;
  }
}

function closeWindowSafely(window) {
  if (!window || window.isDestroyed()) return false;
  try {
    window.close();
    return true;
  } catch (error) {
    if (error?.message?.includes("Object has been destroyed")) return false;
    throw error;
  }
}

function requestMainWindowClose() {
  const window = mainWindow;
  if (!window || window.isDestroyed() || isQuitting || closePromptOpen) return false;
  closePromptOpen = true;
  if (sendToWindowSafely(window, "window:close-requested")) return true;
  closePromptOpen = false;
  return false;
}
function isExternalUrl(url) {
  try {
    return ["http:", "https:"].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}
function protectAppNavigation(win) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalUrl(url)) shell.openExternal(url).catch(() => {});
    return { action: "deny" };
  });
  win.webContents.on("will-navigate", (event, url) => {
    const target = url || "";
    if (!isExternalUrl(target)) return;
    event.preventDefault();
    shell.openExternal(target).catch(() => {});
  });
}
async function verifySmokeRenderer(win) {
  const marker = JSON.stringify(smokeStateMarker);
  const expectMarker = JSON.stringify(smokeExpectStateMarker);
  const musicFile = JSON.stringify(smokeMusicFile);
  const expectMissingMusic = JSON.stringify(smokeExpectMusicMissing);
  return win.webContents.executeJavaScript(`
    new Promise((resolve, reject) => {
      const required = {
        calendarHeading: '#scheduleCalendarHeading',
        calendarGrid: '.calendar-grid',
        todayList: '#scheduleTodayList',
        habitList: '#habitAnimatedList',
        musicPlayer: '#musicPlayer',
        reminderButton: '.kairos-reminder-button',
        aiPanel: '#aiPanel'
      };
      const inspect = () => Object.fromEntries(Object.entries(required).map(([key, selector]) => [key, Boolean(document.querySelector(selector))]));
      const marker = ${marker};
      const expectMarker = ${expectMarker};
      const musicFile = ${musicFile};
      const smokeExpectMusicMissing = ${expectMissingMusic};
      const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
      const hasMarker = (state) =>
        (state.schedules || []).some(item => item.id === marker) &&
        (state.habits || []).some(item => item.id === marker);
      const withMarker = (state) => ({
        ...state,
        schedules: [
          ...(state.schedules || []).filter(item => item.id !== marker),
          { id: marker, title: 'Kairos smoke persisted task', date: '2026-07-14', end_date: '2026-07-14', type: 'task', status: 'todo', reminder: 'none' }
        ],
        habits: [
          ...(state.habits || []).filter(item => item.id !== marker),
          { id: marker, name: 'Kairos smoke persisted habit', icon: 'book', dates: ['2026-07-14'] }
        ]
      });
      const verifyPersistence = async () => {
        const api = window.kairosDesktop?.appState;
        if (!api) return { available: false };
        let before = await api.get();
        let existing = hasMarker(before);
        for (let attempt = 0; expectMarker && !existing && attempt < 8; attempt += 1) {
          await delay(100);
          before = await api.get();
          existing = hasMarker(before);
        }
        if (expectMarker && !existing) {
          throw new Error('missing persisted smoke marker: ' + JSON.stringify({
            scheduleIds: (before.schedules || []).map(item => item.id).slice(0, 8),
            habitIds: (before.habits || []).map(item => item.id).slice(0, 8)
          }));
        }
        if (!marker) return { available: true, existing };
        await api.save(withMarker(before));
        await delay(500);
        await api.save(withMarker(await api.get()));
        const after = await api.get();
        return {
          available: true,
          existing,
          saved: hasMarker(after)
        };
      };
      const verifyMusic = async () => {
        const api = window.kairosDesktop?.music;
        if (!api) return { available: false };
        if (!musicFile) return { available: true };
        let before = await api.getState();
        let existingTrack = (before.tracks || []).find(track => track.path === musicFile);
        for (let attempt = 0; expectMarker && !existingTrack && attempt < 8; attempt += 1) {
          await delay(100);
          before = await api.getState();
          existingTrack = (before.tracks || []).find(track => track.path === musicFile);
        }
        if (expectMarker && !existingTrack) {
          throw new Error('missing persisted smoke music track: ' + JSON.stringify({
            trackPaths: (before.tracks || []).map(track => track.path).slice(0, 8),
            currentTrackId: before.currentTrackId || ''
          }));
        }
        if (expectMarker && smokeExpectMusicMissing) {
          if (existingTrack?.available !== false) {
            throw new Error('expected persisted smoke music track to be unavailable: ' + JSON.stringify({
              available: existingTrack?.available,
              unavailableReason: existingTrack?.unavailableReason || ''
            }));
          }
          return { available: true, existing: true, saved: true, unavailable: true, unavailableReason: existingTrack.unavailableReason || '' };
        }
        const imported = existingTrack ? { added: [existingTrack] } : await api.addFiles([musicFile]);
        const track = imported.added?.[0] || existingTrack;
        if (!track?.id) throw new Error('failed to import smoke music track');
        await api.updatePlayback({ queueTrackIds: [track.id], currentTrackId: track.id, playing: false, volume: 37, position: { trackId: track.id, seconds: 9 } });
        await delay(250);
        await api.updatePlayback({ queueTrackIds: [track.id], currentTrackId: track.id, playing: false, volume: 37, position: { trackId: track.id, seconds: 9 } });
        const after = await api.getState();
        return {
          available: true,
          existing: Boolean(existingTrack),
          saved: (after.tracks || []).some(item => item.path === musicFile) && after.currentTrackId === track.id && after.volume === 37 && after.positions?.[track.id] === 9
        };
      };
      const verifyAiData = async () => {
        const api = window.kairosDesktop?.conversations;
        if (!api) return { available: false };
        const title = 'Kairos smoke AI ' + marker;
        let rows = await api.list();
        let existing = rows.some(item => item.title === title);
        for (let attempt = 0; expectMarker && !existing && attempt < 8; attempt += 1) {
          await delay(100);
          rows = await api.list();
          existing = rows.some(item => item.title === title);
        }
        if (expectMarker && !existing) throw new Error('missing persisted AI smoke conversation');
        if (!marker) return { available: true, existing };
        if (!existing) await api.create({ title, provider: 'openai', model: 'smoke' });
        rows = await api.list();
        return { available: true, existing, saved: rows.some(item => item.title === title) };
      };
      // Legacy embedded pages finish restoring their own cached state shortly
      // after first paint. Let those startup writes settle before the smoke
      // marker is saved, otherwise a stale bootstrap snapshot can overwrite it.
      let started = 0;
      const tick = async () => {
        const checks = inspect();
        if (Object.values(checks).every(Boolean)) {
          try {
            const persistence = await verifyPersistence();
            const music = await verifyMusic();
            const aiData = await verifyAiData();
            if (marker && !persistence.saved) throw new Error('failed to save persisted smoke marker');
            if (musicFile && !music.saved) throw new Error('failed to save smoke music state');
            if (marker && !aiData.saved) throw new Error('failed to save smoke AI data');
            resolve({ ok: true, checks, persistence, music, aiData, title: document.title, page: document.body?.dataset?.page || '' });
          } catch (error) {
            reject(error);
          }
          return;
        }
        if (Date.now() - started > 5000) {
          reject(new Error('missing renderer smoke selectors: ' + JSON.stringify(checks)));
          return;
        }
        setTimeout(tick, 100);
      };
      started = Date.now();
      setTimeout(tick, marker ? 3500 : 0);
    })
  `);
}
async function verifyVuePreviewRenderer(win) {
  return win.webContents.executeJavaScript(`
    new Promise(async (resolve, reject) => {
      if (!document.querySelector('.vue-shell')) {
        reject(new Error('missing Vue preview shell'));
        return;
      }
      const waitFor = (condition, label, timeout = 7000) => new Promise((resolveWait, rejectWait) => {
        const started = Date.now();
        const tick = () => {
          try {
            if (condition()) return resolveWait();
          } catch {}
          if (Date.now() - started >= timeout) return rejectWait(new Error('Vue smoke timed out: ' + label));
          setTimeout(tick, 60);
        };
        tick();
      });
      const changeRoute = async (page, ready) => {
        window.location.hash = '#/' + page;
        await waitFor(() => document.querySelector('main.vue-shell-content')?.dataset.view === page && ready(), page + ' route');
      };
      const assertNoHorizontalOverflow = (documentRoot, label) => {
        const root = documentRoot?.documentElement;
        if (!root) throw new Error('missing document root: ' + label);
        // The original screens are vertically scrollable where necessary, but
        // locale changes must never introduce a horizontal scrollbar or push
        // fixed controls outside the viewport.
        if (root.scrollWidth > root.clientWidth + 2) {
          throw new Error('locale layout overflow in ' + label + ': ' + root.scrollWidth + ' > ' + root.clientWidth);
        }
      };
      const assertRendered = (node, label) => {
        const rect = node?.getBoundingClientRect?.();
        if (!rect || rect.width < 1 || rect.height < 1 || getComputedStyle(node).display === 'none') {
          throw new Error('missing rendered control: ' + label);
        }
      };
      const marker = ${JSON.stringify(process.env.KAIROS_SMOKE_STATE_MARKER || "")};
      const expectMarker = ${JSON.stringify(process.env.KAIROS_SMOKE_EXPECT_STATE_MARKER || "")};
      const musicFile = ${JSON.stringify(process.env.KAIROS_SMOKE_MUSIC_FILE || "")};
      const expectMissingMusic = ${JSON.stringify(process.env.KAIROS_SMOKE_EXPECT_MUSIC_MISSING || "")};
      const delay = (ms) => new Promise(resolveDelay => setTimeout(resolveDelay, ms));
      const hasMarker = (state) =>
        (state.schedules || []).some(item => item.id === marker) &&
        (state.habits || []).some(item => item.id === marker);
      const withMarker = (state) => ({
        ...state,
        schedules: [...(state.schedules || []).filter(item => item.id !== marker), { id: marker, title: 'Kairos smoke persisted task', date: '2026-07-14', end_date: '2026-07-14', type: 'task', status: 'todo', reminder: 'none' }],
        habits: [...(state.habits || []).filter(item => item.id !== marker), { id: marker, name: 'Kairos smoke persisted habit', icon: 'book', dates: ['2026-07-14'] }]
      });
      const verifyPersistence = async () => {
        const api = window.kairosDesktop?.appState;
        if (!api) return { available: false };
        let before = await api.get();
        let existing = hasMarker(before);
        for (let attempt = 0; expectMarker && !existing && attempt < 8; attempt += 1) {
          await delay(100);
          before = await api.get();
          existing = hasMarker(before);
        }
        if (expectMarker && !existing) throw new Error('missing persisted smoke marker');
        if (!marker) return { available: true, existing };
        await api.save(withMarker(before));
        await delay(500);
        await api.save(withMarker(await api.get()));
        return { available: true, existing, saved: hasMarker(await api.get()) };
      };
      const verifyMusic = async () => {
        const api = window.kairosDesktop?.music;
        if (!api) return { available: false };
        if (!musicFile) return { available: true };
        let before = await api.getState();
        let existingTrack = (before.tracks || []).find(track => track.path === musicFile);
        for (let attempt = 0; expectMarker && !existingTrack && attempt < 8; attempt += 1) {
          await delay(100);
          before = await api.getState();
          existingTrack = (before.tracks || []).find(track => track.path === musicFile);
        }
        if (expectMarker && !existingTrack) throw new Error('missing persisted smoke music track');
        if (expectMarker && expectMissingMusic) {
          if (existingTrack?.available !== false) throw new Error('persisted smoke music track should be unavailable');
          return { available: true, existing: true, saved: true, unavailable: true, unavailableReason: existingTrack.unavailableReason || '' };
        }
        const imported = existingTrack ? { added: [existingTrack] } : await api.addFiles([musicFile]);
        const track = imported.added?.[0] || existingTrack;
        if (!track?.id) throw new Error('failed to import smoke music track');
        const playback = { queueTrackIds: [track.id], currentTrackId: track.id, playing: false, volume: 37, position: { trackId: track.id, seconds: 9 } };
        await api.updatePlayback(playback);
        await delay(250);
        await api.updatePlayback(playback);
        const after = await api.getState();
        return { available: true, existing: Boolean(existingTrack), saved: (after.tracks || []).some(item => item.path === musicFile) && after.currentTrackId === track.id && after.volume === 37 && after.positions?.[track.id] === 9 };
      };
      const verifyAiData = async () => {
        const api = window.kairosDesktop?.conversations;
        if (!api) return { available: false };
        const title = 'Kairos smoke AI ' + marker;
        let rows = await api.list();
        let existing = rows.some(item => item.title === title);
        for (let attempt = 0; expectMarker && !existing && attempt < 8; attempt += 1) {
          await delay(100);
          rows = await api.list();
          existing = rows.some(item => item.title === title);
        }
        if (expectMarker && !existing) throw new Error('missing persisted AI smoke conversation');
        if (!marker) return { available: true, existing };
        if (!existing) await api.create({ title, provider: 'openai', model: 'smoke' });
        rows = await api.list();
        return { available: true, existing, saved: rows.some(item => item.title === title) };
      };
      try {
        await waitFor(() => Boolean(document.querySelector('.kairos-topbar')) && Boolean(document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.querySelector('main')) && Boolean(window.kairosDesktop?.appState?.get), 'initial Calendar shell');
        const initialFrame = document.querySelector('iframe.vue-legacy-frame');
        if (initialFrame?.contentDocument?.body?.dataset?.page !== 'calendar') throw new Error('Vue smoke did not begin on Calendar');
        const originalState = await window.kairosDesktop.appState.get();
        const originalLanguage = originalState?.settings?.general?.language || 'en';
        const electronSystemLocale = ${JSON.stringify(nativeLocale())};
        const expectedLanguage = ${JSON.stringify(smokeExpectedLanguage)};
        const persistedLanguage = ${JSON.stringify(smokePersistLanguage)};
        if (expectedLanguage && originalLanguage !== expectedLanguage) throw new Error('Vue smoke did not restore persisted language preference: ' + originalLanguage);
        if (originalLanguage === 'system') {
          await waitFor(() => document.documentElement.lang === electronSystemLocale
            && initialFrame?.contentDocument?.documentElement?.lang === electronSystemLocale, 'system locale follows Electron');
        }
        const saveLanguage = async (language) => {
          const current = await window.kairosDesktop.appState.get();
          const settings = current?.settings || {};
          await window.kairosDesktop.appState.save({
            ...current,
            settings: {
              ...settings,
              general: { ...(settings.general || {}), language }
            }
          });
        };
        await saveLanguage('en');
        await waitFor(() => document.documentElement.lang === 'en' && initialFrame?.contentDocument?.documentElement?.lang === 'en' && document.title === 'Kairos | Intentional Dashboard', 'English locale sync');
        assertNoHorizontalOverflow(document, 'English shell');
        assertNoHorizontalOverflow(initialFrame?.contentDocument, 'English Calendar');
        document.querySelectorAll('.kairos-nav-link, .kairos-create').forEach((node, index) => assertRendered(node, 'English navigation ' + index));
        await waitFor(() => Boolean(document.querySelector('#musicPlaylistToggle')) && Boolean(document.querySelector('#musicPlaylistPanel')), 'shared player queue controls');
        const calendarPlayer = document.querySelector('#musicPlayer');
        await window.kairosDesktop.windowControls.close();
        await waitFor(() => Boolean(document.querySelector('.vue-close-choice-dialog')), 'Kairos close choice dialog');
        const closeChoiceDialog = document.querySelector('.vue-close-choice-dialog');
        if (closeChoiceDialog?.querySelectorAll('button').length !== 3) throw new Error('Kairos close choice dialog is missing actions');
        const closeChoiceBackdrop = document.querySelector('.vue-close-choice-backdrop');
        const closeChoiceRect = closeChoiceDialog?.getBoundingClientRect();
        const closeChoiceBackdropStyle = closeChoiceBackdrop ? getComputedStyle(closeChoiceBackdrop) : null;
        if (!closeChoiceRect || !closeChoiceBackdropStyle
          || closeChoiceBackdropStyle.position !== 'fixed'
          || Math.abs(closeChoiceRect.left + closeChoiceRect.width / 2 - window.innerWidth / 2) > 2
          || Math.abs(closeChoiceRect.top + closeChoiceRect.height / 2 - window.innerHeight / 2) > 2) {
          throw new Error('Kairos close choice dialog is not centered in the viewport');
        }
        closeChoiceDialog?.querySelector('.vue-close-choice-cancel')?.click();
        await waitFor(() => !document.querySelector('.vue-close-choice-dialog'), 'Kairos close choice dialog cancel');
        // The Calendar wallpaper applies a legacy direct-body-child rule. The
        // Vue restore action is teleported to body, so exercise the real hide
        // path here and ensure that rule cannot put it back in normal flow.
        await window.kairosDesktop.pet.hide();
        await waitFor(() => {
          const restore = document.querySelector('.vue-pet-restore');
          return restore instanceof HTMLElement && getComputedStyle(restore).display !== 'none';
        }, 'Calendar desktop pet restore control');
        const restoreControl = document.querySelector('.vue-pet-restore');
        const restoreRect = restoreControl?.getBoundingClientRect?.();
        const restoreStyle = restoreControl ? getComputedStyle(restoreControl) : null;
        if (!restoreRect || !restoreStyle
          || restoreStyle.position !== 'fixed'
          || restoreRect.left < 0
          || restoreRect.right > window.innerWidth
          || restoreRect.bottom > window.innerHeight) {
          throw new Error('Calendar pet restore control is not pinned inside the viewport');
        }
        assertNoHorizontalOverflow(document, 'Calendar pet restore control');
        await window.kairosDesktop.pet.show();
        await waitFor(() => getComputedStyle(document.querySelector('.vue-pet-restore')).display === 'none', 'Calendar desktop pet restore control close');
        document.querySelector('#musicPlaylistToggle')?.click();
        await waitFor(() => {
          const queuePanel = document.querySelector('#musicPlaylistPanel');
          return queuePanel instanceof HTMLElement && !queuePanel.hidden && getComputedStyle(queuePanel).display !== 'none';
        }, 'Calendar player queue open');
        document.querySelector('#musicPlaylistClose')?.click();
        await waitFor(() => document.querySelector('#musicPlaylistPanel')?.hidden === true, 'Calendar player queue close');

        document.querySelector('.kairos-create')?.click();
        await waitFor(() => Boolean(document.querySelector('iframe.vue-legacy-schedule-dialog-host')?.contentDocument?.querySelector('#scheduleFeatureDialog[open]')), 'Calendar Create New dialog');
        await waitFor(() => document.querySelector('iframe.vue-legacy-schedule-dialog-host')?.contentDocument?.querySelector('#scheduleFeatureDialog [name="title"]')?.tagName === 'INPUT', 'Calendar Create New title input');
        const dialog = document.querySelector('iframe.vue-legacy-schedule-dialog-host')?.contentDocument?.querySelector('#scheduleFeatureDialog');
        const draftTitle = dialog?.querySelector('[name="title"]');
        if (draftTitle?.tagName !== 'INPUT') throw new Error('Calendar Create New title input is missing');
        draftTitle.value = 'Locale smoke draft';
        draftTitle.dispatchEvent(new Event('input', { bubbles: true }));
        await saveLanguage('zh-CN');
        const dialogFrame = document.querySelector('iframe.vue-legacy-schedule-dialog-host');
        await waitFor(() => document.documentElement.lang === 'zh-CN'
          && initialFrame?.contentDocument?.documentElement?.lang === 'zh-CN'
          && dialogFrame?.contentDocument?.documentElement?.lang === 'zh-CN'
          && dialog?.open === true
          && draftTitle.value === 'Locale smoke draft'
          && dialog?.querySelector('h2')?.textContent?.includes('添加日程')
          && document.querySelector('#musicPlayer') === calendarPlayer, 'Chinese locale dialog and player preservation');
        assertNoHorizontalOverflow(document, 'Chinese shell with dialog');
        assertNoHorizontalOverflow(initialFrame?.contentDocument, 'Chinese Calendar');
        assertNoHorizontalOverflow(dialogFrame?.contentDocument, 'Chinese Schedule dialog');
        assertRendered(dialog?.querySelector('h2'), 'Chinese Schedule dialog title');
        dialog?.close();
        await waitFor(() => !document.querySelector('iframe.vue-legacy-schedule-dialog-host'), 'Calendar Create New dialog close');
        document.querySelector('#musicPlaylistToggle')?.click();
        await waitFor(() => {
          const queuePanel = document.querySelector('#musicPlaylistPanel');
          return queuePanel instanceof HTMLElement && !queuePanel.hidden
            && queuePanel.textContent?.includes('队列');
        }, 'Chinese Calendar player queue localization');
        assertNoHorizontalOverflow(document, 'Chinese Calendar player queue');
        document.querySelector('#musicPlaylistClose')?.click();
        await waitFor(() => document.querySelector('#musicPlaylistPanel')?.hidden === true, 'Chinese Calendar player queue close');

        await changeRoute('music', () => document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.body?.dataset?.page === 'music');
        await waitFor(() => document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.documentElement?.lang === 'zh-CN', 'Music locale sync');
        assertNoHorizontalOverflow(document.querySelector('iframe.vue-legacy-frame')?.contentDocument, 'Chinese Music');
        const playerCount = document.querySelectorAll('#musicPlayer').length;
        const player = document.querySelector('#musicPlayer');
        if (playerCount !== 1 || player?.hidden || getComputedStyle(player).display === 'none') throw new Error('Music route did not retain exactly one visible shared player');

        await changeRoute('schedule', () => document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.body?.dataset?.page === 'schedule');
        await waitFor(() => document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.documentElement?.lang === 'zh-CN', 'Schedule locale sync');
        assertNoHorizontalOverflow(document.querySelector('iframe.vue-legacy-frame')?.contentDocument, 'Chinese Schedule');
        if (!document.querySelector('#musicPlayer')?.hidden) throw new Error('Schedule route left the Calendar/Music player visible');

        await changeRoute('habits', () => Boolean(document.querySelector('.vue-habits-page')));
        assertNoHorizontalOverflow(document, 'Chinese Habits');
        if (!document.querySelector('#musicPlayer')?.hidden) throw new Error('Habits route left the Calendar/Music player visible');
        document.querySelector('.kairos-reminder-button')?.click();
        await waitFor(() => document.querySelector('#kairosReminderPanel')?.textContent?.includes('提醒'), 'Chinese reminder panel localization');
        assertNoHorizontalOverflow(document, 'Chinese reminder panel');
        document.querySelector('#kairosReminderPanel .kairos-reminder-head button')?.click();
        await waitFor(() => !document.querySelector('#kairosReminderPanel'), 'Chinese reminder panel close');

        document.querySelector('.kairos-settings-button')?.click();
        await waitFor(() => Boolean(document.querySelector('dialog.kairos-settings-dialog[open]')), 'settings dialog');
        const settings = document.querySelector('dialog.kairos-settings-dialog');
        if (settings?.querySelectorAll('.kairos-settings-panel').length !== 1 || settings?.querySelectorAll('[data-settings-tab]').length !== 6) throw new Error('Vue settings host did not retain the original settings dialog DOM');
        assertNoHorizontalOverflow(document, 'Chinese Settings');
        assertRendered(settings, 'Chinese Settings dialog');
        const languageControl = settings?.querySelector('[data-setting-path="general.language"]');
        if (languageControl?.tagName !== 'SELECT') throw new Error('original settings language control is missing');
        languageControl.value = 'en';
        languageControl.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => document.documentElement.lang === 'en'
          && document.querySelector('dialog.kairos-settings-dialog[open]')?.textContent?.includes('Settings')
          && document.querySelector('[data-setting-path="general.language"]')?.value === 'en', 'settings English language change');
        assertNoHorizontalOverflow(document, 'English Settings after control change');
        const chineseLanguageControl = document.querySelector('[data-setting-path="general.language"]');
        if (chineseLanguageControl?.tagName !== 'SELECT') throw new Error('rerendered settings language control is missing');
        chineseLanguageControl.value = 'zh-CN';
        chineseLanguageControl.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => document.documentElement.lang === 'zh-CN'
          && document.querySelector('dialog.kairos-settings-dialog[open]')?.textContent?.includes('设置')
          && document.querySelector('[data-setting-path="general.language"]')?.value === 'zh-CN', 'settings Chinese language change');
        settings?.querySelector('[data-settings-tab="appearance"]')?.click();
        await waitFor(() => settings?.querySelector('[data-settings-tab="appearance"]')?.classList.contains('active') && settings?.querySelector('[data-settings-panel="appearance"]')?.hidden === false, 'original settings tab switch');
        const reduceMotion = settings?.querySelector('[data-setting-path="accessibility.reduceMotion"]');
        if (!(reduceMotion instanceof HTMLInputElement)) throw new Error('original settings reduce-motion control is missing');
        reduceMotion.click();
        await waitFor(() => document.documentElement.classList.contains('kairos-reduce-motion'), 'original settings reduce-motion write');
        reduceMotion.click();
        await waitFor(() => !document.documentElement.classList.contains('kairos-reduce-motion'), 'original settings reduce-motion restore');
        settings?.querySelector('[data-settings-tab="music"]')?.click();
        await waitFor(() => settings?.textContent?.includes('Netease Music') && Boolean(window.kairosDesktop?.netease?.getStatus), 'NetEase settings bridge');
        const neteaseIcon = settings?.querySelector('.kairos-netease-brand img');
        await waitFor(() => neteaseIcon instanceof HTMLImageElement && neteaseIcon.complete && neteaseIcon.naturalWidth > 0, 'NetEase settings icon');
        settings?.querySelector('[data-settings-back]')?.click();
        await waitFor(() => !document.querySelector('dialog.kairos-settings-dialog')?.open, 'original settings close');

        await changeRoute('calendar', () => document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.body?.dataset?.page === 'calendar');
        const restoreLanguage = persistedLanguage || originalLanguage;
        const restoreLocale = restoreLanguage === 'system'
          ? (window.KairosI18n?.resolveLocale?.('system') || navigator.language || 'en')
          : restoreLanguage;
        await saveLanguage(restoreLanguage);
        await waitFor(() => document.documentElement.lang === restoreLocale && document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.documentElement?.lang === restoreLocale, 'restore original locale preference');
        const persistence = await verifyPersistence();
        const music = await verifyMusic();
        const aiData = await verifyAiData();
        if (marker && !persistence.saved) throw new Error('failed to save persisted smoke marker');
        if (musicFile && !music.saved) throw new Error('failed to save smoke music state');
        if (marker && !aiData.saved) throw new Error('failed to save smoke AI data');
        const state = await window.kairosDesktop.appState.get();
        resolve({ ok: true, title: document.title, bridge: 'Electron interface ready', checks: { calendar: true, calendarQueue: true, calendarPetRestoreLayout: true, createNew: true, closeChoiceDialog: true, systemLocale: true, localeEnglish: true, localeChinese: true, localeDialogPreserved: true, localeFrames: true, localeLayout: true, playerSurvivedLocaleChange: true, musicSourceDocument: true, sharedPlayer: true, schedule: true, habits: true, reminderPanel: true, settingsOriginalDom: true, settingsTabs: true, settingsLanguageControl: true, settingsLocaleLayout: true, neteaseSettings: true, neteaseSettingsIcon: true, settingsClose: true }, persistence, music, aiData, schedules: (state.schedules || []).length, habits: (state.habits || []).length });
      } catch (error) {
        reject(error);
      }
    })
  `);
}
async function writeSmokeResult(result) {
  if (!smokeResultPath) return;
  await fs.mkdir(path.dirname(smokeResultPath), { recursive: true });
  await fs.writeFile(smokeResultPath, JSON.stringify({ ...result, writtenAt: new Date().toISOString() }, null, 2), "utf8");
}
async function captureOverlayRenderer(win, label) {
  const image = await win.webContents.capturePage();
  const size = image.getSize();
  let screenshotPath = "";
  if (smokeResultPath) {
    screenshotPath = `${smokeResultPath.replace(/\.json$/i, "")}.${label}.png`;
    await fs.writeFile(screenshotPath, image.toPNG());
  }
  // Electron composites capturePage() onto an opaque surface even when the
  // native window is transparent. Use this image for renderer/radius QA only;
  // native transparency is validated from an actual desktop capture.
  return { size, screenshotPath };
}
async function captureSmokeRenderer(win, label) {
  if (!smokeCaptureVisuals) return null;
  // Hidden Electron windows can return a blank compositor image.  This path
  // runs only after all assertions pass and only for an isolated smoke run,
  // so briefly making the window visible cannot affect user interaction or
  // the assertions that protect dialogs and player state.
  const wasVisible = win.isVisible();
  if (!wasVisible) win.showInactive();
  await win.webContents.executeJavaScript(`new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 750))`);
  const capture = await captureOverlayRenderer(win, label);
  return { ...capture, wasVisible };
}
async function captureVueRouteVisuals(win, locale) {
  const routeReady = {
    calendar: "document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.body?.dataset?.page === 'calendar'",
    habits: "Boolean(document.querySelector('.vue-habits-page'))",
    schedule: "document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.body?.dataset?.page === 'schedule'",
    music: "document.querySelector('iframe.vue-legacy-frame')?.contentDocument?.body?.dataset?.page === 'music'"
  };
  const captures = [];
  for (const [page, ready] of Object.entries(routeReady)) {
    await win.webContents.executeJavaScript(`new Promise((resolve, reject) => {
      window.location.hash = '#/${page}';
      const started = Date.now();
      const tick = () => {
        try {
          if (document.documentElement.lang === ${JSON.stringify(locale)} && (${ready})) return resolve();
        } catch {}
        if (Date.now() - started > 8000) return reject(new Error('visual capture route timed out: ${page}'));
        setTimeout(tick, 60);
      };
      tick();
    })`);
    captures.push({ page, ...(await captureSmokeRenderer(win, `vue-${locale}-${page}`)) });
  }
  return captures;
}
async function waitForMainFrame(win) {
  if (!win.webContents.isLoadingMainFrame()) return;
  await new Promise((resolve, reject) => {
    const loaded = () => { cleanup(); resolve(); };
    const failed = (_event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      cleanup();
      reject(new Error(`Failed to load ${url}: ${code} ${description}`));
    };
    const cleanup = () => {
      win.webContents.removeListener("did-finish-load", loaded);
      win.webContents.removeListener("did-fail-load", failed);
    };
    win.webContents.once("did-finish-load", loaded);
    win.webContents.on("did-fail-load", failed);
  });
}
async function finishPetSmokeTest(win) {
  const page = await win.webContents.executeJavaScript(`(() => {
    const image = document.getElementById("pet-img");
    const menuText = document.getElementById("ctx-menu")?.textContent?.replace(/\\s+/g, " ").trim() || "";
    const scriptText = [...document.scripts].map(script => script.textContent || "").join("\\n");
    return {
      readyState: document.readyState,
      imageComplete: Boolean(image?.complete),
      imageNaturalWidth: Number(image?.naturalWidth || 0),
      imageNaturalHeight: Number(image?.naturalHeight || 0),
      htmlBackgroundColor: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
      menuText,
      fixedChineseCopy: menuText.includes("与Ta对话")
        && menuText.includes("隐藏桌宠")
        && menuText.includes("关闭")
        && scriptText.includes("我还在呢，放心吧。")
        && !/KairosI18n/.test(scriptText)
    };
  })()`);
  const capture = await captureOverlayRenderer(win, "pet");
  const chat = createAiChatWindow();
  await waitForMainFrame(chat);
  await chat.webContents.executeJavaScript(`new Promise(resolve => {
    document.getAnimations().forEach(animation => animation.finish());
    requestAnimationFrame(() => requestAnimationFrame(resolve));
  })`);
  const chatPage = await chat.webContents.executeJavaScript(`(() => {
    const panel = document.getElementById("aiPanel");
    const rect = panel?.getBoundingClientRect();
    const style = panel ? getComputedStyle(panel) : null;
    return {
      readyState: document.readyState,
      htmlBackgroundColor: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackgroundColor: getComputedStyle(document.body).backgroundColor,
      panelWidth: Number(rect?.width || 0),
      panelHeight: Number(rect?.height || 0),
      panelBorderRadius: style?.borderRadius || "",
      panelOverflow: style?.overflow || ""
    };
  })()`);
  const chatCapture = await captureOverlayRenderer(chat, "chat");
  const result = {
    ok: win.isVisible()
      && page.readyState === "complete"
      && page.imageComplete
      && page.imageNaturalWidth > 0
      && page.htmlBackgroundColor === "rgba(0, 0, 0, 0)"
      && page.bodyBackgroundColor === "rgba(0, 0, 0, 0)"
      && page.fixedChineseCopy
      && chatPage.readyState === "complete"
      && chatPage.htmlBackgroundColor === "rgba(0, 0, 0, 0)"
      && chatPage.bodyBackgroundColor === "rgba(0, 0, 0, 0)"
      && chatPage.panelBorderRadius === "32px"
      && chatPage.panelOverflow === "hidden",
    window: {
      visible: win.isVisible(),
      destroyed: win.isDestroyed(),
      title: win.getTitle(),
      url: win.webContents.getURL(),
      bounds: win.getBounds()
    },
    page,
    capture,
    chat: { page: chatPage, capture: chatCapture }
  };
  await writeSmokeResult(result);
  console.log(`Kairos pet smoke test completed. ${JSON.stringify(result)}`);
  app.exit(result.ok ? 0 : 1);
}
function getAiChatBounds() {
  const width = AI_CHAT_PANEL_SIZE.width + AI_CHAT_TRANSPARENT_GUTTER * 2;
  const height = AI_CHAT_PANEL_SIZE.height + AI_CHAT_TRANSPARENT_GUTTER * 2;
  const visualOverlap = 96;
  const petBounds = petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null;
  const display = petBounds ? screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y }) : screen.getPrimaryDisplay();
  const work = display.workArea;
  let x = petBounds ? petBounds.x - AI_CHAT_PANEL_SIZE.width + visualOverlap - AI_CHAT_TRANSPARENT_GUTTER : work.x + work.width - width - 24;
  let y = petBounds ? petBounds.y + petBounds.height - AI_CHAT_PANEL_SIZE.height - AI_CHAT_TRANSPARENT_GUTTER : work.y + work.height - height - 24;
  x = Math.max(work.x, Math.min(x, work.x + work.width - width));
  y = Math.max(work.y, Math.min(y, work.y + work.height - height));
  return { x, y, width, height };
}
function resizePetWindow(width = 195, height = 230) {
  if (!petWindow || petWindow.isDestroyed()) return false;
  const supportedLayout = (width === 195 && height === 230) || (width === PET_WINDOW_SIZE.width && height === PET_WINDOW_SIZE.height);
  return supportedLayout;
}
function placePetWindowInWorkArea(win = petWindow) {
  if (!win || win.isDestroyed()) return false;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const work = display.workArea;
  const [width, height] = win.getSize();
  win.setPosition(work.x + work.width - width - 24, work.y + work.height - height - 24);
  return true;
}
function showPetWindow({ reposition = false } = {}) {
  if (!petWindow || petWindow.isDestroyed()) return false;
  const bounds = petWindow.getBounds();
  const work = screen.getDisplayMatching(bounds).workArea;
  const outsideWorkArea = bounds.x + bounds.width <= work.x || bounds.y + bounds.height <= work.y
    || bounds.x >= work.x + work.width || bounds.y >= work.y + work.height;
  if (reposition || outsideWorkArea) placePetWindowInWorkArea();
  petWindow.setAlwaysOnTop(true);
  petWindow.showInactive();
  petWindow.moveTop();
  return true;
}
function stopAiChatFollow() {
  if (!aiChatFollowTimer) return;
  clearInterval(aiChatFollowTimer);
  aiChatFollowTimer = null;
  aiChatTargetBounds = null;
}
function stopAiChatFade() {
  if (!aiChatFadeTimer) return;
  clearInterval(aiChatFadeTimer);
  aiChatFadeTimer = null;
}
function updateAiChatFollowTarget() {
  if (!aiChatWindow || aiChatWindow.isDestroyed() || !aiChatWindow.isVisible()) return;
  aiChatTargetBounds = getAiChatBounds();
  if (aiChatFollowTimer) return;
  aiChatFollowTimer = setInterval(() => {
    if (!aiChatWindow || aiChatWindow.isDestroyed() || !aiChatWindow.isVisible() || !aiChatTargetBounds) {
      stopAiChatFollow();
      return;
    }
    const current = aiChatWindow.getBounds();
    const nextX = Math.round(current.x + (aiChatTargetBounds.x - current.x) * 0.32);
    const nextY = Math.round(current.y + (aiChatTargetBounds.y - current.y) * 0.32);
    const closeEnough = Math.abs(nextX - aiChatTargetBounds.x) <= 1 && Math.abs(nextY - aiChatTargetBounds.y) <= 1;
    // Reassert the immutable overlay size while following the pet. On Windows
    // a transparent BrowserWindow can otherwise drift in content size while
    // moving between regions with different display scale factors.
    aiChatWindow.setBounds({
      x: closeEnough ? aiChatTargetBounds.x : nextX,
      y: closeEnough ? aiChatTargetBounds.y : nextY,
      width: AI_CHAT_PANEL_SIZE.width + AI_CHAT_TRANSPARENT_GUTTER * 2,
      height: AI_CHAT_PANEL_SIZE.height + AI_CHAT_TRANSPARENT_GUTTER * 2
    }, false);
    if (closeEnough) stopAiChatFollow();
  }, 16);
}
function hideAiChatWindowSmooth() {
  if (!aiChatWindow || aiChatWindow.isDestroyed() || !aiChatWindow.isVisible()) return false;
  stopAiChatFade();
  stopAiChatFollow();
  let opacity = aiChatWindow.getOpacity();
  aiChatFadeTimer = setInterval(() => {
    if (!aiChatWindow || aiChatWindow.isDestroyed()) { stopAiChatFade(); return; }
    opacity = Math.max(0, opacity - 0.28);
    aiChatWindow.setOpacity(opacity);
    if (opacity <= 0) {
      aiChatWindow.hide();
      aiChatWindow.setOpacity(1);
      stopAiChatFade();
    }
  }, 12);
  return true;
}
function flushPetMove() {
  petMoveTimer = null;
  if (!petWindow || petWindow.isDestroyed()) { petPendingDx = 0; petPendingDy = 0; return; }
  if (!petPendingDx && !petPendingDy) return;
  const [x, y] = petWindow.getPosition();
  petWindow.setPosition(x + petPendingDx, y + petPendingDy, false);
  petPendingDx = 0;
  petPendingDy = 0;
  updateAiChatFollowTarget();
}
function queuePetMove(dx, dy) {
  petPendingDx += Number(dx) || 0;
  petPendingDy += Number(dy) || 0;
  if (!petMoveTimer) petMoveTimer = setTimeout(flushPetMove, 16);
}
function createAiChatWindow() {
  if (aiChatWindow && !aiChatWindow.isDestroyed()) return aiChatWindow;
  const fixedWidth = AI_CHAT_PANEL_SIZE.width + AI_CHAT_TRANSPARENT_GUTTER * 2;
  const fixedHeight = AI_CHAT_PANEL_SIZE.height + AI_CHAT_TRANSPARENT_GUTTER * 2;
  aiChatWindow = new BrowserWindow({
    ...getAiChatBounds(),
    minWidth: fixedWidth,
    maxWidth: fixedWidth,
    minHeight: fixedHeight,
    maxHeight: fixedHeight,
    ...OVERLAY_WINDOW_OPTIONS,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    opacity: 0,
    webPreferences: { preload: path.join(root, "electron", "preload", "index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true, transparent: true }
  });
  protectAppNavigation(aiChatWindow);
  aiChatWindow.loadFile(path.join(root, "app", "pages", "ai-chat", "index.html"));
  aiChatWindow.on("closed", () => { stopAiChatFade(); stopAiChatFollow(); aiChatWindow = null; });
  return aiChatWindow;
}
function showAiChatWindow() {
  const win = createAiChatWindow();
  win.setBounds(getAiChatBounds());
    const reveal = () => {
      if (win.isDestroyed()) return;
      stopAiChatFade();
      win.setIgnoreMouseEvents(false);
    win.setOpacity(0);
    win.show();
    win.focus();
    let opacity = 0;
    const timer = setInterval(() => {
      if (win.isDestroyed()) { clearInterval(timer); return; }
      opacity = Math.min(1, opacity + 0.22);
      win.setOpacity(opacity);
      if (opacity >= 1) clearInterval(timer);
    }, 12);
  };
  if (win.webContents.isLoading()) win.once("ready-to-show", reveal);
  else reveal();
}

async function verifyWindowMaximizeControl(win) {
  const captures = {};
  const captureState = async state => {
    if (!smokeCaptureVisuals || !smokeResultPath) return;
    const image = await win.webContents.capturePage();
    const screenshotPath = `${smokeResultPath.replace(/\.json$/i, "")}.window-${state}.png`;
    await fs.writeFile(screenshotPath, image.toPNG());
    captures[state] = screenshotPath;
  };
  const waitForState = async (maximized, glyphClass) => {
    const startedAt = Date.now();
    while (Date.now() - startedAt < 5000) {
      const rendererReady = await win.webContents.executeJavaScript(`(() => {
        const button = document.querySelector('.kairos-window-maximize');
        const glyph = button?.querySelector('.kairos-window-glyph');
        return Boolean(button?.classList.contains('is-window-maximized') === ${maximized} && glyph?.classList.contains('${glyphClass}'));
      })()`);
      if (win.isMaximized() === maximized && rendererReady) return true;
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    throw new Error(`window maximize control did not reach ${maximized ? "maximized" : "restored"} state`);
  };
  const clickControl = () => win.webContents.executeJavaScript("document.querySelector('.kairos-window-maximize')?.click()");
  if (win.isMaximized()) {
    await clickControl();
    await waitForState(false, "kairos-window-glyph--maximize");
  }
  await clickControl();
  await waitForState(true, "kairos-window-glyph--restore");
  await captureState("maximized-restore-icon");
  await clickControl();
  await waitForState(false, "kairos-window-glyph--maximize");
  await captureState("restored-maximize-icon");
  const verifyHover = async (selector, captureName) => {
    // Reset Chromium's synthetic pointer first. In a packaged launch it can
    // inherit the position of the native cursor, making the initial colour
    // sample incorrectly read the control's already-hovered state.
    win.webContents.sendInputEvent({ type: "mouseMove", x: 1, y: 100 });
    await new Promise(resolve => setTimeout(resolve, 120));
    const before = await win.webContents.executeJavaScript(`(() => {
      const button = document.querySelector('${selector}');
      const rect = button?.getBoundingClientRect();
      const style = button ? getComputedStyle(button) : null;
      return rect && style ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, color: style.color } : null;
    })()`);
    if (!before) throw new Error(`missing window control hover target: ${selector}`);
    win.webContents.sendInputEvent({ type: "mouseMove", x: Math.round(before.x), y: Math.round(before.y) });
    await new Promise(resolve => setTimeout(resolve, 180));
    const hovered = await win.webContents.executeJavaScript(`(() => {
      const style = getComputedStyle(document.querySelector('${selector}'));
      return { backgroundColor: style.backgroundColor, color: style.color };
    })()`);
    if (!/rgba?\(0, 0, 0(?:, 0)?\)|transparent/.test(hovered.backgroundColor)) throw new Error(`${selector} hover added a background: ${hovered.backgroundColor}`);
    if (hovered.color === before.color) throw new Error(`${selector} hover did not change glyph colour`);
    await captureState(captureName);
  };
  if (smokeCaptureVisuals) {
    await verifyHover(".kairos-window-minimize", "minimize-hover-lines-only");
    await verifyHover(".kairos-window-maximize", "maximize-hover-lines-only");
    await verifyHover(".kairos-window-close", "close-hover-lines-only");
  }
  win.webContents.sendInputEvent({ type: "mouseMove", x: 1, y: 100 });
  return { ok: true, captures };
}

async function createWindow() {
  const savedBounds = restoreWindowBounds(await readWindowState());
  mainWindow = new BrowserWindow({ ...savedBounds, minWidth: 900, minHeight: 650, frame: false, show: false, backgroundColor: "#f5f4f1", icon: appIconPath, webPreferences: { preload: path.join(root, "electron", "preload", "index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  protectAppNavigation(mainWindow);
  attachWindowStatePersistence(mainWindow);
  const sendMaximizedState = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send("window:maximized-changed", mainWindow.isMaximized());
  };
  mainWindow.on("maximize", sendMaximizedState);
  mainWindow.on("unmaximize", sendMaximizedState);
  mainWindow.on("enter-full-screen", () => mainWindow?.webContents.send("window:fullscreen-changed", true));
  mainWindow.on("leave-full-screen", () => mainWindow?.webContents.send("window:fullscreen-changed", false));
  mainWindow.on("blur", () => focusSessionService?.handleWindowBlur());
  mainWindow.on("focus", () => focusSessionService?.handleWindowFocus());
  mainWindow.on("close", event => {
    if (smokeTest || isQuitting) return;
    event.preventDefault();
    void requestMainWindowClose();
  });
  mainWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, _validatedURL, isMainFrame) => {
    // Vue route changes intentionally destroy legacy child iframes. Chromium
    // reports their cancelled navigation as -3; only a main-frame failure can
    // invalidate the Electron smoke result.
    if (!smokeTest || !isMainFrame) return;
    console.error(`Kairos smoke test failed to load main window: ${errorCode} ${errorDescription}`);
    app.exit(1);
  });
  mainWindow.webContents.on("did-finish-load", async () => {
    if (smokeTest) {
      try {
        const result = rendererMode === "vue"
          ? await verifyVuePreviewRenderer(mainWindow)
          : await verifySmokeRenderer(mainWindow);
        result.renderer = rendererMode;
        result.checks ||= {};
        const windowMaximizeControl = await verifyWindowMaximizeControl(mainWindow);
        result.checks.windowMaximizeControl = windowMaximizeControl.ok;
        result.windowControlCaptures = windowMaximizeControl.captures;
        if (rendererMode === "vue" && smokeCaptureVisuals) {
          const locale = await mainWindow.webContents.executeJavaScript("document.documentElement.lang");
          result.visualCaptures = await captureVueRouteVisuals(mainWindow, locale || "unknown");
        }
        await writeSmokeResult(result);
        console.log(`Kairos smoke test loaded ${rendererMode} renderer. ${JSON.stringify(result.checks || result.bridge)}`);
        app.exit(0);
      } catch (error) {
        await writeSmokeResult({ ok: false, error: error?.message || String(error) });
        console.error(`Kairos smoke test failed renderer checks: ${error?.message || error}`);
        app.exit(1);
      }
      return;
    }
    if (!overlayVisualTest) mainWindow?.show();
    sendPetVisibility();
  });
  mainWindow.on("closed", () => {
    const closingAiChatWindow = aiChatWindow;
    const closingPetWindow = petWindow;
    closePromptOpen = false;
    aiChatWindow = null;
    petWindow = null;
    mainWindow = null;
    closeWindowSafely(closingAiChatWindow);
    closeWindowSafely(closingPetWindow);
  });
  if (rendererMode === "vue") {
    if (vueDevServerUrl) await mainWindow.loadURL(vueDevServerUrl);
    else await mainWindow.loadFile(path.join(root, "app", "vue-preview", "index.html"));
  } else {
    await mainWindow.loadFile(path.join(root, "app", "pages", "calendar", "index.html"));
  }
}

async function createPetWindow() {
  let candidate = null;
  try {
    candidate = new BrowserWindow({
      ...PET_WINDOW_SIZE,
      ...OVERLAY_WINDOW_OPTIONS,
      alwaysOnTop: true, skipTaskbar: true,
      show: false,
      webPreferences: {
        preload: path.join(root, "electron", "preload", "index.cjs"),
        contextIsolation: true, nodeIntegration: false, sandbox: true, transparent: true
      }
    });
    petWindow = candidate;
    protectAppNavigation(petWindow);
    petWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      if (isMainFrame) console.error(`Pet window failed to load ${validatedURL}: ${errorCode} ${errorDescription}`);
    });
    petWindow.webContents.on("render-process-gone", (_event, details) => {
      console.error(`Pet renderer exited: ${details.reason} (${details.exitCode})`);
    });
    petWindow.on("unresponsive", () => console.error("Pet window became unresponsive."));
    petWindow.once("ready-to-show", () => {
      resizePetWindow();
      placePetWindowInWorkArea();
      // A transparent BrowserWindow still intercepts input. Start in pass-through
      // mode; the renderer turns hit testing back on only over visible pet UI.
      petWindow?.setIgnoreMouseEvents(true, { forward: true });
      if (petVisible && (!overlayVisualTest || overlayVisualTarget !== "chat")) showPetWindow();
      if (overlayVisualTest && overlayVisualTarget !== "pet") showAiChatWindow();
      sendPetVisibility();
      if (petSmokeTest && petWindow) finishPetSmokeTest(petWindow).catch(error => {
        console.error(`Kairos pet smoke test failed: ${error?.stack || error}`);
        app.exit(1);
      });
    });
    petWindow.on("blur", () => petWindow?.webContents.send("pet:blur"));
    await petWindow.loadFile(path.join(root, "app", "pages", "pet", "index.html"));
    // The pet is a transparent standalone document, so it does not share the
    // shell's theme runtime. Apply the same named theme after its document is
    // ready while preserving the transparent window around the illustration.
    await petWindow.webContents.executeJavaScript("document.documentElement.dataset.kairosTheme = 'claude-plus';", true);
    await petWindow.webContents.insertCSS(await fs.readFile(path.join(root, "app", "themes", "claude-plus.css"), "utf8"));
    return petWindow;
  } catch (error) {
    if (candidate && !candidate.isDestroyed()) candidate.destroy();
    if (petWindow === candidate) petWindow = null;
    console.error("Failed to create pet window:", error);
    if (petSmokeTest) {
      await writeSmokeResult({ ok: false, error: String(error?.stack || error) }).catch(() => {});
      app.exit(1);
    }
    return null;
  }
}

ipcMain.handle("pet:hide", async () => { petVisible = false; resizePetWindow(); await writePetState({ visible: false }); petWindow?.hide(); hideAiChatWindowSmooth(); sendPetVisibility(); return true; });
ipcMain.handle("pet:show", async () => { petVisible = true; resizePetWindow(); await writePetState({ visible: true }); showPetWindow({ reposition: true }); sendPetVisibility(); return true; });
ipcMain.handle("pet:click", () => { resizePetWindow(); sendPetAction("talk"); showAiChatWindow(); return true; });
ipcMain.handle("pet:react", (_event, input = {}) => sendPetAction(input.action, input));
ipcMain.handle("pet:move", (_event, { dx, dy }) => { queuePetMove(dx, dy); return true; });
ipcMain.handle("pet:is-ready", () => !!petWindow && !petWindow.isDestroyed());
ipcMain.handle("pet:get-visibility", () => petVisible);
ipcMain.handle("pet:resize", (event, { width, height } = {}) => {
  if (event.sender !== petWindow?.webContents) return false;
  return resizePetWindow(width, height);
});
ipcMain.handle("reminder:notify", (event, input = {}) => {
  if (event.sender !== mainWindow?.webContents) return { shown: false, reason: "untrusted_sender" };
  return showNativeReminder(input);
});
ipcMain.handle("ai-window:close", event => { const win = BrowserWindow.fromWebContents(event.sender); if (win === aiChatWindow) return hideAiChatWindowSmooth(); return false; });
ipcMain.handle("window:minimize", event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed()) return false;
  win.minimize();
  return true;
});
ipcMain.handle("window:toggle-maximize", event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed()) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return true;
});
ipcMain.handle("window:is-maximized", event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed()) return false;
  return win.isMaximized();
});
ipcMain.handle("window:toggle-fullscreen", event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed()) return false;
  win.setFullScreen(!win.isFullScreen());
  return win.isFullScreen();
});
ipcMain.handle("window:is-fullscreen", event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed()) return false;
  return win.isFullScreen();
});
ipcMain.handle("window:close", event => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed()) return false;
  return requestMainWindowClose();
});
ipcMain.handle("window:close-action", (event, action) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win !== mainWindow || win.isDestroyed() || !closePromptOpen) return false;
  closePromptOpen = false;
  if (action === "tray") return minimizeToTray();
  if (action === "exit") {
    isQuitting = true;
    app.quit();
    return true;
  }
  return true;
});
ipcMain.on("ai-window:set-mouse-passthrough", (event, ignore) => {
  if (!aiChatWindow || event.sender !== aiChatWindow.webContents) return;
  aiChatWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: Boolean(ignore) });
});
ipcMain.on("pet:set-mouse-passthrough", (event, ignore) => {
  if (!petWindow || event.sender !== petWindow.webContents) return;
  petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: Boolean(ignore) });
});

ipcMain.handle("ai:list-providers", async () => providerCatalog(await readSettings()));
ipcMain.handle("ai:get-settings", async () => publicSettings(await readSettings()));
ipcMain.handle("ai:personal-profile:get", () => readPersonalProfile());
ipcMain.handle("ai:personal-profile:update", async (_event, input = {}) => mutatePersonalProfile(current => updatePersonalProfile(current, {
  memoryEnabled: input.memoryEnabled,
  manual: input.manual,
  interaction: input.interaction,
})));
ipcMain.handle("ai:personal-profile:refresh", async (_event, conversationId) => refreshPersonalPortrait(conversationId, { force: true }));
ipcMain.handle("ai:personal-profile:finalize", async (_event, conversationId) => {
  queueMicrotask(() => refreshPersonalPortrait(conversationId).catch(error => console.error("Failed to refresh personal portrait:", error)));
  return { queued: true };
});

ipcMain.handle("focus:get", event => {
  if (event.sender !== mainWindow?.webContents) return { active: null };
  return focusSessionService?.publicSnapshot() || { active: null };
});
ipcMain.handle("focus:start", (event, input = {}) => {
  if (event.sender !== mainWindow?.webContents) throw new Error("untrusted_sender");
  return focusSessionService.start(input);
});
ipcMain.handle("focus:rest", (event, input = {}) => {
  if (event.sender !== mainWindow?.webContents) throw new Error("untrusted_sender");
  return focusSessionService.enterRest(input);
});
ipcMain.handle("focus:resume", (event, input = {}) => {
  if (event.sender !== mainWindow?.webContents) throw new Error("untrusted_sender");
  return focusSessionService.resumeFocus(input);
});
ipcMain.handle("focus:update", (event, input = {}) => {
  if (event.sender !== mainWindow?.webContents) throw new Error("untrusted_sender");
  return focusSessionService.update(input);
});
ipcMain.handle("focus:finish", (event, input = {}) => {
  if (event.sender !== mainWindow?.webContents) throw new Error("untrusted_sender");
  return focusSessionService.finish(input);
});
ipcMain.handle("focus:choose-scene", async event => {
  if (event.sender !== mainWindow?.webContents) return { canceled: true };
  const result = await dialog.showOpenDialog(mainWindow, {
    title: nativeT("focus.scene.chooseTitle", {}, "Choose a focus scene"),
    properties: ["openFile"],
    filters: [
      { name: nativeT("focus.scene.supportedFiles", {}, "Focus scenes"), extensions: ["mp4", "webm", "gif", "html", "htm"] },
      { name: nativeT("electron.allFiles", {}, "All files"), extensions: ["*"] }
    ]
  });
  const filePath = result.filePaths?.[0] || "";
  const kind = focusSceneKind(filePath);
  if (result.canceled || !filePath || !kind) return { canceled: true };
  return { canceled: false, filePath, name: path.basename(filePath), kind };
});
ipcMain.handle("focus:validate-scene", async event => {
  if (event.sender !== mainWindow?.webContents) return { available: false };
  const scene = (await appStateStore.read())?.settings?.focus?.scene;
  if (scene?.source !== "file" || !focusSceneKind(scene.path)) return { available: true, kind: "video" };
  try {
    const stat = await fs.stat(path.resolve(scene.path));
    return { available: stat.isFile(), kind: focusSceneKind(scene.path) };
  } catch {
    return { available: false, kind: focusSceneKind(scene.path) };
  }
});
ipcMain.handle("ai:personal-profile:clear-portrait", () => mutatePersonalProfile(current => clearPortrait(current)));
ipcMain.handle("ai:initialize-assistant-profile", async (_event, legacy = {}) => {
  const current = await readSettings(); const result = initializeAssistantProfile(current.assistantProfile, legacy);
  if (result.changed) await writeSettings({ ...current, assistantProfile: result.profile });
  return result.profile;
});
ipcMain.handle("ai:save-assistant-profile", async (_event, input = {}) => {
  const current = await readSettings(); const assistantProfile = updateAssistantProfile(current.assistantProfile, input);
  await writeSettings({ ...current, assistantProfile });
  return assistantProfile;
});
ipcMain.handle("ai:create-provider", async (_event, input = {}) => {
  const current = await readSettings();
  assertUniqueProviderName(current, input.name);
  const definition = createCustomDefinition(input);
  const apiKey = String(input.apiKey || "").trim();
  if (!apiKey) throw new ProviderError("missing_key", nativeT("errors.missingApiKey", {}, "Please configure an API key first."));
  if (!safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", nativeT("errors.secureStorageUnavailable", {}, "Secure storage is unavailable on this system."));
  const discoveredModels = await listProviderModels(definition.id, { definition, apiKey, t: nativeT });
  if (!discoveredModels.length) throw new ProviderError("no_models", "The provider's /models endpoint returned no chat-capable models.");
  const next = structuredClone(current);
  next.customProviders.push(definition);
  next.providers[definition.id] = normalizeProviderEntry({
    encryptedKey: safeStorage.encryptString(apiKey).toString("base64"),
    createdAt: new Date().toISOString(),
    keyHint: keyHint(apiKey),
    environmentDisabled: true,
    credentialVersion: 1,
    discoveredModels,
    modelCatalogUpdatedAt: new Date().toISOString(),
  });
  const settings = await persistProviderSettings(next);
  return { settings, provider: providerCatalog(next).find(item => item.id === definition.id) };
});
ipcMain.handle("ai:update-provider", async (_event, input = {}) => {
  const current = await readSettings();
  const definition = requireProviderDefinition(current, input.provider);
  if (definition.kind !== "custom") throw new ProviderError("builtin_provider_readonly", "Built-in providers cannot be renamed or deleted.");
  assertUniqueProviderName(current, input.name ?? definition.name, definition.id);
  const name = String(input.name ?? definition.name).trim().slice(0, 60);
  const baseURL = normalizeCustomBaseURL(input.baseURL ?? definition.baseURL);
  const apiKey = String(input.apiKey || "").trim();
  if (input.clearKey && !apiKey) throw new ProviderError("missing_key", nativeT("errors.missingApiKey", {}, "Custom providers require a saved API key."));
  if (apiKey && !safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", nativeT("errors.secureStorageUnavailable", {}, "Secure storage is unavailable on this system."));
  const configurationChanged = baseURL !== definition.baseURL || Boolean(apiKey);
  const updatedDefinition = { ...definition, name, baseURL, updatedAt: new Date().toISOString() };
  let discoveredModels = null;
  if (configurationChanged) {
    const key = apiKey || resolveProviderKey(current, current.providers[definition.id] || {}, definition.id);
    discoveredModels = await listProviderModels(definition.id, { definition: updatedDefinition, apiKey: key, t: nativeT });
    if (!discoveredModels.length) throw new ProviderError("no_models", "The provider's /models endpoint returned no chat-capable models.");
  }
  const next = structuredClone(current);
  next.customProviders = next.customProviders.map(item => item.id === definition.id ? updatedDefinition : item);
  let entry = normalizeProviderEntry(next.providers[definition.id]);
  if (configurationChanged) entry = { ...entry, credentialVersion: entry.credentialVersion + 1, discoveredModels, modelCatalogUpdatedAt: new Date().toISOString() };
  if (apiKey) entry = { ...entry, encryptedKey: safeStorage.encryptString(apiKey).toString("base64"), createdAt: new Date().toISOString(), keyHint: keyHint(apiKey), environmentDisabled: true };
  next.providers[definition.id] = entry;
  return persistProviderSettings(next);
});
ipcMain.handle("ai:delete-provider", async (_event, { provider } = {}) => {
  const current = await readSettings();
  const definition = requireProviderDefinition(current, provider);
  if (definition.kind !== "custom") throw new ProviderError("builtin_provider_readonly", "Built-in providers cannot be renamed or deleted.");
  const next = structuredClone(current);
  next.customProviders = next.customProviders.filter(item => item.id !== provider);
  delete next.providers[provider];
  next.retiredProviders[provider] = { name: definition.name, deletedAt: new Date().toISOString() };
  if (next.defaultProvider === provider) next.defaultProvider = "";
  sessionKeys.delete(provider);
  return persistProviderSettings(next);
});
ipcMain.handle("ai:save-settings", async (_event, input) => {
  const current = await readSettings(); const provider = input.provider;
  const definition = requireProviderDefinition(current, provider);
  const previous = normalizeProviderEntry(current.providers[provider]);
  const hasEnabledModels = Object.prototype.hasOwnProperty.call(input || {}, "enabledModels");
  const requestedEnabled = hasEnabledModels ? [...new Set((input.enabledModels || []).map(value => String(value).trim()).filter(Boolean))] : previous.enabledModels;
  const requestedModel = String(input.model ?? previous.model).trim();
  const enabledModels = resolveSelectableModels(definition, { ...previous, enabledModels: requestedEnabled, model: requestedModel }, { t: nativeT }).enabledModels;
  let entry = { ...previous, enabledModels, model: enabledModels.includes(requestedModel) ? requestedModel : "" };
  const next = structuredClone(current);
  if (Object.prototype.hasOwnProperty.call(input, "defaultProvider")) {
    const nextDefault = String(input.defaultProvider || "");
    const nextDefinition = nextDefault ? definitionFromSettings(current, nextDefault) : null;
    if (nextDefault && !nextDefinition) throw new ProviderError("unknown_provider", nativeT("errors.unknownProvider", {}, "Unknown AI provider."));
    if (nextDefinition) {
      const targetEntry = nextDefault === provider ? entry : normalizeProviderEntry(current.providers[nextDefault]);
      const targetSelection = resolveSelectableModels(nextDefinition, targetEntry, { t: nativeT });
      if (!targetSelection.defaultModel) throw new ProviderError("no_enabled_model", nativeT("errors.noEnabledModel", {}, "Select a default model before making this the default provider."));
    }
    next.defaultProvider = nextDefault;
  }
  if (input.clearKey) {
    if (definition.kind === "custom") throw new ProviderError("missing_key", nativeT("errors.missingApiKey", {}, "Custom providers require a saved API key."));
    entry = { ...entry, encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: true, credentialVersion: entry.credentialVersion + 1 };
    sessionKeys.delete(provider);
  }
  if (input.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", nativeT("errors.secureStorageUnavailable", {}, "Secure storage is unavailable on this system."));
    entry = { ...entry, encryptedKey: safeStorage.encryptString(String(input.apiKey)).toString("base64"), createdAt: new Date().toISOString(), keyHint: keyHint(input.apiKey), environmentDisabled: definition.kind === "custom", credentialMode: "saved", credentialVersion: entry.credentialVersion + 1 };
    sessionKeys.delete(provider);
  }
  next.providers[provider] = entry;
  return persistProviderSettings(next);
});
ipcMain.handle("ai:save-firecrawl-settings", async (_event, input = {}) => {
  const current = await readSettings();
  const next = structuredClone(current);
  next.firecrawl ||= { encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false };
  if (input.clear) { next.firecrawl.encryptedKey = ""; next.firecrawl.createdAt = ""; next.firecrawl.keyHint = ""; next.firecrawl.environmentDisabled = true; }
  if (input.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", nativeT("errors.secureStorageUnavailable", {}, "Secure storage is unavailable on this system."));
    next.firecrawl.environmentDisabled = false;
    next.firecrawl.encryptedKey = safeStorage.encryptString(String(input.apiKey)).toString("base64");
    next.firecrawl.createdAt = new Date().toISOString();
    next.firecrawl.keyHint = keyHint(input.apiKey);
  }
  await writeSettings(next);
  const result = publicSettings(next); broadcastProviderSettings(result);
  return result;
});
ipcMain.handle("ai:test-provider", async (_event, { provider } = {}) => { const settings = await readSettings(); const definition=requireProviderDefinition(settings, provider); const entry=settings.providers[provider]||{}; const selection=resolveSelectableModels(definition,entry,{t:nativeT}); return testProvider({ provider, definition, apiKey: resolveProviderKey(settings, entry, provider), model: selection.defaultModel || selection.catalogModels[0] || definition.defaultModel, t: nativeT }); });
ipcMain.handle("ai:refresh-provider-models", async (_event, { provider, sessionKey } = {}) => {
  const settings = await readSettings(); const definition=requireProviderDefinition(settings, provider); const entry = settings.providers?.[provider] || {};
  const models = await listProviderModels(provider, { definition, apiKey: sessionKey || resolveProviderKey(settings, entry, provider), t: nativeT });
  const next = structuredClone(settings); next.providers ||= {}; next.providers[provider] = { ...entry, discoveredModels: models, modelCatalogUpdatedAt: new Date().toISOString() };
  await writeSettings(next); const result = publicSettings(next); broadcastProviderSettings(result); return { models, refreshedAt: next.providers[provider].modelCatalogUpdatedAt, settings: result };
});
ipcMain.handle("ai:send", async (_event, payload) => {
  const requestId = crypto.randomUUID(); const settings = await readSettings(); const provider = payload.provider || settings.defaultProvider;
  const definition = requireProviderDefinition(settings, provider);
  const entry = settings.providers[provider] || {}; const selection = resolveSelectableModels(definition, entry, { t: nativeT }); const requestedModel = String(payload.model || "").trim(); const model = requestedModel || selection.defaultModel; if (!model) throw new ProviderError("no_enabled_model", nativeT("errors.noEnabledModel", {}, "Select at least one chat model in Settings first.")); if (!selection.enabledModels.includes(model)) throw new ProviderError("model_unavailable", nativeT("errors.noEnabledModel", {}, "The selected model is unavailable or hidden."));
  const controller = new AbortController(); controllers.set(requestId, controller); const conversationId=payload.conversationId; if(conversationId)await aiStore.updateConversation(conversationId,{provider,model}); const lastUser=[...(payload.messages||[])].reverse().find(x=>x.role==="user"); if(conversationId&&lastUser&&!payload.isRetry)await aiStore.addMessage({conversationId,role:"user",content:lastUser.content,provider,model,attachmentIds:payload.attachmentIds,attachmentNames:payload.attachmentNames});
  queueMicrotask(async () => { let output="",usage=null,status="completed",errorValue=null;try { const requestMessages=[...(payload.messages||[])];for(const id of payload.attachmentIds||[]){const prepared=await attachments.prepare(id,definition.capabilities||[]);if(prepared.mode==="extracted_text")requestMessages.push({role:"user",content:`${nativeT("assistant.attachmentExtractedContent",{},"Extracted attachment content:")}\n${prepared.chunks.map(x=>`[${x.location}${x.part>1?nativeT("assistant.attachmentPart",{part:x.part}," · Part {part}"):""}]\n${x.text}`).join("\n\n")}`});}broadcastAiStream({ requestId, type:"started" });const conversation=conversationId?await aiStore.getConversation(conversationId):null;const aiPreferences=payload.aiPreferences||{};const personalProfile=await readPersonalProfile();const result=await runKairosAgent({provider,providerDefinition:definition,apiKey:resolveProviderKey(settings,entry,provider),model,messages:requestMessages,conversationTitle:conversation?.title||nativeT("assistant.newConversation",{},"New conversation"),personalizationInstruction:buildPersonalizationInstruction(personalProfile,nativeLocale()),memoryEnabled:personalProfile.memoryEnabled,signal:controller.signal,store:aiStore,memoryService:agentMemoryService,toolRuntime,appAdapters,musicController:aiMusicController,searchWeb:input=>{if(aiPreferences.webSearchMode==="off")throw new Error("external_search_disabled");return searchWebWithSettings({...input,firecrawlReader:aiPreferences.firecrawlReader!==false});},ensureExternalSearch:async()=>{if(aiPreferences.webSearchMode==="off")throw new Error("external_search_disabled");const permissions=await toolRuntime.getPermissions();if(permissions.externalSearch==="read")return;const response=await dialog.showMessageBox(mainWindow||aiChatWindow,{type:"question",buttons:[nativeT("electron.allowWebSearch",{},"Allow web search"),nativeT("common.cancel",{},"Cancel")],defaultId:0,cancelId:1,title:nativeT("electron.webSearchPermissionTitle",{},"Allow Kairos to search the web?"),message:nativeT("electron.webSearchPermissionMessage",{},"Kairos wants to search external web pages to answer the current question. Only model-selected search terms will be sent.")});if(response.response!==0)throw new Error("external_search_not_approved");await toolRuntime.setPermissions({externalSearch:"read"});},onSetTitle:title=>conversationId?aiStore.updateConversation(conversationId,{title}):{title},onToolEvent:event=>broadcastAiStream({requestId,...event})});output=result.text;usage=result.usage;broadcastAiStream({requestId,type:"completed",usage}); } catch (error) { if(controller.signal.aborted){status="stopped";broadcastAiStream({requestId,type:"stopped"});}else{status="failed";errorValue=errorInfo(error);broadcastAiStream({ requestId, type: "failed", ...errorValue });} } finally { if(conversationId){try { const message=await aiStore.addMessage({conversationId,role:"assistant",content:output,status,provider,model});if(errorValue)await aiStore.updateMessage(message.id,{error:errorValue});if(usage)await aiStore.addUsage({conversationId,requestId,provider,model,inputTokens:usage.input_tokens||usage.prompt_tokens||0,outputTokens:usage.output_tokens||usage.completion_tokens||0}); } catch (persistenceError) { console.error("Failed to persist AI response:",persistenceError); broadcastAiStream({requestId,type:"persistence_failed",message:errorInfo(persistenceError).message}); }}controllers.delete(requestId); } }); return { requestId };
});
ipcMain.handle("ai:stop", (_event, requestId) => { controllers.get(requestId)?.abort(); return { ok: true }; });
ipcMain.handle("ai:conversations:list",()=>aiStore.listConversations());
ipcMain.handle("ai:conversations:create",(_event,input={})=>aiStore.createConversation({...input,title:input.title||nativeT("assistant.newConversation",{},"New conversation")}));
ipcMain.handle("ai:conversations:get",(_event,id)=>aiStore.getConversation(id));
ipcMain.handle("ai:conversations:update",(_event,{id,patch})=>aiStore.updateConversation(id,patch));
ipcMain.handle("ai:conversations:delete",async(_event,id)=>{const files=await aiStore.deleteConversation(id);await attachments.removeConversationFiles(files);return{ok:true};});
ipcMain.handle("ai:usage",(_event,filters)=>aiStore.usageSummary(filters));
ipcMain.handle("ai:memories:list",()=>aiStore.listMemories());
ipcMain.handle("ai:memories:forget",(_event,id)=>aiStore.forgetMemory(id));
ipcMain.handle("ai:memories:clear",async()=>{const result=await aiStore.clearMemories();await mutatePersonalProfile(current=>clearPortrait(current));return result;});
ipcMain.handle("ai:memory:profile:get",()=>agentMemoryService.getProfile());
ipcMain.handle("ai:memory:profile:update",(_event,input)=>agentMemoryService.updateProfileField(input));
ipcMain.handle("ai:memory:profile:forget",(_event,key)=>agentMemoryService.forgetProfileField(key));
ipcMain.handle("ai:memory:timeline",(_event,query)=>agentMemoryService.getTimeline(query));
ipcMain.handle("ai:memory:search",(_event,query)=>agentMemoryService.recall(query||{}));
ipcMain.handle("ai:memory:stats",()=>agentMemoryService.getStats());
ipcMain.handle("ai:memory:rebuild",()=>{memoryViews.rebuildAll();return{ok:true};});
ipcMain.handle("ai:attachments:save",(_event,input)=>attachments.save(input));
ipcMain.handle("ai:attachments:remove",(_event,id)=>attachments.remove(id));
ipcMain.handle("ai:attachments:prepare",async(_event,{id,provider})=>{const settings=await readSettings();const definition=requireProviderDefinition(settings,provider);const result=await attachments.prepare(id,definition.capabilities||[]);return{...result,localPath:undefined};});
ipcMain.handle("ai:context:assess",async(_event,{conversationId,provider,limit})=>{const conversation=await aiStore.getConversation(conversationId);if(!conversation)throw new Error("conversation_not_found");const parsed=(conversation.attachments||[]).flatMap(item=>item.parsed?.chunks||[]);return contextManager.assess({provider:provider||conversation.provider,messages:conversation.messages,attachments:parsed,limit});});
ipcMain.handle("ai:context:resolve",async(_event,{conversationId,action,carrySummary=false})=>{const conversation=await aiStore.getConversation(conversationId);if(!conversation)throw new Error("conversation_not_found");if(action==="new_conversation")return{action,conversation:await contextManager.createContinuation(conversationId,{carrySummary,titleSuffix:nativeT("assistant.continuationSuffix",{}," · Continue")})};if(action!=="summarize")throw new Error("invalid_context_action");const settings=await readSettings();const provider=conversation.provider||settings.defaultProvider;const definition=requireProviderDefinition(settings,provider);const entry=settings.providers[provider]||{};let summary="";for await(const event of streamProviderRequest({provider,definition,model:conversation.model||entry.model||definition.defaultModel,apiKey:resolveProviderKey(settings,entry,provider),messages:contextManager.buildSummaryPrompt(conversation.messages,{locale:nativeLocale()}),signal:new AbortController().signal,t:nativeT})){if(event.type==="text_delta")summary+=event.delta;}await contextManager.saveSummary(conversationId,summary);return{action,summary};});
ipcMain.handle("ai:permissions:get",()=>toolRuntime.getPermissions());
ipcMain.handle("ai:permissions:set",(_event,input)=>toolRuntime.setPermissions(input));
ipcMain.handle("app:initialize",(_event,legacy)=>appStateStore.initialize(legacy));
ipcMain.handle("app:save", async (_event, state) => { const saved = await appStateStore.write(state); broadcastAppState(saved); return saved; });
ipcMain.handle("app:get",()=>appStateStore.read());
ipcMain.handle("app:audit",async()=>auditAppState(await appStateStore.read()));
ipcMain.handle("app:list-backups",()=>appStateStore.listBackups());
ipcMain.handle("app:read-backup",(_event,name)=>appStateStore.readBackup(name));
ipcMain.handle("app:restore-backup",async(_event,name)=>{const state=await appStateStore.restoreBackup(name);broadcastAppState(state);return state;});
ipcMain.handle("app:export-current",async()=>{const result=await dialog.showSaveDialog(mainWindow,{title:nativeT("electron.exportAppData",{},"Export Kairos app data"),defaultPath:`kairos-app-state-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:nativeT("electron.jsonFiles",{},"JSON files"),extensions:["json"]}]});if(result.canceled||!result.filePath)return{canceled:true};const state=await appStateStore.read();await fs.writeFile(result.filePath,JSON.stringify(state,null,2),"utf8");return{canceled:false,filePath:result.filePath};});
ipcMain.handle("app:import-json",async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:nativeT("electron.importAppData",{},"Import Kairos app data"),properties:["openFile"],filters:[{name:nativeT("electron.jsonFiles",{},"JSON files"),extensions:["json"]}]});if(result.canceled||!result.filePaths[0])return{canceled:true};const raw=JSON.parse(await fs.readFile(result.filePaths[0],"utf8"));const backupPath=await appStateStore.backupCurrent("before-import");const state=await appStateStore.write({...raw,imported_from:result.filePaths[0],imported_at:new Date().toISOString(),last_import_backup:backupPath});broadcastAppState(state);return{canceled:false,state,filePath:result.filePaths[0],backupPath};});
ipcMain.handle("calendar-background:list-builtins", () => calendarBackgroundService().listBuiltins());
ipcMain.handle("calendar-background:choose-import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: nativeT("electron.importCalendarBackground", {}, "Import calendar background"), properties: ["openFile"], filters: [{ name: nativeT("electron.images", {}, "Images"), extensions: ["jpg", "jpeg", "png", "webp"] }] });
  if (result.canceled || !result.filePaths[0]) return { canceled: true };
  const filePath = result.filePaths[0];
  const token = crypto.randomUUID();
  pendingCalendarBackgroundImports.set(token, { filePath, expiresAt: Date.now() + 5 * 60 * 1000 });
  return { canceled: false, token, suggestedName: path.basename(filePath, path.extname(filePath)) };
});
ipcMain.handle("calendar-background:complete-import", async (_event, input = {}) => {
  const token = String(input?.token || "");
  const pending = pendingCalendarBackgroundImports.get(token);
  pendingCalendarBackgroundImports.delete(token);
  if (!pending || pending.expiresAt < Date.now()) throw new Error("calendar_background_import_expired");
  return calendarBackgroundService().importFromPath(pending.filePath, input?.name);
});
ipcMain.handle("calendar-background:rename", (_event, input = {}) => calendarBackgroundService().rename(input?.source, input?.id, input?.name));
ipcMain.handle("calendar-background:delete", (_event, id) => calendarBackgroundService().remove(id));
ipcMain.handle("ai:tools:query",(_event,{domain,query})=>toolRuntime.query(domain,query,appAdapters));
ipcMain.handle("ai:tools:propose",(_event,input)=>toolRuntime.propose(input));
ipcMain.handle("ai:tools:decide",(_event,input)=>toolRuntime.decide(input,appAdapters));
ipcMain.on("music:command-result", (event, payload = {}) => {
  if (!mainWindow || event.sender !== mainWindow.webContents) return;
  const pending = pendingMusicCommands.get(payload.requestId);
  if (!pending) return;
  clearTimeout(pending.timer); pendingMusicCommands.delete(payload.requestId);
  if (payload.ok === false) pending.reject(new Error(payload.error || "music_command_failed"));
  else pending.resolve(payload.result);
});
ipcMain.handle("music:get-state",()=>musicLibrary.publicState());
ipcMain.handle("music:choose-files",async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:nativeT("electron.chooseLocalMusic",{},"Choose local music"),properties:["openFile","multiSelections"],filters:[{name:nativeT("electron.audioFiles",{},"Audio files"),extensions:["mp3","flac","wav","m4a","mp4","aac"]}]});if(result.canceled)return{state:await musicLibrary.publicState(),added:[],rejected:[]};return musicLibrary.addFiles(result.filePaths);});
ipcMain.handle("music:choose-folder",async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:nativeT("electron.choosePlaylistFolder",{},"Choose local playlist folder"),properties:["openDirectory"]});if(result.canceled||!result.filePaths[0])return{state:await musicLibrary.publicState(),imported:[],rejected:[]};return musicLibrary.addFolder(result.filePaths[0]);});
ipcMain.handle("music:add-files",(_event,filePaths)=>musicLibrary.addFiles(filePaths));
ipcMain.handle("music:sync-folders",()=>musicLibrary.syncFolders());
ipcMain.handle("music:update-playback",(_event,patch)=>musicLibrary.updatePlayback(patch));
ipcMain.handle("music:update-runtime",(_event,patch)=>musicLibrary.updateRuntime(patch));
ipcMain.handle("music:update-track",(_event,input)=>musicLibrary.updateTrack(input));
ipcMain.handle("music:remove-track",(_event,id)=>musicLibrary.removeTrack(id));
ipcMain.handle("music:remove-unavailable-tracks",()=>musicLibrary.removeUnavailableTracks());
ipcMain.handle("music:clear",()=>musicLibrary.clear());
ipcMain.handle("music:reorder",(_event,ids)=>musicLibrary.reorder(ids));
ipcMain.handle("music:reorder-playlist",(_event,input)=>musicLibrary.reorderPlaylist(input?.id,input?.trackIds));
ipcMain.handle("music:play-playlist",(_event,id)=>musicLibrary.playPlaylist(id));
ipcMain.handle("music:remove-playlist",(_event,id)=>musicLibrary.removePlaylist(id));
ipcMain.handle("music:refresh-playlist",(_event,id)=>musicLibrary.refreshPlaylist(id));
ipcMain.handle("music:remove-tracks-from-playlist",(_event,input)=>musicLibrary.removeTracksFromPlaylist(input?.id,input?.trackIds));
ipcMain.handle("music:restore-hidden-tracks",(_event,input)=>musicLibrary.restoreHiddenTracks(input?.id,input?.trackPaths));
ipcMain.handle("netease:get-status",()=>neteaseService.getStatus());
ipcMain.handle("netease:start-login",()=>neteaseService.startLogin());
ipcMain.handle("netease:login-check",(_event,input)=>neteaseService.loginCheck(input));
ipcMain.handle("netease:send-captcha",(_event,input)=>neteaseService.sendCaptcha(input));
ipcMain.handle("netease:login-with-phone",(_event,input)=>neteaseService.loginWithPhone(input));
ipcMain.handle("netease:open-verification", async (_event, url) => {
  const target = String(url || "");
  if (!/^https:\/\/(?:st\.music\.163\.com|music\.163\.com)\//.test(target)) return { ok: false };
  await shell.openExternal(target);
  return { ok: true };
});
ipcMain.handle("netease:logout",()=>neteaseService.logout());
ipcMain.handle("netease:search-songs",(_event,input)=>neteaseService.searchSongs(input));
ipcMain.handle("netease:get-search-home",(_event,input)=>neteaseService.getSearchHome(input));
ipcMain.handle("netease:play-song",(_event,input)=>neteaseService.playSong(input));
ipcMain.handle("netease:get-user-playlists",(_event,input)=>neteaseService.getUserPlaylists(input));
ipcMain.handle("netease:get-playlist-songs",(_event,input)=>neteaseService.getPlaylistSongs(input));
ipcMain.handle("netease:set-playlist-subscribed",(_event,input)=>neteaseService.setPlaylistSubscribed(input));
ipcMain.handle("netease:get-liked-songs",()=>neteaseService.getLikedSongs());
ipcMain.handle("netease:get-liked-song-ids",()=>neteaseService.getLikedSongIds());
ipcMain.handle("netease:set-song-liked",(_event,input)=>neteaseService.setSongLiked(input));
ipcMain.handle("netease:get-history",(_event,input)=>neteaseService.getHistory(input));
ipcMain.handle("netease:download-start", (_event, input) => ({ ok: true, ...neteaseDownloadService.start(input) }));
ipcMain.handle("netease:download-get-state", () => neteaseDownloadService.getState());
ipcMain.handle("netease:download-retry", (_event, input) => neteaseDownloadService.retry(input));
ipcMain.handle("netease:download-remove-task", (_event, input) => neteaseDownloadService.removeTask(input));
ipcMain.handle("netease:download-remove-completed", (_event, input) => neteaseDownloadService.removeCompleted(input));
ipcMain.handle("netease:open-download-directory", async () => {
  const result = await shell.openPath(neteaseDownloadService.downloadDir);
  return { ok: !result, message: result || "" };
});

if (hasSingleInstanceLock) {
  app.on("second-instance", () => { focusMainWindow(); });
  app.on("before-quit", event => {
    if (focusQuitFinalized || !focusSessionService?.active) return;
    event.preventDefault();
    focusQuitFinalized = true;
    void focusSessionService.finish({ status: "interrupted" }).catch(error => {
      console.error("Failed to finalize focus session during quit:", error);
    }).finally(() => app.quit());
  });
app.whenReady().then(async()=>{const userData=app.getPath("userData");appDatabase=new KairosAppDatabase(path.join(userData,"kairos.sqlite"));const databaseStatus=await appDatabase.initialize();if(!databaseStatus.available)throw new Error(`sqlite_unavailable:${databaseStatus.reason||"unknown"}`);await registerCalendarBackgroundProtocol();calendarBackgrounds=new CalendarBackgroundService({builtinDir:path.join(root,"app","assets","calendar-backgrounds"),legacyDir:calendarBackgroundDir(),database:appDatabase});await calendarBackgrounds.initialize();aiStore=new AiDataStore(path.join(userData,"ai-data.json"),{database:appDatabase});await aiStore.ensureStateFile();const memoryLedger=new MemoryLedger(appDatabase);const memoryViews=new MemoryViews(appDatabase,memoryLedger);agentMemoryService=new AgentMemoryService({database:appDatabase,ledger:memoryLedger,views:memoryViews,legacyStore:aiStore});aiStore.memoryService=agentMemoryService;appStateStore=new AppStateStore(path.join(userData,"app-state.json"),{database:appDatabase});await appStateStore.repairSchedules();await registerFocusSceneProtocol();const initialAppState=await appStateStore.read();setNativeLocale(initialAppState);focusSessionService=new FocusSessionService({store:appStateStore,onChange:(state,snapshot)=>{if(state)broadcastAppState(state);broadcastFocusState(snapshot);},onAwayReminder:()=>sendPetAction("focus-away",{title:nativeT("focus.awayReminder",{},"你还会回来吗…")})});await focusSessionService.initialize();const initializedProfile=initializePersonalProfile(await readPersonalProfile(),initialAppState?.settings?.ai||{});if(initializedProfile.changed)await writePersonalProfile(initializedProfile.profile);musicLibrary=new MusicLibrary({legacyPath:path.join(userData,"music-state.json"),database:appDatabase});await musicLibrary.ensureStateFile();await registerMusicMediaProtocol();neteaseService=new NeteaseApiService({statePath:path.join(userData,"netease-api-state.json"),database:appDatabase,t:nativeT});await neteaseService.initialize();await neteaseService.save();aiMusicController=new AiMusicController({netease:neteaseService,dispatch:dispatchMusicCommand,quality:async()=>(await appStateStore.read())?.settings?.music?.neteaseQuality||"standard"});neteaseDownloadService=new NeteaseDownloadService({neteaseService,musicLibrary,downloadDir:path.join(app.getPath("music"),"Kairos Downloads"),statePath:path.join(userData,"netease-download-state.json"),database:appDatabase,ffmpegPath:bundledFfmpegPath(),onProgress:payload=>{if(mainWindow&&!mainWindow.isDestroyed())mainWindow.webContents.send("netease:download-progress",payload);}});await neteaseDownloadService.initialize();await readSettings();attachments=new AttachmentService({tempDir:path.join(app.getPath("temp"),"kairos-ai"),store:aiStore,database:appDatabase});await attachments.migrateLegacyAttachments();toolRuntime=new ToolRuntime(aiStore);contextManager=new ContextManager(aiStore);appAdapters=createAppAdapters(appStateStore,broadcastAppState);petVisible=(await readPetState()).visible;await readWindowState();await attachments.cleanupTemporary();await cleanupMigratedLegacyData(userData);await createWindow();if(!smokeTest)await createPetWindow();});
  app.on("activate", () => { if (!focusMainWindow()) createWindow().catch(error => console.error("Failed to recreate main window:", error)); });
  app.on("window-all-closed", () => { closeWindowSafely(petWindow); if (process.platform !== "darwin") app.quit(); });
}
