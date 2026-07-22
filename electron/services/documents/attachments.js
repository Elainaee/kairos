import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { parseDocument, chunkParsedDocument } from "./document-parser.js";

const MAX_BYTES = 25 * 1024 * 1024;
const safeName = name => path.basename(name).replace(/[^\p{L}\p{N}._-]+/gu, "_").slice(0, 120) || "attachment";

export class AttachmentService {
  constructor({ tempDir, store, database }) { this.tempDir = tempDir; this.store = store; this.database = database; }

  async ensureDatabase() { if (!this.database) await this.store?.ensureDatabase?.(); this.database ||= this.store?.database; if (!this.database?.saveBinaryAsset) throw new Error("sqlite_unavailable"); return this.database; }

  assetFor(item) {
    const asset = this.database?.readBinaryAsset?.(item?.assetId);
    if (!asset) throw new Error("attachment_content_missing");
    return asset;
  }

  async save({ conversationId, name, mimeType, bytes, retain = false }) {
    const buffer = Buffer.from(bytes);
    if (!buffer.length || buffer.length > MAX_BYTES) throw new Error("attachment_size_invalid");
    await this.ensureDatabase();
    const id = crypto.randomUUID();
    const item = { id, assetId: id, conversationId, name: safeName(name), mimeType: mimeType || "application/octet-stream", size: buffer.length, retain: Boolean(retain), status: "ready", createdAt: new Date().toISOString() };
    this.database.saveBinaryAsset({ id, ownerType: "ai-attachment", ownerId: String(conversationId || ""), name: item.name, mimeType: item.mimeType, payload: buffer });
    await this.store.mutate(data => { data.attachments.push(item); });
    return item;
  }

  async remove(id) {
    const data = await this.store.read();
    const item = data.attachments.find(x => x.id === id);
    if (!item) return false;
    this.database?.removeBinaryAsset?.(item.assetId || item.id);
    await this.store.mutate(db => { db.attachments = db.attachments.filter(x => x.id !== id); });
    return true;
  }

  async materialize(item) {
    const asset = this.assetFor(item);
    await fs.mkdir(this.tempDir, { recursive: true });
    const filePath = path.join(this.tempDir, `${item.id}-${safeName(item.name)}`);
    await fs.writeFile(filePath, asset.payload);
    return filePath;
  }

  async prepare(id, providerCapabilities = []) {
    const data = await this.store.read();
    const item = data.attachments.find(x => x.id === id);
    if (!item) throw new Error("attachment_not_found");
    const localPath = await this.materialize(item);
    const isImage = item.mimeType.startsWith("image/");
    if (isImage) {
      if (!providerCapabilities.includes("vision")) { await fs.rm(localPath, { force: true }); throw new Error("provider_vision_unsupported"); }
      return { mode: "image", attachment: item, localPath };
    }
    if (providerCapabilities.includes("files")) return { mode: "native_file", attachment: item, localPath };
    try {
      const parsed = await parseDocument(localPath, item.name, item.mimeType);
      const chunks = chunkParsedDocument(parsed);
      await this.store.mutate(db => { const row = db.attachments.find(x => x.id === id); if (row) { row.status = "parsed"; row.parsed = { kind: parsed.kind, charCount: parsed.charCount, chunks }; } });
      await fs.rm(localPath, { force: true });
      return { mode: "extracted_text", attachment: { ...item, status: "parsed" }, chunks };
    } catch (error) {
      await fs.rm(localPath, { force: true });
      await this.store.mutate(db => { const row = db.attachments.find(x => x.id === id); if (row) { row.status = "failed"; row.error = error.message; } });
      throw error;
    }
  }

  async releasePrepared(filePath) { if (filePath) await fs.rm(filePath, { force: true }).catch(() => {}); }

  async migrateLegacyAttachments() {
    await this.ensureDatabase();
    const data = await this.store.read();
    let changed = false;
    for (const item of data.attachments || []) {
      if (item.assetId) continue;
      const bytes = item.path ? await fs.readFile(item.path).catch(() => null) : null;
      if (!bytes?.length) { item.status = "missing"; delete item.path; changed = true; continue; }
      const assetId = item.id || crypto.randomUUID();
      this.database.saveBinaryAsset({ id: assetId, ownerType: "ai-attachment", ownerId: String(item.conversationId || ""), name: safeName(item.name), mimeType: item.mimeType || "application/octet-stream", payload: bytes });
      item.assetId = assetId; item.size = bytes.length; delete item.path; changed = true;
    }
    if (changed) await this.store.mutate(() => {});
    return { migrated: changed };
  }

  async cleanupTemporary() {
    const data = await this.store.read();
    const expired = data.attachments.filter(x => !x.retain);
    expired.forEach(item => this.database?.removeBinaryAsset?.(item.assetId || item.id));
    await this.store.mutate(db => { db.attachments = db.attachments.filter(x => x.retain); });
    await fs.rm(this.tempDir, { recursive: true, force: true }).catch(() => {});
  }

  async removeConversationFiles(items) {
    for (const item of items || []) this.database?.removeBinaryAsset?.(item.assetId || item.id);
  }
}
