import fs from "node:fs/promises";
import path from "node:path";

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const isTransientFileError = error => ["EPERM", "EACCES", "EBUSY"].includes(error?.code);

async function replaceFileWithRetry(tempPath, targetPath) {
  let lastError;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    try {
      await fs.rename(tempPath, targetPath);
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFileError(error)) throw error;
    }
    try {
      await fs.copyFile(tempPath, targetPath);
      await fs.unlink(tempPath).catch(() => {});
      return;
    } catch (error) {
      lastError = error;
      if (!isTransientFileError(error)) throw error;
      await wait(40 * (attempt + 1));
    }
  }
  throw lastError;
}

export class SettingsRepository {
  constructor({ filePath, defaults = {}, normalize = value => value || {}, database = null, storeKey = "settings", summarize = () => ({}) } = {}) {
    this.filePath = filePath;
    this.defaults = structuredClone(defaults);
    this.normalize = normalize;
    this.database = database;
    this.storeKey = storeKey;
    this.summarize = summarize;
    this.queue = Promise.resolve();
  }

  fallback() {
    return this.normalize(structuredClone(this.defaults));
  }

  readSnapshot() {
    try {
      const snapshot = this.database?.readJsonStorePayload?.(this.storeKey);
      return snapshot ? this.normalize(snapshot) : null;
    } catch {
      return null;
    }
  }

  async read() {
    try {
      return this.normalize(JSON.parse(await fs.readFile(this.filePath, "utf8")));
    } catch {
      const snapshot = this.readSnapshot();
      if (!snapshot) return this.fallback();
      await this.write(snapshot);
      return snapshot;
    }
  }

  async write(value) {
    const normalized = this.normalize(value);
    this.queue = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      const tempPath = `${this.filePath}.${process.pid}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
      await fs.writeFile(tempPath, JSON.stringify(normalized, null, 2), "utf8");
      await replaceFileWithRetry(tempPath, this.filePath);
      await this.database?.saveJsonStoreSnapshot?.(this.storeKey, normalized, this.summarize(normalized));
      return normalized;
    });
    return this.queue;
  }

  async update(change) {
    const current = await this.read();
    const next = await change(structuredClone(current));
    return this.write(next === undefined ? current : next);
  }
}
