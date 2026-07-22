import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";

export const MAX_CALENDAR_BACKGROUND_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Map([[".jpg", "image/jpeg"], [".jpeg", "image/jpeg"], [".png", "image/png"], [".webp", "image/webp"]]);
const OWNER = "calendar-background";

function safeId(value) { const id = String(value || "").normalize("NFC"); const extension = path.extname(id).toLowerCase(); return id && id === path.basename(id) && !id.startsWith(".") && !/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(id) && IMAGE_TYPES.has(extension) ? id : ""; }
function typeFromHeader(buffer) { if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: ".jpg", mimeType: "image/jpeg" }; if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: ".png", mimeType: "image/png" }; if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { extension: ".webp", mimeType: "image/webp" }; return null; }
function displayName(id) { return path.basename(id, path.extname(id)).replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase()); }
function fileStem(value, fallback) { const label = String(value || fallback || "").normalize("NFC").trim(); const extension = path.extname(label).toLowerCase(); const stem = (IMAGE_TYPES.has(extension) ? path.basename(label, extension) : label).replace(/[. ]+$/g, "").trim().slice(0, 80); if (!stem || /^[.]+$/.test(stem) || /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(stem) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) throw new Error("calendar_background_name_invalid"); return stem; }
function storedLabel(id) { return path.basename(id, path.extname(id)); }

export class CalendarBackgroundService {
  constructor({ builtinDir, legacyDir, database, maxBytes = MAX_CALENDAR_BACKGROUND_BYTES }) { this.builtinDir = builtinDir; this.legacyDir = legacyDir; this.database = database; this.maxBytes = maxBytes; this.initialized = false; }

  async initialize() {
    if (this.initialized) return;
    if (!this.database?.saveBinaryAsset) throw new Error("sqlite_unavailable");
    const names = await fs.readdir(this.legacyDir).catch(() => []);
    for (const id of names.filter(safeId)) {
      const assetId = `calendar-background:${id}`;
      if (this.database.readBinaryAsset(assetId)) continue;
      const bytes = await fs.readFile(path.join(this.legacyDir, id)).catch(() => null);
      const type = bytes && typeFromHeader(bytes);
      if (type && bytes.length <= this.maxBytes) this.database.saveBinaryAsset({ id: assetId, ownerType: OWNER, ownerId: id, name: id, mimeType: type.mimeType, payload: bytes });
    }
    this.initialized = true;
  }

  urlFor(source, id) { const safeImageId = safeId(id); return safeImageId && ["builtin", "custom"].includes(source) ? `kairos-background://${source}/${encodeURIComponent(safeImageId)}` : ""; }
  detail(source, id, mimeType = IMAGE_TYPES.get(path.extname(id).toLowerCase())) { return { id, label: storedLabel(id), source, url: this.urlFor(source, id), mimeType }; }

  async listBuiltins() {
    await this.initialize();
    const builtinNames = (await fs.readdir(this.builtinDir).catch(() => [])).filter(safeId).sort((a, b) => a === "default.jpg" ? -1 : b === "default.jpg" ? 1 : a.localeCompare(b));
    const custom = this.database.listBinaryAssets(OWNER).map(asset => this.detail("custom", asset.ownerId, asset.mimeType));
    return [...builtinNames.map(id => this.detail("builtin", id)), ...custom];
  }

  async importFromPath(filePath, name = "") {
    await this.initialize(); const sourcePath = path.resolve(String(filePath || "")); const stats = await fs.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) throw new Error("calendar_background_file_invalid"); if (stats.size > this.maxBytes) throw new Error("calendar_background_file_too_large");
    const bytes = await fs.readFile(sourcePath); const imageType = typeFromHeader(bytes); if (!imageType) throw new Error("calendar_background_file_type_invalid");
    const id = await this.uniqueUserId(fileStem(name, displayName(path.basename(sourcePath)) || "Imported image"), imageType.extension);
    this.database.saveBinaryAsset({ id: `calendar-background:${id}`, ownerType: OWNER, ownerId: id, name: id, mimeType: imageType.mimeType, payload: bytes }); return this.detail("custom", id, imageType.mimeType);
  }

  async rename(source, id, name) {
    await this.initialize(); const existing = await this.resolve(source, id); if (!existing) throw new Error("calendar_background_file_invalid");
    const targetId = await this.uniqueUserId(fileStem(name, storedLabel(id)), path.extname(id).toLowerCase(), source === "custom" ? id : ""); if (source === "custom" && targetId === id) return this.detail("custom", id, existing.mimeType);
    const payload = existing.payload || await fs.readFile(existing.filePath);
    this.database.saveBinaryAsset({ id: `calendar-background:${targetId}`, ownerType: OWNER, ownerId: targetId, name: targetId, mimeType: existing.mimeType, payload }); if (source === "custom") this.database.removeBinaryAsset(existing.assetId); return this.detail("custom", targetId, existing.mimeType);
  }

  async remove(id) { await this.initialize(); const existing = await this.resolve("custom", id); if (!existing) throw new Error("calendar_background_file_invalid"); this.database.removeBinaryAsset(existing.assetId); return { id: safeId(id) }; }
  async resolve(source, id) {
    const safeImageId = safeId(id); if (!safeImageId) return null;
    if (source === "builtin") { const filePath = path.join(this.builtinDir, safeImageId); const stats = await fs.stat(filePath).catch(() => null); return stats?.isFile() ? { filePath, mimeType: IMAGE_TYPES.get(path.extname(safeImageId).toLowerCase()) } : null; }
    if (source !== "custom") return null;
    const assetId = `calendar-background:${safeImageId}`; const asset = this.database.readBinaryAsset(assetId); return asset ? { ...asset, assetId } : null;
  }
  async uniqueUserId(stem, extension, existingId = "") { for (let index = 1; index < 1000; index += 1) { const suffix = index === 1 ? "" : ` (${index})`; const id = `${stem}${suffix}${extension}`; if (id === existingId || !this.database.readBinaryAsset(`calendar-background:${id}`)) return id; } throw new Error("calendar_background_name_unavailable"); }
}
