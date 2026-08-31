const MEDIA_TYPES = new Set(["song", "playlist", "album", "artist"]);

function text(value) { return String(value || "").trim().toLocaleLowerCase(); }
function compact(value) { return text(value).replace(/[\s\p{P}\p{S}]+/gu, ""); }

export function musicMatchScore(item, query, type = "song", hints = {}) {
  const needle = compact(query);
  const artistNeedle = compact(hints.artist);
  const albumNeedle = compact(hints.album);
  const name = compact(item.title || item.name);
  const artist = compact(item.artist || item.creator || (item.aliases || []).join(" "));
  const album = compact(item.album);
  let score = item.source === "netease" || String(item.id || "").startsWith("netease") ? 100 : 0;
  if (name === needle) score += 80;
  else if (name.startsWith(needle) || needle.startsWith(name)) score += 48;
  else if (name.includes(needle) || needle.includes(name)) score += 30;
  if (artist === needle) score += 36;
  else if (artist.includes(needle) || needle.includes(artist)) score += 18;
  if (artistNeedle && artist === artistNeedle) score += 54;
  else if (artistNeedle && (artist.includes(artistNeedle) || artistNeedle.includes(artist))) score += 28;
  if (albumNeedle && album === albumNeedle) score += 42;
  else if (albumNeedle && (album.includes(albumNeedle) || albumNeedle.includes(album))) score += 20;
  if (type === "artist" && artist === needle) score += 30;
  return score;
}

function ranked(rows, query, type, hints = {}) {
  return [...(rows || [])].sort((left, right) => musicMatchScore(right, query, type, hints) - musicMatchScore(left, query, type, hints));
}

function summarizeTrack(track) {
  return { id: track.id, title: track.title, artist: track.artist, album: track.album || "" };
}

export class AiMusicController {
  constructor({ netease, dispatch, quality = () => "standard" } = {}) {
    this.netease = netease;
    this.dispatch = dispatch;
    this.quality = quality;
  }

  async search({ query, type = "all", limit = 8, artist = "", album = "" } = {}) {
    if (type !== "all" && !MEDIA_TYPES.has(type)) throw new Error("unsupported_music_type");
    const result = await this.netease.searchMedia({ keyword: query, type, limit: Math.max(1, Math.min(20, Number(limit) || 8)) });
    return {
      songs: ranked(result.songs, query, "song", { artist, album }).map(summarizeTrack),
      playlists: ranked(result.playlists, query, "playlist").map(item => ({ id: item.id, name: item.name, creator: item.creator, trackCount: item.trackCount })),
      albums: ranked(result.albums, query, "album").map(item => ({ id: item.id, name: item.name, artist: item.artist, trackCount: item.trackCount })),
      artists: ranked(result.artists, query, "artist").map(item => ({ id: item.id, name: item.name, aliases: item.aliases })),
    };
  }

  async playableTrack(song) {
    const result = await this.netease.playSong({ id: song.id, neteaseId: song.neteaseId, level: await this.quality() });
    return result?.ok && result.track?.playUrl ? result.track : null;
  }

  async firstPlayable(songs, count = 3) {
    for (const song of (songs || []).slice(0, count)) {
      const track = await this.playableTrack(song);
      if (track) return track;
    }
    return null;
  }

  async playableCollection(songs) {
    const tracks = [];
    const source = songs || [];
    for (let index = 0; index < source.length; index += 4) {
      const batch = await Promise.all(source.slice(index, index + 4).map(song => this.playableTrack(song)));
      tracks.push(...batch.filter(Boolean));
    }
    return tracks;
  }

