import test from "node:test";
import assert from "node:assert/strict";
import { NeteaseApiService } from "../../services/music/netease-api-service.js";

test("NetEase AI catalog searches every supported media type and normalizes results", async () => {
  const calls = [];
  const apiClient = {
    async cloudsearch(input) {
      calls.push(input);
      const resultByType = {
        1: { songs: [{ id: 1, name: "Song", ar: [{ name: "Artist" }], al: { name: "Album" } }] },
        10: { albums: [{ id: 2, name: "Album", artist: { name: "Artist" } }] },
        100: { artists: [{ id: 3, name: "Artist" }] },
        1000: { playlists: [{ id: 4, name: "Playlist", trackCount: 12 }] }
      };
      return { body: { result: resultByType[input.type] } };
    }
  };
  const service = new NeteaseApiService({ apiClient });

  const result = await service.searchMedia({ keyword: "Kairos", type: "all", limit: 6 });

  assert.equal(result.ok, true);
  assert.equal(result.songs[0].id, "netease:1");
  assert.equal(result.albums[0].id, "netease-album:2");
  assert.equal(result.artists[0].id, "netease-artist:3");
  assert.equal(result.playlists[0].id, "netease-playlist:4");
  assert.deepEqual(calls.map(call => call.type).sort((a, b) => a - b), [1, 10, 100, 1000]);
  assert.equal(calls.every(call => call.keywords === "Kairos" && call.limit === 6), true);
});

test("NetEase AI catalog preserves album order and caps artist hot songs at twenty", async () => {
  const apiClient = {
    async album({ id }) {
      return {
        body: {
          album: { id, name: "Ordered album" },
          songs: [3, 1, 2].map(songId => ({ id: songId, name: `Song ${songId}` }))
        }
      };
    },
    async artist_top_song() {
      return { body: { songs: Array.from({ length: 25 }, (_, index) => ({ id: index + 1, name: `Hot ${index + 1}` })) } };
    }
  };
  const service = new NeteaseApiService({ apiClient });

  const album = await service.getAlbumSongs({ id: "netease-album:88" });
  const artist = await service.getArtistHotSongs({ id: "netease-artist:99", limit: 25 });

  assert.equal(album.album.id, "netease-album:88");
  assert.deepEqual(album.songs.map(song => song.neteaseId), [3, 1, 2]);
  assert.equal(artist.songs.length, 20);
  assert.deepEqual(artist.songs.slice(0, 3).map(song => song.neteaseId), [1, 2, 3]);
});
