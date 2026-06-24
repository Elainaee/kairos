import { app, BrowserWindow, dialog, ipcMain, safeStorage, screen } from "electron";
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

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true });
const controllers = new Map();
const sessionKeys = new Map();
let mainWindow, petWindow;
let aiStore, appStateStore, attachments, toolRuntime, contextManager, appAdapters, musicLibrary;

const settingsPath = () => path.join(app.getPath("userData"), "ai-settings.json");
const defaults = { defaultProvider: "openai", providers: { openai: { model: PROVIDERS.openai.defaultModel, credentialMode: "session", encryptedKey: "" } } };
async function readSettings() { try { return { ...defaults, ...JSON.parse(await fs.readFile(settingsPath(), "utf8")) }; } catch { return structuredClone(defaults); } }
async function writeSettings(value) { await fs.mkdir(path.dirname(settingsPath()), { recursive: true }); await fs.writeFile(settingsPath(), JSON.stringify(value, null, 2), "utf8"); }
function decryptKey(entry, provider) {
  if (sessionKeys.has(provider)) return sessionKeys.get(provider);
  if (entry?.encryptedKey && safeStorage.isEncryptionAvailable()) return safeStorage.decryptString(Buffer.from(entry.encryptedKey, "base64"));
  if (provider === "openai" && process.env.OPENAI_API_KEY) return process.env.OPENAI_API_KEY;
  if (provider === "doubao" && process.env.ARK_API_KEY) return process.env.ARK_API_KEY;
  return "";
}
function publicSettings(settings) { return { ...settings, providers: Object.fromEntries(Object.entries(settings.providers || {}).map(([id, value]) => [id, { ...value, encryptedKey: undefined, hasKey: Boolean(value.encryptedKey || sessionKeys.has(id) || (id === "openai" && process.env.OPENAI_API_KEY)) }])) }; }

function createWindow() { mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 900, minHeight: 650, show: false, backgroundColor: "#f5f4f1", webPreferences: { preload: path.join(root, "electron", "preload.cjs"), contextIsolation: true, nodeIntegration: false, sandbox: true } }); let firstLoad = true; mainWindow.webContents.on("did-finish-load", () => { mainWindow?.show(); if (!firstLoad && petWindow && !petWindow.isDestroyed()) petWindow.reload(); firstLoad = false; }); mainWindow.on("closed", () => { petWindow?.close(); petWindow = null; mainWindow = null; }); mainWindow.loadFile(path.join(root, "app", "index.html")); }

function createPetWindow() {
  try {
    petWindow = new BrowserWindow({
      width: 195, height: 230,
      frame: false, transparent: true,
      alwaysOnTop: true, skipTaskbar: true,
      resizable: false, hasShadow: false,
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
      if (mainWindow?.webContents) mainWindow?.webContents.send("pet:visibility", true);
    });
    petWindow.on("blur", () => petWindow?.webContents.send("pet:blur"));
  } catch (e) {
    console.error("Failed to create pet window, falling back to iframe:", e);
    petWindow = null;
  }
}

ipcMain.handle("pet:hide", () => { petWindow?.hide(); mainWindow?.webContents.send("pet:visibility", false); return true; });
ipcMain.handle("pet:show", () => { petWindow?.show(); mainWindow?.webContents.send("pet:visibility", true); return true; });
ipcMain.handle("pet:click", () => { mainWindow?.webContents.send("pet:open-ai"); return true; });
ipcMain.handle("pet:move", (_event, { dx, dy }) => { if (petWindow) { const [x, y] = petWindow.getPosition(); petWindow.setPosition(x + dx, y + dy); } return true; });
ipcMain.handle("pet:is-ready", () => !!petWindow && !petWindow.isDestroyed());
ipcMain.handle("pet:resize", (_event, { width, height }) => { if (petWindow) petWindow.setSize(width, height); return true; });
ipcMain.on("pet:set-mouse-passthrough", (event, ignore) => {
  if (!petWindow || event.sender !== petWindow.webContents) return;
  petWindow.setIgnoreMouseEvents(Boolean(ignore), { forward: Boolean(ignore) });
});

