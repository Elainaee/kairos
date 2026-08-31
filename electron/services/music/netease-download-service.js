import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { SettingsRepository } from "../../data/settings/index.js";
import { neteaseDownloadQualityCandidates, normalizeNeteaseDownloadQuality } from "./netease-api-service.js";
import { normalizeNeteaseMediaUrl } from "./netease-url-resolver.js";

const execFile = promisify(execFileCallback);
const MAX_CONCURRENCY = 2;
const MAX_REDIRECTS = 5;
const QUALITY_RANK = Object.freeze({ standard: 1, higher: 2, exhigh: 3, lossless: 4, hires: 5 });
const EXTENSIONS = Object.freeze({ mp3: ".mp3", flac: ".flac", m4a: ".m4a", mp4: ".mp4", ogg: ".ogg", opus: ".opus", aac: ".aac" });
const MIME_EXTENSIONS = Object.freeze({
  "audio/mpeg": ".mp3",
  "audio/mp3": ".mp3",
  "audio/flac": ".flac",
  "audio/x-flac": ".flac",
  "audio/mp4": ".m4a",
  "audio/x-m4a": ".m4a",
  "audio/aac": ".aac",
  "audio/ogg": ".ogg",
  "audio/opus": ".opus"
});
const METADATA_FORMATS = new Set([".mp3", ".flac", ".m4a", ".mp4", ".ogg", ".opus", ".aac"]);
const DOWNLOAD_STATE_VERSION = 1;
const ACTIVE_STATUSES = new Set(["queued", "resolving", "downloading", "tagging", "importing"]);
const TERMINAL_STATUSES = new Set(["completed", "failed", "cancelled"]);

function message(error, fallback) {
  return error instanceof Error && error.message ? error.message : fallback;
}

function safeFilePart(value, fallback) {
  const compact = String(value || "").replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_").replace(/[. ]+$/g, "").trim();
  return (compact || fallback).slice(0, 120);
}

function outputPathKey(filePath) {
  const resolved = path.resolve(String(filePath || ""));
  return process.platform === "win32" ? resolved.toLowerCase() : resolved;
}

function extensionFrom(source, contentType = "") {
  const apiType = String(source?.format || "").toLowerCase();
  if (EXTENSIONS[apiType]) return EXTENSIONS[apiType];
  const mime = String(contentType || "").split(";", 1)[0].trim().toLowerCase();
  if (MIME_EXTENSIONS[mime]) return MIME_EXTENSIONS[mime];
  const fromUrl = path.extname(new URL(source?.audioUrl || "https://music.163.com/").pathname).toLowerCase();
  return EXTENSIONS[fromUrl.slice(1)] || ".mp3";
}

function qualityRank(quality) {
  return QUALITY_RANK[String(quality || "").toLowerCase()] || 0;
}

function sourceIsAcceptableFor(candidate, source) {
  const requested = qualityRank(candidate);
  const actual = qualityRank(source?.resolvedQuality);
  // A successful upstream URL is already account-authorized. NetEase can
  // return a higher tier than requested (for example exhigh for standard),
  // which is still safe to use and must not turn an otherwise valid download
  // into a false failure.
  return requested > 0 && (actual > 0 || Boolean(source?.resolvedQuality));
}

