import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const SUPPORTED_EXTENSIONS = new Set([".mp3", ".flac", ".wav", ".m4a", ".mp4", ".aac"]);
const COVER_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".webp"]);
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
  positions: {}
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
    positions: input.positions
  };
  if (!Array.isArray(out.tracks)) out.tracks = [];
  if (!Array.isArray(out.playlists)) out.playlists = [];
  if (!Array.isArray(out.queueTrackIds)) out.queueTrackIds = [];
  if (!out.positions || typeof out.positions !== "object" || Array.isArray(out.positions)) out.positions = {};
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

export class MusicLibrary {
  constructor({ statePath, coverDir }) {
    this.statePath = statePath;
    this.coverDir = coverDir;
    this.queue = Promise.resolve();
  }

  async read() {
    try {
      return normalize(JSON.parse(await fs.readFile(this.statePath, "utf8")));
    } catch {
      return normalize();
    }
  }

  async write(input) {
    const state = normalize(input);
    this.queue = this.queue.catch(() => {}).then(async () => {
      await fs.mkdir(path.dirname(this.statePath), { recursive: true });
      const temp = `${this.statePath}.${process.pid}.${Date.now()}.tmp`;
      await fs.writeFile(temp, JSON.stringify(state, null, 2), "utf8");
      await replaceFileWithRetry(temp, this.statePath);
      return state;
    });
    return this.queue;
  }

  async publicState() {
    const state = await this.read();
    return {
      ...state,
      tracks: await Promise.all(state.tracks.map(track => this.publicTrack(track))),
      playlists: state.playlists.map(playlist => ({
        ...playlist,
        coverUrl: playlist.coverPath ? pathToFileURL(playlist.coverPath).href : ""
      }))
    };
  }

  async publicTrack(track) {
    return {
      ...track,
      playUrl: pathToFileURL(track.path).href,
      coverUrl: track.coverPath ? pathToFileURL(track.coverPath).href : ""
    };
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
        const key = resolved.toLowerCase();
        if (existingByPath.has(key)) {
          added.push(existingByPath.get(key));
          continue;
        }
        const metadata = await parseMetadata(resolved);
        const id = crypto.randomUUID();
        let coverPath = "";
        if (metadata.cover?.data?.length) {
          await fs.mkdir(this.coverDir, { recursive: true });
          coverPath = path.join(this.coverDir, `${id}${coverExtension(metadata.cover.mimeType)}`);
          await fs.writeFile(coverPath, metadata.cover.data);
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
          coverPath,
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
    const folderTracks = state.tracks.filter(track => fileKeys.has(path.resolve(track.path).toLowerCase()));
    const folderTrackIds = folderTracks.map(track => track.id);
    const folderTrackIdSet = new Set(folderTrackIds);
    const now = new Date().toISOString();
    const existing = state.playlists.find(item => path.resolve(item.folderPath || "").toLowerCase() === resolved.toLowerCase());
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
  }

  async updateTrack(input = {}) {
    const state = await this.read();
    const track = state.tracks.find(item => item.id === input.id);
    if (!track) throw new Error("track_not_found");
    if (Number.isFinite(input.duration)) track.duration = Math.max(0, input.duration);
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
