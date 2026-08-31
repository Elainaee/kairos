import crypto from "node:crypto";

const EAPI_ENDPOINT = "https://interface3.music.163.com/eapi/song/enhance/player/url/v1";
const EAPI_PATH = "/api/song/enhance/player/url/v1";
const EAPI_KEY = Buffer.from("e82ckenh8dichen8", "utf8");
const EAPI_SALT = "36cd479b6b5";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Safari/537.36 Chrome/91.0.4472.164 NeteaseMusicDesktop/2.10.2.200154";
const NETEASE_MEDIA_HOST = /(?:^|\.)music\.126\.net$|(?:^|\.)music\.163\.com$/i;

/**
 * Netease_url can return HTTP CDN links even though the same trusted CDN
 * resource is available over HTTPS. Keep Kairos's host allowlist and upgrade
 * those links before they are fetched instead of rejecting valid songs.
 */
export function normalizeNeteaseMediaUrl(value) {
  try {
    const url = new URL(String(value || ""));
    if (!NETEASE_MEDIA_HOST.test(url.hostname) || !["http:", "https:"].includes(url.protocol)) return null;
    if (url.protocol === "http:") url.protocol = "https:";
    return url;
  } catch {
    return null;
  }
}

function cookieHeader(cookie) {
  const values = new Map([
    ["os", "pc"],
    ["appver", ""],
    ["osver", ""],
    ["deviceId", "pyncm!"]
  ]);
  String(cookie || "").split(";").forEach(part => {
    const index = part.indexOf("=");
    if (index <= 0) return;
    values.set(part.slice(0, index).trim(), part.slice(index + 1).trim());
  });
  return [...values].map(([key, value]) => `${key}=${value}`).join("; ");
}

function encryptEapiPayload(payload) {
  const payloadJson = JSON.stringify(payload);
  const digest = crypto.createHash("md5").update(`nobody${EAPI_PATH}use${payloadJson}md5forencrypt`, "utf8").digest("hex");
  const plaintext = `${EAPI_PATH}-${EAPI_SALT}-${payloadJson}-${EAPI_SALT}-${digest}`;
  const cipher = crypto.createCipheriv("aes-128-ecb", EAPI_KEY, null);
  cipher.setAutoPadding(true);
  return Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]).toString("hex");
}

/**
 * Resolve an authenticated NetEase audio URL through the EAPI request flow
 * used by Suxiaoqinx/Netease_url (MIT, commit 6428a441767e3517e84b6834095cd0b23225d599).
 * Raw cookies and resolved URLs remain in Electron's main process.
 */
export async function resolveNeteaseUrl({ songId, quality, cookie, fetchImpl = globalThis.fetch } = {}) {
  const id = String(songId || "").replace(/^netease:/, "");
  if (!/^\d{1,20}$/.test(id)) throw new Error("download_song_ids_required");
  const payload = {
    ids: [Number(id)],
    level: String(quality || "standard"),
    encodeType: "flac",
    header: JSON.stringify({
      os: "pc",
      appver: "",
      osver: "",
      deviceId: "pyncm!",
      requestId: String(Math.floor(20_000_000 + Math.random() * 10_000_000))
    })
  };
  const response = await fetchImpl(EAPI_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "user-agent": USER_AGENT,
      referer: "https://music.163.com/",
      cookie: cookieHeader(cookie)
    },
    body: new URLSearchParams({ params: encryptEapiPayload(payload) }).toString()
  });
  if (!response.ok) throw new Error(`download_resolver_http_${response.status}`);
  const body = await response.json().catch(() => null);
  if (!body || Number(body.code) !== 200) throw new Error(`download_resolver_response_${Number(body?.code) || "invalid"}`);
  return body;
}