function insideDirectory(filePath, directory) {
  const resolved = path.resolve(String(filePath || ""));
  const root = path.resolve(String(directory || ""));
  const relative = path.relative(root, resolved);
  return Boolean(root) && relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

function cleanText(value, limit = 240) {
  return String(value || "").trim().slice(0, limit);
}

function normalizeStoredTask(input = {}, batch = {}, downloadDir) {
  const songId = String(input.songId || "").replace(/^netease:/, "");
  if (!/^\d{1,20}$/.test(songId)) return null;
  const status = TERMINAL_STATUSES.has(input.status) || ACTIVE_STATUSES.has(input.status) ? input.status : "failed";
  const filePath = insideDirectory(input.filePath, downloadDir) ? path.resolve(input.filePath) : "";
  const partPath = insideDirectory(input.partPath, downloadDir) ? path.resolve(input.partPath) : "";
  return {
    id: cleanText(input.id) || crypto.randomUUID(),
    batchId: cleanText(input.batchId) || cleanText(batch.batchId) || crypto.randomUUID(),
    songId,
    status,
    requestedQuality: normalizeNeteaseDownloadQuality(input.requestedQuality || batch.quality),
    resolvedQuality: cleanText(input.resolvedQuality, 40),
    receivedBytes: Math.max(0, Number(input.receivedBytes) || 0),
    totalBytes: Math.max(0, Number(input.totalBytes) || 0),
    outputName: cleanText(input.outputName),
    title: cleanText(input.title),
    artist: cleanText(input.artist),
    album: cleanText(input.album),
    coverUrl: cleanText(input.coverUrl, 2048),
    message: cleanText(input.message, 500),
    errorCode: cleanText(input.errorCode, 120),
    stage: cleanText(input.stage, 40) || status,
    warning: cleanText(input.warning, 120),
    downgraded: Boolean(input.downgraded),
    filePath,
    partPath,
    localTrackId: cleanText(input.localTrackId, 120),
    createdAt: cleanText(input.createdAt, 64) || new Date().toISOString(),
    updatedAt: cleanText(input.updatedAt, 64) || new Date().toISOString(),
    completedAt: cleanText(input.completedAt, 64),
    controller: new AbortController()
  };
}

function storedTask(task) {
  const { controller, ...stored } = task;
  return stored;
}

function publicTask(task) {
  return {
    taskId: task.id,
    batchId: task.batchId,
    songId: task.songId,
    status: task.status,
    receivedBytes: task.receivedBytes || 0,
    totalBytes: task.totalBytes || 0,
    requestedQuality: task.requestedQuality,
    resolvedQuality: task.resolvedQuality || "",
    outputName: task.outputName || "",
    title: task.title || "",
    artist: task.artist || "",
    album: task.album || "",
    coverUrl: task.coverUrl || "",
    message: task.message || "",
    errorCode: task.errorCode || "",
    stage: task.stage || task.status || "",
    warning: task.warning || "",
    downgraded: Boolean(task.downgraded),
    localTrackId: task.localTrackId || "",
    createdAt: task.createdAt || "",
    updatedAt: task.updatedAt || "",
    completedAt: task.completedAt || ""
  };
}

/**
 * Authenticated NetEase download orchestration. The URL, cookie and FFmpeg
 * arguments never cross the Electron main-process boundary.
 */
export class NeteaseDownloadService {
  constructor({ neteaseService, musicLibrary, downloadDir, ffmpegPath, onProgress, fetchImpl = globalThis.fetch, maxConcurrency = MAX_CONCURRENCY, statePath, database } = {}) {
    this.neteaseService = neteaseService;
    this.musicLibrary = musicLibrary;
    this.downloadDir = path.resolve(String(downloadDir || path.join(process.cwd(), "Kairos Downloads")));
    this.ffmpegPath = ffmpegPath || "";
    this.onProgress = typeof onProgress === "function" ? onProgress : () => {};
    this.fetch = fetchImpl;
    this.maxConcurrency = Math.max(1, Math.min(MAX_CONCURRENCY, Number(maxConcurrency) || MAX_CONCURRENCY));
    this.batches = new Map();
    this.queue = [];
    this.active = new Map();
    this.activeBySong = new Map();
    this.outputReservations = new Set();
    this.persistTimer = null;
    this.stateRepository = statePath ? new SettingsRepository({
      filePath: statePath,
      defaults: { version: DOWNLOAD_STATE_VERSION, batches: [] },
      normalize: value => ({ version: DOWNLOAD_STATE_VERSION, batches: Array.isArray(value?.batches) ? value.batches : [] }),
      database,
      storeKey: "netease-download-state",
      summarize: value => ({ batches: value.batches?.length || 0, tasks: value.batches?.reduce((count, batch) => count + (batch.tasks?.length || 0), 0) || 0 })
    }) : null;
  }

  async initialize() {
    await fs.mkdir(this.downloadDir, { recursive: true });
    const entries = await fs.readdir(this.downloadDir, { withFileTypes: true }).catch(() => []);
    await Promise.all(entries
      .filter(entry => entry.isFile() && /\.(?:tagging|bak)(?:$|[.-])/i.test(entry.name))
      .map(entry => fs.rm(path.join(this.downloadDir, entry.name), { force: true }).catch(() => {})));
    if (this.stateRepository) {
      const state = await this.stateRepository.read();
      for (const storedBatch of state.batches) {
        const batchId = cleanText(storedBatch?.batchId) || crypto.randomUUID();
        const batch = {
          batchId,
          quality: normalizeNeteaseDownloadQuality(storedBatch?.quality),
          createdAt: cleanText(storedBatch?.createdAt, 64) || new Date().toISOString(),
          tasks: []
        };
        for (const input of Array.isArray(storedBatch?.tasks) ? storedBatch.tasks : []) {
          const task = normalizeStoredTask(input, batch, this.downloadDir);
          if (!task) continue;
          task.batchId = batchId;
          if (ACTIVE_STATUSES.has(task.status)) {
            task.status = "queued";
            task.stage = "queued";
            task.message = "download_restored";
            task.errorCode = "";
            this.queue.push(task);
            this.activeBySong.set(task.songId, task);
          }
          batch.tasks.push(task);
        }
        if (batch.tasks.length) this.batches.set(batch.batchId, batch);
      }
    }
    await this.migrateLegacyOutputNames();
    await this.persistNow();
    void this.drain();
  }

  async migratedOutputPath(baseName, extension) {
    for (let suffix = 1; suffix <= 10_000; suffix += 1) {
      const outputName = suffix === 1 ? `${baseName}${extension}` : `${baseName} (${suffix})${extension}`;
      const candidate = path.join(this.downloadDir, outputName);
      const candidateKey = outputPathKey(candidate);
      if (this.outputReservations.has(candidateKey)) continue;
      const existing = await fs.stat(candidate).catch(() => null);
      if (existing || this.outputReservations.has(candidateKey)) continue;
      this.outputReservations.add(candidateKey);
      return candidate;
    }
    throw new Error("download_output_name_unavailable");
  }

  updateMigratedTaskPaths(songId, previousPath, nextPath) {
    const previousKey = outputPathKey(previousPath);
    const previousName = path.basename(previousPath);
    for (const task of [...this.batches.values()].flatMap(batch => batch.tasks)) {
      if (task.songId !== songId) continue;
      if (task.filePath && outputPathKey(task.filePath) !== previousKey && task.outputName !== previousName) continue;
      task.filePath = nextPath;
      task.outputName = path.basename(nextPath);
      task.updatedAt = new Date().toISOString();
    }
  }

  async migrateLegacyOutputNames() {
    let libraryState = null;
    if (this.musicLibrary?.publicState) {
      try {
        libraryState = await this.musicLibrary.publicState();
      } catch {
        // Never move managed files when their source-of-truth paths cannot be
        // read. A later app start can retry the migration safely.
        return;
      }
    }
    const trackedByPath = new Map((libraryState?.tracks || []).map(track => [outputPathKey(track.path), track]));
    const entries = await fs.readdir(this.downloadDir, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const match = /^(.*?) \[(\d{1,20})\](\.(?:mp3|flac|m4a|mp4|ogg|opus|aac))$/i.exec(entry.name);
      if (!match?.[1]) continue;
      const [, baseName, songId, extension] = match;
      const previousPath = path.join(this.downloadDir, entry.name);
      const tracked = trackedByPath.get(outputPathKey(previousPath));
      if (tracked && (tracked.source !== "netease-download" || String(tracked.sourceId || "").replace(/^netease:/, "") !== songId)) continue;
      let nextPath = "";
      try {
        nextPath = await this.migratedOutputPath(baseName, extension);
        if (tracked && this.musicLibrary?.relocateDownloadedTrack) {
          await this.musicLibrary.relocateDownloadedTrack(tracked.id, { targetPath: nextPath, downloadDir: this.downloadDir });
        } else if (!tracked) {
          await fs.rename(previousPath, nextPath);
        } else {
          continue;
        }
        this.updateMigratedTaskPaths(songId, previousPath, nextPath);
      } catch {
        // A single locked or unreadable file must not prevent the app or the
        // remaining downloads from starting and migrating successfully.
      } finally {
        if (nextPath) this.outputReservations.delete(outputPathKey(nextPath));
      }
    }
  }

  getState() {
    const batches = [...this.batches.values()].map(batch => ({
      batchId: batch.batchId,
      quality: batch.quality,
      createdAt: batch.createdAt,
      tasks: batch.tasks.map(publicTask)
    }));
    return {
      batches,
      tasks: batches.flatMap(batch => batch.tasks)
    };
  }

  snapshot() {
    return {
      version: DOWNLOAD_STATE_VERSION,
      batches: [...this.batches.values()].map(batch => ({
        batchId: batch.batchId,
        quality: batch.quality,
        createdAt: batch.createdAt,
        tasks: batch.tasks.map(storedTask)
      }))
    };
  }

  async persistNow() {
    if (!this.stateRepository) return;
    await this.stateRepository.write(this.snapshot());
  }

  persistSoon(immediate = false) {
    if (!this.stateRepository) return;
    if (immediate) {
      if (this.persistTimer) clearTimeout(this.persistTimer);
      this.persistTimer = null;
      void this.persistNow();
      return;
    }
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 750);
  }

  emit(task) {
    this.onProgress(publicTask(task));
  }

  setTask(task, patch) {
    Object.assign(task, patch, { updatedAt: new Date().toISOString() });
    this.emit(task);
    this.persistSoon(TERMINAL_STATUSES.has(task.status) || patch.status === "queued");
  }

  start({ songIds, quality, songs = [] } = {}) {
    const ids = [...new Set((Array.isArray(songIds) ? songIds : []).map(value => String(value || "").replace(/^netease:/, "")).filter(value => /^\d{1,20}$/.test(value)))];
    if (!ids.length) throw new Error("download_song_ids_required");
    if (ids.length > 500) throw new Error("download_batch_too_large");
    const requestedQuality = normalizeNeteaseDownloadQuality(quality);
    const alreadyRunning = ids.filter(id => this.activeBySong.has(id));
    const pendingIds = ids.filter(id => !this.activeBySong.has(id));
    if (!pendingIds.length) return { batchId: this.activeBySong.get(ids[0])?.batchId || "", alreadyRunning, reused: true };
    const batch = { batchId: crypto.randomUUID(), quality: requestedQuality, createdAt: new Date().toISOString(), tasks: [] };
    const songById = new Map((Array.isArray(songs) ? songs : []).map(song => [String(song?.neteaseId || song?.id || "").replace(/^netease:/, ""), song]));
    for (const songId of pendingIds) {
      const song = songById.get(songId) || {};
      const task = {
        id: crypto.randomUUID(),
        batchId: batch.batchId,
        songId,
        status: "queued",
        requestedQuality,
        resolvedQuality: "",
        receivedBytes: 0,
        totalBytes: 0,
        outputName: "",
        title: cleanText(song.title || song.name),
        artist: cleanText(song.artist),
        album: cleanText(song.album),
        coverUrl: cleanText(song.coverUrl, 2048),
        message: "",
        errorCode: "",
        stage: "queued",
        warning: "",
        downgraded: false,
        filePath: "",
        partPath: "",
        localTrackId: "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        completedAt: "",
        controller: new AbortController()
      };
      batch.tasks.push(task);
      this.queue.push(task);
      this.activeBySong.set(songId, task);
      this.emit(task);
    }
    this.batches.set(batch.batchId, batch);
    this.persistSoon(true);
    void this.drain();
    return { batchId: batch.batchId, alreadyRunning, reused: false };
  }

  async retry({ taskId } = {}) {
    const task = [...this.batches.values()].flatMap(batch => batch.tasks).find(item => item.id === String(taskId || ""));
    if (!task || task.status !== "failed") return { ok: false, reason: "download_task_not_retryable" };
    if (this.activeBySong.has(task.songId)) return { ok: false, reason: "download_task_running" };
    task.controller = new AbortController();
    this.activeBySong.set(task.songId, task);
    this.queue.push(task);
    this.setTask(task, { status: "queued", stage: "queued", message: "", errorCode: "", warning: "" });
    void this.drain();
    return { ok: true, task: publicTask(task) };
  }

  async removeTask({ taskId } = {}) {
    for (const batch of this.batches.values()) {
      const index = batch.tasks.findIndex(task => task.id === String(taskId || ""));
      if (index < 0) continue;
      const task = batch.tasks[index];
      if (!TERMINAL_STATUSES.has(task.status) || task.status === "completed") return { ok: false, reason: "download_task_not_removable" };
      if (task.partPath && insideDirectory(task.partPath, this.downloadDir)) await fs.rm(task.partPath, { force: true }).catch(() => {});
      batch.tasks.splice(index, 1);
      if (!batch.tasks.length) this.batches.delete(batch.batchId);
      await this.persistNow();
      return { ok: true };
    }
    return { ok: false, reason: "download_task_not_found" };
  }

  async removeCompleted({ trackId } = {}) {
    const id = String(trackId || "");
    if (!id || !this.musicLibrary?.removeDownloadedTrack) return { ok: false, reason: "download_track_not_found" };
    const before = await this.musicLibrary.publicState();
    const track = before.tracks?.find(item => item.id === id);
    const sourceId = String(track?.sourceId || "").replace(/^netease:/, "");
    const state = await this.musicLibrary.removeDownloadedTrack(id, { downloadDir: this.downloadDir });
    for (const batch of [...this.batches.values()]) {
      batch.tasks = batch.tasks.filter(task => !(task.status === "completed" && (task.localTrackId === id || (sourceId && task.songId === sourceId))));
      if (!batch.tasks.length) this.batches.delete(batch.batchId);
    }
    await this.persistNow();
    return { ok: true, state };
  }

  cancel({ batchId } = {}) {
    const batch = this.batches.get(String(batchId || ""));
    if (!batch) return { ok: false, reason: "download_batch_not_found" };
    for (const task of batch.tasks) {
      if (["completed", "failed", "cancelled"].includes(task.status)) continue;
      task.controller.abort();
      if (task.status === "queued") {
        this.setTask(task, { status: "cancelled", message: "download_cancelled" });
        this.activeBySong.delete(task.songId);
      }
    }
    this.queue = this.queue.filter(task => task.batchId !== batch.batchId || task.status !== "cancelled");
    return { ok: true };
  }

  async drain() {
    while (this.active.size < this.maxConcurrency) {
      const task = this.queue.shift();
      if (!task) return;
      if (task.status !== "queued" || task.controller.signal.aborted) continue;
      this.active.set(task.id, task);
      void this.runTask(task).finally(() => {
        this.active.delete(task.id);
        this.activeBySong.delete(task.songId);
        void this.drain();
      });
    }
  }

  async assignOutputPath(task, baseName, extension) {
    const legacyName = `${baseName} [${task.songId}]${extension}`;
    const currentPath = task.filePath && insideDirectory(task.filePath, this.downloadDir)
      ? path.resolve(task.filePath)
      : "";
    if (currentPath && path.basename(currentPath) !== legacyName) {
      this.outputReservations.add(outputPathKey(currentPath));
      task.filePath = currentPath;
      return currentPath;
    }

    const previousForSong = [...this.batches.values()]
      .flatMap(batch => batch.tasks)
      .find(item => item !== task
        && item.status === "completed"
        && item.songId === task.songId
        && insideDirectory(item.filePath, this.downloadDir)
        && path.basename(item.filePath) !== legacyName);
    if (previousForSong) {
      const previousPath = path.resolve(previousForSong.filePath);
      this.outputReservations.add(outputPathKey(previousPath));
      task.filePath = previousPath;
      return previousPath;
    }

    for (let suffix = 1; suffix <= 10_000; suffix += 1) {
      const outputName = suffix === 1 ? `${baseName}${extension}` : `${baseName} (${suffix})${extension}`;
      const candidate = path.join(this.downloadDir, outputName);
      const candidateKey = outputPathKey(candidate);
      const claimedByTask = [...this.batches.values()]
        .flatMap(batch => batch.tasks)
        .some(item => item !== task
          && item.status !== "cancelled"
          && insideDirectory(item.filePath, this.downloadDir)
          && outputPathKey(item.filePath) === candidateKey);
      if (claimedByTask || this.outputReservations.has(candidateKey)) continue;
      const existing = await fs.stat(candidate).catch(() => null);
      // Recheck after the async filesystem lookup so parallel downloads cannot
      // reserve the same readable filename in the same event-loop turn.
      if (existing || this.outputReservations.has(candidateKey)) continue;
      this.outputReservations.add(candidateKey);
      task.filePath = candidate;
      return candidate;
    }
    throw new Error("download_output_name_unavailable");
  }

  async runTask(task) {
    let partPath = "";
    let taggedPath = "";
    let coverPath = "";
    try {
      this.setTask(task, { status: "resolving", stage: "resolving", message: "", warning: "" });
      const source = await this.resolveWithFallback(task);
      if (!source) throw new Error("download_unavailable");
      task.resolvedQuality = source.resolvedQuality;
      task.downgraded = source.resolvedQuality !== task.requestedQuality;
      task.title = cleanText(source.title) || task.title;
      task.artist = cleanText(source.artist) || task.artist;
      task.album = cleanText(source.album) || task.album;
      task.coverUrl = cleanText(source.coverUrl, 2048) || task.coverUrl;
      this.setTask(task, { status: "downloading", stage: "downloading", message: "" });
      const extension = extensionFrom(source);
      if (!METADATA_FORMATS.has(extension)) throw new Error("download_unsupported_format");
      const baseName = `${safeFilePart(source.artist, "NetEase")} - ${safeFilePart(source.title, "song")}`;
      const finalPath = await this.assignOutputPath(task, baseName, extension);
      partPath = task.partPath && insideDirectory(task.partPath, this.downloadDir)
        ? task.partPath
        : `${finalPath}.${task.id}.part`;
      task.partPath = partPath;
      task.outputName = path.basename(finalPath);
      const existingStat = await fs.stat(partPath).catch(() => null);
      let existingBytes = existingStat?.isFile() ? existingStat.size : 0;
      let response = await this.fetchNetease(source.audioUrl, task.controller.signal, existingBytes > 0 ? { Range: `bytes=${existingBytes}-` } : {});
      const append = existingBytes > 0 && response.status === 206;
      if (!append && existingBytes > 0) {
        await fs.rm(partPath, { force: true }).catch(() => {});
        existingBytes = 0;
      }
      const contentType = response.headers.get("content-type") || "";
      if (/^text\/|html|json/i.test(contentType)) throw new Error("download_invalid_content_type");
      const responseSize = Math.max(0, Number(response.headers.get("content-length") || 0));
      task.totalBytes = Math.max(source.size || 0, existingBytes + responseSize);
      await this.streamToFile(response, partPath, task, { append, initialBytes: existingBytes });
      const stat = await fs.stat(partPath);
      if (!stat.isFile() || stat.size <= 0) throw new Error("download_empty_file");
      if (source.size > 0 && stat.size < source.size) throw new Error("download_incomplete_file");
      this.setTask(task, { status: "tagging", stage: "tagging", receivedBytes: stat.size, totalBytes: task.totalBytes || stat.size });
      coverPath = `${finalPath}.${task.id}.cover`;
      let coverMimeType = "";
      try {
        coverMimeType = await this.downloadCover(source.coverUrl, coverPath, task.controller.signal);
      } catch (error) {
        if (task.controller.signal.aborted || error?.name === "AbortError") throw error;
        task.warning = "download_cover_unavailable";
        await fs.rm(coverPath, { force: true }).catch(() => {});
        coverPath = "";
      }
      taggedPath = `${finalPath}.${task.id}.tagging${extension}`;
      try {
        await this.writeMetadata({ inputPath: partPath, coverPath, outputPath: taggedPath, source });
        await this.replaceOutput({ taggedPath, finalPath, task });
        taggedPath = "";
      } catch (error) {
        if (task.controller.signal.aborted || error?.name === "AbortError") throw error;
        task.warning = "download_metadata_incomplete";
        await fs.rm(taggedPath, { force: true }).catch(() => {});
        taggedPath = "";
        await this.replaceOutput({ taggedPath: partPath, finalPath, task });
        partPath = "";
      }
      this.setTask(task, { status: "importing", stage: "importing" });
      const libraryState = await this.musicLibrary.upsertDownloadedTrack({ filePath: finalPath, source, batchId: task.batchId, coverPath, coverMimeType });
      task.localTrackId = libraryState?.tracks?.find(track => track.source === "netease-download" && String(track.sourceId || "") === String(task.songId))?.id || task.localTrackId;
      this.setTask(task, {
        status: "completed",
        stage: "completed",
        message: task.warning ? "download_completed_with_warnings" : task.downgraded ? "download_quality_downgraded" : "download_completed",
        receivedBytes: stat.size,
        totalBytes: task.totalBytes || stat.size,
        completedAt: new Date().toISOString()
      });
    } catch (error) {
      const cancelled = task.controller.signal.aborted || error?.name === "AbortError";
      this.setTask(task, {
        status: cancelled ? "cancelled" : "failed",
        stage: task.stage || task.status,
        message: cancelled ? "download_cancelled" : message(error, "download_failed"),
        errorCode: cancelled ? "download_cancelled" : message(error, "download_failed")
      });
    } finally {
      const transient = [taggedPath, coverPath];
      if (task.status === "completed" || task.status === "cancelled") transient.push(partPath);
      await Promise.all(transient.filter(Boolean).map(filePath => fs.rm(filePath, { force: true }).catch(() => {})));
      if (task.status === "completed" || task.status === "cancelled") task.partPath = "";
      if (task.filePath) this.outputReservations.delete(outputPathKey(task.filePath));
      this.persistSoon(true);
    }
  }

  async resolveWithFallback(task) {
    let lastFailure = null;
    for (const quality of neteaseDownloadQualityCandidates(task.requestedQuality)) {
      if (task.controller.signal.aborted) throw new DOMException("The operation was aborted.", "AbortError");
      const result = await this.neteaseService.resolveDownloadSource({ neteaseId: task.songId, quality });
      if (!result?.ok) {
        lastFailure = result;
        continue;
      }
      if (sourceIsAcceptableFor(quality, result.source)) return result.source;
      lastFailure = { message: "download_quality_unavailable" };
    }
    throw new Error(lastFailure?.message || "download_unavailable");
  }

  async fetchNetease(url, signal, headers = {}) {
    let nextUrl = String(url || "");
    for (let redirect = 0; redirect <= MAX_REDIRECTS; redirect += 1) {
      const trustedUrl = normalizeNeteaseMediaUrl(nextUrl);
      if (!trustedUrl) throw new Error("download_unsafe_url");
      const response = await this.fetch(trustedUrl.href, { signal, redirect: "manual", headers });
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get("location");
        if (!location) throw new Error("download_redirect_missing_location");
        nextUrl = new URL(location, trustedUrl).href;
        continue;
      }
      if (!response.ok || !response.body) throw new Error(`download_http_${response.status}`);
      return response;
    }
    throw new Error("download_too_many_redirects");
  }

  async streamToFile(response, filePath, task, { append = false, initialBytes = 0 } = {}) {
    const output = (await import("node:fs")).createWriteStream(filePath, { flags: append ? "a" : "w" });
    let received = initialBytes;
    const meter = new TransformStream({
      transform(chunk, controller) {
        received += chunk.byteLength;
        task.receivedBytes = received;
        controller.enqueue(chunk);
      }
    });
    const stream = response.body.pipeThrough(meter);
    const report = setInterval(() => this.emit(task), 180);
    try {
      await pipeline(Readable.fromWeb(stream), output, { signal: task.controller.signal });
      task.receivedBytes = received;
      this.emit(task);
    } finally {
      clearInterval(report);
    }
  }

  async downloadCover(url, filePath, signal) {
    const response = await this.fetchNetease(url, signal);
    const contentType = response.headers.get("content-type") || "";
    if (!/^image\//i.test(contentType)) throw new Error("download_cover_invalid_content_type");
    const output = (await import("node:fs")).createWriteStream(filePath, { flags: "wx" });
    await pipeline(Readable.fromWeb(response.body), output, { signal });
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size <= 0) throw new Error("download_cover_empty");
    return contentType.split(";", 1)[0].trim().toLowerCase() || "image/jpeg";
  }

  async writeMetadata({ inputPath, coverPath, outputPath, source }) {
    if (!this.ffmpegPath) throw new Error("ffmpeg_unavailable");
    await fs.access(this.ffmpegPath);
    const extension = path.extname(outputPath).toLowerCase();
    const supportsEmbeddedCover = Boolean(coverPath) && ![".ogg", ".opus", ".aac"].includes(extension);
    const args = ["-y", "-v", "error", "-i", inputPath];
    if (supportsEmbeddedCover) args.push("-i", coverPath);
    args.push("-map", "0:a:0", "-c:a", "copy");
    if (supportsEmbeddedCover) args.push("-map", "1:v:0", "-c:v", "mjpeg");
    for (const [key, value] of Object.entries({ title: source.title, artist: source.artist, album: source.album, album_artist: source.artist })) {
      if (value) args.push("-metadata", `${key}=${value}`);
    }
    if (extension === ".mp3") {
      if (supportsEmbeddedCover) args.push("-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
      args.push("-id3v2_version", "3", "-f", "mp3");
    } else if (extension === ".flac") {
      if (supportsEmbeddedCover) args.push("-disposition:v:0", "attached_pic");
      args.push("-f", "flac");
    } else if (extension === ".m4a" || extension === ".mp4") {
      if (supportsEmbeddedCover) args.push("-disposition:v:0", "attached_pic", "-metadata:s:v", "title=Album cover", "-metadata:s:v", "comment=Cover (front)");
      args.push("-movflags", "+faststart", "-f", "mp4");
    } else if (extension === ".ogg") args.push("-f", "ogg");
    else if (extension === ".opus") args.push("-f", "opus");
    else if (extension === ".aac") args.push("-f", "adts");
    args.push(outputPath);
    await execFile(this.ffmpegPath, args, { windowsHide: true, timeout: 120_000, maxBuffer: 1024 * 1024 });
    const stat = await fs.stat(outputPath);
    if (!stat.isFile() || stat.size <= 0) throw new Error("ffmpeg_empty_output");
  }

  async replaceOutput({ taggedPath, finalPath, task }) {
    const backupPath = `${finalPath}.${task.id}.bak`;
    let backedUp = false;
    try {
      await fs.rename(finalPath, backupPath);
      backedUp = true;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    try {
      await fs.rename(taggedPath, finalPath);
      if (backedUp) await fs.rm(backupPath, { force: true });
    } catch (error) {
      if (backedUp) {
        await fs.rm(finalPath, { force: true }).catch(() => {});
        await fs.rename(backupPath, finalPath).catch(() => {});
      }
      throw error;
    }
  }
}