  async play({ query, type = "song", position = "now", artist = "", album = "" } = {}) {
    if (!MEDIA_TYPES.has(type)) throw new Error("unsupported_music_type");
    const found = await this.netease.searchMedia({ keyword: query, type, limit: type === "song" ? 8 : 5 });
    const candidates = ranked(found[`${type}s`], query, type, { artist, album });
    if (!candidates.length) throw new Error("music_not_found");

    if (type === "song") {
      const track = await this.firstPlayable(candidates, 3);
      if (!track) throw new Error("no_playable_netease_match");
      const state = await this.dispatch({ type: "get_state" });
      const queue = [...(state.queueTrackIds || [])];
      const existingIndex = queue.indexOf(track.id);
      if (position === "next") {
        if (existingIndex >= 0) queue.splice(existingIndex, 1);
        const currentIndex = queue.indexOf(state.currentTrackId);
        queue.splice(currentIndex >= 0 ? currentIndex + 1 : 0, 0, track.id);
        await this.dispatch({ type: "apply_patch", patch: { tracks: [track], queueTrackIds: queue, currentTrackId: state.currentTrackId || track.id, playing: state.currentTrackId ? state.playing === true : true } });
        return { action: "play_next", track: summarizeTrack(track), queueLength: queue.length };
      }
      if (existingIndex < 0) {
        const currentIndex = queue.indexOf(state.currentTrackId);
        queue.splice(currentIndex >= 0 ? currentIndex + 1 : 0, 0, track.id);
      }
      await this.dispatch({ type: "apply_patch", patch: { tracks: [track], queueTrackIds: queue, currentTrackId: track.id, playing: true } });
      return { action: "play_now", track: summarizeTrack(track), queueLength: queue.length };
    }

    const selected = candidates[0];
    const collection = type === "playlist"
      ? await this.netease.getPlaylistSongs({ id: selected.id, neteaseId: selected.neteaseId })
      : type === "album"
        ? await this.netease.getAlbumSongs({ id: selected.id, neteaseId: selected.neteaseId })
        : await this.netease.getArtistHotSongs({ id: selected.id, neteaseId: selected.neteaseId, limit: 20 });
    const tracks = await this.playableCollection(collection.songs || []);
    if (!tracks.length) throw new Error("no_playable_netease_match");
    await this.dispatch({ type: "apply_patch", patch: { tracks, queueTrackIds: tracks.map(track => track.id), currentTrackId: tracks[0].id, playing: true } });
    return { action: "replace_queue", type, name: selected.name, playable: tracks.length, skipped: Math.max(0, (collection.songs || []).length - tracks.length), tracks: tracks.slice(0, 5).map(summarizeTrack) };
  }

  async control({ action } = {}) {
    if (!["play", "pause", "next", "previous"].includes(action)) throw new Error("unsupported_music_control");
    return this.dispatch({ type: action });
  }

  async volume({ mode = "relative", value = 0 } = {}) {
    if (mode === "mute") return this.dispatch({ type: "volume", muted: true });
    if (mode === "unmute") return this.dispatch({ type: "volume", muted: false });
    if (mode === "relative") {
      const direction = Number(value) < 0 ? -10 : 10;
      return this.dispatch({ type: "volume", relative: direction });
    }
    if (mode === "absolute") return this.dispatch({ type: "volume", value: Math.max(0, Math.min(100, Number(value) || 0)) });
    throw new Error("unsupported_volume_mode");
  }

  async queue({ action = "list", query = "", trackId = "", artist = "", album = "" } = {}) {
    if (action === "add_next") return this.play({ query, type: "song", position: "next", artist, album });
    const state = await this.dispatch({ type: "get_state" });
    const ids = [...(state.queueTrackIds || [])];
    const byId = new Map((state.tracks || []).map(track => [track.id, track]));
    if (action === "list") {
      return {
        action: "queue_list",
        currentTrackId: state.currentTrackId || null,
        tracks: ids.map(id => byId.get(id)).filter(Boolean).map(summarizeTrack),
      };
    }
    if (action === "clear") {
      await this.dispatch({ type: "apply_patch", patch: { queueTrackIds: [], currentTrackId: null, playing: false } });
      return { action: "queue_cleared", removed: ids.length };
    }
    if (action === "remove") {
      const needle = compact(query);
      if (!trackId && !needle) throw new Error("queue_track_required");
      const targetId = ids.find(id => id === trackId)
        || ids.find(id => {
          const track = byId.get(id);
          return track && (compact(track.title) === needle || compact(track.title).includes(needle));
        });
      if (!targetId) throw new Error("queue_track_not_found");
      const removedIndex = ids.indexOf(targetId);
      const nextIds = ids.filter(id => id !== targetId);
      const removedCurrent = targetId === state.currentTrackId;
      const nextCurrent = removedCurrent ? (nextIds[Math.min(removedIndex, Math.max(0, nextIds.length - 1))] || null) : state.currentTrackId;
      await this.dispatch({ type: "apply_patch", patch: { queueTrackIds: nextIds, currentTrackId: nextCurrent, playing: Boolean(nextCurrent) && state.playing === true } });
      return { action: "queue_removed", track: byId.get(targetId) ? summarizeTrack(byId.get(targetId)) : { id: targetId }, queueLength: nextIds.length };
    }
    throw new Error("unsupported_queue_action");
  }

  async likeCurrent({ liked = true } = {}) {
    const state = await this.dispatch({ type: "get_state" });
    const track = (state.tracks || []).find(item => item.id === state.currentTrackId);
    if (!track || !String(track.id).startsWith("netease:")) throw new Error("current_track_is_not_netease");
    const result = await this.netease.setSongLiked({ id: track.id, neteaseId: track.neteaseId, liked });
    if (!result?.ok) throw new Error(result?.message || "netease_like_failed");
    await this.dispatch({ type: "apply_patch", patch: { tracks: [{ ...track, liked }] } });
    return { action: liked ? "liked" : "unliked", track: summarizeTrack(track) };
  }
}
