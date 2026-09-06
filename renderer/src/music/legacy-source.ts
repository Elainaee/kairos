/**
 * Music migration reference lock.
 *
 * These fingerprints describe the approved original source files. Any Vue
 * implementation must preserve their visible DOM, styling and interaction
 * contract; this module contains no rendered UI.
 */
export const legacyMusicReference = Object.freeze({
  page: {
    path: "app/pages/music/index.html",
    sha256: "53ff57415f8446b3c51229378fb3725f83d57df272a3f1102c03ecea19c9f8f6",
    bytes: 267624,
    lines: 4378,
    viewSections: 9,
    idAnchors: 49,
    buttons: 62
  },
  playerScript: {
    path: "app/shell/player/music-player.js",
    sha256: "e31016098a1c2f91cdaf66d0ad95638b971a835df002b0d02e030ac05890e743",
    bytes: 55678,
    lines: 763
  },
  playerStyle: {
    path: "app/shell/player/music-player.css",
    sha256: "447286036e5620395a433316fe600238cb8a61eb95edfd2096f0b538c52b1b00",
    bytes: 26978,
    lines: 1043
  }
});

export type LegacyMusicState = Record<string, unknown>;