ipcMain.handle("ai:list-providers", () => Object.values(PROVIDERS));
ipcMain.handle("ai:get-settings", async () => publicSettings(await readSettings()));
ipcMain.handle("ai:save-settings", async (_event, input) => {
  const current = await readSettings(); const provider = input.provider;
  if (!PROVIDERS[provider]) throw new ProviderError("unknown_provider", "未知模型提供商");
  const next = structuredClone(current); next.defaultProvider = input.defaultProvider || current.defaultProvider; next.providers[provider] = { ...(current.providers[provider] || {}), model: String(input.model || PROVIDERS[provider].defaultModel), credentialMode: input.credentialMode === "saved" ? "saved" : "session", encryptedKey: current.providers[provider]?.encryptedKey || "" };
  if (input.apiKey) { if (next.providers[provider].credentialMode === "saved") { if (!safeStorage.isEncryptionAvailable()) throw new ProviderError("secure_storage_unavailable", "系统安全存储当前不可用"); next.providers[provider].encryptedKey = safeStorage.encryptString(input.apiKey).toString("base64"); sessionKeys.delete(provider); } else { sessionKeys.set(provider, input.apiKey); next.providers[provider].encryptedKey = ""; } }
  await writeSettings(next); return publicSettings(next);
});
ipcMain.handle("ai:test-provider", async (_event, { provider, sessionKey }) => { const settings = await readSettings(); const entry=settings.providers[provider]||{}; return testProvider({ provider, apiKey: sessionKey || decryptKey(entry, provider), model: entry.model || PROVIDERS[provider]?.defaultModel }); });
ipcMain.handle("ai:send", async (_event, payload) => {
  const requestId = crypto.randomUUID(); const controller = new AbortController(); controllers.set(requestId, controller); const settings = await readSettings(); const provider = payload.provider || settings.defaultProvider; const entry = settings.providers[provider] || {};
  const model=payload.model || entry.model || PROVIDERS[provider].defaultModel; const conversationId=payload.conversationId; const lastUser=[...(payload.messages||[])].reverse().find(x=>x.role==="user"); if(conversationId&&lastUser&&!payload.isRetry)await aiStore.addMessage({conversationId,role:"user",content:lastUser.content,provider,model,attachmentIds:payload.attachmentIds,attachmentNames:payload.attachmentNames});
  queueMicrotask(async () => { let output="",usage=null,status="completed",errorValue=null;try { const requestMessages=[...(payload.messages||[])],images=[];for(const id of payload.attachmentIds||[]){const prepared=await attachments.prepare(id,PROVIDERS[provider]?.capabilities||[]);if(prepared.mode==="extracted_text")requestMessages.push({role:"user",content:`附件提取内容：\n${prepared.chunks.map(x=>`[${x.location}${x.part>1?` · 第 ${x.part} 段`:""}]\n${x.text}`).join("\n\n")}`});if(prepared.mode==="image"){const bytes=await fs.readFile(prepared.localPath);images.push({dataUrl:`data:${prepared.attachment.mimeType};base64,${bytes.toString("base64")}`});}}mainWindow.webContents.send("ai:stream", { requestId, type: "started" }); for await (const event of streamProviderRequest({ ...payload, messages:requestMessages,images,provider,model,apiKey:decryptKey(entry,provider),signal:controller.signal })) { if(event.type==="text_delta")output+=event.delta;if(event.type==="completed")usage=event.usage;if(event.type==="stopped")status="stopped";mainWindow.webContents.send("ai:stream", { requestId, ...event }); } } catch (error) { status="failed";errorValue={code:error.code||"unknown",message:error.message};mainWindow.webContents.send("ai:stream", { requestId, type: "failed", ...errorValue }); } finally { if(conversationId){await aiStore.addMessage({conversationId,role:"assistant",content:output,status,provider,model}).then(message=>errorValue?aiStore.updateMessage(message.id,{error:errorValue}):message);if(usage)await aiStore.addUsage({conversationId,requestId,provider,model,inputTokens:usage.input_tokens||usage.prompt_tokens||0,outputTokens:usage.output_tokens||usage.completion_tokens||0});}controllers.delete(requestId); } }); return { requestId };
});
ipcMain.handle("ai:stop", (_event, requestId) => { controllers.get(requestId)?.abort(); return { ok: true }; });
ipcMain.handle("ai:extract-schedules", async (_event, payload) => {
  const settings=await readSettings();const provider=payload.provider||settings.defaultProvider;const entry=settings.providers[provider]||{};const model=payload.model||entry.model||PROVIDERS[provider]?.defaultModel;
  const capabilities=PROVIDERS[provider]?.capabilities||[],images=[],sources=[];
  for(const id of payload.attachmentIds||[]){const prepared=await attachments.prepare(id,capabilities);if(prepared.mode==="extracted_text")sources.push(`${prepared.attachment.name}:\n${prepared.chunks.map(x=>`[${x.location}]\n${x.text}`).join("\n\n")}`);if(prepared.mode==="image"){const bytes=await fs.readFile(prepared.localPath);images.push({dataUrl:`data:${prepared.attachment.mimeType};base64,${bytes.toString("base64")}`});}}
  const today=new Date().toISOString().slice(0,10);const prompt=`你是 Kairos 日程提取器。根据用户要求以及附件内容，找出明确的日程、课程、任务、截止日期或活动。只返回 JSON，不要解释。格式：{"schedules":[{"title":"标题","date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","start_time":"HH:mm 或空字符串","end_time":"HH:mm 或空字符串","all_day":true,"type":"task|deadline|event|other","priority":"low|medium|high","status":"todo","reminder":"none","notes":"来源或必要说明"}]}。今天是 ${today}。不确定的日期不要猜测；没有可提取项目时返回 {"schedules":[]}。\n\n用户要求：${payload.text||"整理为日程"}\n\n附件文本：\n${sources.join("\n\n")}`;
  let output="";for await(const event of streamProviderRequest({provider,model,apiKey:decryptKey(entry,provider),messages:[{role:"user",content:prompt}],images,signal:new AbortController().signal})){if(event.type==="text_delta")output+=event.delta;}
  const cleaned=output.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");let parsed;try{parsed=JSON.parse(cleaned);}catch{throw new ProviderError("invalid_schedule_output","模型没有返回有效的日程结构");}
  const rows=Array.isArray(parsed)?parsed:parsed.schedules;if(!Array.isArray(rows))throw new ProviderError("invalid_schedule_output","模型没有返回日程列表");
  const validTypes=new Set(["task","deadline","event","other"]),validPriorities=new Set(["low","medium","high"]);return rows.slice(0,50).filter(x=>x&&typeof x.title==="string"&&/^\d{4}-\d{2}-\d{2}$/.test(x.date||"")).map(x=>({title:x.title.trim().slice(0,120),date:x.date,end_date:/^\d{4}-\d{2}-\d{2}$/.test(x.end_date||"")?x.end_date:x.date,start_time:/^\d{2}:\d{2}$/.test(x.start_time||"")?x.start_time:"",end_time:/^\d{2}:\d{2}$/.test(x.end_time||"")?x.end_time:"",all_day:Boolean(x.all_day)||!x.start_time,type:validTypes.has(x.type)?x.type:"event",priority:validPriorities.has(x.priority)?x.priority:"medium",status:"todo",reminder:x.reminder||"none",notes:String(x.notes||"").slice(0,500),source:"ai_attachment"}));
});

