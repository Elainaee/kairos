import fs from "node:fs/promises";
import { KairosAppDatabase } from "../../data/sqlite/index.js";

const EMPTY = { version: 2, conversations: [], messages: [], attachments: [], proposals: [], usage: [], permissions: {}, entities: {}, memories: [] };

export class AiDataStore {
  constructor(legacyPath, options = {}) { this.legacyPath = legacyPath; this.queue = Promise.resolve(); this.database = options.database || null; this.databaseReady = null; this.databasePath = options.databasePath || ":memory:"; this.memoryService = options.memoryService || null; this.defaultConversationTitle = options.defaultConversationTitle || "New conversation"; }
  conversationTitle() { const value = typeof this.defaultConversationTitle === "function" ? this.defaultConversationTitle() : this.defaultConversationTitle; return typeof value === "string" && value.trim() ? value.trim() : "New conversation"; }
  async ensureDatabase() { if (this.database?.available) return this.database; if (!this.databaseReady) this.databaseReady = (async () => { this.database ||= new KairosAppDatabase(this.databasePath); const status = await this.database.initialize(); if (!status.available) throw new Error("sqlite_unavailable"); return this.database; })(); return this.databaseReady; }
  normalize(input = {}) { return { ...structuredClone(EMPTY), ...input }; }
  readDatabaseSnapshot() {
    try {
      const snapshot = this.database?.readStorePayload?.("ai-data");
      return snapshot ? this.normalize(snapshot) : null;
    } catch {
      return null;
    }
  }
  async read() { await this.ensureDatabase(); const snapshot = this.readDatabaseSnapshot(); if (snapshot) return snapshot; try { const legacy = this.normalize(JSON.parse(await fs.readFile(this.legacyPath, "utf8"))); await this.writeAtomic(legacy); return legacy; } catch { const empty = structuredClone(EMPTY); await this.writeAtomic(empty); return empty; } }
  async ensureStateFile() { await this.read(); }
  async writeAtomic(data) { await this.ensureDatabase(); if (!this.database?.saveStorePayload) throw new Error("sqlite_unavailable"); this.database.saveStorePayload("ai-data", this.normalize(data), { conversations: data.conversations?.length || 0, messages: data.messages?.length || 0, attachments: data.attachments?.length || 0, proposals: data.proposals?.length || 0, memories: data.memories?.length || 0, usage: data.usage?.length || 0 }); }
  async mutate(change) {
    const run = async () => { const data = await this.read(); const result = await change(data); await this.writeAtomic(data); return result; };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
  listConversations() { return this.ensureStateFile().then(() => this.read()).then(data => [...data.conversations].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))); }
  createConversation(input = {}) { const now = new Date().toISOString(); const item = { id: crypto.randomUUID(), title: input.title || this.conversationTitle(), provider: input.provider || "openai", model: input.model || "", summary: input.summary || "", draft: "", createdAt: now, updatedAt: now }; return this.mutate(data => { data.conversations.push(item); return item; }); }
  async getConversation(id) { await this.ensureStateFile(); const data = await this.read(); const conversation = data.conversations.find(x=>x.id===id); if (!conversation) return null; return { ...conversation, messages: data.messages.filter(x=>x.conversationId===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)), attachments: data.attachments.filter(x=>x.conversationId===id) }; }
  updateConversation(id, patch) { const allowed=["title","provider","model","summary","draft","lastReadMessageId"]; return this.mutate(data=>{const item=data.conversations.find(x=>x.id===id);if(!item)throw new Error("conversation_not_found");for(const key of allowed)if(key in patch)item[key]=patch[key];item.updatedAt=new Date().toISOString();return item;}); }
  deleteConversation(id) { return this.mutate(data=>{data.conversations=data.conversations.filter(x=>x.id!==id);data.messages=data.messages.filter(x=>x.conversationId!==id);data.proposals=data.proposals.filter(x=>x.conversationId!==id);data.usage=data.usage.filter(x=>x.conversationId!==id);const attachments=data.attachments.filter(x=>x.conversationId===id);data.attachments=data.attachments.filter(x=>x.conversationId!==id);return attachments;}); }
  addMessage(input) { const item={id:crypto.randomUUID(),conversationId:input.conversationId,role:input.role,content:input.content||"",status:input.status||"completed",provider:input.provider||"",model:input.model||"",attachmentIds:Array.isArray(input.attachmentIds)?input.attachmentIds:[],attachmentNames:Array.isArray(input.attachmentNames)?input.attachmentNames:[],error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return this.mutate(data=>{data.messages.push(item);const c=data.conversations.find(x=>x.id===item.conversationId);if(c)c.updatedAt=item.updatedAt;return item;}); }
  updateMessage(id, patch) { const allowed=["content","status","error","usage"];return this.mutate(data=>{const item=data.messages.find(x=>x.id===id);if(!item)throw new Error("message_not_found");for(const key of allowed)if(key in patch)item[key]=patch[key];item.updatedAt=new Date().toISOString();return item;}); }
  addUsage(input) { const item={id:crypto.randomUUID(),createdAt:new Date().toISOString(),...input};return this.mutate(data=>{data.usage.push(item);return item;}); }
  listMemories() { if (this.memoryService?.isMigrated()) return Promise.resolve(this.memoryService.listMemories()); return this.ensureStateFile().then(() => this.read()).then(data => (Array.isArray(data.memories) ? data.memories : []).filter(x => !x.deletedAt).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))); }
  remember(input) { if (this.memoryService?.isMigrated()) { return Promise.resolve(this.memoryService.remember(input)); } return this.mutate(data => { data.memories ||= []; const now=new Date().toISOString(); const existing=data.memories.find(x=>!x.deletedAt&&x.type===input.type&&x.key===input.key&&x.value===input.value); if(existing){existing.updatedAt=now;existing.lastUsedAt=now;existing.confidence=Math.max(existing.confidence||0,input.confidence||0);return existing;} const item={id:crypto.randomUUID(),type:input.type||"fact",key:String(input.key||"fact").slice(0,80),value:String(input.value||"").slice(0,500),confidence:Number(input.confidence)||.7,source:input.source||"conversation",createdAt:now,updatedAt:now,lastUsedAt:now};data.memories.push(item);return item; }); }
  forgetMemory(id) { if (this.memoryService?.isMigrated()) { return Promise.resolve(this.memoryService.forgetMemoryById(id)); } return this.mutate(data=>{const item=(data.memories||[]).find(x=>x.id===id);if(!item)throw new Error("memory_not_found");item.deletedAt=new Date().toISOString();item.updatedAt=item.deletedAt;return item;}); }
  clearMemories() { if (this.memoryService?.isMigrated()) { return Promise.resolve(this.memoryService.clearAll()); } return this.mutate(data => { const now = new Date().toISOString(); let count = 0; for (const item of data.memories || []) { if (!item.deletedAt) { item.deletedAt = now; item.updatedAt = now; count++; } } return { count }; }); }
  async usageSummary(filters={}) { await this.ensureStateFile(); const data=await this.read();const rows=data.usage.filter(x=>(!filters.conversationId||x.conversationId===filters.conversationId)&&(!filters.provider||x.provider===filters.provider));return rows.reduce((out,row)=>{out.requests++;out.inputTokens+=row.inputTokens||0;out.outputTokens+=row.outputTokens||0;return out;},{requests:0,inputTokens:0,outputTokens:0}); }
}
