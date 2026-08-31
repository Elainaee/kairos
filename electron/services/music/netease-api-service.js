import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { SettingsRepository } from "../../data/settings/index.js";
import { normalizeNeteaseMediaUrl, resolveNeteaseUrl } from "./netease-url-resolver.js";

const require = createRequire(import.meta.url);
const previousDotenvQuiet = process.env.DOTENV_CONFIG_QUIET;
process.env.DOTENV_CONFIG_QUIET = "true";
const neteaseApi = require("@neteasecloudmusicapienhanced/api");
const neteaseRequest = require("@neteasecloudmusicapienhanced/api/util/request");
const legacyPlaybackApi = require("NeteaseCloudMusicApi");
if (previousDotenvQuiet === undefined) delete process.env.DOTENV_CONFIG_QUIET;
else process.env.DOTENV_CONFIG_QUIET = previousDotenvQuiet;

const DEFAULT_LEVEL = "standard";
const PAGE_SIZE = 200;
const MAX_ACCOUNT_SONGS = 5000;
const MAX_ACCOUNT_PLAYLISTS = 500;
const DOWNLOAD_LEVELS = new Set(["standard", "lossless", "hires"]);
const PLAYLIST_SUBSCRIPTION_COOLDOWN_MS = 60_000;
const PLAYLIST_SUBSCRIPTION_RATE_LIMIT_CODES = new Set([405, 406]);
const fallbackTranslate = (_key, _params = {}, fallback = "") => fallback;

function translate(translateFn, key, fallback, params = {}) {
  return translateFn(key, params, fallback);
}

function normalizeImageUrl(value) {
  const url = String(value || "");
  return /^http:\/\/p\d+\.music\.126\.net\//i.test(url) ? url.replace(/^http:/i, "https:") : url;
}

export function normalizeNeteaseProfile(value = {}) {
  const account = value?.account || {};
  const userId = Number(value?.userId || account.id || value?.id || 0);
  if (!Number.isFinite(userId) || userId <= 0) return null;
  return {
    userId,
    nickname: String(value?.nickname || value?.name || account.userName || account.nickname || "").trim(),
    avatarUrl: normalizeImageUrl(value?.avatarUrl || value?.avatar || account.avatarUrl || "")
  };
}

function profileFromResponse(result = {}) {
  const body = result?.body || {};
  return normalizeNeteaseProfile(body.data?.profile || body.profile || body.account?.profile || null)
    || normalizeNeteaseProfile(body.data || body);
}

function accountIdFromResponse(result = {}) {
  const body = result?.body || {};
  return Number(body.data?.account?.id || body.account?.id || body.data?.profile?.userId || body.profile?.userId || 0);
}

function sessionCookieFromResult(result = {}) {
  const cookie = result?.body?.cookie || result?.cookie || "";
  if (Array.isArray(cookie)) return cookie.filter(Boolean).join(";");
  return String(cookie || "").trim();
}

function artistsText(song) {
  const artists = song?.ar || song?.artists || [];
  return Array.isArray(artists) ? artists.map(item => item?.name).filter(Boolean).join(" / ") : "";
}

function normalizeSong(song = {}, translateFn = fallbackTranslate) {
  const album = song.al || song.album || {};
  return {
    id: `netease:${song.id}`,
    neteaseId: song.id,
    title: song.name || translate(translateFn, "music.neteaseSong", "NetEase song"),
    artist: artistsText(song) || translate(translateFn, "music.neteaseCloud", "NetEase Cloud"),
    album: album.name || "",
    coverUrl: normalizeImageUrl(album.picUrl || album.coverImgUrl),
    duration: Number(song.dt || song.duration || 0) / 1000 || 0,
    source: "netease"
  };
}

function normalizePlaylist(playlist = {}, patch = {}, translateFn = fallbackTranslate) {
  return {
    id: `netease-playlist:${playlist.id}`,
    neteaseId: playlist.id,
    name: playlist.name || translate(translateFn, "music.neteasePlaylist", "NetEase playlist"),
    coverUrl: normalizeImageUrl(playlist.coverImgUrl || playlist.picUrl),
    trackCount: playlist.trackCount || 0,
    playCount: playlist.playCount || 0,
    creator: playlist.creator?.nickname || "",
    creatorId: playlist.creator?.userId || playlist.userId || 0,
    subscribed: Boolean(playlist.subscribed || patch.subscribed),
    owned: Boolean(patch.owned)
  };
}

