import { app, BrowserWindow, dialog, ipcMain, Menu, Notification, protocol, safeStorage, screen, shell } from "electron";
import crypto from "node:crypto";
import path from "node:path";
import fsSync from "node:fs";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PROVIDERS, ProviderError, streamProviderRequest, testProvider } from "../services/ai/providers.js";
import { AiDataStore } from "../services/ai/data-store.js";
import { AttachmentService } from "../services/documents/attachments.js";
import { ToolRuntime } from "../services/ai/tool-runtime.js";
import { AppStateStore, auditAppState, createAppAdapters } from "../data/app-state/index.js";
import { KairosAppDatabase } from "../data/sqlite/index.js";
import { ContextManager } from "../services/ai/context-manager.js";
import { MusicLibrary } from "../services/music/music-library.js";
import { runKairosAgent } from "../services/ai/langchain-agent.js";
import { createWebSearch } from "../services/web/web-search.js";
import { NeteaseApiService } from "../services/music/netease-api-service.js";
import { SettingsRepository } from "../data/settings/index.js";
import { CalendarBackgroundService } from "../services/calendar/calendar-backgrounds.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
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
let aiStore, appStateStore, appDatabase, attachments, toolRuntime, contextManager, appAdapters, musicLibrary, neteaseService, aiSettingsRepository, calendarBackgrounds;
const pendingCalendarBackgroundImports = new Map();
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

