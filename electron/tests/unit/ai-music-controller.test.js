import test from "node:test";
import assert from "node:assert/strict";
import { AiMusicController, musicMatchScore } from "../../services/music/ai-music-controller.js";

function song(id, title = `Song ${id}`) { return { id: `netease:${id}`, neteaseId: id, title, artist: "Singer", source: "netease" }; }
function playable(value) { return { ...value, playUrl: `https://music.example/${value.neteaseId}.mp3` }; }

test("NetEase exact metadata matches are ranked first", () => {
  assert.ok(musicMatchScore({ ...song(1, "Night"), artist: "Singer" }, "Night", "song") > musicMatchScore(song(2, "Night Drive"), "Night", "song"));
  assert.ok(musicMatchScore({ ...song(1, "Night"), artist: "Exact Singer", album: "Exact Album" }, "Night", "song", { artist: "Exact Singer", album: "Exact Album" }) > musicMatchScore({ ...song(2, "Night"), artist: "Other", album: "Other" }, "Night", "song", { artist: "Exact Singer", album: "Exact Album" }));
});

test("play now inserts a new song after current and preserves the remaining queue", async () => {
  const calls = [];
  const controller = new AiMusicController({ netease: { searchMedia: async () => ({ songs: [song(9, "Target")] }), playSong: async input => ({ ok: true, track: playable(song(input.neteaseId, "Target")) }) }, dispatch: async command => { calls.push(command); if (command.type === "get_state") return { queueTrackIds: ["netease:1", "netease:2", "netease:3"], currentTrackId: "netease:1", playing: true }; return command.patch; } });
  await controller.play({ query: "Target", type: "song", position: "now" });
  assert.deepEqual(calls.at(-1).patch.queueTrackIds, ["netease:1", "netease:9", "netease:2", "netease:3"]);
  assert.equal(calls.at(-1).patch.currentTrackId, "netease:9");
});

test("play now jumps an existing song without replacing the queue", async () => {
  const calls = [];
  const controller = new AiMusicController({ netease: { searchMedia: async () => ({ songs: [song(2, "Target")] }), playSong: async input => ({ ok: true, track: playable(song(input.neteaseId, "Target")) }) }, dispatch: async command => { calls.push(command); if (command.type === "get_state") return { queueTrackIds: ["netease:1", "netease:2", "netease:3"], currentTrackId: "netease:1", playing: true }; return command.patch; } });
  const result = await controller.play({ query: "Target", type: "song", position: "now" });
  assert.equal(result.action, "play_now");
  assert.deepEqual(calls.at(-1).patch.queueTrackIds, ["netease:1", "netease:2", "netease:3"]);
  assert.equal(calls.at(-1).patch.currentTrackId, "netease:2");
});

test("play next moves a duplicate after current and keeps current playback", async () => {
  const calls = [];
  const controller = new AiMusicController({ netease: { searchMedia: async () => ({ songs: [song(3, "Target")] }), playSong: async input => ({ ok: true, track: playable(song(input.neteaseId, "Target")) }) }, dispatch: async command => { calls.push(command); if (command.type === "get_state") return { queueTrackIds: ["netease:1", "netease:2", "netease:3"], currentTrackId: "netease:1", playing: true }; return command.patch; } });
  await controller.play({ query: "Target", type: "song", position: "next" });
  assert.deepEqual(calls.at(-1).patch.queueTrackIds, ["netease:1", "netease:3", "netease:2"]);
  assert.equal(calls.at(-1).patch.currentTrackId, "netease:1");
});

test("albums replace the queue in source order and skip unavailable tracks", async () => {
  const calls = [];
  const controller = new AiMusicController({ netease: { searchMedia: async () => ({ albums: [{ id: "netease-album:8", neteaseId: 8, name: "Album", source: "netease" }] }), getAlbumSongs: async () => ({ songs: [song(1), song(2), song(3)] }), playSong: async input => input.neteaseId === 2 ? ({ ok: false }) : ({ ok: true, track: playable(song(input.neteaseId)) }) }, dispatch: async command => { calls.push(command); return command.patch || {}; } });
  const result = await controller.play({ query: "Album", type: "album" });
  assert.equal(result.skipped, 1);
  assert.deepEqual(calls.at(-1).patch.queueTrackIds, ["netease:1", "netease:3"]);
  assert.equal(calls.at(-1).patch.playing, true);
});

test("relative volume uses a fixed ten-point step", async () => {
  let command;
  const controller = new AiMusicController({ netease: {}, dispatch: async value => { command = value; return { volume: 60 }; } });
  await controller.volume({ mode: "relative", value: -1 });
  assert.deepEqual(command, { type: "volume", relative: -10 });
});

test("queue operations list, remove the current track continuously, and clear directly", async () => {
  const calls = [];
  let state = { tracks: [song(1), song(2), song(3)], queueTrackIds: ["netease:1", "netease:2", "netease:3"], currentTrackId: "netease:2", playing: true };
  const controller = new AiMusicController({ netease: {}, dispatch: async command => {
    calls.push(command);
    if (command.type === "get_state") return state;
    state = { ...state, ...command.patch };
    return state;
  } });

  const listed = await controller.queue({ action: "list" });
  assert.deepEqual(listed.tracks.map(track => track.id), ["netease:1", "netease:2", "netease:3"]);
  const removed = await controller.queue({ action: "remove", trackId: "netease:2" });
  assert.equal(removed.action, "queue_removed");
  assert.deepEqual(calls.at(-1).patch, { queueTrackIds: ["netease:1", "netease:3"], currentTrackId: "netease:3", playing: true });
  const cleared = await controller.queue({ action: "clear" });
  assert.equal(cleared.removed, 2);
  assert.deepEqual(calls.at(-1).patch, { queueTrackIds: [], currentTrackId: null, playing: false });
});
