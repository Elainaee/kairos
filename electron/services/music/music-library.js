import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { KairosAppDatabase } from "../../data/sqlite/index.js";

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".flac", ".wav", ".m4a", ".mp4", ".aac"]);
const COVER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
const MAX_EMBEDDED_COVER_BYTES = 5 * 1024 * 1024;
const pathKey = value => path.resolve(String(value || "")).toLowerCase();
const EMPTY = {
  version: 1,
  tracks: [],
  playlists: [],
  queueTrackIds: [],
  currentTrackId: null,
  mode: "sequence",
  playing: false,
  volume: 70,
  muted: false,
  positions: {},
  runtime: { lastSource: "local", neteasePlayback: null, playCounts: {} }
};

const textDecoder = new TextDecoder("utf-8", { fatal: false });
const latinDecoder = new TextDecoder("latin1", { fatal: false });
const utf16Decoder = new TextDecoder("utf-16", { fatal: false });

function normalize(input = {}) {
  const out = {
    ...structuredClone(EMPTY),
    version: 1,
    tracks: input.tracks,
    playlists: input.playlists,
    queueTrackIds: input.queueTrackIds,
    currentTrackId: input.currentTrackId,
    mode: input.mode,
    playing: input.playing,
    volume: input.volume,
    muted: input.muted,
    positions: input.positions,
    runtime: input.runtime
  };
  if (!Array.isArray(out.tracks)) out.tracks = [];
  if (!Array.isArray(out.playlists)) out.playlists = [];
  out.playlists = out.playlists.map(playlist => ({
    ...playlist,
    hiddenTrackPaths: Array.isArray(playlist.hiddenTrackPaths)
      ? [...new Set(playlist.hiddenTrackPaths.map(pathKey).filter(Boolean))]
      : []
  }));
  if (!Array.isArray(out.queueTrackIds)) out.queueTrackIds = [];
  if (!out.positions || typeof out.positions !== "object" || Array.isArray(out.positions)) out.positions = {};
  if (!out.runtime || typeof out.runtime !== "object" || Array.isArray(out.runtime)) out.runtime = structuredClone(EMPTY.runtime);
  out.runtime.lastSource = ["local", "netease", "empty"].includes(out.runtime.lastSource) ? out.runtime.lastSource : "local";
  if (!out.runtime.playCounts || typeof out.runtime.playCounts !== "object" || Array.isArray(out.runtime.playCounts)) out.runtime.playCounts = {};
  if (!["sequence", "loop", "shuffle", "single"].includes(out.mode)) out.mode = "sequence";
  const validIds = new Set(out.tracks.map(track => track.id));
  out.queueTrackIds = out.queueTrackIds.filter(id => validIds.has(id));
  if (!out.queueTrackIds.length || !out.queueTrackIds.includes(out.currentTrackId)) out.currentTrackId = out.queueTrackIds[0] || null;
  out.playing = Boolean(out.playing);
  if (!out.currentTrackId) out.playing = false;
  out.volume = Math.min(100, Math.max(0, Number.isFinite(out.volume) ? out.volume : 70));
  out.muted = Boolean(out.muted);
  return out;
}

function syncSafeInt(bytes, offset) {
  return ((bytes[offset] & 0x7f) << 21) | ((bytes[offset + 1] & 0x7f) << 14) | ((bytes[offset + 2] & 0x7f) << 7) | (bytes[offset + 3] & 0x7f);
}