ipcMain.handle("ai:conversations:list",()=>aiStore.listConversations());
ipcMain.handle("ai:conversations:create",(_event,input)=>aiStore.createConversation(input));
ipcMain.handle("ai:conversations:get",(_event,id)=>aiStore.getConversation(id));
ipcMain.handle("ai:conversations:update",(_event,{id,patch})=>aiStore.updateConversation(id,patch));
ipcMain.handle("ai:conversations:delete",async(_event,id)=>{const files=await aiStore.deleteConversation(id);await attachments.removeConversationFiles(files);return{ok:true};});
ipcMain.handle("ai:usage",(_event,filters)=>aiStore.usageSummary(filters));
ipcMain.handle("ai:attachments:save",(_event,input)=>attachments.save(input));
ipcMain.handle("ai:attachments:remove",(_event,id)=>attachments.remove(id));
ipcMain.handle("ai:attachments:prepare",(_event,{id,provider})=>attachments.prepare(id,PROVIDERS[provider]?.capabilities||[]).then(result=>({...result,localPath:undefined})));
ipcMain.handle("ai:context:assess",async(_event,{conversationId,provider,limit})=>{const conversation=await aiStore.getConversation(conversationId);if(!conversation)throw new Error("conversation_not_found");const parsed=(conversation.attachments||[]).flatMap(item=>item.parsed?.chunks||[]);return contextManager.assess({provider:provider||conversation.provider,messages:conversation.messages,attachments:parsed,limit});});
ipcMain.handle("ai:context:resolve",async(_event,{conversationId,action,carrySummary=false})=>{const conversation=await aiStore.getConversation(conversationId);if(!conversation)throw new Error("conversation_not_found");if(action==="new_conversation")return{action,conversation:await contextManager.createContinuation(conversationId,{carrySummary})};if(action!=="summarize")throw new Error("invalid_context_action");const settings=await readSettings();const provider=conversation.provider||settings.defaultProvider;const entry=settings.providers[provider]||{};let summary="";for await(const event of streamProviderRequest({provider,model:conversation.model||entry.model||PROVIDERS[provider].defaultModel,apiKey:decryptKey(entry,provider),messages:contextManager.buildSummaryPrompt(conversation.messages),signal:new AbortController().signal})){if(event.type==="text_delta")summary+=event.delta;}await contextManager.saveSummary(conversationId,summary);return{action,summary};});
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
ipcMain.handle("music:update-playback",(_event,patch)=>musicLibrary.updatePlayback(patch));
ipcMain.handle("music:update-track",(_event,input)=>musicLibrary.updateTrack(input));
ipcMain.handle("music:remove-track",(_event,id)=>musicLibrary.removeTrack(id));
ipcMain.handle("music:clear",()=>musicLibrary.clear());
ipcMain.handle("music:reorder",(_event,ids)=>musicLibrary.reorder(ids));
ipcMain.handle("music:remove-playlist",(_event,id)=>musicLibrary.removePlaylist(id));

app.whenReady().then(async()=>{const userData=app.getPath("userData");aiStore=new AiDataStore(path.join(userData,"ai-data.json"));appStateStore=new AppStateStore(path.join(userData,"app-state.json"));musicLibrary=new MusicLibrary({statePath:path.join(userData,"music-state.json"),coverDir:path.join(userData,"music-covers")});attachments=new AttachmentService({rootDir:path.join(userData,"attachments"),tempDir:path.join(app.getPath("temp"),"kairos-ai"),store:aiStore});toolRuntime=new ToolRuntime(aiStore);contextManager=new ContextManager(aiStore);appAdapters=createAppAdapters(appStateStore,state=>mainWindow?.webContents.send("app:state-changed",state));await attachments.cleanupTemporary();createWindow();createPetWindow();}); app.on("window-all-closed", () => { petWindow?.close(); if (process.platform !== "darwin") app.quit(); });
