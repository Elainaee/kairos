import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { NeteaseDownloadService } from "../../services/music/netease-download-service.js";
import { neteaseDownloadQualityCandidates, normalizeNeteaseDownloadQuality } from "../../services/music/netease-api-service.js";
import { MusicLibrary } from "../../services/music/music-library.js";

const downloadStateDatabase = () => ({
  payload: null,
  readStorePayload(key) { return key === "netease-download-state" ? this.payload : null; },
  async saveStorePayload(key, value) { if (key === "netease-download-state") this.payload = structuredClone(value); }
});

const failedTask = ({ id = "task-1", songId = "100", partPath = "" } = {}) => ({
  id, batchId: "batch-1", songId, status: "failed", requestedQuality: "standard", resolvedQuality: "", receivedBytes: 2, totalBytes: 4,
  outputName: "Artist - Song [100].mp3", title: "Song", artist: "Artist", album: "Album", coverUrl: "", message: "download_http_403", errorCode: "download_http_403",
  stage: "downloading", warning: "", downgraded: false, filePath: "", partPath, localTrackId: "", createdAt: "2026-08-01T00:00:00.000Z", updatedAt: "2026-08-01T00:00:00.000Z", completedAt: ""
});

test("NetEase download quality only accepts the three product choices and degrades in order", () => {
  assert.equal(normalizeNeteaseDownloadQuality("hires"), "hires");
  assert.equal(normalizeNeteaseDownloadQuality("lossless"), "lossless");
  assert.equal(normalizeNeteaseDownloadQuality("exhigh"), "standard");
  assert.deepEqual(neteaseDownloadQualityCandidates("hires"), ["hires", "lossless", "standard"]);
  assert.deepEqual(neteaseDownloadQualityCandidates("lossless"), ["lossless", "standard"]);
  assert.deepEqual(neteaseDownloadQualityCandidates("standard"), ["standard"]);
});

test("NetEase download service rejects non-NetEase download hosts before issuing a request", async () => {
  let called = false;
  const service = new NeteaseDownloadService({
    downloadDir: path.join(os.tmpdir(), "kairos-download-test"),
    fetchImpl: async () => { called = true; throw new Error("must not fetch"); }
  });

  await assert.rejects(service.fetchNetease("https://example.test/audio.mp3", new AbortController().signal), /download_unsafe_url/);
  assert.equal(called, false);
});

test("NetEase download service upgrades allowlisted HTTP CDN links before fetching", async () => {
  let requestedUrl = "";
  const service = new NeteaseDownloadService({
    downloadDir: path.join(os.tmpdir(), "kairos-download-test"),
    fetchImpl: async url => {
      requestedUrl = String(url);
      return new Response(new Uint8Array([1]), { headers: { "content-type": "audio/mpeg" } });
    }
  });

  const response = await service.fetchNetease("http://m801.music.126.net/song.mp3", new AbortController().signal);
  assert.equal(response.ok, true);
  assert.equal(requestedUrl, "https://m801.music.126.net/song.mp3");
});

test("NetEase download public state excludes source URLs and session data", () => {
  const events = [];
  const service = new NeteaseDownloadService({
    downloadDir: path.join(os.tmpdir(), "kairos-download-test"),
    neteaseService: { resolveDownloadSource: async () => ({ ok: false, message: "unavailable" }) },
    musicLibrary: { upsertDownloadedTrack: async () => {} },
    onProgress: task => events.push(task)
  });

  const started = service.start({ songIds: ["netease:100", "100", "200", "not-a-song"], quality: "hires" });
  assert.equal(started.reused, false);
  assert.equal(service.getState().batches[0].tasks.length, 2);
  assert.equal(events.some(task => Object.hasOwn(task, "audioUrl") || Object.hasOwn(task, "cookie")), false);
  service.cancel({ batchId: started.batchId });
});

