import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(".");

async function source(file) {
  return fs.readFile(path.join(root, file), "utf8");
}

test("Music migration contract: source reference fingerprints stay current", async () => {
  const reference = await source("renderer/src/music/legacy-source.ts");
  for (const file of ["app/pages/music/index.html", "app/shell/player/music-player.js", "app/shell/player/music-player.css"]) {
    const bytes = Buffer.from((await fs.readFile(path.join(root, file), "utf8")).replace(/\r\n/g, "\n"), "utf8");
    const hash = crypto.createHash("sha256").update(bytes).digest("hex");
    assert.match(reference, new RegExp(`sha256: "${hash}"`), `${file} must retain an up-to-date source fingerprint`);
    assert.match(reference, new RegExp(`bytes: ${bytes.length}`), `${file} must retain an up-to-date source size`);
  }
});

test("Music migration contract: original view order and interaction state remain explicit", async () => {
  const html = await source("app/pages/music/index.html");

  const playlist = html.indexOf('data-music-view="playlist"');
  const history = html.indexOf('data-music-view="history"');
  const detail = html.indexOf('data-music-view="playlist-detail"');
  const netease = html.indexOf('data-music-view="netease"');
  const empty = html.indexOf('data-music-view="empty"');
  assert.ok(playlist >= 0 && playlist < history && history < detail && detail < netease && netease < empty,
    "the Vue migration must preserve the original Music section DOM order");

  assert.match(html, /const showMusicView = view => \{[\s\S]*?section\.hidden = section\.dataset\.musicView !== view;[\s\S]*?\};/,
    "view switches must keep the original hidden-attribute state contract");
  assert.match(html, /const showInitialMusicSource = \(\) => \{[\s\S]*?item\.setAttribute\('aria-checked', String\(item\.dataset\.source === firstSource\)\)[\s\S]*?submenu\.dataset\.state = isFirst \? 'open' : 'closed';[\s\S]*?aria-expanded/,
    "source switches must update both aria and submenu state before the first view is shown");
  assert.match(html, /item\.classList\.add\('is-source-dragging'\);[\s\S]*?writeMusicSourceOrder\(\);[\s\S]*?classList\.remove\('is-source-dragging', 'source-drop-before', 'source-drop-after'\)/,
    "source reordering must expose the original drag classes and persist the resulting DOM order");
  assert.match(html, /row\.classList\.toggle\('is-playing', isActive\);[\s\S]*?button\.dataset\.state = isActive \? 'pause' : 'play';[\s\S]*?button\.setAttribute\('aria-label', isActive \? 'Pause track' : 'Play track'\);/,
    "track rows must derive class, data-state, and aria label from the same playback state");
  assert.match(html, /const setDetailMode = mode => \{[\s\S]*?selectedTrackIds\.clear\(\);[\s\S]*?table\.classList\.toggle\('is-selecting', mode !== 'songs'\);[\s\S]*?updateSelectionBar\(\);/,
    "multi-select must retain the original hidden/class state pair");
});

test("Music migration contract: original motion timing and triggers remain explicit", async () => {
  const html = await source("app/pages/music/index.html");

  assert.match(html, /\.music-sidebar-spacer\s*\{[\s\S]*?transition:\s*width \.22s cubic-bezier\(\.2,\.8,\.2,1\)/,
    "sidebar collapse keeps the source 220ms easing");
  assert.match(html, /\.music-submenu-list\s*\{[\s\S]*?transition:\s*max-height \.3s cubic-bezier\(\.2,\.8,\.2,1\)/,
    "source submenu expansion keeps the source 300ms easing");
  assert.match(html, /\.playlist-tilted-inner\s*\{[\s\S]*?transition:\s*transform \.18s ease,box-shadow \.18s ease/,
    "playlist card tilt keeps the source 180ms transition");
  assert.match(html, /\.netease-history-indicator,\.netease-download-indicator\s*\{[\s\S]*?transition:\s*transform \.24s cubic-bezier\(\.2,\.8,\.2,1\),width \.24s cubic-bezier\(\.2,\.8,\.2,1\)/,
    "NetEase history and Download indicators keep the source 240ms transition");
  assert.match(html, /\.kairos-toast\s*\{[\s\S]*?transition:\s*opacity \.18s ease,transform \.18s ease/,
    "toast enter and leave retain the source 180ms transition");
  assert.match(html, /requestAnimationFrame\(\(\) => item\.classList\.add\('is-visible'\)\);[\s\S]*?setTimeout\(\(\) => \{[\s\S]*?setTimeout\(\(\) => item\.remove\(\), 220\);[\s\S]*?\}, 2600\);/,
    "toast animation must be frame-triggered and retain its original 2600ms/220ms lifecycle");
  assert.match(html, /manageTrigger\.classList\.add\('is-refreshing'\);[\s\S]*?setTimeout\(resolve, 320\)[\s\S]*?manageTrigger\.classList\.remove\('is-refreshing'\)/,
    "folder refresh must retain the original class lifecycle and 320ms acknowledgement delay");
});

test("Music migration contract: Electron writes and playback recovery preserve source boundaries", async () => {
  const html = await source("app/pages/music/index.html");
  const player = await source("app/shell/player/music-player.js");

  assert.match(html, /const persistMusicRuntime = patch => \{ musicState\.runtime = \{ \.\.\.musicRuntime\(\), \.\.\.patch \}; getDesktopMusic\(\)\?\.updateRuntime\?\.\(patch\)\.catch\(\(\) => \{\}\); \};/,
    "source order/sidebar mutations must write only their changed runtime fields through Electron's runtime bridge");
  assert.match(html, /musicState = applySavedPlaylistOrders\(nextState\);[\s\S]*?if \(!musicSourceOrderHydrated\) \{[\s\S]*?applyMusicSourceOrder\(\);[\s\S]*?showInitialMusicSource\(\);[\s\S]*?musicSourceOrderHydrated = true;/,
    "the persisted source order must be reapplied after Electron state hydration, not only before it");
  assert.match(html, /musicState = await desktopMusic\.updatePlayback\(playbackPatch\);[\s\S]*?playbackState = \{ currentTrackId: target\.id, playing: true \};[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(/,
    "local play must write Electron playback state before reflecting it to the shared player");
  assert.match(html, /const payload = \{ source: location\.href, at: Date\.now\(\), refresh: true, \.\.\.detail \};[\s\S]*?KairosMusicPlayer\.applyRefresh[\s\S]*?new CustomEvent\('kairos:music-refresh', \{ detail: payload \}\)/,
    "Music page commands must carry an ordered timestamp and reach the single shared player");
  assert.match(player, /const persist = patch => \{ const api = desktop\(\); if \(!api \|\| !shouldPersistPlayback\(patch\)\) return; clearTimeout\(saveTimer\); saveTimer = setTimeout\(\(\) => api\.updatePlayback\(patch\)\.catch\(\(\)=>\{\}\), 180\); \};/,
    "shared player must debounce Electron playback writes by the original 180ms");
  assert.match(player, /const persistRuntime = patch => \{ state\.runtime = \{ \.\.\.runtime\(\), \.\.\.patch \}; desktop\(\)\?\.updateRuntime\?\.\(patch\)\.catch\(\(\) => \{\}\); \};/,
    "shared player runtime updates must not replay stale source-order fields");
  assert.match(player, /const detail=\{\.\.\.state,queueTrackIds:state\.queueTrackIds\|\|\[\],currentTrackId:state\.currentTrackId\|\|null,playing:state\.playing===true,currentTime:els\.audio\.currentTime\|\|0,at:Date\.now\(\)\};/,
    "every shared-player event must carry an ordering timestamp for route re-entry races");
  assert.match(player, /if \(hasNeteaseQueue\(\) && !isGlobalPlayerSettingPatch\(patch\)\) return false;/,
    "NetEase queue state must never overwrite the local queue persistence record");
  assert.match(player, /const saveNeteasePlayback = \(\) => \{[\s\S]*?persistRuntime\(\{ neteasePlayback: \{[\s\S]*?updatedAt: new Date\(\)\.toISOString\(\)[\s\S]*?\}, lastSource: 'netease' \}\);/,
    "NetEase playback must save an independent runtime snapshot for restart recovery");
  assert.match(player, /const restoreLastPlaybackSource = nextState => \{[\s\S]*?if \(lastSource !== 'netease'\) return nextState;[\s\S]*?queueTrackIds: saved\.queueTrackIds,[\s\S]*?currentTrackId: saved\.currentTrackId,[\s\S]*?playing: false,/,
    "restart recovery must restore NetEase queue identity without autoplay");
});

test("Music migration contract: Vue keeps the source controller alive across route changes", async () => {
  const app = await source("renderer/src/App.vue");
  const shell = await source("renderer/src/components/AppShell.vue");
  const view = await source("renderer/src/views/MusicView.vue");
  const store = await source("renderer/src/stores/music-runtime.ts");

  assert.match(app, /<AppShell>[\s\S]*?<RouterView[\s\S]*?<component :is="Component" :key="route\.path"\s*\/>[\s\S]*?<\/AppShell>/,
    "AppShell must remain outside routed page lifetime so the shared player is never remounted");
  assert.match(shell, /window\.addEventListener\("kairos:music-state-changed", handleMusicStateChanged\)/,
    "Vue must subscribe to the original player snapshot stream");
  assert.match(shell, /window\.addEventListener\("kairos:music-command", handleMusicCommand\)/,
    "Vue must forward commands without creating an independent audio owner");
  assert.match(shell, /new CustomEvent\("kairos:player-route-layout", \{ detail: \{ view \} \}\)/,
    "route changes must notify the original player to retain its source visibility/layout behaviour");
  assert.match(store, /KairosMusicPlayer[\s\S]*?applyRefresh/,
    "Vue runtime state is a mirror/command bridge to the original player controller");
  assert.match(store, /const version = \+\+loadVersion;[\s\S]*?if \(version !== loadVersion\) return state\.value;[\s\S]*?if \(at && at < newestSnapshotAt\) return state\.value;/,
    "an old asynchronous Electron read must not overwrite a newer player event after route entry");
  assert.match(store, /function sync\(next: unknown\) \{[\s\S]*?if \(at && at < newestSnapshotAt\) return state\.value;[\s\S]*?loadVersion \+= 1;[\s\S]*?return commit\(next\);/,
    "Vue mirror state must reject stale events and invalidate in-flight reads");
  assert.match(view, /route\.query\.candidate !== "1"/,
    "the exact original Music source document must be the default route while retaining a diagnostic candidate");
  assert.match(view, /<EmbeddedLegacyView v-if="useSourceDocument" page="music" \/>[\s\S]*?<NativeMusicCandidate v-else \/>/,
    "the default /music route must preserve the source DOM and CSS in an isolated Vue-managed document");
});

test("Music migration contract: route locale sync preserves dynamic player metadata", async () => {
  const player = await source("app/shell/player/music-player.js");

  assert.doesNotMatch(player, /data-i18n="player\.(?:chooseSong|localAmbience)"/,
    "dynamic title and artist nodes must not be overwritten by static DOM translation");
  assert.match(player, /const syncTrackCopy = track => \{[\s\S]*?els\.title\.textContent = track \?[\s\S]*?els\.artist\.textContent = track \?/,
    "player metadata should have one source-aware rendering path");
  assert.match(player, /window\.addEventListener\('kairos:locale-changed',[\s\S]*?translatePlayer\(\);[\s\S]*?syncTrackCopy\(currentTrack\(\)\);/,
    "locale synchronization should re-render the current track instead of restoring placeholders");
});

test("Music migration contract: the unrouted Vue candidate starts from original Music source", async () => {
  const candidate = await source("renderer/src/views/NativeMusicCandidate.vue");

  assert.match(candidate, /fetch\(originalPageUrl\(\), \{ cache: "no-store" \}\)/,
    "candidate must load the authoritative original Music document instead of a redesigned duplicate");
  assert.match(candidate, /new DOMParser\(\)\.parseFromString\(await response\.text\(\), "text\/html"\)/,
    "candidate must derive DOM from source HTML for node-order fidelity");
  assert.match(candidate, /original\.querySelector<HTMLElement>\("\.music-root"\)/,
    "candidate must keep the original Music root subtree intact");
  assert.match(candidate, /scopePageCss\(pageCss\)/,
    "candidate must carry original page CSS while scoping it to the Vue route surface");
  assert.match(candidate, /replace\(\/\\\[data-state="collapsed"\\\]\/g, `\$\{scope\} \[data-state="collapsed"\]`\)/,
    "legacy global state selectors must not leak from Music into the Vue shell");
  assert.match(candidate, /\$\{scope\} \.material-symbols-outlined \{/,
    "legacy global icon styling must remain inside the Music candidate");
  assert.match(candidate, /controllerRuntime = createCandidateRuntime\(target, controllerAbort\);[\s\S]*?await appendOriginalController\(target, controllerRuntime\);/,
    "candidate must retain original event/controller behaviour during migration validation");
  assert.match(candidate, /script\.src = originalControllerUrl\(\)/,
    "candidate must load the original controller through a CSP-safe same-origin script");
  assert.match(candidate, /target\.dataset\.embedded = "true"/,
    "candidate must retain the original embedded Music layout context");
  assert.match(candidate, /controllerRuntime\?\.dispose\(\)/,
    "candidate must clean original controller listeners and timers when Vue leaves Music");
  assert.match(candidate, /const version = \+\+mountVersion;[\s\S]*?if \(version !== mountVersion \|\| host\.value !== target\) return;/,
    "a stale asynchronous candidate mount must not inject source DOM after Vue has left Music");
  assert.match(candidate, /\[data-embedded="true"\] \.music-root\{height:100%!important\}/,
    "candidate must map the original iframe viewport height onto its Vue host");
  assert.match(candidate, /const runtimeKey = "__kairosNativeMusicCandidateRuntime"/,
    "candidate controller DOM queries must remain scoped to the retained original root");
  const generatedController = await source("app/pages/music/native-vue-controller.js");
  const originalHtml = (await source("app/pages/music/index.html")).replace(/\r\n/g, "\n");
  const originalBody = originalHtml.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i)?.[1] || "";
  const originalController = [...originalBody.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
    .map(match => match[1])
    .filter(script => script.trim())
    .at(-1);
  assert.ok(originalController, "original Music page must retain its authoritative inline controller");
  assert.match(generatedController, /Generated from app\/pages\/music\/index\.html/,
    "the CSP-safe external controller must be mechanically generated from the original page");
  assert.ok(generatedController.endsWith(`\n${originalController}\n})();\n`),
    "the generated controller body must remain byte-for-byte identical to the original Music controller");
  assert.match(generatedController, /const document = __runtime\.document;[\s\S]*?const window = __runtime\.window;/,
    "the generated controller must scope original DOM and listeners to the Vue route lifetime");
  assert.match(generatedController, /const setTimeout = __runtime\.setTimeout;[\s\S]*?const requestAnimationFrame = __runtime\.requestAnimationFrame;/,
    "the generated controller must bind original timer lifetimes to the Vue route");
  assert.doesNotMatch(candidate, /<iframe\b|<audio\b/i,
    "candidate must not introduce another iframe or a second audio owner");
});
