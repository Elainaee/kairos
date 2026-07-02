import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const neteaseApi = require("NeteaseCloudMusicApi");

const DEFAULT_LEVEL = "standard";

function artistsText(song) {
  const artists = song?.ar || song?.artists || [];
  return Array.isArray(artists) ? artists.map(item => item?.name).filter(Boolean).join(" / ") : "";
}

function normalizeSong(song = {}) {
  const album = song.al || song.album || {};
  return {
    id: `netease:${song.id}`,
    neteaseId: song.id,
    title: song.name || "NetEase song",
    artist: artistsText(song) || "NetEase Cloud",
    album: album.name || "",
    coverUrl: album.picUrl || album.coverImgUrl || "",
    duration: Number(song.dt || song.duration || 0) / 1000 || 0,
    source: "netease"
  };
}

function normalizePlaylist(playlist = {}) {
  return {
    id: `netease-playlist:${playlist.id}`,
    neteaseId: playlist.id,
    name: playlist.name || "NetEase playlist",
    coverUrl: playlist.coverImgUrl || playlist.picUrl || "",
    trackCount: playlist.trackCount || 0,
    playCount: playlist.playCount || 0,
    creator: playlist.creator?.nickname || ""
  };
}

function publicStatus(cookie) {
  return {
    installed: true,
    configured: true,
    loggedIn: Boolean(cookie),
    searchSupported: true,
    player: "Kairos Player"
  };
}

export class NeteaseApiService {
  constructor({ statePath } = {}) {
    this.statePath = statePath;
    this.cookie = "";
    this.loginKey = "";
  }

  async initialize() {
    try {
      const data = JSON.parse(await fs.readFile(this.statePath, "utf8"));
      this.cookie = String(data.cookie || "");
    } catch {}
  }

  async save() {
    if (!this.statePath) return;
    await fs.mkdir(path.dirname(this.statePath), { recursive: true });
    await fs.writeFile(this.statePath, JSON.stringify({ cookie: this.cookie }, null, 2), "utf8");
  }

  withCookie(input = {}) {
    return this.cookie ? { ...input, cookie: this.cookie } : input;
  }

  async getStatus() {
    if (!this.cookie) return publicStatus("");
    const result = await neteaseApi.login_status(this.withCookie({}));
    const profile = result.body?.data?.profile || result.body?.profile || null;
    return { ...publicStatus(this.cookie), loggedIn: Boolean(profile), profile };
  }

  async requireProfile() {
    const status = await this.getStatus();
    if (!status.loggedIn || !status.profile?.userId) {
      return { ok: false, message: "Please login to NetEase Cloud first." };
    }
    return { ok: true, profile: status.profile };
  }

  async startLogin() {
    const keyResult = await neteaseApi.login_qr_key({});
    const key = keyResult.body?.data?.unikey;
    if (!key) return { ok: false, message: "Unable to create NetEase QR login key." };
    this.loginKey = key;
    const qrResult = await neteaseApi.login_qr_create({ key, qrimg: true });
    return {
      ok: true,
      key,
      qrUrl: qrResult.body?.data?.qrurl || "",
      qrImg: qrResult.body?.data?.qrimg || ""
    };
  }

  async loginCheck({ key } = {}) {
    const targetKey = key || this.loginKey;
    if (!targetKey) return { ok: false, code: 0, message: "No QR login in progress." };
    const result = await neteaseApi.login_qr_check({ key: targetKey });
    const body = result.body || {};
    if (body.code === 803 && body.cookie) {
      this.cookie = body.cookie;
      await this.save();
    }
    return { ok: true, ...body, loggedIn: body.code === 803 };
  }

  async searchSongs({ keyword, limit = 30, offset = 0 } = {}) {
    const result = await neteaseApi.cloudsearch(this.withCookie({
      keywords: String(keyword || ""),
      type: 1,
      limit,
      offset
    }));
    const songs = result.body?.result?.songs || [];
    return { ok: true, songs: songs.map(normalizeSong), raw: result.body };
  }

  async getUserPlaylists({ limit = 50, offset = 0 } = {}) {
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const result = await neteaseApi.user_playlist(this.withCookie({
      uid: auth.profile.userId,
      limit,
      offset
    }));
    const playlists = result.body?.playlist || [];
    return { ok: true, playlists: playlists.map(normalizePlaylist), profile: auth.profile };
  }

  async getPlaylistSongs({ id, neteaseId, limit = 100, offset = 0 } = {}) {
    const playlistId = String(neteaseId || id || "").replace(/^netease-playlist:/, "");
    if (!playlistId) return { ok: false, message: "Missing NetEase playlist id." };
    const result = await neteaseApi.playlist_track_all(this.withCookie({
      id: playlistId,
      limit,
      offset
    }));
    const songs = result.body?.songs || [];
    return { ok: true, songs: songs.map(normalizeSong), raw: result.body };
  }

  async getLikedSongs() {
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const likedResult = await neteaseApi.likelist(this.withCookie({ uid: auth.profile.userId }));
    const ids = likedResult.body?.ids || [];
    if (!ids.length) return { ok: true, songs: [], profile: auth.profile };
    const detailResult = await neteaseApi.song_detail(this.withCookie({ ids: ids.slice(0, 100).join(",") }));
    const songs = detailResult.body?.songs || [];
    return { ok: true, songs: songs.map(normalizeSong), total: ids.length, profile: auth.profile };
  }

  async getHistory({ type = 1 } = {}) {
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const result = await neteaseApi.user_record(this.withCookie({
      uid: auth.profile.userId,
      type
    }));
    const rows = result.body?.weekData || result.body?.allData || [];
    return {
      ok: true,
      songs: rows.map(row => ({ ...normalizeSong(row.song), playCount: row.playCount || row.score || 0 })),
      profile: auth.profile
    };
  }

  async playSong({ id, neteaseId, level = DEFAULT_LEVEL } = {}) {
    const songId = String(neteaseId || id || "").replace(/^netease:/, "");
    if (!songId) return { ok: false, message: "Missing NetEase song id." };
    const [detailResult, urlResult] = await Promise.all([
      neteaseApi.song_detail(this.withCookie({ ids: songId })),
      neteaseApi.song_url_v1(this.withCookie({ id: songId, level }))
    ]);
    const song = detailResult.body?.songs?.[0] || { id: Number(songId) || songId };
    const urlData = urlResult.body?.data?.[0] || {};
    if (!urlData.url) {
      return { ok: false, message: urlData.message || "No playable URL returned for this song.", data: urlData };
    }
    const track = {
      ...normalizeSong(song),
      playUrl: urlData.url,
      duration: Number(urlData.time || 0) / 1000 || Number(song.dt || 0) / 1000 || 0,
      bitrate: urlData.br || 0,
      level: urlData.level || level,
      expiresIn: urlData.expi || 0
    };
    return { ok: true, track, data: urlData };
  }
}
