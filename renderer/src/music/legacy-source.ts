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
    sha256: "28ca92384c1611072b7f36e28a95c599c4385e3a6cce816105c06f55a4465757",
    bytes: 268352,
    lines: 4402,
    viewSections: 9,
    idAnchors: 49,
    buttons: 62
  },
  playerScript: {
    path: "app/shell/player/music-player.js",
    sha256: "c549842af1ea73bcec9678e40f93c5988793ec2022f11f44bd4a69a54402b762",
    bytes: 56264,
    lines: 784
  },
  playerStyle: {
    path: "app/shell/player/music-player.css",
    sha256: "447286036e5620395a433316fe600238cb8a61eb95edfd2096f0b538c52b1b00",
    bytes: 26978,
    lines: 1043
  }
});

export type LegacyMusicState = Record<string, unknown>;
