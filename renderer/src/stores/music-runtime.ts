import { defineStore } from "pinia";
import { ref } from "vue";
import type { LegacyMusicState } from "../music/legacy-source";

/**
 * The original Electron player remains the only playback owner.  Vue mirrors
 * its snapshots and forwards explicit Vue-originated commands back to that
 * same controller; it never creates an audio element of its own.
 */
export const useMusicRuntimeStore = defineStore("music-runtime", () => {
  const state = ref<LegacyMusicState>({});
  const loaded = ref(false);
  let loadVersion = 0;
  let newestSnapshotAt = 0;

  function snapshotAt(value: unknown) {
    const at = Number((value as Record<string, unknown> | null)?.at || 0);
    return Number.isFinite(at) && at > 0 ? at : 0;
  }

  function commit(next: unknown) {
    state.value = JSON.parse(JSON.stringify(next || {}));
    loaded.value = true;
    return state.value;
  }

  async function load() {
    const version = ++loadVersion;
    const next = await window.kairosDesktop?.music?.getState?.() ?? {};
    // A player event received while this Electron read was in flight is newer
    // than the read result.  Do not revive old queue/progress state on route
    // entry or after returning to Music.
    if (version !== loadVersion) return state.value;
    const at = snapshotAt(next);
    if (at && at < newestSnapshotAt) return state.value;
    if (at) newestSnapshotAt = at;
    return commit(next);
  }

  function sync(next: unknown) {
    const at = snapshotAt(next);
    if (at && at < newestSnapshotAt) return state.value;
    if (at) newestSnapshotAt = at;
    // Invalidate any earlier async desktop read before publishing the event.
    loadVersion += 1;
    return commit(next);
  }

  async function apply(command: unknown) {
    if (!command || typeof command !== "object" || Array.isArray(command)) return false;
    const player = (window as any).KairosMusicPlayer;
    if (typeof player?.applyRefresh !== "function") return false;
    const detail = JSON.parse(JSON.stringify(command));
    await player.applyRefresh({
      ...detail,
      source: detail.source || "vue-store",
      at: Number(detail.at) || Date.now()
    });
    return true;
  }

  return { state, loaded, load, sync, apply };
});