function uint32(bytes, offset) {
  return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

function decodeTextFrame(bytes) {
  if (!bytes.length) return "";
  const encoding = bytes[0];
  const body = bytes.subarray(1);
  const raw = encoding === 0 ? latinDecoder.decode(body) : encoding === 1 || encoding === 2 ? utf16Decoder.decode(body) : textDecoder.decode(body);
  return raw.replace(/\0+$/g, "").trim();
}

function readNullTerminated(bytes, start, encoding) {
  const step = encoding === 1 || encoding === 2 ? 2 : 1;
  for (let i = start; i < bytes.length - (step - 1); i += step) {
    if (step === 1 && bytes[i] === 0) return [bytes.subarray(start, i), i + 1];
    if (step === 2 && bytes[i] === 0 && bytes[i + 1] === 0) return [bytes.subarray(start, i), i + 2];
  }
  return [bytes.subarray(start), bytes.length];
}

function parseApic(bytes) {
  if (!bytes.length) return null;
  const encoding = bytes[0];
  const [mimeBytes, afterMime] = readNullTerminated(bytes, 1, 0);
  const mimeType = latinDecoder.decode(mimeBytes).trim() || "image/jpeg";
  const [, afterDescription] = readNullTerminated(bytes, afterMime + 1, encoding);
  const data = bytes.subarray(afterDescription);
  return data.length ? { mimeType, data } : null;
}

async function parseId3(filePath) {
  const handle = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(10);
    const { bytesRead } = await handle.read(header, 0, 10, 0);
    if (bytesRead < 10 || header.toString("latin1", 0, 3) !== "ID3") return {};
    const version = header[3];
    const tagSize = syncSafeInt(header, 6);
    const tag = Buffer.alloc(Math.min(tagSize, 16 * 1024 * 1024));
    await handle.read(tag, 0, tag.length, 10);
    const meta = {};
    let offset = 0;
    while (offset + 10 <= tag.length) {
      const id = tag.toString("latin1", offset, offset + 4).replace(/\0/g, "");
      if (!id) break;
      const size = version === 4 ? syncSafeInt(tag, offset + 4) : uint32(tag, offset + 4);
      const start = offset + 10;
      const end = start + size;
      if (size <= 0 || end > tag.length) break;
      const body = tag.subarray(start, end);
      if (id === "TIT2") meta.title = decodeTextFrame(body);
      if (id === "TPE1") meta.artist = decodeTextFrame(body);
      if (id === "TALB") meta.album = decodeTextFrame(body);
      if (id === "APIC" && !meta.cover) meta.cover = parseApic(body);
      offset = end;
    }
    return meta;
  } finally {
    await handle.close();
  }
}

function parseVorbisText(bytes) {
  const text = textDecoder.decode(bytes).replace(/\0/g, "\n");
  const meta = {};
  for (const line of text.split(/\r?\n/)) {
    const [key, ...rest] = line.split("=");
    const value = rest.join("=").trim();
    if (!value) continue;
    if (key?.toUpperCase() === "TITLE") meta.title ||= value;
    if (key?.toUpperCase() === "ARTIST") meta.artist ||= value;
    if (key?.toUpperCase() === "ALBUM") meta.album ||= value;
  }
  return meta;
}

async function parseFlac(filePath) {
  const bytes = await fs.readFile(filePath);
  if (bytes.toString("latin1", 0, 4) !== "fLaC") return {};
  const meta = {};
  let offset = 4;
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset];
    const type = header & 0x7f;
    const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    const start = offset + 4;
    const block = bytes.subarray(start, start + length);
    if (type === 4) Object.assign(meta, parseVorbisText(block));
    if (type === 6 && !meta.cover) {
      let p = 4;
      const mimeLength = uint32(block, p); p += 4;
      const mimeType = textDecoder.decode(block.subarray(p, p + mimeLength)); p += mimeLength;
      const descriptionLength = uint32(block, p); p += 4 + descriptionLength + 16;
      const dataLength = uint32(block, p); p += 4;
      const data = block.subarray(p, p + dataLength);
      if (data.length) meta.cover = { mimeType, data };
    }
    offset = start + length;
    if (header & 0x80) break;
  }
  return meta;
}

async function parseMetadata(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    if (ext === ".mp3") return await parseId3(filePath);
    if (ext === ".flac") return await parseFlac(filePath);
  } catch {
    return {};
  }
  return {};
}

function coverExtension(mimeType = "") {
  if (mimeType.includes("png")) return ".png";
  if (mimeType.includes("webp")) return ".webp";
  return ".jpg";
}

