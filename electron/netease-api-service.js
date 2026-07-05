import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const neteaseApi = require("NeteaseCloudMusicApi");

const DEFAULT_LEVEL = "standard";
const PAGE_SIZE = 200;
const MAX_ACCOUNT_SONGS = 5000;
const MAX_ACCOUNT_PLAYLISTS = 500;

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

function playlistRows(body = {}) {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body.data)) return body.data;
  return body.playlist
    || body.playlists
    || body.createdPlaylist
    || body.collectPlaylist
    || body.data?.playlist
    || body.data?.playlists
    || body.data?.createdPlaylist
    || body.data?.collectPlaylist
    || [];
}

function isLikedPlaylist(playlist = {}) {
  return playlist.specialType === 5 || /喜欢|liked/i.test(playlist.name || "");
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

  async getUserPlaylists({ limit = 0, offset = 0 } = {}) {
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const targetLimit = Math.max(0, Number(limit) || 0);
    const fetchPages = async method => {
      const playlists = [];
      let currentOffset = Math.max(0, Number(offset) || 0);
      let raw = null;
      while (playlists.length < (targetLimit || MAX_ACCOUNT_PLAYLISTS)) {
        const pageLimit = targetLimit ? Math.min(PAGE_SIZE, targetLimit - playlists.length) : PAGE_SIZE;
        const result = await method(this.withCookie({
          uid: auth.profile.userId,
          limit: pageLimit,
          offset: currentOffset
        }));
        raw = result.body;
        const page = playlistRows(result.body);
        playlists.push(...page);
        if (page.length < pageLimit || result.body?.more === false) break;
        currentOffset += page.length;
      }
      return { playlists, raw };
    };
    const [createdResult, savedResult] = await Promise.all([
      fetchPages(neteaseApi.user_playlist_create),
      fetchPages(neteaseApi.user_playlist_collect)
    ]);
    const createdPlaylists = createdResult.playlists.filter(playlist => !isLikedPlaylist(playlist)).map(normalizePlaylist);
    const savedPlaylists = savedResult.playlists.filter(playlist => !isLikedPlaylist(playlist)).map(normalizePlaylist);
    return {
      ok: true,
      playlists: [...createdPlaylists, ...savedPlaylists],
      createdPlaylists,
      savedPlaylists,
      total: createdPlaylists.length + savedPlaylists.length,
      profile: auth.profile,
      raw: { created: createdResult.raw, saved: savedResult.raw }
    };
  }

  async getPlaylistSongs({ id, neteaseId, limit = 0, offset = 0 } = {}) {
    const playlistId = String(neteaseId || id || "").replace(/^netease-playlist:/, "");
    if (!playlistId) return { ok: false, message: "Missing NetEase playlist id." };
    const targetLimit = Math.max(0, Number(limit) || 0);
    const songs = [];
    let currentOffset = Math.max(0, Number(offset) || 0);
    let raw = null;
    while (songs.length < (targetLimit || MAX_ACCOUNT_SONGS)) {
      const pageLimit = targetLimit ? Math.min(PAGE_SIZE, targetLimit - songs.length) : PAGE_SIZE;
      const result = await neteaseApi.playlist_track_all(this.withCookie({
        id: playlistId,
        limit: pageLimit,
        offset: currentOffset
      }));
      raw = result.body;
      const page = result.body?.songs || [];
      songs.push(...page);
      if (page.length < pageLimit) break;
      currentOffset += page.length;
    }
    return { ok: true, songs: songs.map(normalizeSong), total: songs.length, raw };
  }

  async getLikedPlaylist(profile) {
    const userId = profile?.userId;
    if (!userId) return null;
    let currentOffset = 0;
    while (currentOffset < MAX_ACCOUNT_PLAYLISTS) {
      const result = await neteaseApi.user_playlist_create(this.withCookie({
        uid: userId,
        limit: PAGE_SIZE,
        offset: currentOffset
      }));
      const page = playlistRows(result.body);
      const liked = page.find(isLikedPlaylist);
      if (liked) return normalizePlaylist(liked);
      if (page.length < PAGE_SIZE || result.body?.more === false) break;
      currentOffset += page.length;
    }
    return null;
  }

  async getLikedSongs() {
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const playlist = await this.getLikedPlaylist(auth.profile);
    if (!playlist) return { ok: true, songs: [], total: 0, ids: [], profile: auth.profile, playlist: null };
    const result = await this.getPlaylistSongs({ neteaseId: playlist.neteaseId });
    if (!result?.ok) return result;
    const songs = (result.songs || []).map(song => ({ ...song, liked: true }));
    return {
      ok: true,
      songs,
      total: result.total || songs.length,
      ids: songs.map(song => song.neteaseId).filter(Boolean),
      profile: auth.profile,
      playlist,
      raw: result.raw
    };
  }

  async getLikedSongIds() {
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const likedResult = await neteaseApi.likelist(this.withCookie({ uid: auth.profile.userId }));
    return { ok: true, ids: likedResult.body?.ids || [], profile: auth.profile };
  }

  async setSongLiked({ id, neteaseId, liked = true } = {}) {
    const songId = String(neteaseId || id || "").replace(/^netease:/, "");
    if (!songId) return { ok: false, message: "Missing NetEase song id." };
    const auth = await this.requireProfile();
    if (!auth.ok) return auth;
    const result = await neteaseApi.like(this.withCookie({ id: songId, like: liked ? "true" : "false" }));
    const code = result.body?.code;
    return { ok: code === 200 || code === 201, liked: Boolean(liked), raw: result.body };
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
    const fetchedAt = Date.now();
    const expiresIn = Number(urlData.expi || 0);
    const track = {
      ...normalizeSong(song),
      playUrl: urlData.url,
      duration: Number(urlData.time || 0) / 1000 || Number(song.dt || 0) / 1000 || 0,
      bitrate: urlData.br || 0,
      level: urlData.level || level,
      expiresIn,
      urlFetchedAt: fetchedAt,
      urlExpiresAt: expiresIn > 0 ? fetchedAt + expiresIn * 1000 : 0
    };
    return { ok: true, track, data: urlData };
  }
}