function playlistSubscribedState(body = {}) {
  const source = body.data && typeof body.data === "object" ? body.data : body;
  return source.subscribed === true
    || source.isSubscribed === true
    || source.subscribedPlaylist === true
    || source.playlist?.subscribed === true
    || source.data?.subscribed === true;
}

function isSuccessCode(code) {
  return Number(code) === 200 || Number(code) === 201;
}

function subscriptionResult(result, subscribed, translateFn = fallbackTranslate) {
  const body = result?.body || {};
  const code = body.code || result?.status || 0;
  const rateLimited = PLAYLIST_SUBSCRIPTION_RATE_LIMIT_CODES.has(Number(code));
  return {
    ok: isSuccessCode(code),
    code,
    subscribed: Boolean(subscribed),
    message: rateLimited
      ? translate(translateFn, "music.neteaseActionRateLimited", "NetEase says this action was attempted too frequently. Please wait and try again.")
      : body.message || body.msg || "",
    retryAfter: rateLimited ? PLAYLIST_SUBSCRIPTION_COOLDOWN_MS : 0,
    raw: body
  };
}

function normalizeAlbum(album = {}, translateFn = fallbackTranslate) {
  return {
    id: `netease-album:${album.id}`,
    neteaseId: album.id,
    name: album.name || translate(translateFn, "music.neteaseAlbum", "NetEase album"),
    artist: album.artist?.name || (album.artists || []).map(item => item?.name).filter(Boolean).join(" / "),
    coverUrl: normalizeImageUrl(album.picUrl || album.blurPicUrl),
    trackCount: album.size || album.trackCount || 0,
    source: "netease"
  };
}