test("NetEase download keeps the audio when cover or metadata writing is unavailable", async () => {
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-fallback-"));
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const imported = [];
  const service = new NeteaseDownloadService({
    downloadDir,
    neteaseService: {
      resolveDownloadSource: async () => ({
        ok: true,
        source: {
          neteaseId: "100",
          title: "Song",
          artist: "Artist",
          album: "Album",
          audioUrl: "https://m10.music.126.net/song.mp3",
          coverUrl: "https://p1.music.126.net/cover.jpg",
          format: "mp3",
          size: 4,
          resolvedQuality: "standard"
        }
      })
    },
    musicLibrary: { upsertDownloadedTrack: async input => imported.push(input) },
    fetchImpl: async url => String(url).includes("cover")
      ? new Response("not found", { status: 404 })
      : new Response(new Uint8Array([1, 2, 3, 4]), { headers: { "content-type": "audio/mpeg", "content-length": "4" } }),
    onProgress: task => {
      if (task.status === "completed" || task.status === "failed") finish(task);
    }
  });
  service.writeMetadata = async () => { throw new Error("ffmpeg_unavailable"); };
  await service.initialize();
  service.start({ songIds: ["100"], quality: "standard" });
  const task = await completed;

  assert.equal(task.status, "completed");
  assert.equal(task.stage, "completed");
  assert.equal(task.warning, "download_metadata_incomplete");
  assert.equal(imported.length, 1);
  assert.equal(imported[0].coverPath, "");
  assert.equal(path.basename(imported[0].filePath), "Artist - Song.mp3");
  await fs.rm(downloadDir, { recursive: true, force: true });
});

test("NetEase download uses a readable suffix instead of a song id when a filename is occupied", async () => {
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-name-"));
  await fs.writeFile(path.join(downloadDir, "Artist - Song.mp3"), "existing");
  const service = new NeteaseDownloadService({ downloadDir });
  const task = { songId: "100", filePath: "" };
  const outputPath = await service.assignOutputPath(task, "Artist - Song", ".mp3");
  assert.equal(path.basename(outputPath), "Artist - Song (2).mp3");
  await fs.rm(downloadDir, { recursive: true, force: true });
});

test("NetEase download startup removes legacy song ids and updates tracked and orphaned files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-migrate-"));
  const downloadDir = path.join(root, "Kairos Downloads");
  await fs.mkdir(downloadDir, { recursive: true });
  const trackedLegacy = path.join(downloadDir, "Artist - Song [100].mp3");
  const orphanLegacy = path.join(downloadDir, "Other - Track [200].flac");
  await fs.writeFile(trackedLegacy, Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000"));
  await fs.writeFile(orphanLegacy, Buffer.from("fLaC"));
  const library = new MusicLibrary({ statePath: path.join(root, "music.json") });
  const imported = await library.upsertDownloadedTrack({ filePath: trackedLegacy, source: { neteaseId: "100", title: "Song", artist: "Artist", album: "Album" } });
  const trackedId = imported.tracks[0].id;
  const service = new NeteaseDownloadService({ downloadDir, musicLibrary: library });
  await service.initialize();

  const trackedTarget = path.join(downloadDir, "Artist - Song.mp3");
  const orphanTarget = path.join(downloadDir, "Other - Track.flac");
  const state = await library.publicState();
  assert.equal(state.tracks.find(track => track.id === trackedId).path, trackedTarget);
  await fs.access(trackedTarget);
  await fs.access(orphanTarget);
  await assert.rejects(fs.access(trackedLegacy));
  await assert.rejects(fs.access(orphanLegacy));
  await fs.rm(root, { recursive: true, force: true });
});

test("NetEase download startup persists the renamed path in completed task records", async () => {
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-task-migrate-"));
  const legacyPath = path.join(downloadDir, "Artist - Song [100].mp3");
  await fs.writeFile(legacyPath, Buffer.from("ID3\u0004\u0000\u0000\u0000\u0000\u0000\u0000"));
  const database = downloadStateDatabase();
  database.payload = {
    version: 1,
    batches: [{ batchId: "batch-1", quality: "standard", createdAt: "2026-08-01T00:00:00.000Z", tasks: [{
      ...failedTask(), status: "completed", stage: "completed", message: "download_completed", errorCode: "",
      filePath: legacyPath, outputName: path.basename(legacyPath), completedAt: "2026-08-01T00:01:00.000Z"
    }] }]
  };
  const service = new NeteaseDownloadService({
    downloadDir,
    statePath: path.join(downloadDir, "state.json"),
    database,
    musicLibrary: { publicState: async () => ({ tracks: [] }) }
  });
  await service.initialize();

  const renamedPath = path.join(downloadDir, "Artist - Song.mp3");
  const task = database.payload.batches[0].tasks[0];
  assert.equal(task.filePath, renamedPath);
  assert.equal(task.outputName, "Artist - Song.mp3");
  await fs.access(renamedPath);
  await assert.rejects(fs.access(legacyPath));
  await fs.rm(downloadDir, { recursive: true, force: true });
});

