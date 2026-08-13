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
    sha256: "c35e7bf489e00073ac83562a0838d5d81bfa1ecde35c38c7757f885db54a170d",
    bytes: 209188,
    lines: 3840,
    viewSections: 9,
    idAnchors: 49,
    buttons: 62
  },
  playerScript: {
    path: "app/shell/player/music-player.js",
    sha256: "e8e87a66a3b364d462a2b29f8a15dfa058415ba9fd48b692ca8030c9ca712f9e",
    bytes: 48177,
    lines: 665
  },
  playerStyle: {
    path: "app/shell/player/music-player.css",
    sha256: "ea778b26f42dc457724f517a4ee233a49ccf6ec0f81a9562541c8d2ef703ad94",
    bytes: 25508,
    lines: 873
  }
});

export type LegacyMusicState = Record<string, unknown>;
