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
    sha256: "dbd93d0b046c795bdc8cdfb5e1f5a7c2002e24d410a0a3f3bb187245d133d4db",
    bytes: 226740,
    lines: 3884,
    viewSections: 9,
    idAnchors: 49,
    buttons: 62
  },
  playerScript: {
    path: "app/shell/player/music-player.js",
    sha256: "0dcc0b9291871df49cf353e424e98efcce745299797201c0eec8f0bfd87d6055",
    bytes: 54683,
    lines: 736
  },
  playerStyle: {
    path: "app/shell/player/music-player.css",
    sha256: "9a740af9b53cafeac23fde3d0171a358a72829ee3d64dd17964461f156514bd9",
    bytes: 26081,
    lines: 1018
  }
});

export type LegacyMusicState = Record<string, unknown>;