export class MusicLibrary {
  constructor({ legacyPath, statePath, database } = {}) {
    this.legacyPath = legacyPath || statePath || path.join(process.cwd(), "music-state.json");
    this.database = database || null;
    this.databaseReady = null;
    this.databasePath = ":memory:";
    this.queue = Promise.resolve();
    this.mutationQueue = Promise.resolve();
  }

  async ensureDatabase() {
    if (this.database?.available) return this.database;
    if (!this.databaseReady) this.databaseReady = (async () => { this.database ||= new KairosAppDatabase(this.databasePath); const status = await this.database.initialize(); if (!status.available) throw new Error("sqlite_unavailable"); return this.database; })();
    return this.databaseReady;
  }

  async read() {
    await this.ensureDatabase();
    const snapshot = this.readDatabaseSnapshot();
    const state = snapshot || await (async () => { try { const legacy = normalize(JSON.parse(await fs.readFile(this.legacyPath, "utf8"))); await this.write(legacy); return legacy; } catch { const empty = normalize(); await this.write(empty); return empty; } })();
    let changed = false;
    for (const track of state.tracks) {
      if (track.coverAssetId || !track.coverPath) continue;
      const bytes = await fs.readFile(track.coverPath).catch(() => null);
      if (!bytes?.length || !this.database?.saveBinaryAsset) continue;
      const assetId = `music-cover:${track.id}`;
      this.database.saveBinaryAsset({ id: assetId, ownerType: "music-cover", ownerId: track.id, name: path.basename(track.coverPath), mimeType: COVER_EXTENSIONS.has(path.extname(track.coverPath).toLowerCase()) ? ({ ".png": "image/png", ".webp": "image/webp" }[path.extname(track.coverPath).toLowerCase()] || "image/jpeg") : "image/jpeg", payload: bytes });
      track.coverAssetId = assetId; delete track.coverPath; changed = true;
    }
    if (changed) await this.write(state);
    return state;
  }

  readDatabaseSnapshot() {
    try {
      const snapshot = this.database?.readStorePayload?.("music-state");
      return snapshot ? normalize(snapshot) : null;
    } catch {
      return null;
    }
  }

  async ensureStateFile() { await this.read(); }

  async write(input) {
    const state = normalize(input);
    await this.ensureDatabase();
    this.queue = this.queue.catch(() => {}).then(async () => {
      if (!this.database?.saveStorePayload) throw new Error("sqlite_unavailable");
      this.database.saveStorePayload("music-state", state, { tracks: state.tracks.length, playlists: state.playlists.length, queue: state.queueTrackIds.length, currentTrackId: state.currentTrackId || "", playing: state.playing, volume: state.volume });
      return state;
    });
    return this.queue;
  }

  enqueueMutation(operation) {
    const mutation = this.mutationQueue.catch(() => {}).then(operation);
    this.mutationQueue = mutation.catch(() => {});
    return mutation;
  }

  async publicState() {
    await this.ensureStateFile();
    const state = await this.read();
    const trackByPath = new Map(state.tracks.map(track => [pathKey(track.path), track]));
    return {
      ...state,
      tracks: await Promise.all(state.tracks.map(track => this.publicTrack(track))),
      playlists: state.playlists.map(playlist => ({
        ...playlist,
        hiddenTracks: (playlist.hiddenTrackPaths || []).map(hiddenPath => {
          const track = trackByPath.get(hiddenPath);
          return track ? {
            id: track.id,
            path: track.path,
            fileName: track.fileName,
            title: track.title,
            artist: track.artist,
            album: track.album,
            coverUrl: this.coverUrlFor(track),
            available: true
          } : {
            path: hiddenPath,
            fileName: path.basename(hiddenPath),
            title: path.basename(hiddenPath).replace(/\.[^.]+$/, ""),
            artist: "",
            album: "",
            coverUrl: "",
            available: false
          };
        }),
        coverUrl: playlist.coverPath ? pathToFileURL(playlist.coverPath).href : ""
      }))
    };
  }

