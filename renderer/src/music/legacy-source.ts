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
    sha256: "45218cdb688657e6097cdfb348e550daac739b8d98e13540ba380986f7cb6754",
    bytes: 209164,
    lines: 3836,
    viewSections: 9,
    idAnchors: 49,
    buttons: 62
  },
  playerScript: {
    path: "app/shell/player/music-player.js",
    sha256: "34a2f5a149a1efe9d63d09ee59413fdd48ba5b357a5eb28f7c7484bffd0fe7ca",
    bytes: 46889,
    lines: 629
  },
  playerStyle: {
    path: "app/shell/player/music-player.css",
    sha256: "ea778b26f42dc457724f517a4ee233a49ccf6ec0f81a9562541c8d2ef703ad94",
    bytes: 25508,
    lines: 1001
  }
});

export type LegacyMusicState = Record<string, unknown>;
