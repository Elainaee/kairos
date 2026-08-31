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
    sha256: "849140d8f949ac22c24c204e31a534284312adbba2b64934697a9d746f3de310",
    bytes: 271392,
    lines: 4378,
    viewSections: 9,
    idAnchors: 49,
    buttons: 62
  },
  playerScript: {
    path: "app/shell/player/music-player.js",
    sha256: "251701ec36ad9757f91d507c0fec284009051e0e07dfc124e40bed724fb1bc7d",
    bytes: 56393,
    lines: 763
  },
  playerStyle: {
    path: "app/shell/player/music-player.css",
    sha256: "cc55a5de624a423715208a60c35bd997d5c6cc125d3c2312386400cc7c4db512",
    bytes: 27989,
    lines: 1043
  }
});

export type LegacyMusicState = Record<string, unknown>;
