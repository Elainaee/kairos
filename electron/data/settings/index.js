import fs from "node:fs/promises";

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
      const snapshot = this.database?.readStorePayload?.(this.storeKey);
      return snapshot ? this.normalize(snapshot) : null;
    } catch {
      return null;
    }
  }

  async read() {
    const snapshot = this.readSnapshot();
    if (snapshot) return snapshot;
    try {
      const legacy = this.normalize(JSON.parse(await fs.readFile(this.filePath, "utf8")));
      await this.write(legacy);
      return legacy;
    } catch { const fallback = this.fallback(); await this.write(fallback); return fallback; }
  }

  async write(value) {
    const normalized = this.normalize(value);
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (!this.database?.saveStorePayload) throw new Error("sqlite_unavailable");
      await this.database.saveStorePayload(this.storeKey, normalized, this.summarize(normalized));
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