const settingsPath = () => path.join(app.getPath("userData"), "ai-settings.json");
const petStatePath = () => path.join(app.getPath("userData"), "pet-state.json");
const windowStatePath = () => path.join(app.getPath("userData"), "window-state.json");
const calendarBackgroundDir = () => path.join(app.getPath("userData"), "calendar-backgrounds");
const defaults = { defaultProvider: "openai", providers: { openai: { model: PROVIDERS.openai.defaultModel, credentialMode: "session", encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false } }, firecrawl: { encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false } };
function normalizeSettings(value = {}) { const base = structuredClone(defaults); return { ...base, ...value, providers: { ...base.providers, ...(value.providers || {}) }, firecrawl: { ...base.firecrawl, ...(value.firecrawl || {}) } }; }
function settingsRepository() { if (!aiSettingsRepository) aiSettingsRepository = new SettingsRepository({ filePath: settingsPath(), defaults, normalize: normalizeSettings, database: appDatabase, storeKey: "ai-settings", summarize: value => ({ defaultProvider: value.defaultProvider || "", providers: Object.keys(value.providers || {}).length, firecrawlConfigured: Boolean(value.firecrawl?.encryptedKey) }) }); return aiSettingsRepository; }
async function readSettings() { return settingsRepository().read(); }
async function writeSettings(value) { return settingsRepository().write(value); }
async function readPetState() { try { return { visible: JSON.parse(await fs.readFile(petStatePath(), "utf8")).visible !== false }; } catch { return { visible: true }; } }
async function writePetState(value) { await fs.mkdir(path.dirname(petStatePath()), { recursive: true }); await fs.writeFile(petStatePath(), JSON.stringify(value, null, 2), "utf8"); }
async function readWindowState() { try { return JSON.parse(await fs.readFile(windowStatePath(), "utf8")); } catch { return null; } }
async function writeWindowState(value) { await fs.mkdir(path.dirname(windowStatePath()), { recursive: true }); await fs.writeFile(windowStatePath(), JSON.stringify(value, null, 2), "utf8"); }
function calendarBackgroundService() {
  if (!calendarBackgrounds) calendarBackgrounds = new CalendarBackgroundService({ builtinDir: path.join(root, "app", "assets", "calendar-backgrounds"), userDir: calendarBackgroundDir() });
  return calendarBackgrounds;
}
async function registerCalendarBackgroundProtocol() {
  protocol.handle("kairos-background", async request => {
    const url = new URL(request.url);
    const source = url.hostname === "custom" ? "custom" : url.hostname === "builtin" ? "builtin" : "";
    const id = decodeURIComponent(url.pathname.replace(/^\//, ""));
    const image = source ? await calendarBackgroundService().resolve(source, id) : null;
    if (!image) return new Response("Not found", { status: 404 });
    return new Response(await fs.readFile(image.filePath), { headers: { "content-type": image.mimeType, "cache-control": "no-store" } });
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
const PET_ACTIONS = new Set(["idle", "talk", "happy", "sleepy", "reminder"]);
const SHELL_VIEWS = new Set(["calendar", "schedule", "habits", "notes", "music", "settings"]);
function sendShellCommand(type, payload = {}) {
  if (!SHELL_VIEWS.has(type) || !mainWindow || mainWindow.isDestroyed()) return false;
  mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send("shell:command", { type, ...payload });
  return true;
}
function showNativeReminder(input = {}) {
  if (!Notification.isSupported()) return { shown: false, reason: "not_supported" };
  const itemTitle = typeof input.title === "string" ? input.title.trim().slice(0, 120) : "未命名日程";
  const note = typeof input.note === "string" ? input.note.trim().slice(0, 220) : "";
  const missed = input.missed === true;
  const notification = new Notification({
    title: missed ? "Kairos · 错过的提醒" : "Kairos · 日程提醒",
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
        { label: "打开 AI 对话", accelerator: "CommandOrControl+Shift+A", click: () => { sendPetAction("talk"); showAiChatWindow(); } },
        { label: petVisible ? "隐藏桌宠" : "显示桌宠", click: async () => { petVisible = !petVisible; await writePetState({ visible: petVisible }); if (petVisible) showPetWindow({ reposition: true }); else petWindow?.hide(); sendPetVisibility(); } },
        { type: "separator" },
        { role: "quit", label: "退出 Kairos" }
      ]
    },
    {
      label: "页面",
      submenu: [
        { label: "日历", accelerator: "Alt+1", click: navigate("calendar") },
        { label: "日程", accelerator: "Alt+2", click: navigate("schedule") },
        { label: "习惯", accelerator: "Alt+3", click: navigate("habits") },
        { label: "笔记", accelerator: "Alt+4", click: navigate("notes") },
        { label: "音乐", accelerator: "Alt+5", click: navigate("music") },
        { type: "separator" },
        { label: "设置", accelerator: "CommandOrControl+,", click: navigate("settings") }
      ]
    },
    {
      label: "窗口",
      submenu: [
        { role: "minimize", label: "最小化" },
        { role: "zoom", label: "缩放" },
        { type: "separator" },
        { role: "close", label: "关闭窗口" }
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
  const providerIds = new Set([...Object.keys(PROVIDERS), ...Object.keys(settings.providers || {})]);
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
async function searchWebWithSettings(input) {
  const settings = await readSettings();
  return createWebSearch({ apiKey: decryptFirecrawlKey(settings) })(input);
}
function errorInfo(error) { if (error && typeof error === "object") return { code: error.code || "unknown", message: error.message || String(error) }; return { code: "unknown", message: typeof error === "string" ? error : "unknown_error" }; }
function broadcastAiStream(payload) {
  for (const win of [mainWindow, aiChatWindow]) {
    if (win && !win.isDestroyed()) win.webContents.send("ai:stream", payload);
  }
}
function focusMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) return false;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  mainWindow.focus();
  return true;
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
      const started = Date.now();
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
      tick();
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
    return {
      readyState: document.readyState,
      imageComplete: Boolean(image?.complete),
      imageNaturalWidth: Number(image?.naturalWidth || 0),
      imageNaturalHeight: Number(image?.naturalHeight || 0),
      htmlBackgroundColor: getComputedStyle(document.documentElement).backgroundColor,
      bodyBackgroundColor: getComputedStyle(document.body).backgroundColor
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
    aiChatWindow.setPosition(closeEnough ? aiChatTargetBounds.x : nextX, closeEnough ? aiChatTargetBounds.y : nextY);
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
  aiChatWindow = new BrowserWindow({
    ...getAiChatBounds(),
    minWidth: 360,
    minHeight: 480,
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

async function createWindow() {
  const savedBounds = restoreWindowBounds(await readWindowState());
  mainWindow = new BrowserWindow({ ...savedBounds, minWidth: 900, minHeight: 650, show: false, backgroundColor: "#f5f4f1", webPreferences: { preload: path.join(root, "electron", "preload", "index.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } });
  protectAppNavigation(mainWindow);
  attachWindowStatePersistence(mainWindow);
  mainWindow.webContents.once("did-fail-load", (_event, errorCode, errorDescription) => {
    if (!smokeTest) return;
    console.error(`Kairos smoke test failed to load main window: ${errorCode} ${errorDescription}`);
    app.exit(1);
  });
  mainWindow.webContents.on("did-finish-load", async () => {
    if (smokeTest) {
      try {
        const result = await verifySmokeRenderer(mainWindow);
        await writeSmokeResult(result);
        console.log(`Kairos smoke test loaded main window. ${JSON.stringify(result.checks)}`);
        app.exit(0);
      } catch (error) {
        console.error(`Kairos smoke test failed renderer checks: ${error?.message || error}`);
        app.exit(1);
      }
      return;
    }
    if (!overlayVisualTest) mainWindow?.show();
    sendPetVisibility();
  });
  mainWindow.on("closed", () => { aiChatWindow?.close(); petWindow?.close(); aiChatWindow = null; petWindow = null; mainWindow = null; });
  mainWindow.loadFile(path.join(root, "app", "pages", "calendar", "index.html"));
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
ipcMain.on("ai-window:set-mouse-passthrough", (event, ignore) => {
  if (!aiChatWindow || event.sender !== aiChatWindow.webContents) return;
  aiChatWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: Boolean(ignore) });
});
ipcMain.on("pet:set-mouse-passthrough", (event, ignore) => {
  if (!petWindow || event.sender !== petWindow.webContents) return;
  petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: Boolean(ignore) });
});

ipcMain.handle("ai:list-providers", () => Object.values(PROVIDERS));
ipcMain.handle("ai:get-settings", async () => publicSettings(await readSettings()));
ipcMain.handle("ai:save-settings", async (_event, input) => {
  const current = await readSettings(); const provider = input.provider;
  if (!PROVIDERS[provider]) throw new ProviderError("unknown_provider", "未知模型提供商");
  const next = structuredClone(current); next.defaultProvider = input.defaultProvider || current.defaultProvider; next.providers[provider] = { ...(current.providers[provider] || {}), model: String(input.model || PROVIDERS[provider].defaultModel), credentialMode: input.credentialMode === "saved" ? "saved" : "session", encryptedKey: current.providers[provider]?.encryptedKey || "", environmentDisabled: Boolean(current.providers[provider]?.environmentDisabled) };
  if (input.clearKey) { next.providers[provider].encryptedKey = ""; next.providers[provider].createdAt = ""; next.providers[provider].keyHint = ""; next.providers[provider].environmentDisabled = true; sessionKeys.delete(provider); }
  if (input.apiKey) { next.providers[provider].environmentDisabled = false; if (next.providers[provider].credentialMode === "saved") { if (!safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", "系统安全存储当前不可用"); next.providers[provider].encryptedKey = safeStorage.encryptString(input.apiKey).toString("base64"); next.providers[provider].createdAt = new Date().toISOString(); next.providers[provider].keyHint = keyHint(input.apiKey); sessionKeys.delete(provider); } else { sessionKeys.set(provider, input.apiKey); next.providers[provider].encryptedKey = ""; next.providers[provider].keyHint = keyHint(input.apiKey); } }
  await writeSettings(next); return publicSettings(next);
});
ipcMain.handle("ai:save-firecrawl-settings", async (_event, input = {}) => {
  const current = await readSettings();
  const next = structuredClone(current);
  next.firecrawl ||= { encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false };
  if (input.clear) { next.firecrawl.encryptedKey = ""; next.firecrawl.createdAt = ""; next.firecrawl.keyHint = ""; next.firecrawl.environmentDisabled = true; }
  if (input.apiKey) {
    if (!safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", "系统安全存储当前不可用");
    next.firecrawl.environmentDisabled = false;
    next.firecrawl.encryptedKey = safeStorage.encryptString(String(input.apiKey)).toString("base64");
    next.firecrawl.createdAt = new Date().toISOString();
    next.firecrawl.keyHint = keyHint(input.apiKey);
  }
  await writeSettings(next);
  return publicSettings(next);
});
ipcMain.handle("ai:test-provider", async (_event, { provider, sessionKey }) => { const settings = await readSettings(); const entry=settings.providers[provider]||{}; return testProvider({ provider, apiKey: sessionKey || resolveProviderKey(settings, entry, provider), model: entry.model || PROVIDERS[provider]?.defaultModel }); });
ipcMain.handle("ai:send", async (_event, payload) => {
  const requestId = crypto.randomUUID(); const controller = new AbortController(); controllers.set(requestId, controller); const settings = await readSettings(); const provider = payload.provider || settings.defaultProvider; const entry = settings.providers[provider] || {};
  const model=payload.model || entry.model || PROVIDERS[provider].defaultModel; const conversationId=payload.conversationId; const lastUser=[...(payload.messages||[])].reverse().find(x=>x.role==="user"); if(conversationId&&lastUser&&!payload.isRetry)await aiStore.addMessage({conversationId,role:"user",content:lastUser.content,provider,model,attachmentIds:payload.attachmentIds,attachmentNames:payload.attachmentNames});
  queueMicrotask(async () => { let output="",usage=null,status="completed",errorValue=null;try { if(!["openai","doubao"].includes(provider))throw new ProviderError("agent_model_unsupported","当前提供商尚未接入 LangChain 工具调用适配器。"); const requestMessages=[...(payload.messages||[])];for(const id of payload.attachmentIds||[]){const prepared=await attachments.prepare(id,PROVIDERS[provider]?.capabilities||[]);if(prepared.mode==="extracted_text")requestMessages.push({role:"user",content:`附件提取内容：\n${prepared.chunks.map(x=>`[${x.location}${x.part>1?` · 第 ${x.part} 段`:""}]\n${x.text}`).join("\n\n")}`});}broadcastAiStream({ requestId, type:"started" });const conversation=conversationId?await aiStore.getConversation(conversationId):null;const aiPreferences=payload.aiPreferences||{};const result=await runKairosAgent({apiKey:resolveProviderKey(settings,entry,provider),model,baseURL:provider==="doubao"?"https://ark.cn-beijing.volces.com/api/v3":undefined,messages:requestMessages,conversationTitle:conversation?.title||"新对话",replyStyle:aiPreferences.replyStyle,memoryEnabled:aiPreferences.memoryEnabled!==false,store:aiStore,toolRuntime,appAdapters,searchWeb:input=>{if(aiPreferences.webSearchMode==="off")throw new Error("external_search_disabled");return searchWebWithSettings({...input,firecrawlReader:aiPreferences.firecrawlReader!==false});},ensureExternalSearch:async()=>{if(aiPreferences.webSearchMode==="off")throw new Error("external_search_disabled");const permissions=await toolRuntime.getPermissions();if(permissions.externalSearch==="read")return;const response=await dialog.showMessageBox(mainWindow||aiChatWindow,{type:"question",buttons:["允许联网搜索","取消"],defaultId:0,cancelId:1,title:"允许 Kairos 联网搜索？",message:"Kairos 想查询外部网页以回答当前问题。只会发送模型选择的搜索词。"});if(response.response!==0)throw new Error("external_search_not_approved");await toolRuntime.setPermissions({externalSearch:"read"});},onSetTitle:title=>conversationId?aiStore.updateConversation(conversationId,{title}):{title},onToolEvent:event=>broadcastAiStream({requestId,...event})});output=result.text;if(output)broadcastAiStream({requestId,type:"text_delta",delta:output});broadcastAiStream({requestId,type:"completed",usage}); } catch (error) { status="failed";errorValue=errorInfo(error);broadcastAiStream({ requestId, type: "failed", ...errorValue }); } finally { if(conversationId){try { const message=await aiStore.addMessage({conversationId,role:"assistant",content:output,status,provider,model});if(errorValue)await aiStore.updateMessage(message.id,{error:errorValue});if(usage)await aiStore.addUsage({conversationId,requestId,provider,model,inputTokens:usage.input_tokens||usage.prompt_tokens||0,outputTokens:usage.output_tokens||usage.completion_tokens||0}); } catch (persistenceError) { console.error("Failed to persist AI response:",persistenceError); broadcastAiStream({requestId,type:"persistence_failed",message:errorInfo(persistenceError).message}); }}controllers.delete(requestId); } }); return { requestId };
});
ipcMain.handle("ai:stop", (_event, requestId) => { controllers.get(requestId)?.abort(); return { ok: true }; });
ipcMain.handle("ai:conversations:list",()=>aiStore.listConversations());
ipcMain.handle("ai:conversations:create",(_event,input)=>aiStore.createConversation(input));
ipcMain.handle("ai:conversations:get",(_event,id)=>aiStore.getConversation(id));
ipcMain.handle("ai:conversations:update",(_event,{id,patch})=>aiStore.updateConversation(id,patch));
ipcMain.handle("ai:conversations:delete",async(_event,id)=>{const files=await aiStore.deleteConversation(id);await attachments.removeConversationFiles(files);return{ok:true};});
ipcMain.handle("ai:usage",(_event,filters)=>aiStore.usageSummary(filters));
ipcMain.handle("ai:memories:list",()=>aiStore.listMemories());
ipcMain.handle("ai:memories:forget",(_event,id)=>aiStore.forgetMemory(id));
ipcMain.handle("ai:memories:clear",()=>aiStore.clearMemories());
ipcMain.handle("ai:attachments:save",(_event,input)=>attachments.save(input));
ipcMain.handle("ai:attachments:remove",(_event,id)=>attachments.remove(id));
ipcMain.handle("ai:attachments:prepare",(_event,{id,provider})=>attachments.prepare(id,PROVIDERS[provider]?.capabilities||[]).then(result=>({...result,localPath:undefined})));
ipcMain.handle("ai:context:assess",async(_event,{conversationId,provider,limit})=>{const conversation=await aiStore.getConversation(conversationId);if(!conversation)throw new Error("conversation_not_found");const parsed=(conversation.attachments||[]).flatMap(item=>item.parsed?.chunks||[]);return contextManager.assess({provider:provider||conversation.provider,messages:conversation.messages,attachments:parsed,limit});});
ipcMain.handle("ai:context:resolve",async(_event,{conversationId,action,carrySummary=false})=>{const conversation=await aiStore.getConversation(conversationId);if(!conversation)throw new Error("conversation_not_found");if(action==="new_conversation")return{action,conversation:await contextManager.createContinuation(conversationId,{carrySummary})};if(action!=="summarize")throw new Error("invalid_context_action");const settings=await readSettings();const provider=conversation.provider||settings.defaultProvider;const entry=settings.providers[provider]||{};let summary="";for await(const event of streamProviderRequest({provider,model:conversation.model||entry.model||PROVIDERS[provider].defaultModel,apiKey:resolveProviderKey(settings,entry,provider),messages:contextManager.buildSummaryPrompt(conversation.messages),signal:new AbortController().signal})){if(event.type==="text_delta")summary+=event.delta;}await contextManager.saveSummary(conversationId,summary);return{action,summary};});
ipcMain.handle("ai:permissions:get",()=>toolRuntime.getPermissions());
ipcMain.handle("ai:permissions:set",(_event,input)=>toolRuntime.setPermissions(input));
ipcMain.handle("app:initialize",(_event,legacy)=>appStateStore.initialize(legacy));
ipcMain.handle("app:save",(_event,state)=>appStateStore.write(state));
ipcMain.handle("app:get",()=>appStateStore.read());
ipcMain.handle("app:audit",async()=>auditAppState(await appStateStore.read()));
ipcMain.handle("app:list-backups",()=>appStateStore.listBackups());
ipcMain.handle("app:read-backup",(_event,name)=>appStateStore.readBackup(name));
ipcMain.handle("app:restore-backup",async(_event,name)=>{const state=await appStateStore.restoreBackup(name);mainWindow?.webContents.send("app:state-changed",state);return state;});
ipcMain.handle("app:export-current",async()=>{const result=await dialog.showSaveDialog(mainWindow,{title:"Export Kairos app data",defaultPath:`kairos-app-state-${new Date().toISOString().slice(0,10)}.json`,filters:[{name:"JSON",extensions:["json"]}]});if(result.canceled||!result.filePath)return{canceled:true};const state=await appStateStore.read();await fs.writeFile(result.filePath,JSON.stringify(state,null,2),"utf8");return{canceled:false,filePath:result.filePath};});
ipcMain.handle("app:import-json",async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:"Import Kairos app data",properties:["openFile"],filters:[{name:"JSON",extensions:["json"]}]});if(result.canceled||!result.filePaths[0])return{canceled:true};const raw=JSON.parse(await fs.readFile(result.filePaths[0],"utf8"));const backupPath=await appStateStore.backupCurrent("before-import");const state=await appStateStore.write({...raw,imported_from:result.filePaths[0],imported_at:new Date().toISOString(),last_import_backup:backupPath});mainWindow?.webContents.send("app:state-changed",state);return{canceled:false,state,filePath:result.filePaths[0],backupPath};});
ipcMain.handle("calendar-background:list-builtins", () => calendarBackgroundService().listBuiltins());
ipcMain.handle("calendar-background:choose-import", async () => {
  const result = await dialog.showOpenDialog(mainWindow, { title: "Import calendar background", properties: ["openFile"], filters: [{ name: "Images", extensions: ["jpg", "jpeg", "png", "webp"] }] });
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
ipcMain.handle("music:get-state",()=>musicLibrary.publicState());
ipcMain.handle("music:choose-files",async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:"选择本地音乐",properties:["openFile","multiSelections"],filters:[{name:"Audio",extensions:["mp3","flac","wav","m4a","mp4","aac"]}]});if(result.canceled)return{state:await musicLibrary.publicState(),added:[],rejected:[]};return musicLibrary.addFiles(result.filePaths);});
ipcMain.handle("music:choose-folder",async()=>{const result=await dialog.showOpenDialog(mainWindow,{title:"选择本地歌单文件夹",properties:["openDirectory"]});if(result.canceled||!result.filePaths[0])return{state:await musicLibrary.publicState(),imported:[],rejected:[]};return musicLibrary.addFolder(result.filePaths[0]);});
ipcMain.handle("music:add-files",(_event,filePaths)=>musicLibrary.addFiles(filePaths));
ipcMain.handle("music:sync-folders",()=>musicLibrary.syncFolders());
ipcMain.handle("music:update-playback",(_event,patch)=>musicLibrary.updatePlayback(patch));
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

if (hasSingleInstanceLock) {
  app.on("second-instance", () => { focusMainWindow(); });
  app.whenReady().then(async()=>{const userData=app.getPath("userData");await registerCalendarBackgroundProtocol();calendarBackgrounds=new CalendarBackgroundService({builtinDir:path.join(root,"app","assets","calendar-backgrounds"),userDir:calendarBackgroundDir()});await calendarBackgrounds.initialize();appDatabase=new KairosAppDatabase(path.join(userData,"kairos.sqlite"));await appDatabase.initialize();aiStore=new AiDataStore(path.join(userData,"ai-data.json"),{database:appDatabase});appStateStore=new AppStateStore(path.join(userData,"app-state.json"),{database:appDatabase});await appStateStore.repairSchedules();musicLibrary=new MusicLibrary({statePath:path.join(userData,"music-state.json"),coverDir:path.join(userData,"music-covers"),database:appDatabase});neteaseService=new NeteaseApiService({statePath:path.join(userData,"netease-api-state.json"),database:appDatabase});await neteaseService.initialize();attachments=new AttachmentService({rootDir:path.join(userData,"attachments"),tempDir:path.join(app.getPath("temp"),"kairos-ai"),store:aiStore});toolRuntime=new ToolRuntime(aiStore);contextManager=new ContextManager(aiStore);appAdapters=createAppAdapters(appStateStore,state=>mainWindow?.webContents.send("app:state-changed",state));petVisible=(await readPetState()).visible;await attachments.cleanupTemporary();Menu.setApplicationMenu(buildApplicationMenu());await createWindow();if(!smokeTest)await createPetWindow();});
  app.on("activate", () => { if (!focusMainWindow()) createWindow().catch(error => console.error("Failed to recreate main window:", error)); });
  app.on("window-all-closed", () => { petWindow?.close(); if (process.platform !== "darwin") app.quit(); });
}
