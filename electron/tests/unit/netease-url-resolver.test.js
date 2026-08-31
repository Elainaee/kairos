import test from "node:test";
import assert from "node:assert/strict";
import { normalizeNeteaseMediaUrl, resolveNeteaseUrl } from "../../services/music/netease-url-resolver.js";

test("NetEase media URLs keep the CDN allowlist and upgrade upstream HTTP links", () => {
  assert.equal(normalizeNeteaseMediaUrl("http://m801.music.126.net/song.mp3")?.href, "https://m801.music.126.net/song.mp3");
  assert.equal(normalizeNeteaseMediaUrl("https://m10.music.126.net/song.flac")?.href, "https://m10.music.126.net/song.flac");
  assert.equal(normalizeNeteaseMediaUrl("http://example.test/song.mp3"), null);
  assert.equal(normalizeNeteaseMediaUrl("ftp://m801.music.126.net/song.mp3"), null);
});

test("Netease_url resolver sends the encrypted EAPI request with the authenticated desktop cookie", async () => {
  let request = null;
  const result = await resolveNeteaseUrl({
    songId: "185668",
    quality: "lossless",
    cookie: "MUSIC_U=session-token; os=pc",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response(JSON.stringify({ code: 200, data: [{ url: "https://m10.music.126.net/song.flac", level: "lossless" }] }), {
        headers: { "content-type": "application/json" }
      });
    }
  });

  assert.equal(request.url, "https://interface3.music.163.com/eapi/song/enhance/player/url/v1");
  assert.equal(request.init.method, "POST");
  assert.match(request.init.headers.cookie, /MUSIC_U=session-token/);
  assert.match(request.init.headers.cookie, /os=pc/);
  const params = new URLSearchParams(request.init.body).get("params");
  assert.match(params, /^[a-f0-9]+$/i, "EAPI params must be AES-encrypted hexadecimal");
  assert.equal(result.data[0].level, "lossless");
});

test("Netease_url resolver rejects an invalid song id before issuing a request", async () => {
  let called = false;
  await assert.rejects(resolveNeteaseUrl({
    songId: "not-a-song",
    fetchImpl: async () => { called = true; return new Response(); }
  }), /download_song_ids_required/);
  assert.equal(called, false);
});