  async publicTrack(track) {
    let available = true;
    let unavailableReason = "";
    try {
      const stat = await fs.stat(track.path);
      available = stat.isFile();
      if (!available) unavailableReason = "not_file";
    } catch {
      available = false;
      unavailableReason = "missing_file";
    }
    return {
      ...track,
      available,
      unavailableReason,
      playUrl: pathToFileURL(track.path).href,
      coverUrl: this.coverUrlFor(track)
    };
  }

  coverUrlFor(track) {
    const asset = track?.coverAssetId ? this.database?.readBinaryAsset?.(track.coverAssetId) : null;
    if (asset) return `data:${asset.mimeType};base64,${asset.payload.toString("base64")}`;
    return track?.coverPath ? pathToFileURL(track.coverPath).href : "";
  }

  async addFiles(filePaths) {
    const state = await this.read();
    const existingByPath = new Map(state.tracks.map(track => [path.resolve(track.path).toLowerCase(), track]));
    const added = [];
    const rejected = [];
    for (const filePath of filePaths || []) {
      const resolved = path.resolve(filePath);
      const ext = path.extname(resolved).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        rejected.push({ path: resolved, reason: "unsupported_format" });
        continue;
      }
      try {
        const stat = await fs.stat(resolved);
        if (!stat.isFile()) throw new Error("not_file");
        if (stat.size <= 0) {
          rejected.push({ path: resolved, reason: "empty_file" });
          continue;
        }
        const key = resolved.toLowerCase();
        if (existingByPath.has(key)) {
          added.push(existingByPath.get(key));
          continue;
        }
        const metadata = await parseMetadata(resolved);
        const id = crypto.randomUUID();
        let coverAssetId = "";
        if (metadata.cover?.data?.length && metadata.cover.data.length <= MAX_EMBEDDED_COVER_BYTES) {
          coverAssetId = `music-cover:${id}`;
          this.database?.saveBinaryAsset?.({ id: coverAssetId, ownerType: "music-cover", ownerId: id, name: `${id}${coverExtension(metadata.cover.mimeType)}`, mimeType: metadata.cover.mimeType, payload: metadata.cover.data });
        }
        const now = new Date().toISOString();
        const fileName = path.basename(resolved);
        const track = {
          id,
          path: resolved,
          fileName,
          title: metadata.title || fileName.replace(/\.[^.]+$/, ""),
          artist: metadata.artist || "Local music",
          album: metadata.album || "",
          duration: 0,
          coverAssetId,
          coverPath: "",
          format: ext.slice(1).toUpperCase(),
          fileSize: stat.size,
          addedAt: now,
          updatedAt: now
        };
        state.tracks.push(track);
        existingByPath.set(key, track);
        added.push(track);
      } catch {
        rejected.push({ path: resolved, reason: "unreadable_file" });
      }
    }
    await this.write(state);
    return { state: await this.publicState(), added: await Promise.all(added.map(track => this.publicTrack(track))), rejected };
  }

  async scanAudioFiles(dirPath) {
    const found = [];
    const visit = async current => {
      let entries = [];
      try {
        entries = await fs.readdir(current, { withFileTypes: true });
      } catch {
        return;
      }
      for (const entry of entries) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) await visit(entryPath);
        else if (entry.isFile() && SUPPORTED_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) found.push(entryPath);
      }
    };
    await visit(dirPath);
    return found.sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
  }

  async addFolder(dirPath) {
    const resolved = path.resolve(dirPath);
    const files = await this.scanAudioFiles(resolved);
    const imported = await this.addFiles(files);
    const state = await this.read();
    const fileKeys = new Set(files.map(file => path.resolve(file).toLowerCase()));
    const existing = state.playlists.find(item => path.resolve(item.folderPath || "").toLowerCase() === resolved.toLowerCase());
    const hidden = new Set(existing?.hiddenTrackPaths || []);
    const folderTracks = state.tracks.filter(track => fileKeys.has(path.resolve(track.path).toLowerCase()) && !hidden.has(pathKey(track.path)));
    const folderTrackIds = folderTracks.map(track => track.id);
    const folderTrackIdSet = new Set(folderTrackIds);
    const now = new Date().toISOString();
    const playlist = existing || { id: crypto.randomUUID(), createdAt: now };
    const previousTrackIds = existing?.trackIds || [];
    const orderedTrackIds = existing
      ? [
          ...previousTrackIds.filter(id => folderTrackIdSet.has(id)),
          ...folderTrackIds.filter(id => !previousTrackIds.includes(id))
        ]
      : folderTrackIds;
    Object.assign(playlist, {
      name: path.basename(resolved) || "Local Playlist",
      folderPath: resolved,
      trackIds: orderedTrackIds,
      hiddenTrackPaths: existing?.hiddenTrackPaths || [],
      coverPath: existing?.coverPath || await this.findFolderCover(resolved),
      updatedAt: now
    });
    if (!existing) state.playlists.push(playlist);
    const playlistIds = new Set(state.playlists.flatMap(item => item.trackIds || []));
    const missingFolderIds = existing ? previousTrackIds.filter(id => !folderTrackIdSet.has(id)) : [];
    for (const id of missingFolderIds) {
      if (!playlistIds.has(id)) {
        state.tracks = state.tracks.filter(track => track.id !== id);
        delete state.positions[id];
      }
      state.queueTrackIds = state.queueTrackIds.filter(trackId => trackId !== id);
      if (state.currentTrackId === id) state.currentTrackId = state.queueTrackIds[0] || null;
    }
    await this.write(state);
    return { ...(await this.publicState()), imported: imported.added, rejected: imported.rejected, playlist };
  }

  async findFolderCover(dirPath) {
    let entries = [];
    try {
      entries = await fs.readdir(dirPath, { withFileTypes: true });
    } catch {
      return "";
    }
    const preferred = ["cover", "folder", "front", "album"];
    const files = entries.filter(entry => entry.isFile() && COVER_EXTENSIONS.has(path.extname(entry.name).toLowerCase()));
    const picked = files.find(entry => preferred.includes(path.basename(entry.name, path.extname(entry.name)).toLowerCase())) || files[0];
    return picked ? path.join(dirPath, picked.name) : "";
  }

  async syncFolders() {
    const state = await this.read();
    const folderPaths = state.playlists.map(playlist => playlist.folderPath).filter(Boolean);
    for (const folderPath of folderPaths) {
      try {
        await fs.access(folderPath);
        await this.addFolder(folderPath);
      } catch {}
    }
    return this.publicState();
  }

  async updatePlayback(patch = {}) {
    return this.enqueueMutation(async () => {
      const state = await this.read();
      if (Array.isArray(patch.queueTrackIds)) {
        const validIds = new Set(state.tracks.map(track => track.id));
        state.queueTrackIds = patch.queueTrackIds.filter(id => validIds.has(id));
      }
      if (patch.currentTrackId !== undefined) state.currentTrackId = patch.currentTrackId || null;
      if (patch.mode && ["sequence", "loop", "shuffle", "single"].includes(patch.mode)) state.mode = patch.mode;
      if (patch.playing !== undefined) state.playing = Boolean(patch.playing);
      if (Number.isFinite(patch.volume)) state.volume = Math.min(100, Math.max(0, Math.round(patch.volume)));
      if (patch.muted !== undefined) state.muted = Boolean(patch.muted);
      if (patch.position?.trackId) state.positions[patch.position.trackId] = Math.max(0, Number(patch.position.seconds) || 0);
      await this.write(state);
      return this.publicState();
    });
  }

  async updateRuntime(patch = {}) {
    return this.enqueueMutation(async () => {
      const state = await this.read();
      state.runtime = { ...(state.runtime || {}), ...patch };
      await this.write(state);
      return state.runtime;
    });
  }

  async updateTrack(input = {}) {
    const state = await this.read();
    const track = state.tracks.find(item => item.id === input.id);
    if (!track) throw new Error("track_not_found");
    if (Number.isFinite(input.duration)) track.duration = Math.max(0, input.duration);
    if (input.liked !== undefined) {
      track.liked = Boolean(input.liked);
      track.likedAt = track.liked ? new Date().toISOString() : null;
    }
    if (input.incrementPlayCount === true) {
      track.playCount = Math.max(0, Number(track.playCount) || 0) + 1;
      track.lastPlayedAt = new Date().toISOString();
    } else if (Number.isFinite(input.playCount)) {
      track.playCount = Math.max(0, Math.round(input.playCount));
    }
    track.updatedAt = new Date().toISOString();
    await this.write(state);
    return this.publicState();
  }

  async removeTrack(id) {
    const state = await this.read();
    state.tracks = state.tracks.filter(track => track.id !== id);
    state.queueTrackIds = state.queueTrackIds.filter(trackId => trackId !== id);
    delete state.positions[id];
    if (state.currentTrackId === id) state.currentTrackId = state.queueTrackIds[0] || null;
    await this.write(state);
    return this.publicState();
  }

  async removeUnavailableTracks() {
    const state = await this.read();
    const unavailableIds = new Set();
    const unavailablePaths = new Set();
    for (const track of state.tracks) {
      try {
        const stat = await fs.stat(track.path);
        if (stat.isFile()) continue;
      } catch {}
      unavailableIds.add(track.id);
      unavailablePaths.add(pathKey(track.path));
    }
    if (!unavailableIds.size) return { ...(await this.publicState()), removed: [] };
    const removed = state.tracks.filter(track => unavailableIds.has(track.id));
    state.tracks = state.tracks.filter(track => !unavailableIds.has(track.id));
    state.queueTrackIds = state.queueTrackIds.filter(trackId => !unavailableIds.has(trackId));
    for (const id of unavailableIds) delete state.positions[id];
    if (state.currentTrackId && unavailableIds.has(state.currentTrackId)) state.currentTrackId = state.queueTrackIds[0] || null;
    if (!state.currentTrackId) state.playing = false;
    for (const playlist of state.playlists) {
      playlist.trackIds = (playlist.trackIds || []).filter(trackId => !unavailableIds.has(trackId));
      playlist.hiddenTrackPaths = (playlist.hiddenTrackPaths || []).filter(hiddenPath => !unavailablePaths.has(pathKey(hiddenPath)));
      playlist.updatedAt = new Date().toISOString();
    }
    await this.write(state);
    return { ...(await this.publicState()), removed: await Promise.all(removed.map(track => this.publicTrack(track))) };
  }

  async clear() {
    const state = await this.read();
    state.tracks = [];
    state.queueTrackIds = [];
    state.currentTrackId = null;
    state.positions = {};
    await this.write(state);
    return this.publicState();
  }

  async removePlaylist(id) {
    const state = await this.read();
    const removed = state.playlists.find(item => item.id === id);
    state.playlists = state.playlists.filter(item => item.id !== id);
    if (removed?.trackIds?.length) {
      const removedIds = new Set(removed.trackIds);
      state.queueTrackIds = state.queueTrackIds.filter(trackId => !removedIds.has(trackId));
      if (state.currentTrackId && removedIds.has(state.currentTrackId)) state.currentTrackId = state.queueTrackIds[0] || null;
    }
    await this.write(state);
    return this.publicState();
  }

  async refreshPlaylist(id) {
    const state = await this.read();
    const playlist = state.playlists.find(item => item.id === id);
    if (!playlist?.folderPath) throw new Error("playlist_not_found");
    return this.addFolder(playlist.folderPath);
  }

  async removeTracksFromPlaylist(id, trackIds = []) {
    const state = await this.read();
    const playlist = state.playlists.find(item => item.id === id);
    if (!playlist) throw new Error("playlist_not_found");
    const removeSet = new Set(trackIds);
    const tracksById = new Map(state.tracks.map(track => [track.id, track]));
    const hidden = new Set(playlist.hiddenTrackPaths || []);
    for (const trackId of removeSet) {
      const track = tracksById.get(trackId);
      if (track?.path) hidden.add(pathKey(track.path));
    }
    playlist.hiddenTrackPaths = [...hidden];
    playlist.trackIds = (playlist.trackIds || []).filter(trackId => !removeSet.has(trackId));
    playlist.updatedAt = new Date().toISOString();
    state.queueTrackIds = state.queueTrackIds.filter(trackId => !removeSet.has(trackId));
    if (state.currentTrackId && removeSet.has(state.currentTrackId)) state.currentTrackId = state.queueTrackIds[0] || null;
    if (!state.currentTrackId) state.playing = false;
    await this.write(state);
    return this.publicState();
  }

  async restoreHiddenTracks(id, trackPaths = []) {
    const state = await this.read();
    const playlist = state.playlists.find(item => item.id === id);
    if (!playlist) throw new Error("playlist_not_found");
    const restoreSet = new Set(trackPaths.map(pathKey));
    playlist.hiddenTrackPaths = (playlist.hiddenTrackPaths || []).filter(item => !restoreSet.has(item));
    await this.write(state);
    await this.addFiles([...restoreSet]);
    const next = await this.read();
    const nextPlaylist = next.playlists.find(item => item.id === id);
    const existingIds = new Set(nextPlaylist.trackIds || []);
    for (const track of next.tracks) {
      if (restoreSet.has(pathKey(track.path)) && !existingIds.has(track.id)) {
        nextPlaylist.trackIds.push(track.id);
        existingIds.add(track.id);
      }
    }
    nextPlaylist.updatedAt = new Date().toISOString();
    await this.write(next);
    return this.publicState();
  }

  async reorder(ids = []) {
    const state = await this.read();
    const byId = new Map(state.tracks.map(track => [track.id, track]));
    const ordered = ids.map(id => byId.get(id)).filter(Boolean);
    const rest = state.tracks.filter(track => !ids.includes(track.id));
    state.tracks = [...ordered, ...rest];
    state.queueTrackIds = [...ordered.map(track => track.id), ...state.queueTrackIds.filter(id => !ids.includes(id))];
    const orderedIds = ordered.map(track => track.id);
    for (const playlist of state.playlists) {
      const current = playlist.trackIds || [];
      const currentSet = new Set(current);
      const next = orderedIds.filter(id => currentSet.has(id));
      if (next.length) playlist.trackIds = [...next, ...current.filter(id => !next.includes(id))];
    }
    await this.write(state);
    return this.publicState();
  }

  async reorderPlaylist(id, trackIds = []) {
    const state = await this.read();
    const playlist = state.playlists.find(item => item.id === id);
    if (!playlist) throw new Error("playlist_not_found");
    const current = playlist.trackIds || [];
    const currentSet = new Set(current);
    const ordered = trackIds.filter(trackId => currentSet.has(trackId));
    playlist.trackIds = [...ordered, ...current.filter(trackId => !ordered.includes(trackId))];
    playlist.updatedAt = new Date().toISOString();
    const queueSet = new Set(state.queueTrackIds || []);
    const playlistInQueue = current.some(trackId => queueSet.has(trackId));
    if (playlistInQueue) {
      const playlistSet = new Set(current);
      state.queueTrackIds = [
        ...playlist.trackIds,
        ...state.queueTrackIds.filter(trackId => !playlistSet.has(trackId))
      ];
    }
    await this.write(state);
    return this.publicState();
  }

  async playPlaylist(id) {
    const state = await this.read();
    const playlist = state.playlists.find(item => item.id === id);
    if (!playlist) throw new Error("playlist_not_found");
    const validIds = new Set(state.tracks.map(track => track.id));
    const queueTrackIds = (playlist.trackIds || []).filter(trackId => validIds.has(trackId));
    state.queueTrackIds = queueTrackIds;
    state.currentTrackId = queueTrackIds[0] || null;
    if (state.currentTrackId) state.positions[state.currentTrackId] = 0;
    await this.write(state);
    return this.publicState();
  }
}
