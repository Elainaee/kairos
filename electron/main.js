import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen, shell } from "electron";
import path from "node:path";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { PROVIDERS, ProviderError, streamProviderRequest, testProvider } from "./providers.js";
import { AiDataStore } from "./data-store.js";
import { AttachmentService } from "./attachments.js";
import { ToolRuntime } from "./tool-runtime.js";
import { AppStateStore, createAppAdapters } from "./app-state.js";
import { ContextManager } from "./context-manager.js";
import { MusicLibrary } from "./music-library.js";
import { runKairosAgent } from "./langchain-agent.js";
import { createWebSearch } from "./web-search.js";
import { NeteaseApiService } from "./netease-api-service.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
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
let aiStore, appStateStore, attachments, toolRuntime, contextManager, appAdapters, musicLibrary, neteaseService;

const settingsPath = () => path.join(app.getPath("userData"), "ai-settings.json");
const petStatePath = () => path.join(app.getPath("userData"), "pet-state.json");
const defaults = { defaultProvider: "openai", providers: { openai: { model: PROVIDERS.openai.defaultModel, credentialMode: "session", encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false } }, firecrawl: { encryptedKey: "", createdAt: "", keyHint: "", environmentDisabled: false } };
async function readSettings() { try { return { ...defaults, ...JSON.parse(await fs.readFile(settingsPath(), "utf8")) }; } catch { return structuredClone(defaults); } }
async function writeSettings(value) { await fs.mkdir(path.dirname(settingsPath()), { recursive: true }); await fs.writeFile(settingsPath(), JSON.stringify(value, null, 2), "utf8"); }
async function readPetState() { try { return { visible: JSON.parse(await fs.readFile(petStatePath(), "utf8")).visible !== false }; } catch { return { visible: true }; } }
async function writePetState(value) { await fs.mkdir(path.dirname(petStatePath()), { recursive: true }); await fs.writeFile(petStatePath(), JSON.stringify(value, null, 2), "utf8"); }
function sendPetVisibility() { mainWindow?.webContents.send("pet:visibility", petVisible); }
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
function getAiChatBounds() {
  const width = 520, height = 680, visualOverlap = 96;
  const petBounds = petWindow && !petWindow.isDestroyed() ? petWindow.getBounds() : null;
  const display = petBounds ? screen.getDisplayNearestPoint({ x: petBounds.x, y: petBounds.y }) : screen.getPrimaryDisplay();
  const work = display.workArea;
  let x = petBounds ? petBounds.x - width + visualOverlap : work.x + work.width - width - 24;
  let y = petBounds ? petBounds.y + petBounds.height - height : work.y + work.height - height - 24;
  x = Math.max(work.x, Math.min(x, work.x + work.width - width));
  y = Math.max(work.y, Math.min(y, work.y + work.height - height));
  return { x, y, width, height };
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
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    opacity: 0,
    backgroundColor: "#00000000",
    webPreferences: { preload: path.join(root, "electron", "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true }
  });
  aiChatWindow.loadFile(path.join(root, "app", "ai-chat-window.html"));
  aiChatWindow.on("closed", () => { stopAiChatFade(); stopAiChatFollow(); aiChatWindow = null; });
  return aiChatWindow;
}
function showAiChatWindow() {
  const win = createAiChatWindow();
  win.setBounds(getAiChatBounds());
  const reveal = () => {
    if (win.isDestroyed()) return;
    stopAiChatFade();
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

function createWindow() { mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 900, minHeight: 650, show: false, backgroundColor: "#f5f4f1", webPreferences: { preload: path.join(root, "electron", "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } }); mainWindow.webContents.on("did-finish-load", () => { mainWindow?.show(); sendPetVisibility(); }); mainWindow.on("closed", () => { aiChatWindow?.close(); petWindow?.close(); aiChatWindow = null; petWindow = null; mainWindow = null; }); mainWindow.loadFile(path.join(root, "app", "index.html")); }

function createPetWindow() {
  try {
    petWindow = new BrowserWindow({
      width: 195, height: 230,
      frame: false, transparent: true,
      alwaysOnTop: true, skipTaskbar: true,
      resizable: false, hasShadow: false, show: false,
      webPreferences: {
        preload: path.join(root, "electron", "preload.cjs"),
        contextIsolation: true, nodeIntegration: false, sandbox: true
      }
    });
    petWindow.loadFile(path.join(root, "app", "chibi_pet.html"));
    petWindow.setVisibleOnAllWorkspaces(true);
    const display = screen.getPrimaryDisplay();
    const { width: sw, height: sh } = display.workAreaSize;
    petWindow.setPosition(sw - 300, sh - 380);
    petWindow.webContents.once("did-finish-load", () => {
      // A transparent BrowserWindow still intercepts input. Start in pass-through
      // mode; the renderer turns hit testing back on only over visible pet UI.
      petWindow?.setIgnoreMouseEvents(true, { forward: true });
      if (petVisible) petWindow?.show();
      sendPetVisibility();
    });
    petWindow.on("blur", () => petWindow?.webContents.send("pet:blur"));
  } catch (e) {
    console.error("Failed to create pet window, falling back to iframe:", e);
    petWindow = null;
  }
}

ipcMain.handle("pet:hide", async () => { petVisible = false; await writePetState({ visible: false }); petWindow?.hide(); hideAiChatWindowSmooth(); sendPetVisibility(); return true; });
ipcMain.handle("pet:show", async () => { petVisible = true; await writePetState({ visible: true }); petWindow?.show(); sendPetVisibility(); return true; });
ipcMain.handle("pet:click", () => { showAiChatWindow(); return true; });
ipcMain.handle("pet:move", (_event, { dx, dy }) => { queuePetMove(dx, dy); return true; });
ipcMain.handle("pet:is-ready", () => !!petWindow && !petWindow.isDestroyed());
ipcMain.handle("pet:get-visibility", () => petVisible);
ipcMain.handle("pet:resize", (_event, { width, height }) => { if (petWindow) petWindow.setSize(width, height); return true; });
ipcMain.handle("ai-window:close", event => { const win = BrowserWindow.fromWebContents(event.sender); if (win === aiChatWindow) return hideAiChatWindowSmooth(); return false; });
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

app.whenReady().then(async()=>{const userData=app.getPath("userData");aiStore=new AiDataStore(path.join(userData,"ai-data.json"));appStateStore=new AppStateStore(path.join(userData,"app-state.json"));await appStateStore.migrateStudyPlansToSchedules();musicLibrary=new MusicLibrary({statePath:path.join(userData,"music-state.json"),coverDir:path.join(userData,"music-covers")});neteaseService=new NeteaseApiService({statePath:path.join(userData,"netease-api-state.json")});await neteaseService.initialize();attachments=new AttachmentService({rootDir:path.join(userData,"attachments"),tempDir:path.join(app.getPath("temp"),"kairos-ai"),store:aiStore});toolRuntime=new ToolRuntime(aiStore);contextManager=new ContextManager(aiStore);appAdapters=createAppAdapters(appStateStore,state=>mainWindow?.webContents.send("app:state-changed",state));petVisible=(await readPetState()).visible;await attachments.cleanupTemporary();createWindow();createPetWindow();}); app.on("window-all-closed", () => { petWindow?.close(); if (process.platform !== "darwin") app.quit(); });
