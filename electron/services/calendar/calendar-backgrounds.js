import fs from "node:fs/promises";
import path from "node:path";

export const MAX_CALENDAR_BACKGROUND_BYTES = 20 * 1024 * 1024;
const IMAGE_TYPES = new Map([
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".webp", "image/webp"]
]);

function safeId(value) {
  const id = String(value || "").normalize("NFC");
  const extension = path.extname(id).toLowerCase();
  return id && id === path.basename(id) && !id.startsWith(".") && !/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(id) && IMAGE_TYPES.has(extension) ? id : "";
}

function typeFromHeader(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return { extension: ".jpg", mimeType: "image/jpeg" };
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { extension: ".png", mimeType: "image/png" };
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return { extension: ".webp", mimeType: "image/webp" };
  return null;
}

function displayName(id) {
  return path.basename(id, path.extname(id)).replace(/[-_]+/g, " ").replace(/\b\w/g, character => character.toUpperCase());
}

function fileStem(value, fallback) {
  const label = String(value || fallback || "").normalize("NFC").trim();
  const extension = path.extname(label).toLowerCase();
  const stem = (IMAGE_TYPES.has(extension) ? path.basename(label, extension) : label).replace(/[. ]+$/g, "").trim().slice(0, 80);
  if (!stem || /^[.]+$/.test(stem) || /[\\/<>:"|?*\u0000-\u001f\u007f]/.test(stem)) throw new Error("calendar_background_name_invalid");
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) throw new Error("calendar_background_name_invalid");
  return stem;
}

function storedLabel(id) {
  return path.basename(id, path.extname(id));
}

export class CalendarBackgroundService {
  constructor({ builtinDir, userDir, maxBytes = MAX_CALENDAR_BACKGROUND_BYTES }) {
    this.builtinDir = builtinDir;
    this.userDir = userDir;
    this.maxBytes = maxBytes;
  }

  async listBuiltins() {
    await this.initialize();
    const names = await fs.readdir(this.userDir).catch(() => []);
    return names
      .filter(name => IMAGE_TYPES.has(path.extname(name).toLowerCase()) && safeId(name))
      .sort((left, right) => left === "default.jpg" ? -1 : right === "default.jpg" ? 1 : left.localeCompare(right))
      .map(id => ({ id, label: id === "default.jpg" ? "Default" : storedLabel(id), source: "custom", url: this.urlFor("custom", id) }));
  }

  urlFor(_source, id) {
    const safeImageId = safeId(id);
    return safeImageId ? `kairos-background://custom/${encodeURIComponent(safeImageId)}` : "";
  }

  async importFromPath(filePath, name = "") {
    await this.initialize();
    const sourcePath = path.resolve(String(filePath || ""));
    const stats = await fs.stat(sourcePath).catch(() => null);
    if (!stats?.isFile()) throw new Error("calendar_background_file_invalid");
    if (stats.size > this.maxBytes) throw new Error("calendar_background_file_too_large");
    const file = await fs.open(sourcePath, "r");
    let header;
    try { header = Buffer.alloc(Math.min(16, stats.size)); await file.read(header, 0, header.length, 0); } finally { await file.close(); }
    const imageType = typeFromHeader(header);
    if (!imageType) throw new Error("calendar_background_file_type_invalid");
    const label = fileStem(name, displayName(path.basename(sourcePath)) || "Imported image");
    const id = await this.uniqueUserId(label, imageType.extension);
    await fs.copyFile(sourcePath, path.join(this.userDir, id));
    return this.detail("custom", id, imageType.mimeType);
  }

  async rename(_source, id, name) {
    await this.initialize();
    const existing = await this.resolve("custom", id);
    if (!existing) throw new Error("calendar_background_file_invalid");
    const extension = path.extname(id).toLowerCase();
    const targetId = await this.uniqueUserId(fileStem(name, storedLabel(id)), extension, id);
    const targetPath = path.join(this.userDir, targetId);
    if (targetId !== id && id === "default.jpg") await fs.copyFile(existing.filePath, targetPath);
    if (targetId !== id && id !== "default.jpg") await fs.rename(existing.filePath, targetPath);
    return this.detail("custom", targetId, existing.mimeType);
  }

  async remove(id) {
    await this.initialize();
    const safeImageId = safeId(id);
    if (!safeImageId) throw new Error("calendar_background_file_invalid");
    if (safeImageId === "default.jpg") throw new Error("calendar_background_default_protected");
    const existing = await this.resolve("custom", safeImageId);
    if (!existing) throw new Error("calendar_background_file_invalid");
    const names = await fs.readdir(this.userDir).catch(() => []);
    const imageCount = names.filter(name => IMAGE_TYPES.has(path.extname(name).toLowerCase()) && safeId(name)).length;
    if (imageCount <= 1) throw new Error("calendar_background_last_protected");
    await fs.unlink(existing.filePath);
    return { id: safeImageId };
  }

  async resolve(_source, id) {
    const safeImageId = safeId(id);
    if (!safeImageId) return null;
    const baseDir = this.userDir;
    const filePath = path.join(baseDir, safeImageId);
    const resolvedBase = path.resolve(baseDir);
    const resolvedFile = path.resolve(filePath);
    if (!resolvedFile.startsWith(`${resolvedBase}${path.sep}`) || !IMAGE_TYPES.has(path.extname(safeImageId).toLowerCase())) return null;
    const stats = await fs.stat(resolvedFile).catch(() => null);
    if (!stats?.isFile()) return null;
    return { filePath: resolvedFile, mimeType: IMAGE_TYPES.get(path.extname(safeImageId).toLowerCase()) };
  }

  async initialize() {
    await fs.mkdir(this.userDir, { recursive: true });
    const existing = await fs.readdir(this.userDir).catch(() => []);
    const bundled = await fs.readdir(this.builtinDir).catch(() => []);
    const bundledImages = bundled.filter(name => IMAGE_TYPES.has(path.extname(name).toLowerCase()) && safeId(name));
    const hasImages = existing.some(name => IMAGE_TYPES.has(path.extname(name).toLowerCase()) && safeId(name));
    const seeds = hasImages ? bundledImages.filter(name => name === "default.jpg" && !existing.includes(name)) : bundledImages;
    await Promise.all(seeds.map(name => fs.copyFile(path.join(this.builtinDir, name), path.join(this.userDir, name))));
  }

  async uniqueUserId(stem, extension, existingId = "") {
    await fs.mkdir(this.userDir, { recursive: true });
    for (let index = 1; index < 1000; index += 1) {
      const suffix = index === 1 ? "" : ` (${index})`;
      const id = `${stem}${suffix}${extension}`;
      if (id === existingId) return id;
      const exists = await fs.access(path.join(this.userDir, id)).then(() => true).catch(() => false);
      if (!exists) return id;
    }
    throw new Error("calendar_background_name_unavailable");
  }

  detail(source, id, mimeType = IMAGE_TYPES.get(path.extname(id).toLowerCase())) {
    return { id, label: storedLabel(id), source, url: this.urlFor(source, id), mimeType };
  }
}