test("NetEase download state restores terminal tasks and requeues interrupted work from SQLite", async () => {
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-restore-"));
  const database = downloadStateDatabase();
  database.payload = {
    version: 1,
    batches: [{ batchId: "batch-1", quality: "standard", createdAt: "2026-08-01T00:00:00.000Z", tasks: [
      failedTask(),
      { ...failedTask({ id: "task-2", songId: "200" }), status: "downloading", stage: "downloading", message: "", errorCode: "" }
    ] }]
  };
  const service = new NeteaseDownloadService({
    downloadDir,
    statePath: path.join(downloadDir, "state.json"),
    database,
    neteaseService: { resolveDownloadSource: async () => new Promise(() => {}) },
    musicLibrary: { upsertDownloadedTrack: async () => ({ tracks: [] }) }
  });
  service.drain = async () => {};
  await service.initialize();
  const tasks = service.getState().tasks;
  assert.equal(tasks.find(task => task.taskId === "task-1").status, "failed");
  const restored = tasks.find(task => task.taskId === "task-2");
  assert.equal(restored.status, "queued");
  assert.equal(restored.message, "download_restored");
  assert.equal(database.payload.batches[0].tasks.find(task => task.id === "task-2").status, "queued");
  await fs.rm(downloadDir, { recursive: true, force: true });
});

test("NetEase download retries failed tasks and removes confirmed failed records with only their part file", async () => {
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-retry-"));
  const partPath = path.join(downloadDir, "song.part");
  await fs.writeFile(partPath, "part");
  const service = new NeteaseDownloadService({ downloadDir, musicLibrary: { upsertDownloadedTrack: async () => ({ tracks: [] }) } });
  service.drain = async () => {};
  service.batches.set("batch-1", { batchId: "batch-1", quality: "standard", createdAt: "2026-08-01T00:00:00.000Z", tasks: [failedTask({ partPath })] });
  const retry = await service.retry({ taskId: "task-1" });
  assert.equal(retry.ok, true);
  assert.equal(retry.task.status, "queued");
  const task = service.batches.get("batch-1").tasks[0];
  task.status = "failed";
  service.activeBySong.delete(task.songId);
  const removal = await service.removeTask({ taskId: "task-1" });
  assert.equal(removal.ok, true);
  await assert.rejects(fs.access(partPath));
  assert.equal(service.getState().tasks.length, 0);
  await fs.rm(downloadDir, { recursive: true, force: true });
});

test("NetEase download resumes a trusted partial file with an HTTP range request", async () => {
  const downloadDir = await fs.mkdtemp(path.join(os.tmpdir(), "kairos-download-range-"));
  const legacyFinalPath = path.join(downloadDir, "Artist - Song [100].mp3");
  const finalPath = path.join(downloadDir, "Artist - Song.mp3");
  const partPath = `${legacyFinalPath}.task-range.part`;
  await fs.writeFile(partPath, Buffer.from([1, 2]));
  let requestedRange = "";
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const service = new NeteaseDownloadService({
    downloadDir,
    neteaseService: { resolveDownloadSource: async () => ({ ok: true, source: { neteaseId: "100", title: "Song", artist: "Artist", album: "Album", audioUrl: "https://m10.music.126.net/song.mp3", coverUrl: "", format: "mp3", size: 4, resolvedQuality: "standard" } }) },
    musicLibrary: { upsertDownloadedTrack: async () => ({ tracks: [{ id: "local-100", source: "netease-download", sourceId: "100" }] }) },
    fetchImpl: async (_url, options) => { requestedRange = options.headers?.Range || ""; return new Response(new Uint8Array([3, 4]), { status: 206, headers: { "content-type": "audio/mpeg", "content-length": "2" } }); },
    onProgress: task => { if (task.status === "completed" || task.status === "failed") finish(task); }
  });
  service.drain = async () => {};
  service.start({ songIds: ["100"], quality: "standard" });
  const task = service.batches.values().next().value.tasks[0];
  task.id = "task-range";
  task.filePath = legacyFinalPath;
  task.partPath = partPath;
  service.drain = NeteaseDownloadService.prototype.drain.bind(service);
  void service.drain();
  const result = await completed;
  assert.equal(result.status, "completed");
  assert.equal(requestedRange, "bytes=2-");
  assert.deepEqual(await fs.readFile(finalPath), Buffer.from([1, 2, 3, 4]));
  await fs.rm(downloadDir, { recursive: true, force: true });
});
