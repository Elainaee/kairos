import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");
const source = file => fs.readFile(path.join(root, file), "utf8");

test("music download contract keeps privileged downloads in the main process", async () => {
  const main = await source("electron/main/index.js");
  const preload = await source("electron/preload/index.cjs");
  const renderer = await source("app/pages/music/index.html");
  const service = await source("electron/services/music/netease-download-service.js");
  const theme = await source("app/shared/styles/tweakcn-theme.css");

  assert.match(main, /new NeteaseDownloadService\([\s\S]*?downloadDir:path\.join\(app\.getPath\("music"\),"Kairos Downloads"\)/, "main process must own the system music download directory");
  assert.match(main, /neteaseDownloadService=new NeteaseDownloadService\([\s\S]*?statePath:path\.join\(userData,"netease-download-state\.json"\),database:appDatabase/, "download queue state must be owned and persisted in the main process SQLite store");
  assert.match(main, /ipcMain\.handle\("netease:download-start",[\s\S]*?neteaseDownloadService\.start\(input\)/, "downloads must start through a narrow IPC handler");
  assert.match(main, /ipcMain\.handle\("netease:download-retry",[\s\S]*?neteaseDownloadService\.retry\(input\)/, "failed tasks must retry through narrow IPC");
  assert.match(main, /ipcMain\.handle\("netease:download-remove-task",[\s\S]*?neteaseDownloadService\.removeTask\(input\)/, "failed records must be removable through narrow IPC");
  assert.match(main, /ipcMain\.handle\("netease:download-remove-completed",[\s\S]*?neteaseDownloadService\.removeCompleted\(input\)/, "completed downloads must be removed through narrow IPC");
  assert.match(preload, /startDownload: \(input\) => ipcRenderer\.invoke\("netease:download-start", input\)/, "renderer bridge exposes only a request method");
  assert.match(preload, /retryDownload: \(input\) => ipcRenderer\.invoke\("netease:download-retry", input\)/, "preload exposes retry without privileged source data");
  assert.match(preload, /removeCompletedDownload: \(input\) => ipcRenderer\.invoke\("netease:download-remove-completed", input\)/, "preload exposes confirmed local deletion by stable id only");
  assert.doesNotMatch(preload, /cookie|audioUrl|resolveDownloadSource/, "preload must not expose session or source URL access");
  assert.match(service, /redirect: "manual"/, "download redirects must be individually revalidated");
  assert.match(service, /normalizeNeteaseMediaUrl\(nextUrl\)/, "only normalized, allowlisted NetEase CDN hosts are eligible for download");
  assert.match(renderer, /openNeteaseDownloadDialog/, "Music uses the existing page for quality selection");
  assert.match(renderer, /playlist-selection-bar/, "playlist downloads reuse the existing selection interaction");
  assert.match(renderer, /data-netease-view="download"/, "NetEase navigation exposes the Download subsection");
  assert.match(renderer, /netease-download-head[\s\S]*?<h1 class="playlist-detail-title">/, "Download reuses the playlist title typography");
  assert.match(renderer, /\.netease-download-head\{display:grid;[\s\S]*?\.netease-download-tabs\{margin-left:0\}/, "Download tabs sit on their own row below the title");
  assert.match(renderer, /table\.className = 'playlist-detail-table netease-download-table/, "Download rows reuse the playlist table contract");
  assert.match(renderer, /track-title-cell[\s\S]*?track-cover[\s\S]*?track-main[\s\S]*?track-name[\s\S]*?track-artist/, "Download rows reuse playlist track identity structure");
  assert.match(renderer, /cleanMusicText\(track\.title\)[\s\S]*?cleanMusicText\(track\.artist\)/, "downloaded metadata is cleaned before rendering replacement glyphs");
  assert.match(renderer, /netease-download-panel\.is-empty\{display:grid;[\s\S]*?place-items:center/, "Download empty states are centered in the content area");
  assert.match(renderer, /role="tablist"/, "Download uses real tab semantics");
  assert.match(renderer, /let neteaseDownloadTab = 'downloaded';[\s\S]*?\['downloaded'.*?\['downloading'/, "Download defaults to Downloaded and places Downloading second");
  assert.match(renderer, /api\.retryDownload\?\.\(\{ taskId: task\.taskId \}\)/, "failed Downloading rows expose retry");
  assert.match(renderer, /api\.removeCompletedDownload\?\.\(\{ trackId: track\.id \}\)/, "Downloaded rows delete through the local library contract");
  assert.doesNotMatch(renderer, /pauseDownload|resumeDownload|cancelDownload/, "Download intentionally exposes no pause, resume, or cancel controls");
  assert.match(theme, /:not\(\.netease-history-tab\):not\(\.netease-download-tab\)/, "shared button hover must not paint History or Download tab backgrounds");
});

test("FFmpeg packaging remains outside ASAR with a generated audit manifest", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  const prepare = await source("scripts/prepare-ffmpeg.cjs");
  const notice = await source("third_party/ffmpeg/NOTICE.md");

  assert.equal(packageJson.devDependencies["ffmpeg-static"], "5.3.0");
  assert.ok(packageJson.build.extraResources.some(item => item.from === "vendor/ffmpeg" && item.to === "ffmpeg"));
  assert.ok(packageJson.build.files.includes("!node_modules/ffmpeg-static{,/**}"), "the build-only FFmpeg source package must not be copied into app.asar");
  assert.match(prepare, /execFileAsync\(outputPath, \["-version"\]/);
  assert.match(prepare, /sha256:/);
  assert.match(notice, /GPL-3\.0-or-later/);
});
