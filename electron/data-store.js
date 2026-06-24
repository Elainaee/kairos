import fs from "node:fs/promises";
import path from "node:path";

const EMPTY = { version: 1, conversations: [], messages: [], attachments: [], proposals: [], usage: [], permissions: {}, entities: {} };

export class AiDataStore {
  constructor(filePath) { this.filePath = filePath; this.queue = Promise.resolve(); }
  async read() { try { return { ...structuredClone(EMPTY), ...JSON.parse(await fs.readFile(this.filePath, "utf8")) }; } catch { return structuredClone(EMPTY); } }
  async mutate(change) {
    this.queue = this.queue.then(async () => { const data = await this.read(); const result = await change(data); await fs.mkdir(path.dirname(this.filePath), { recursive: true }); const temp = `${this.filePath}.tmp`; await fs.writeFile(temp, JSON.stringify(data, null, 2), "utf8"); await fs.rename(temp, this.filePath); return result; });
    return this.queue;
  }
  listConversations() { return this.read().then(data => [...data.conversations].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt))); }
  createConversation(input = {}) { const now = new Date().toISOString(); const item = { id: crypto.randomUUID(), title: input.title || "新对话", provider: input.provider || "openai", model: input.model || "", summary: input.summary || "", draft: "", createdAt: now, updatedAt: now }; return this.mutate(data => { data.conversations.push(item); return item; }); }
  async getConversation(id) { const data = await this.read(); const conversation = data.conversations.find(x=>x.id===id); if (!conversation) return null; return { ...conversation, messages: data.messages.filter(x=>x.conversationId===id).sort((a,b)=>a.createdAt.localeCompare(b.createdAt)), attachments: data.attachments.filter(x=>x.conversationId===id) }; }
  updateConversation(id, patch) { const allowed=["title","provider","model","summary","draft","lastReadMessageId"]; return this.mutate(data=>{const item=data.conversations.find(x=>x.id===id);if(!item)throw new Error("conversation_not_found");for(const key of allowed)if(key in patch)item[key]=patch[key];item.updatedAt=new Date().toISOString();return item;}); }
  deleteConversation(id) { return this.mutate(data=>{data.conversations=data.conversations.filter(x=>x.id!==id);data.messages=data.messages.filter(x=>x.conversationId!==id);data.proposals=data.proposals.filter(x=>x.conversationId!==id);data.usage=data.usage.filter(x=>x.conversationId!==id);const attachments=data.attachments.filter(x=>x.conversationId===id);data.attachments=data.attachments.filter(x=>x.conversationId!==id);return attachments;}); }
  addMessage(input) { const item={id:crypto.randomUUID(),conversationId:input.conversationId,role:input.role,content:input.content||"",status:input.status||"completed",provider:input.provider||"",model:input.model||"",attachmentIds:Array.isArray(input.attachmentIds)?input.attachmentIds:[],attachmentNames:Array.isArray(input.attachmentNames)?input.attachmentNames:[],error:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};return this.mutate(data=>{data.messages.push(item);const c=data.conversations.find(x=>x.id===item.conversationId);if(c)c.updatedAt=item.updatedAt;return item;}); }
  updateMessage(id, patch) { const allowed=["content","status","error","usage"];return this.mutate(data=>{const item=data.messages.find(x=>x.id===id);if(!item)throw new Error("message_not_found");for(const key of allowed)if(key in patch)item[key]=patch[key];item.updatedAt=new Date().toISOString();return item;}); }
  addUsage(input) { const item={id:crypto.randomUUID(),createdAt:new Date().toISOString(),...input};return this.mutate(data=>{data.usage.push(item);return item;}); }
  async usageSummary(filters={}) { const data=await this.read();const rows=data.usage.filter(x=>(!filters.conversationId||x.conversationId===filters.conversationId)&&(!filters.provider||x.provider===filters.provider));return rows.reduce((out,row)=>{out.requests++;out.inputTokens+=row.inputTokens||0;out.outputTokens+=row.outputTokens||0;return out;},{requests:0,inputTokens:0,outputTokens:0}); }
}
