import fs from "node:fs/promises";
import path from "node:path";

const EMPTY = { version: 2, conversations: [], messages: [], attachments: [], proposals: [], usage: [], permissions: {}, entities: {}, memories: [] };
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const retryableRenameError = error => ["EPERM", "EACCES", "EBUSY"].includes(error?.code);

export class AiDataStore {
  constructor(filePath, options = {}) { this.filePath = filePath; this.queue = Promise.resolve(); this.database = options.database || null; }
  normalize(input = {}) { return { ...structuredClone(EMPTY), ...input }; }
  readDatabaseSnapshot() {
    try {
      const snapshot = this.database?.readJsonStorePayload?.("ai-data");
      return snapshot ? this.normalize({ ...snapshot, recoveredFromSqlite: true }) : null;
    } catch {
      return null;
    }
  }
  async read() { try { return this.normalize(JSON.parse(await fs.readFile(this.filePath, "utf8"))); } catch { return this.readDatabaseSnapshot() || structuredClone(EMPTY); } }
  async ensureStateFile() {
    try {
      JSON.parse(await fs.readFile(this.filePath, "utf8"));
      return;
    } catch {}
    const snapshot = this.readDatabaseSnapshot();
    if (snapshot) await this.writeAtomic({ ...snapshot, restoredFromSqliteAt: new Date().toISOString() });
  }
  async writeAtomic(data) { await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.${process.pid}.${crypto.randomUUID()}.tmp`; try { await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8"); for (let attempt = 0; ; attempt++) { try { await fs.rename(temp, this.filePath); break; } catch (error) { if (!retryableRenameError(error) || attempt >= 6) throw error; await sleep(25 * (attempt + 1)); } } if (this.database?.saveJsonStoreSnapshot) this.database.saveJsonStoreSnapshot("ai-data", data, { conversations: data.conversations?.length || 0, messages: data.messages?.length || 0, attachments: data.attachments?.length || 0, proposals: data.proposals?.length || 0, memories: data.memories?.length || 0, usage: data.usage?.length || 0 }); } finally { await fs.unlink(temp).catch(() => {}); } }
  async mutate(change) {
    const run = async () => { const data = await this.read(); const result = await change(data); await this.writeAtomic(data); return result; };
    this.queue = this.queue.then(run, run);
    return this.queue;
  }
  listConversations() { return this.ensureStateFile().then(() => this.read()).then(data => [...data.conversations].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))); }
  createConversation(input = {}) { const now = new Date().toISOString(); const item = { id: crypto.randomUUID(), title: input.title || "新对话", provider: input.provider || "openai", model: input.model || "", summary: input.summary || "", draft: "", createdAt: now, updatedAt: now }; return this.mutate(data => { data.conversations.push(item); return item; }); }
  async getConversation(id) { await this.ensureStateFile(); const data = await this.read(); const conversation = data.conversations.find(x=>x.id===id); if (!conversation) return null; return { ...conversation, messages: data.messages.filter(x=>x.conversationId===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)), attachments: data.attachments.filter(x=>x.conversationId===id) }; }
  updateConversation(id, patch) { const allowed=["title","provider","model","summary","draft","lastReadMessageId"]; return this.mutate(data=>{const item=data.conversations.find(x=>x.id===id);if(!item)throw new Error("conversation_not_found");for(const key of allowed)if(key in patch)item[key]=patch[key];item.updatedAt=new Date().toISOString();return item;}); }
  deleteConversation(id) { return this.mutate(data=>{data.conversations=data.conversations.filter(x=>x.id!==id);data.messages=data.messages.filter(x=>x.conversationId!==id);data.proposals=data.proposals.filter(x=>x.conversationId!==id);data.usage=data.usage.filter(x=>x.conversationId!==id);const attachments=data.attachments.filter(x=>x.conversationId===id);data.attachments=data.attachments.filter(x=>x.conversationId!==id);return attachments;}); }
  addMessage(input) { const item={id:crypto.randomUUID(),conversationId:input.conversationId,role:input.role,content:input.content||"",status:input.status||"completed",provider:input.provider||"",model:input.model||"",attachmentIds:Array.isArray(input.attachmentIds)?input.attachmentIds:[],attachmentNames:Array.isArray(input.attachmentNames)?input.attachmentNames:[],error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return this.mutate(data=>{data.messages.push(item);const c=data.conversations.find(x=>x.id===item.conversationId);if(c)c.updatedAt=item.updatedAt;return item;}); }
  updateMessage(id, patch) { const allowed=["content","status","error","usage"];return this.mutate(data=>{const item=data.messages.find(x=>x.id===id);if(!item)throw new Error("message_not_found");for(const key of allowed)if(key in patch)item[key]=patch[key];item.updatedAt=new Date().toISOString();return item;}); }
  addUsage(input) { const item={id:crypto.randomUUID(),createdAt:new Date().toISOString(),...input};return this.mutate(data=>{data.usage.push(item);return item;}); }
  listMemories() { return this.ensureStateFile().then(() => this.read()).then(data => (Array.isArray(data.memories) ? data.memories : []).filter(x => !x.deletedAt).sort((a,b) => b.updatedAt.localeCompare(a.updatedAt))); }
  remember(input) { return this.mutate(data => { data.memories ||= []; const now=new Date().toISOString(); const existing=data.memories.find(x=>!x.deletedAt&&x.type===input.type&&x.key===input.key&&x.value===input.value); if(existing){existing.updatedAt=now;existing.lastUsedAt=now;existing.confidence=Math.max(existing.confidence||0,input.confidence||0);return existing;} const item={id:crypto.randomUUID(),type:input.type||"fact",key:String(input.key||"fact").slice(0,80),value:String(input.value||"").slice(0,500),confidence:Number(input.confidence)||.7,source:input.source||"conversation",createdAt:now,updatedAt:now,lastUsedAt:now};data.memories.push(item);return item; }); }
  forgetMemory(id) { return this.mutate(data=>{const item=(data.memories||[]).find(x=>x.id===id);if(!item)throw new Error("memory_not_found");item.deletedAt=new Date().toISOString();item.updatedAt=item.deletedAt;return item;}); }
  clearMemories() { return this.mutate(data => { const now = new Date().toISOString(); let count = 0; for (const item of data.memories || []) { if (!item.deletedAt) { item.deletedAt = now; item.updatedAt = now; count++; } } return { count }; }); }
  async usageSummary(filters={}) { await this.ensureStateFile(); const data=await this.read();const rows=data.usage.filter(x=>(!filters.conversationId||x.conversationId===filters.conversationId)&&(!filters.provider||x.provider===filters.provider));return rows.reduce((out,row)=>{out.requests++;out.inputTokens+=row.inputTokens||0;out.outputTokens+=row.outputTokens||0;return out;},{requests:0,inputTokens:0,outputTokens:0}); }
}
