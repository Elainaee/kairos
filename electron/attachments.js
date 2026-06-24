import fs from "node:fs/promises";
import path from "node:path";
import { parseDocument, chunkParsedDocument } from "./document-parser.js";

const MAX_BYTES = 25 * 1024 * 1024;
const safeName = name => path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu,"_").slice(0,120) || "attachment";

export class AttachmentService {
  constructor({ rootDir, tempDir, store }) { this.rootDir=rootDir;this.tempDir=tempDir;this.store=store; }
  async save({ conversationId, name, mimeType, bytes, retain=false }) {
    const buffer=Buffer.from(bytes);if(!buffer.length||buffer.length>MAX_BYTES)throw new Error("attachment_size_invalid");
    const id=crypto.randomUUID();const dir=retain?path.join(this.rootDir,conversationId):this.tempDir;await fs.mkdir(dir,{recursive:true});const filePath=path.join(dir,`${id}-${safeName(name)}`);await fs.writeFile(filePath,buffer);
    const item={id,conversationId,name:safeName(name),mimeType:mimeType||"application/octet-stream",size:buffer.length,path:filePath,retain,status:"ready",createdAt:new Date().toISOString()};await this.store.mutate(data=>{data.attachments.push(item);});return {...item,path:undefined};
  }
  async remove(id) { const data=await this.store.read();const item=data.attachments.find(x=>x.id===id);if(!item)return false;await fs.rm(item.path,{force:true});await this.store.mutate(db=>{db.attachments=db.attachments.filter(x=>x.id!==id);});return true; }
  async prepare(id,providerCapabilities=[]) { const data=await this.store.read();const item=data.attachments.find(x=>x.id===id);if(!item)throw new Error("attachment_not_found");const isImage=item.mimeType.startsWith("image/");if(isImage){if(!providerCapabilities.includes("vision"))throw new Error("provider_vision_unsupported");return{mode:"image",attachment:{...item,path:undefined},localPath:item.path};}if(providerCapabilities.includes("files"))return{mode:"native_file",attachment:{...item,path:undefined},localPath:item.path};try{const parsed=await parseDocument(item.path,item.name,item.mimeType);const chunks=chunkParsedDocument(parsed);await this.store.mutate(db=>{const row=db.attachments.find(x=>x.id===id);if(row){row.status="parsed";row.parsed={kind:parsed.kind,charCount:parsed.charCount,chunks};}});return{mode:"extracted_text",attachment:{...item,path:undefined,status:"parsed"},chunks};}catch(error){await this.store.mutate(db=>{const row=db.attachments.find(x=>x.id===id);if(row){row.status="failed";row.error=error.message;}});throw error;} }
  async cleanupTemporary() { const data=await this.store.read();const expired=data.attachments.filter(x=>!x.retain);for(const item of expired)await fs.rm(item.path,{force:true}).catch(()=>{});await this.store.mutate(db=>{db.attachments=db.attachments.filter(x=>x.retain);}); }
  async removeConversationFiles(items) { for(const item of items)await fs.rm(item.path,{force:true}).catch(()=>{}); }
}