function normalizeArtist(artist = {}, translateFn = fallbackTranslate) {
  return {
    id: `netease-artist:${artist.id}`,
    neteaseId: artist.id,
    name: artist.name || translate(translateFn, "music.neteaseArtist", "NetEase artist"),
    aliases: Array.isArray(artist.alias) ? artist.alias : [],
    coverUrl: normalizeImageUrl(artist.picUrl || artist.img1v1Url),
    albumCount: artist.albumSize || 0,
    source: "netease"
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

function readableNeteaseMessage(code, fallback = "", translateFn = fallbackTranslate) {
  if (Number(code) === 405) return translate(translateFn, "music.neteaseActionRateLimited", "NetEase says this action was attempted too frequently. Please wait and try again.");
  if (Number(code) === 406) return translate(translateFn, "music.neteaseLoginRateLimited", "Too many NetEase login requests. Please wait and try again.");
  if (Number(code) === 10004 || Number(code) === 10003) return translate(translateFn, "music.neteaseLoginSecurityBlocked", "NetEase blocked this login for account security. Please complete security verification or try again later.");
  return fallback || translate(translateFn, "music.neteaseRequestFailed", "NetEase request failed.");
}

export function normalizeNeteaseDownloadQuality(value) {
  return DOWNLOAD_LEVELS.has(String(value || "").toLowerCase()) ? String(value).toLowerCase() : "standard";
}

export function neteaseDownloadQualityCandidates(value) {
  const quality = normalizeNeteaseDownloadQuality(value);
  if (quality === "hires") return ["hires", "lossless", "standard"];
  if (quality === "lossless") return ["lossless", "standard"];
  return ["standard"];
}

export function readableNeteasePlaybackMessage(data = {}, fallback = "", translateFn = fallbackTranslate) {
  const code = Number(data.code || 0);
  const fee = Number(data.fee ?? -1);
  if (data.freeTrialInfo) return translate(translateFn, "music.neteaseTrialPreview", "This song is only available as a NetEase trial preview.");
  if (fee === 1 || fee === 4) return translate(translateFn, "music.neteaseMembershipRequired", "This song requires NetEase membership or purchase.");
  if (data.payed === 0 && fee > 0) return translate(translateFn, "music.neteaseRightsRestricted", "This song is restricted by NetEase rights.");
  if (code === 404 || code === -110) return translate(translateFn, "music.neteaseNoPlayableUrl", "NetEase cannot provide a playable URL for this song.");
  return data.message || data.msg || fallback || translate(translateFn, "music.neteaseSongUnavailable", "This song is unavailable on NetEase.");
}

async function withSuppressedNeteaseErrors(task) {
  const originalLog = console.log;
  console.log = (...args) => {
    if (args[0] === "[ERR]") return;
    originalLog(...args);
  };
  try {
    return await task();
  } finally {
    console.log = originalLog;
  }
}

function neteaseFailure(error, fallback, translateFn = fallbackTranslate) {
  const body = error?.body || {};
  const code = body.code || error?.status || 0;
  const message = readableNeteaseMessage(code, body.message || body.msg || error?.message || fallback, translateFn);
  return {
    ok: false,
    code,
    message,
    redirectUrl: body.redirectUrl || "",
    needsVerification: Number(code) === 10004 || Number(code) === 10003,
    retryAfter: PLAYLIST_SUBSCRIPTION_RATE_LIMIT_CODES.has(Number(code)) ? PLAYLIST_SUBSCRIPTION_COOLDOWN_MS : 0,
    raw: body
  };
}

export class NeteaseApiService {
  constructor({ statePath, database, t, downloadUrlResolver = resolveNeteaseUrl, apiClient = neteaseApi, requestClient = neteaseRequest, playbackApi = legacyPlaybackApi, now = Date.now } = {}) {
    this.statePath = statePath;
    this.database = database || null;
    this.t = typeof t === "function" ? t : fallbackTranslate;
    this.downloadUrlResolver = downloadUrlResolver;
    this.api = apiClient;
    this.request = requestClient;
    this.playbackApi = playbackApi;
    this.now = typeof now === "function" ? now : Date.now;
    this.stateRepository = statePath ? new SettingsRepository({
      filePath: statePath,
      defaults: { cookie: "", profile: null },
      normalize: value => ({ cookie: String(value?.cookie || ""), profile: normalizeNeteaseProfile(value?.profile) }),
      database: this.database,
      storeKey: "netease-api-state",
      summarize: value => ({ loggedIn: Boolean(value.cookie), userId: value.profile?.userId || null })
    }) : null;
    this.cookie = "";
    this.profile = null;
    this.loginKey = "";
    this.playlistSubscriptionRequests = new Map();
    this.playlistSubscriptionCooldownUntil = 0;
  }

  message(key, fallback, params = {}) {
    return translate(this.t, key, fallback, params);
  }

  async initialize() {
    if (!this.stateRepository) return;
    const state = await this.stateRepository.read();
    this.cookie = state.cookie;
    this.profile = state.profile;
  }

  async save() {
    if (!this.stateRepository) return;
    await this.stateRepository.write({ cookie: this.cookie, profile: this.profile });
  }

  readDatabaseSnapshot() {
    return this.stateRepository?.readSnapshot() || null;
  }

  withCookie(input = {}) {
    return this.cookie ? { ...input, cookie: this.cookie } : input;
  }

  async getStatus() {
    if (!this.cookie) return publicStatus("");
    let profile = null;
    let accountId = 0;
    try {
      const result = await neteaseApi.login_status(this.withCookie({}));
      profile = profileFromResponse(result);
      accountId = accountIdFromResponse(result);
    } catch {}
    if (!profile) {
      try {
        const result = await neteaseApi.user_account(this.withCookie({}));
        profile = profileFromResponse(result);
        accountId ||= accountIdFromResponse(result);
      } catch {}
    }
    if (!profile && accountId > 0) {
      try {
        profile = profileFromResponse(await neteaseApi.user_detail(this.withCookie({ uid: accountId })));
      } catch {}
    }
    if (profile) {
      this.profile = profile;
      await this.save();
      return { ...publicStatus(this.cookie), loggedIn: true, profile, sessionVerified: true };
    }
    if (this.profile?.userId) {
      return { ...publicStatus(this.cookie), loggedIn: true, profile: this.profile, sessionVerified: false };
    }
    return { ...publicStatus(this.cookie), loggedIn: false, profile: null };
  }

  async requireProfile() {
    const status = await this.getStatus();
    if (!status.loggedIn || !status.profile?.userId) {
      return { ok: false, message: this.message("music.neteaseLoginRequired", "Please login to NetEase Cloud first.") };
    }
    return { ok: true, profile: status.profile };
  }

  async startLogin() {
    try {
      const keyResult = await withSuppressedNeteaseErrors(() => neteaseApi.login_qr_key({}));
      const key = keyResult.body?.data?.unikey;
      if (!key) return { ok: false, message: this.message("music.unableToCreateNeteaseQrKey", "Unable to create NetEase QR login key.") };
      this.loginKey = key;
      const qrResult = await withSuppressedNeteaseErrors(() => neteaseApi.login_qr_create({ key, qrimg: true }));
      return {
        ok: true,
        key,
        qrUrl: qrResult.body?.data?.qrurl || "",
        qrImg: qrResult.body?.data?.qrimg || ""
      };
    } catch (error) {
      return neteaseFailure(error, this.message("music.unableToCreateNeteaseQrKey", "Unable to create NetEase QR login key."), this.t);
    }
  }

  async loginCheck({ key } = {}) {
    const targetKey = key || this.loginKey;
    if (!targetKey) return { ok: false, code: 0, message: this.message("music.noNeteaseQrLogin", "No QR login in progress.") };
    const result = await neteaseApi.login_qr_check({ key: targetKey });
    const body = result.body || {};
    const cookie = sessionCookieFromResult(result);
    if (Number(body.code) === 803 && cookie) {
      this.cookie = cookie;
      this.profile = normalizeNeteaseProfile(body.profile) || this.profile;
      await this.save();
      const status = await this.getStatus().catch(() => null);
      return { ok: true, ...body, loggedIn: Boolean(status?.loggedIn), profile: status?.profile || this.profile || null };
    }
    if (Number(body.code) === 803) {
      return { ok: false, ...body, loggedIn: false, message: this.message("music.neteaseQrCheckFailed", "Unable to check login status.") };
    }
    return { ok: true, ...body, loggedIn: false };
  }

  async sendCaptcha({ phone, countrycode = "86" } = {}) {
    const targetPhone = String(phone || "").trim();
    if (!targetPhone) return { ok: false, message: this.message("music.missingPhoneNumber", "Missing phone number.") };
    try {
      const result = await withSuppressedNeteaseErrors(() => neteaseApi.captcha_sent({ phone: targetPhone, ctcode: String(countrycode || "86").trim() || "86" }));
      const body = result.body || {};
      return { ok: body.code === 200, code: body.code, message: body.message || body.msg || "", raw: body };
    } catch (error) {
      return neteaseFailure(error, this.message("music.unableToSendVerificationCode", "Unable to send verification code."), this.t);
    }
  }

  async loginWithPhone({ phone, captcha, countrycode = "86" } = {}) {
    const targetPhone = String(phone || "").trim();
    const targetCaptcha = String(captcha || "").trim();
    if (!targetPhone) return { ok: false, message: this.message("music.missingPhoneNumber", "Missing phone number.") };
    if (!targetCaptcha) return { ok: false, message: this.message("music.missingVerificationCode", "Missing verification code.") };
    try {
      const result = await withSuppressedNeteaseErrors(() => neteaseApi.login_cellphone({
        phone: targetPhone,
        captcha: targetCaptcha,
        countrycode: String(countrycode || "86").trim() || "86"
      }));
      const body = result.body || {};
      if (Number(body.code) === 200 && body.cookie) {
        this.cookie = body.cookie;
        this.profile = normalizeNeteaseProfile(body.profile || body) || this.profile;
        await this.save();
        const status = await this.getStatus().catch(() => null);
        return { ok: true, loggedIn: Boolean(status?.loggedIn), profile: status?.profile || this.profile || null, raw: body };
      }
      return {
        ok: false,
        code: body.code || 0,
        message: readableNeteaseMessage(body.code, body.message || body.msg || this.message("music.neteasePhoneLoginFailed", "Phone login failed."), this.t),
        redirectUrl: body.redirectUrl || "",
        needsVerification: Number(body.code) === 10004 || Number(body.code) === 10003,
        raw: body
      };
    } catch (error) {
      return neteaseFailure(error, this.message("music.neteasePhoneLoginFailed", "Phone login failed."), this.t);
    }
  }

  async logout() {
    if (this.cookie) {
      await neteaseApi.logout(this.withCookie({})).catch(() => {});
    }
    this.cookie = "";
    this.profile = null;
    this.loginKey = "";
    await this.save();
    return { ok: true, ...publicStatus("") };
  }

  async searchSongs({ keyword, limit = 30, offset = 0 } = {}) {
    const result = await neteaseApi.cloudsearch(this.withCookie({
      keywords: String(keyword || ""),
      type: 1,
      limit,
      offset
    }));
    const songs = result.body?.result?.songs || [];
    return { ok: true, songs: songs.map(song => normalizeSong(song, this.t)), raw: result.body };
  }

  async getSearchHome({ songLimit = 10, playlistLimit = 8 } = {}) {
    const [songsResult, playlistsResult] = await Promise.all([
      neteaseApi.recommend_songs(this.withCookie({})).catch(error => ({ error })),
      neteaseApi.personalized(this.withCookie({ limit: Math.max(1, Number(playlistLimit) || 8) })).catch(error => ({ error }))
    ]);
    const songBody = songsResult.body || {};
    const playlistBody = playlistsResult.body || {};
    const dailySongs = songBody.data?.dailySongs || songBody.recommend || songBody.songs || [];
    const playlists = playlistBody.result || playlistBody.playlists || [];
    return {
      ok: true,
      dailySongs: dailySongs.slice(0, Math.max(1, Number(songLimit) || 10)).map(song => normalizeSong(song, this.t)),
      hotPlaylists: playlists.slice(0, Math.max(1, Number(playlistLimit) || 8)).map(playlist => normalizePlaylist(playlist, {}, this.t)),
      raw: {
        daily: songsResult.error ? { error: readableNeteaseMessage(songsResult.error?.body?.code, songsResult.error?.message, this.t) } : songBody,
        playlists: playlistsResult.error ? { error: readableNeteaseMessage(playlistsResult.error?.body?.code, playlistsResult.error?.message, this.t) } : playlistBody
      }
    };
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
    const createdPlaylists = createdResult.playlists.filter(playlist => !isLikedPlaylist(playlist)).map(playlist => normalizePlaylist(playlist, { owned: true }, this.t));
    const savedPlaylists = savedResult.playlists.filter(playlist => !isLikedPlaylist(playlist)).map(playlist => normalizePlaylist(playlist, { subscribed: true }, this.t));
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
    if (!playlistId) return { ok: false, message: this.message("music.missingNeteasePlaylistId", "Missing NetEase playlist id.") };
    const targetLimit = Math.max(0, Number(limit) || 0);
    const songs = [];
    let currentOffset = Math.max(0, Number(offset) || 0);
    let raw = null;
    const detailResult = await neteaseApi.playlist_detail_dynamic(this.withCookie({ id: playlistId })).catch(() => null);
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
    return {
      ok: true,
      songs: songs.map(song => normalizeSong(song, this.t)),
      total: songs.length,
      playlist: detailResult?.body ? normalizePlaylist({ id: playlistId }, { subscribed: playlistSubscribedState(detailResult.body) }, this.t) : null,
      subscribed: playlistSubscribedState(detailResult?.body || {}),
      raw: { tracks: raw, detail: detailResult?.body || null }
    };
  }

  async setPlaylistSubscribed({ id, neteaseId, subscribed = true } = {}) {
    const playlistId = String(neteaseId || id || "").replace(/^netease-playlist:/, "");
    if (!playlistId) return { ok: false, message: this.message("music.missingNeteasePlaylistId", "Missing NetEase playlist id.") };
    const targetSubscribed = Boolean(subscribed);
    const existing = this.playlistSubscriptionRequests.get(playlistId);
    if (existing?.subscribed === targetSubscribed) return existing.promise;
    if (existing) {
      return {
        ok: false,
        code: "playlist_subscription_in_progress",
        subscribed: !targetSubscribed,
        message: this.message("music.playlistUpdateInProgress", "This playlist is already being updated. Please wait.")
      };
    }
    const retryAfter = Math.max(0, this.playlistSubscriptionCooldownUntil - this.now());
    if (retryAfter > 0) {
      return {
        ok: false,
        code: 405,
        subscribed: !targetSubscribed,
        message: this.message("music.neteaseActionRateLimited", "NetEase says this action was attempted too frequently. Please wait and try again."),
        retryAfter
      };
    }

    const request = (async () => {
      const auth = await this.requireProfile();
      if (!auth.ok) return auth;
      try {
        const action = targetSubscribed ? "subscribe" : "unsubscribe";
        const result = await withSuppressedNeteaseErrors(() => this.request(
          `/api/playlist/${action}`,
          { id: playlistId },
          { crypto: "weapi", cookie: this.cookie }
        ));
        const parsed = subscriptionResult(result, targetSubscribed, this.t);
        if (parsed.retryAfter) this.playlistSubscriptionCooldownUntil = this.now() + parsed.retryAfter;
        return parsed;
      } catch (error) {
        const failure = neteaseFailure(error, this.message("music.unableToUpdatePlaylistCollection", "Unable to update playlist collection."), this.t);
        if (PLAYLIST_SUBSCRIPTION_RATE_LIMIT_CODES.has(Number(failure.code))) {
          failure.message = this.message("music.neteaseActionRateLimited", "NetEase says this action was attempted too frequently. Please wait and try again.");
          failure.retryAfter = PLAYLIST_SUBSCRIPTION_COOLDOWN_MS;
          failure.subscribed = !targetSubscribed;
          this.playlistSubscriptionCooldownUntil = this.now() + PLAYLIST_SUBSCRIPTION_COOLDOWN_MS;
        }
        return failure;
      }
    })();
    this.playlistSubscriptionRequests.set(playlistId, { subscribed: targetSubscribed, promise: request });
    try {
      return await request;
    } finally {
      if (this.playlistSubscriptionRequests.get(playlistId)?.promise === request) {
        this.playlistSubscriptionRequests.delete(playlistId);
      }
    }
  }

  async searchMedia({ keyword, type = "all", limit = 10, offset = 0 } = {}) {
    const query = String(keyword || "").trim();
    const types = type === "all" ? ["song", "playlist", "album", "artist"] : [type];
    const typeIds = { song: 1, album: 10, artist: 100, playlist: 1000 };
    const searches = await Promise.all(types.map(async kind => {
      if (!typeIds[kind]) return [kind, []];
      const result = await this.api.cloudsearch(this.withCookie({ keywords: query, type: typeIds[kind], limit, offset }));
      const body = result.body?.result || {};
      const rows = kind === "song" ? body.songs || [] : kind === "playlist" ? body.playlists || [] : kind === "album" ? body.albums || [] : body.artists || [];
      const normalize = kind === "song" ? item => normalizeSong(item, this.t) : kind === "playlist" ? item => normalizePlaylist(item, {}, this.t) : kind === "album" ? item => normalizeAlbum(item, this.t) : item => normalizeArtist(item, this.t);
      return [kind, rows.map(normalize)];
    }));
    const result = Object.fromEntries(searches.map(([kind, rows]) => [`${kind}s`, rows]));
    return { ok: true, songs: [], playlists: [], albums: [], artists: [], ...result };
  }

  async getAlbumSongs({ id, neteaseId } = {}) {
    const albumId = String(neteaseId || id || "").replace(/^netease-album:/, "");
    if (!albumId) return { ok: false, message: this.message("music.missingNeteaseAlbumId", "Missing NetEase album id.") };
    const result = await this.api.album(this.withCookie({ id: albumId }));
    const album = result.body?.album || { id: albumId };
    return { ok: true, album: normalizeAlbum(album, this.t), songs: (result.body?.songs || []).map(song => normalizeSong(song, this.t)) };
  }

  async getArtistHotSongs({ id, neteaseId, limit = 20 } = {}) {
    const artistId = String(neteaseId || id || "").replace(/^netease-artist:/, "");
    if (!artistId) return { ok: false, message: this.message("music.missingNeteaseArtistId", "Missing NetEase artist id.") };
    const result = await this.api.artist_top_song(this.withCookie({ id: artistId }));
    const songs = result.body?.songs || result.body?.hotSongs || [];
    return { ok: true, artistId, songs: songs.slice(0, Math.max(1, Math.min(20, Number(limit) || 20))).map(song => normalizeSong(song, this.t)) };
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
      if (liked) return normalizePlaylist(liked, {}, this.t);
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
    if (!songId) return { ok: false, message: this.message("music.missingNeteaseSongId", "Missing NetEase song id.") };
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
      songs: rows.map(row => ({ ...normalizeSong(row.song, this.t), playCount: row.playCount || row.score || 0 })),
      profile: auth.profile
    };
  }

  async playSong({ id, neteaseId, level = DEFAULT_LEVEL } = {}) {
    const songId = String(neteaseId || id || "").replace(/^netease:/, "");
    if (!songId) return { ok: false, message: this.message("music.missingNeteaseSongId", "Missing NetEase song id.") };
    try {
      const [detailResult, urlResult] = await Promise.all([
        this.playbackApi.song_detail(this.withCookie({ ids: songId })),
        this.playbackApi.song_url_v1(this.withCookie({ id: songId, level }))
      ]);
      const song = detailResult.body?.songs?.[0] || { id: Number(songId) || songId };
      const urlData = urlResult.body?.data?.[0] || {};
      if (!urlData.url) {
        return { ok: false, message: readableNeteasePlaybackMessage(urlData, this.message("music.neteaseNoPlayableUrlReturned", "No playable URL returned for this song."), this.t), data: urlData };
      }
      const fetchedAt = Date.now();
      const expiresIn = Number(urlData.expi || 0);
      const track = {
        ...normalizeSong(song, this.t),
        playUrl: urlData.url,
        duration: Number(urlData.time || 0) / 1000 || Number(song.dt || 0) / 1000 || 0,
        bitrate: urlData.br || 0,
        level: urlData.level || level,
        expiresIn,
        urlFetchedAt: fetchedAt,
        urlExpiresAt: expiresIn > 0 ? fetchedAt + expiresIn * 1000 : 0
      };
      return { ok: true, track, data: urlData };
    } catch (error) {
      return neteaseFailure(error, this.message("music.unableToLoadPlayableNeteaseUrl", "Unable to load playable NetEase URL."), this.t);
    }
  }

  /**
   * Resolves one authenticated, full-length download candidate.  This stays
   * intentionally main-process only: callers receive neither the stored
   * session cookie nor the raw upstream response.
   */
  async resolveDownloadSource({ id, neteaseId, quality = "standard" } = {}) {
    const songId = String(neteaseId || id || "").replace(/^netease:/, "");
    if (!songId) return { ok: false, reason: "missing_song_id", message: this.message("music.missingNeteaseSongId", "Missing NetEase song id.") };
    const auth = await this.requireProfile().catch(error => ({ ok: false, message: error?.message || this.message("music.neteaseLoginRequired", "Please login to NetEase Cloud first.") }));
    if (!auth.ok) return { ok: false, reason: "login_required", message: auth.message || this.message("music.neteaseLoginRequired", "Please login to NetEase Cloud first.") };
    const requestedQuality = normalizeNeteaseDownloadQuality(quality);
    try {
      const [detailResult, urlResult] = await Promise.all([
        neteaseApi.song_detail(this.withCookie({ ids: songId })),
        this.downloadUrlResolver({ songId, quality: requestedQuality, cookie: this.cookie })
      ]);
      const song = detailResult.body?.songs?.[0] || null;
      const data = urlResult?.data?.[0] || {};
      if (!song || !data.url || data.freeTrialInfo) {
        return {
          ok: false,
          reason: data.freeTrialInfo ? "trial_preview" : "unavailable",
          message: readableNeteasePlaybackMessage(data, this.message("music.neteaseNoPlayableUrlReturned", "No playable URL returned for this song."), this.t)
        };
      }
      const source = normalizeNeteaseMediaUrl(data.url);
      if (!source) {
        return { ok: false, reason: "unsafe_download_url", message: this.message("music.neteaseDownloadUnavailable", "This song cannot be downloaded by Kairos.") };
      }
      const normalized = normalizeSong(song, this.t);
      return {
        ok: true,
        source: {
          neteaseId: String(songId),
          title: normalized.title,
          artist: normalized.artist,
          album: normalized.album,
          duration: normalized.duration,
          coverUrl: normalized.coverUrl,
          audioUrl: source.href,
          requestedQuality,
          // Keep the actual upstream level (for example `exhigh`) intact for
          // audit and download fallback reporting. Only the requested UI
          // quality is constrained to Kairos's three supported choices.
          resolvedQuality: String(data.level || requestedQuality).toLowerCase(),
          bitrate: Number(data.br || 0),
          size: Math.max(0, Number(data.size || 0)),
          format: String(data.type || "").toLowerCase(),
          expiresAt: Number(data.expi || 0) > 0 ? Date.now() + Number(data.expi) * 1000 : 0
        }
      };
    } catch (error) {
      const failure = neteaseFailure(error, this.message("music.neteaseDownloadUnavailable", "This song cannot be downloaded by Kairos."), this.t);
      return { ...failure, reason: "upstream_failure" };
    }
  }
}
