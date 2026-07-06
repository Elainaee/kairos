import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(".");

async function inlineScripts(file) {
  const html = await fs.readFile(path.join(root, file), "utf8");
  return [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attrs]) => !/\bsrc\s*=/.test(attrs))
    .map(([, , source]) => source.trim())
    .filter(Boolean);
}

test("html inline scripts stay syntactically valid", async () => {
  for (const file of ["app/index.html", "app/music.html"]) {
    const scripts = await inlineScripts(file);
    assert.ok(scripts.length > 0, `${file} should contain inline scripts to check`);
    scripts.forEach((source, index) => {
      assert.doesNotThrow(
        () => new vm.Script(source, { filename: `${file}#script-${index + 1}` }),
        `${file} inline script ${index + 1} should parse`
      );
    });
  }
});

test("embedded music pages rely on the shell player instance", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    playerScript,
    /new URLSearchParams\(location\.search\)\.get\('embed'\)\s*===\s*'1'\s*&&\s*window\.parent\s*!==\s*window\)\s*return window\.KairosMusicPlayer/,
    "music-player.js should not mount a second player inside the embedded Music iframe"
  );
  assert.match(
    musicHtml,
    /<script src="music-player\.js\?v=\d+"><\/script>/,
    "music.html may load the player script, relying on the embed guard for single-instance behavior"
  );
  assert.match(
    musicHtml,
    /document\.body\.dataset\.embedded = 'true';/,
    "embedded music pages should mark themselves for iframe-specific layout"
  );
  assert.match(
    musicHtml,
    /body\[data-embedded="true"\] \{ padding-bottom: 0; \}/,
    "embedded music pages should remove inner player padding after the shell already reserved it"
  );
  assert.match(
    musicHtml,
    /body\[data-embedded="true"\] \.music-root \{ height: 100vh; \}/,
    "embedded music pages should let the sidebar fill the iframe height"
  );
  assert.doesNotMatch(
    musicHtml,
    /\.music-sidebar-footer \{[\s\S]*?position:\s*absolute[\s\S]*?bottom:\s*80px/,
    "sidebar footer should use flex layout instead of a second hard-coded player offset"
  );
});

test("NetEase playback stays isolated from local queue persistence", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /snapshot\.queueTrackIds\.filter\(id => String\(id\)\.startsWith\('netease:'\) && id !== track\.id\)/,
    "NetEase queue actions should drop local track ids instead of mixing local and online queues"
  );
  assert.match(
    musicHtml,
    /snapshot\.tracks\.filter\(item => String\(item\?\.id \|\| ''\)\.startsWith\('netease:'\)\)[\s\S]*?trackMap\.set\(track\.id, \{ \.\.\.\(trackMap\.get\(track\.id\) \|\| \{\}\), \.\.\.track \}\);[\s\S]*?tracks: \[\.\.\.trackMap\.values\(\)\]/,
    "NetEase queue actions should carry existing online track metadata instead of replacing the queue with one new track"
  );
  assert.match(
    musicHtml,
    /let neteaseVisibleSongs = \[\];[\s\S]*?\(neteaseVisibleSongs \|\| \[\]\)\.forEach\(item => \{[\s\S]*?trackMap\.set\(item\.id, makeNeteaseTrackShell\(item\)\);[\s\S]*?queueTrackIds: existingQueue/,
    "NetEase queue actions may use visible rows as a metadata pool without changing the actual online queue ids"
  );
  assert.match(
    musicHtml,
    /const enqueueNeteaseTrack = async \(song, mode = 'queue'\) => \{[\s\S]*?if \(!api\?\.playSong\) throw new Error\('NetEase API is unavailable\.'\);[\s\S]*?const track = makeNeteaseTrackShell\(song\);[\s\S]*?notifyMusicPlayer\(\{/,
    "NetEase queue actions should enqueue song metadata immediately and defer URL fetching until playback"
  );
  assert.doesNotMatch(
    musicHtml,
    /const enqueueNeteaseTrack = async \(song, mode = 'queue'\) => \{[\s\S]*?api\.playSong/,
    "NetEase Add to Queue and Play Next should not request short-lived playable URLs before playback"
  );
  assert.match(
    musicHtml,
    /const playing = isCurrentNetease && snapshot\.playing === true && Boolean\(currentTrackId\);[\s\S]*?playing,[\s\S]*?playbackState = \{ currentTrackId, playing \};/,
    "NetEase queue actions should preserve active online playback while switching from local queues into a paused online queue"
  );
  assert.match(
    musicHtml,
    /const switchingFromLocalQueue = !isCurrentNetease && Boolean\(snapshot\.currentTrackId \|\| snapshot\.queueTrackIds\?\.length\);[\s\S]*?toast\.message\('Switched to NetEase queue'/,
    "NetEase queue actions should clearly communicate when they replace a local queue instead of mixing sources"
  );
  assert.match(
    musicHtml,
    /const reason = mode === 'next'[\s\S]*?'Online songs cannot play next after local tracks\.'[\s\S]*?'Online songs use a separate queue from local tracks\.'[\s\S]*?toast\.message\('Switched to NetEase queue', `[$]\{track\.title \|\| 'NetEase song'\} \\u00b7 [$]\{reason\}`\);/,
    "NetEase queue actions should explain that online and local tracks use separate queues"
  );
  assert.match(
    playerScript,
    /const isGlobalPlayerSettingPatch = patch => \{[\s\S]*?keys\.every\(key => key === 'volume' \|\| key === 'muted' \|\| key === 'mode'\);[\s\S]*?\};/,
    "shared player should identify global player setting persistence patches"
  );
  assert.match(
    playerScript,
    /if \(hasNeteaseQueue\(\) && !isGlobalPlayerSettingPatch\(patch\)\) return false;/,
    "NetEase queues should not be persisted into the local music library playback state except global player settings"
  );
  assert.match(
    playerScript,
    /if \(hasNeteaseQueue\(\) && !isGlobalPlayerSettingPatch\(patch\)\) return false;[\s\S]*?const persist = patch => \{ const api = desktop\(\); if \(!api \|\| !shouldPersistPlayback\(patch\)\) return;/,
    "online queues should block local queue playback persistence while allowing shared volume and mode settings"
  );
  assert.match(
    playerScript,
    /els\.mode\.onclick=\(\)=>\{[\s\S]*?persist\(\{mode:state\.mode\}\); emitState\(\); \};/,
    "playback mode changes should broadcast immediately across the shared player surfaces"
  );
  assert.match(
    playerScript,
    /lastAppliedRefreshAt = 0/,
    "shared player should track external refresh ordering"
  );
  assert.match(
    playerScript,
    /const incomingAt = Number\(detail\?\.at \|\| 0\);[\s\S]*?if \(incomingAt > 0 && incomingAt < lastAppliedRefreshAt\) return;[\s\S]*?if \(incomingAt > 0\) lastAppliedRefreshAt = incomingAt;/,
    "older delayed music refresh retries should not overwrite newer playback state"
  );
  assert.match(
    playerScript,
    /if \(patch\?\.position\?\.trackId && isNeteaseId\(patch\.position\.trackId\)\) return false;/,
    "online playback positions should never be written into the local music playback state"
  );
  assert.match(
    playerScript,
    /const NETEASE_PLAYBACK_KEY = 'kairos-netease-playback-state';[\s\S]*?const LAST_SOURCE_KEY = 'kairos-music-last-source';/,
    "NetEase playback should keep its own persisted snapshot keys instead of using the local music state file"
  );
  assert.match(
    playerScript,
    /const saveNeteasePlayback = \(\) => \{[\s\S]*?if \(!hasNeteaseQueue\(\)\) return;[\s\S]*?localStorage\.setItem\(NETEASE_PLAYBACK_KEY, JSON\.stringify\(\{[\s\S]*?currentTrackId:[\s\S]*?mode:[\s\S]*?positions,[\s\S]*?updatedAt:[\s\S]*?\}\)\);[\s\S]*?localStorage\.setItem\(LAST_SOURCE_KEY, 'netease'\);[\s\S]*?\};/,
    "NetEase queues should persist a separate last-online snapshot for app restart recovery"
  );
  assert.match(
    playerScript,
    /const restoreLastPlaybackSource = nextState => \{[\s\S]*?if \(lastSource === 'empty'\) return \{ \.\.\.nextState, queueTrackIds: \[\], currentTrackId: null, playing: false \};[\s\S]*?if \(lastSource !== 'netease'\) return nextState;[\s\S]*?tracks: \[\.\.\.localTracks, \.\.\.saved\.tracks\],[\s\S]*?queueTrackIds: saved\.queueTrackIds,[\s\S]*?currentTrackId: saved\.currentTrackId,[\s\S]*?playing: false,/,
    "startup restore should recover the last NetEase queue without autoplaying or mixing it into local queue state"
  );
  assert.match(
    playerScript,
    /if\(options\.restoreLastSource\) nextState=restoreLastPlaybackSource\(nextState\);[\s\S]*?refresh\(true, true, \{ guardExternalVersion: initialRefreshVersion, restoreLastSource: true \}\)/,
    "the initial player refresh should choose the last active local, empty, or NetEase source"
  );
  assert.match(
    playerScript,
    /if\(wasNeteaseQueue\) clearNeteasePlayback\(\);/,
    "clearing an online queue should remove the saved NetEase snapshot so it does not reappear after restart"
  );
  assert.match(
    playerScript,
    /if\(isNeteaseId\(id\)\) \{\s*emitState\(\);\s*return;\s*\}/,
    "NetEase playback should not increment local play counts"
  );
});

test("NetEase playable URLs are refreshed before expiry-sensitive playback", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/netease-api-service.js"), "utf8");

  assert.match(
    neteaseService,
    /urlExpiresAt:\s*expiresIn > 0 \? fetchedAt \+ expiresIn \* 1000 : 0/,
    "NetEase service should expose absolute URL expiry time to the shared player"
  );
  assert.match(
    playerScript,
    /const isNeteaseUrlStale = track => \{[\s\S]*?Date\.now\(\) > expiresAt - 60000;[\s\S]*?\};/,
    "shared player should treat NetEase URLs as stale before they actually expire"
  );
  assert.match(
    playerScript,
    /const neteaseDesktop = \(\) => \{[\s\S]*?window\.parent\?\.kairosDesktop\?\.netease[\s\S]*?\};[\s\S]*?const result = await api\.playSong\(\{ id: track\.id, neteaseId: track\.neteaseId \}\);/,
    "shared player should refresh NetEase URLs directly when the Music page listener is not mounted"
  );
  assert.match(
    playerScript,
    /async function playLoadedAudio\(\)\{[\s\S]*?if \(isNeteaseUrlStale\(track\)\) \{[\s\S]*?await refreshNeteaseTrackUrl\(track\);/,
    "all current-track play/resume paths should refresh stale NetEase URLs before audio.play"
  );
  assert.match(
    playerScript,
    /els\.toggle\.onclick=async\(\)=>\{ const track=currentTrack\(\); if\(!els\.audio\.src&&!track\) return;/,
    "main player toggle should allow a current NetEase track to refresh its URL even when audio.src is empty"
  );
  assert.match(
    playerScript,
    /if \(detail\?\.playing === true && \(els\.audio\.src \|\| currentTrack\(\)\)\) await playLoadedAudio\(\)/,
    "external NetEase play notifications should not be blocked only because audio.src is empty before URL refresh"
  );
  assert.match(
    playerScript,
    /if\(isNeteaseId\(id\)&&isNeteaseUrlStale\(t\)\)\{[\s\S]*?t=await refreshNeteaseTrackUrl\(t\);/,
    "manual NetEase track playback should refresh stale URLs before loading audio"
  );
  assert.match(
    playerScript,
    /if \(t\.playUrl\) \{[\s\S]*?els\.audio\.src=t\.playUrl;[\s\S]*?\} else if \(isNeteaseId\(t\.id\)\) \{[\s\S]*?els\.audio\.removeAttribute\('src'\);[\s\S]*?els\.audio\.load\(\);[\s\S]*?\}/,
    "shared player should not write empty NetEase shell URLs into the audio element before refresh"
  );
  assert.match(
    playerScript,
    /async function playAdjacentTrack\(direction=1\)\{[\s\S]*?const ok=await playTrack\(id,true,\{silentFailure:true\}\);[\s\S]*?\}[\s\S]*?els\.audio\.onended=\(\)=>\{ playAdjacentTrack\(1\); \};/,
    "automatic next-track playback should advance through the same NetEase URL-refreshing playTrack path"
  );
  assert.match(
    playerScript,
    /const playbackErrorText = error => error\?\.message === 'Unable to refresh NetEase URL' \? 'Unable to refresh NetEase URL' : 'Unable to play this audio file';/,
    "shared player should keep local audio failure messaging separate from NetEase URL refresh failures"
  );
  assert.match(
    playerScript,
    /state\.currentTrackId=previousTrackId;[\s\S]*?state\.playing=false;[\s\S]*?els\.status\.textContent='Unable to refresh NetEase URL';[\s\S]*?loadTrack\(false\);[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?emitState\(\);/,
    "shared player should immediately roll back its own controls when NetEase URL refresh fails"
  );
  assert.match(
    playerScript,
    /catch\(error\)\{[\s\S]*?const message=playbackErrorText\(error\);[\s\S]*?state\.playing=false;[\s\S]*?els\.status\.textContent=message;[\s\S]*?if\(!silentFailure\) toast\('error',message\);[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?emitState\(\);/,
    "shared player should immediately roll back its own controls with source-aware messaging when audio playback fails"
  );
  assert.match(
    playerScript,
    /async function continueQueuePlayback\(shouldPlay\)\{[\s\S]*?catch\(error\)\{[\s\S]*?state\.playing=false;[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?emitState\(\);[\s\S]*?\}/,
    "queue continuation failures should broadcast the stopped state after rolling back controls"
  );
  assert.match(
    playerScript,
    /els\.toggle\.onclick=async\(\)=>\{[\s\S]*?catch\(error\)\{ const message=playbackErrorText\(error\); state\.playing=false; els\.status\.textContent=message; toast\('error',message\); syncPlayButton\(\); updateQueuePlaybackState\(\); emitState\(\);/,
    "main play button failures should roll back shared player controls immediately"
  );
  assert.match(
    playerScript,
    /if \(detail\?\.playing === true && \(els\.audio\.src \|\| currentTrack\(\)\)\) await playLoadedAudio\(\)\.catch\(error=>\{ const message=playbackErrorText\(error\); state\.playing=false; els\.status\.textContent=message; toast\('error',message\); syncPlayButton\(\); updateQueuePlaybackState\(\); emitState\(\); \}\);/,
    "external play refresh failures should broadcast the stopped state after rolling back controls"
  );
  assert.match(
    playerScript,
    /els\.audio\.onerror=async\(\)=>\{ const t=currentTrack\(\); if\(!isNeteaseId\(t\?\.id\)\) return; const fail=message=>\{ state\.playing=false; els\.status\.textContent=message; toast\('error',message\); syncPlayButton\(\); updateQueuePlaybackState\(\); emitState\(\); \}; const refreshed=await refreshNeteaseTrackUrl\(t\); if\(!refreshed\)\{ fail\('Unable to refresh NetEase URL'\); return; \} if\(state\.playing===true\) playLoadedAudio\(\)\.catch\(error=>fail\(playbackErrorText\(error\)\)\); \};/,
    "NetEase audio error recovery should roll back shared player controls when URL refresh or replay fails"
  );
});

test("NetEase rows mirror local playing-state highlighting", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    musicHtml,
    /const isActive = isCurrent && playing;[\s\S]*?row\.classList\.toggle\('is-playing', isActive\);/,
    "NetEase rows should only show the persistent playing highlight while the current track is actively playing"
  );
  assert.match(
    musicHtml,
    /button\.dataset\.state = isActive \? 'pause' : 'play';/,
    "NetEase row play buttons should use the same play/pause state rule as local rows"
  );
  assert.match(
    musicHtml,
    /playButton\.setAttribute\('aria-label', 'Play track'\);/,
    "NetEase row play buttons should use the same initial aria label as local row play buttons"
  );
  assert.doesNotMatch(
    musicHtml,
    /playButton\.setAttribute\('aria-label', `Play /,
    "NetEase row play labels should not switch wording after the first playback-state refresh"
  );
  assert.match(
    musicHtml,
    /const updateNeteasePlaybackRows = \(override = null\) => \{[\s\S]*?const snapshot = override \|\| getPlayerSnapshot\(\);/,
    "NetEase rows should support an immediate local playback-state update like local playlist rows"
  );
  assert.match(
    musicHtml,
    /const syncPlaybackRows = \(override = null\) => \{[\s\S]*?if \(override\) playbackState = override;[\s\S]*?syncVisiblePlaylistPlayback\(\);[\s\S]*?syncHistoryPlayback\(\);[\s\S]*?updateNeteasePlaybackRows\(override\);[\s\S]*?\};/,
    "playback state changes should refresh local playlist, local history, and NetEase rows together"
  );
  assert.match(
    musicHtml,
    /const closeNeteaseRowMenus = \(\) => \{[\s\S]*?neteaseResults\?\.querySelectorAll\('\.track-row-menu:not\(\[hidden\]\)'\)[\s\S]*?aria-expanded', 'false'/,
    "NetEase row menus should have the same reusable close behavior as local playlist row menus"
  );
  assert.match(
    musicHtml,
    /neteaseResults\.onclick = event => \{[\s\S]*?if \(event\.target\.closest\('\.track-row-menu-wrap'\)\) return;[\s\S]*?closeNeteaseRowMenus\(\);[\s\S]*?\};/,
    "clicking blank space in NetEase results should close open row menus"
  );
  assert.match(
    musicHtml,
    /input\.addEventListener\('input', \(\) => \{[\s\S]*?const visible = refreshNeteaseVisibleIndexes\(\) \|\| 0;[\s\S]*?resultsLabel\.textContent = `\$\{visible\} result\$\{visible === 1 \? '' : 's'\}`;[\s\S]*?updateNeteasePlaybackRows\(\);[\s\S]*?\}\);/,
    "filtering NetEase collection rows should refresh row numbering and then re-apply shared playback state"
  );
  assert.match(
    musicHtml,
    /neteaseAccountPanel\.onclick = event => \{[\s\S]*?if \(!event\.target\.closest\('\.track-row-menu-wrap'\)\) closeNeteaseRowMenus\(\);[\s\S]*?\};/,
    "clicking the NetEase detail hero/account panel should close open row menus"
  );
  assert.match(
    musicHtml,
    /const neteasePlaybackDetail = \(snapshot, detail = \{\}\) => \(\{[\s\S]*?tracks: Array\.isArray\(snapshot\?\.tracks\) \? snapshot\.tracks\.filter\(item => String\(item\?\.id \|\| ''\)\.startsWith\('netease:'\)\) : \[\],[\s\S]*?queueTrackIds: Array\.isArray\(snapshot\?\.queueTrackIds\) \? snapshot\.queueTrackIds\.filter\(id => String\(id\)\.startsWith\('netease:'\)\) : \[\],[\s\S]*?mode: snapshot\?\.mode \|\| 'sequence'/,
    "NetEase current-song pause/resume should include online queue metadata like local playback notifications"
  );
  assert.match(
    musicHtml,
    /notifyMusicPlayer\(neteasePlaybackDetail\(snapshot, \{ currentTrackId: song\.id, playing: false \}\)\);[\s\S]*?syncPlaybackRows\(playbackState\);[\s\S]*?notifyMusicPlayer\(neteasePlaybackDetail\(snapshot, \{ currentTrackId: song\.id, playing: true \}\)\);[\s\S]*?syncPlaybackRows\(playbackState\);/,
    "NetEase current-song pause/resume should refresh all visible row controls immediately"
  );
  assert.match(
    musicHtml,
    /playbackState = \{ currentTrackId: track\.id, playing: true \};[\s\S]*?syncPlaybackRows\(playbackState\);/,
    "NetEase new track playback should refresh all visible row controls immediately"
  );
  assert.match(
    musicHtml,
    /const enqueueNeteaseTrack = async \(song, mode = 'queue'\) => \{[\s\S]*?const playing = isCurrentNetease && snapshot\.playing === true && Boolean\(currentTrackId\);[\s\S]*?playbackState = \{ currentTrackId, playing \};[\s\S]*?syncPlaybackRows\(playbackState\);/,
    "NetEase queue actions should refresh every visible row state immediately when they switch the active online queue"
  );
  assert.match(
    playerScript,
    /window\.dispatchEvent\(new CustomEvent\('kairos:music-state-changed',\{detail\}\)\);[\s\S]*?window\.parent\.postMessage\(\{type:'kairos:music-state-changed',detail\},'\*'\);[\s\S]*?document\.querySelectorAll\('iframe'\)/,
    "shared player state changes should be broadcast across shell and embedded Music frames"
  );
});

test("NetEase rows use the same cover fallback as local rows", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /if \(song\.coverUrl\) \{[\s\S]*?cover\.append\(img\);[\s\S]*?\} else \{[\s\S]*?music_note/,
    "NetEase rows should render a music_note placeholder instead of an empty image when cover art is missing"
  );
});

test("playlist selection checkboxes use stable icon text", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /\.track-select-button \.checkmark\{font-family:"Material Symbols Outlined"/,
    "playlist selection checkmarks should render through Material Symbols"
  );
  assert.match(
    musicHtml,
    /<span class="checkmark">check<\/span>/,
    "playlist selection checkmarks should avoid fragile glyphs in source HTML"
  );
  assert.doesNotMatch(
    musicHtml,
    /<span class="checkmark">(?!check<\/span>)[\s\S]*?<\/span>/,
    "playlist selection checkmarks should not contain mojibake or direct check glyphs"
  );
});

test("local and NetEase liked menu copy stays aligned", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /\$\{track\.liked \? 'Remove from Liked' : 'Like'\}/,
    "local playlist row menus should use the same liked-removal wording as NetEase rows"
  );
  assert.match(
    musicHtml,
    /\$\{isNeteaseSongLiked\(song\) \? 'Remove from Liked' : 'Like'\}/,
    "NetEase row menus should keep the same liked-removal wording"
  );
  assert.doesNotMatch(
    musicHtml,
    />Unlike</,
    "liked row menus should avoid the older Unlike label"
  );
});

test("local liked buttons expose current liked state like NetEase rows", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /const likedAriaLabel = liked => liked \? 'Remove from liked songs' : 'Add to liked songs';/,
    "local liked buttons should have a reusable state-aware aria label"
  );
  assert.match(
    musicHtml,
    /aria-label="\$\{likedAriaLabel\(track\.liked === true\)\}" aria-pressed="\$\{track\.liked === true\}"/,
    "local playlist and history liked buttons should render labels from the current liked state"
  );
  assert.match(
    musicHtml,
    /button\.setAttribute\('aria-pressed', String\(liked\)\);[\s\S]*?button\.setAttribute\('aria-label', likedAriaLabel\(liked\)\);/,
    "local playlist liked button toggles should update aria label with aria-pressed"
  );
  assert.match(
    musicHtml,
    /const toggleTrackLike = async \(track, button\) => \{[\s\S]*?button\.disabled = true;[\s\S]*?finally \{[\s\S]*?button\.disabled = false;[\s\S]*?\}/,
    "local playlist liked button should be disabled while the update is in flight"
  );
  assert.match(
    musicHtml,
    /const button = event\.currentTarget;[\s\S]*?button\.setAttribute\('aria-pressed', String\(liked\)\);[\s\S]*?button\.setAttribute\('aria-label', likedAriaLabel\(liked\)\);/,
    "local history liked button toggles should update aria label with aria-pressed"
  );
  assert.match(
    musicHtml,
    /row\.querySelector\('\.track-like-button'\)\?\.addEventListener\('click', async event => \{[\s\S]*?button\.disabled = true;[\s\S]*?finally \{[\s\S]*?button\.disabled = false;[\s\S]*?\}/,
    "local history liked button should be disabled while the update is in flight"
  );
  assert.match(
    musicHtml,
    /console\.error\('toggle history like failed', error\);[\s\S]*?track\.liked = !liked;[\s\S]*?button\.setAttribute\('aria-pressed', String\(track\.liked === true\)\);[\s\S]*?button\.setAttribute\('aria-label', likedAriaLabel\(track\.liked === true\)\);[\s\S]*?toast\.error\('Like failed', 'Please try again\.'\);/,
    "local history liked button failures should roll back like state like playlist and NetEase rows"
  );
  assert.doesNotMatch(
    musicHtml,
    /aria-label="Like song"/,
    "local liked buttons should not keep the stale generic Like song label"
  );
});

test("NetEase liked view updates its in-memory list when a song is removed", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /if \(!nextLiked && neteaseActiveView === 'liked'\) \{[\s\S]*?neteaseLastSongs = neteaseLastSongs\.filter\(item => neteaseNumericId\(item\) !== id\);[\s\S]*?neteaseVisibleSongs = neteaseVisibleSongs\.filter\(item => neteaseNumericId\(item\) !== id\);/,
    "removing a NetEase liked song should update the current liked collections, not just the DOM row"
  );
  assert.match(
    musicHtml,
    /if \(!visibleRows && neteaseResults\) neteaseResults\.innerHTML = '<p class="netease-empty">No liked songs yet\.<\/p>';/,
    "removing the last NetEase liked song should show an empty-state message"
  );
  assert.match(
    musicHtml,
    /const metaLabel = neteaseAccountPanel\?\.querySelector\('\.playlist-detail-meta'\);[\s\S]*?if \(metaLabel\) metaLabel\.textContent = `\$\{visibleRows\} track\$\{visibleRows === 1 \? '' : 's'\}`;/,
    "removing a NetEase liked song should update the liked hero count with the table count"
  );
  assert.match(
    musicHtml,
    /const syncNeteaseCachedLike = \(id, liked\) => \{[\s\S]*?\[neteaseLastSongs, neteaseVisibleSongs\]\.forEach/,
    "NetEase liked changes should update both search and visible song caches"
  );
  assert.match(
    musicHtml,
    /syncNeteaseCachedLike\(id, nextLiked\);[\s\S]*?syncNeteaseCachedLike\(id, !nextLiked\);/,
    "NetEase liked changes should be rolled forward optimistically and rolled back on failure"
  );
  assert.match(
    musicHtml,
    /setNeteaseStatus\(`Logged in[$]\{name\}\.`, true\);[\s\S]*?await ensureNeteaseLikedIds\(true\)\.catch/,
    "NetEase login/status refresh should force-refresh liked ids before relying on row state"
  );
  assert.match(
    musicHtml,
    /neteaseLikedIds = new Set\(\);[\s\S]*?neteaseLikedIdsLoaded = false;[\s\S]*?setNeteaseStatus\('Anonymous mode\. Login may improve availability\.', true\);/,
    "NetEase anonymous status should clear account liked state"
  );
  assert.match(
    musicHtml,
    /<div class="music-sidebar-footer">[\s\S]*?<div class="music-sidebar-account-wrap" id="neteaseSidebarAccountWrap">[\s\S]*?id="neteaseSidebarAvatar" alt="" hidden[\s\S]*?id="neteaseSidebarAvatarFallback"[\s\S]*?id="neteaseSidebarName">&#x672A;&#x767B;&#x5F55;<\/span>[\s\S]*?class="music-sidebar-account-service"[\s\S]*?hidden[\s\S]*?class="material-symbols-outlined music-sidebar-account-chevron"[\s\S]*?hidden[\s\S]*?id="neteaseSidebarAccountMenu" role="menu" hidden/,
    "NetEase account profile should render an always-visible signed-out placeholder in the sidebar footer"
  );
  assert.doesNotMatch(
    musicHtml,
    /<div class="netease-status" id="neteaseStatus">/,
    "NetEase login status should not be shown at the top of the page body"
  );
  assert.match(
    musicHtml,
    /const renderNeteaseSidebarProfile = profile => \{[\s\S]*?neteaseSidebarAccountWrap\.hidden = false;[\s\S]*?if \(!hasProfile\) \{[\s\S]*?neteaseSidebarName\.textContent = '\\u672a\\u767b\\u5f55';[\s\S]*?neteaseSidebarAvatar\.hidden = true;[\s\S]*?neteaseSidebarAvatarFallback\.hidden = false;[\s\S]*?neteaseSidebarName\.textContent = profile\.nickname \|\| 'NetEase Cloud';[\s\S]*?neteaseSidebarAvatar\.src = avatarUrl;/,
    "NetEase status refresh should keep signed-out placeholder visible and update avatar/nickname when logged in"
  );
  assert.match(
    musicHtml,
    /serviceIcon\.hidden = !hasProfile;[\s\S]*?chevron\.hidden = !hasProfile;/,
    "signed-out sidebar account should hide the service icon and expand affordance"
  );
  assert.match(
    musicHtml,
    /setNeteaseStatus\(`Logged in[$]\{name\}\.`, true\);[\s\S]*?renderNeteaseSidebarProfile\(status\.profile\);/,
    "successful NetEase login should populate the sidebar profile"
  );
  assert.match(
    musicHtml,
    /showInitialMusicSource\(\);\s*initializeNeteaseView\(\);/,
    "Music startup should show the first ordered source while still checking NetEase status for the sidebar profile"
  );
  assert.match(
    musicHtml,
    /setNeteaseStatus\('Anonymous mode\. Login may improve availability\.', true\);[\s\S]*?renderNeteaseSidebarProfile\(null\);/,
    "anonymous NetEase status should hide the sidebar profile"
  );
  assert.match(
    musicHtml,
    /let neteaseStatusRequestId = 0;/,
    "NetEase status refresh should track request order"
  );
  assert.match(
    musicHtml,
    /let neteaseLoginRequestId = 0;/,
    "NetEase login should track QR request order"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseStatusRequestId;[\s\S]*?const status = await api\.getStatus\(\);[\s\S]*?if \(requestId !== neteaseStatusRequestId\) return;[\s\S]*?await ensureNeteaseLikedIds\(true\)\.catch[\s\S]*?if \(requestId !== neteaseStatusRequestId\) return;/,
    "stale NetEase status refreshes should not overwrite newer login or account state"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(requestId !== neteaseStatusRequestId\) return;[\s\S]*?Unable to check NetEase status\./,
    "stale NetEase status errors should not overwrite newer status text"
  );
  assert.match(
    musicHtml,
    /const loginKey = neteaseLoginKey;[\s\S]*?const result = await api\.loginCheck\(\{ key: loginKey \}\);[\s\S]*?if \(loginKey !== neteaseLoginKey\) return;/,
    "stale NetEase QR polling should not overwrite the current login key state"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseLoginRequestId;[\s\S]*?const result = await api\.startLogin\(\);[\s\S]*?if \(requestId !== neteaseLoginRequestId\) return;/,
    "stale NetEase QR creation results should not replace a newer QR"
  );
  assert.match(
    musicHtml,
    /const startNeteaseLoginFlow = async \(\{ force = false \} = \{\}\) => \{[\s\S]*?if \(neteaseLoginInFlight \|\| \(neteaseLoginKey && !force\)\) return;[\s\S]*?if \(now < neteaseLoginCooldownUntil\) \{[\s\S]*?return;[\s\S]*?\}[\s\S]*?if \(force\) \{[\s\S]*?neteaseLoginKey = "";[\s\S]*?\}[\s\S]*?if \(result\?\.code === 406 \|\| result\?\.retryAfter\) \{[\s\S]*?neteaseLoginCooldownUntil = Date\.now\(\) \+ \(Number\(result\.retryAfter\) \|\| 60000\);/,
    "NetEase QR login should guard in-flight requests and cool down after rate limits"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(requestId !== neteaseLoginRequestId\) return;[\s\S]*?Login failed/,
    "stale NetEase QR creation errors should not overwrite a newer login state"
  );
  assert.match(
    musicHtml,
    /finally \{[\s\S]*?if \(requestId === neteaseLoginRequestId\) setNeteaseBusy\(false\);[\s\S]*?\}/,
    "stale NetEase login requests should not clear the busy state for a newer QR"
  );
  assert.match(
    musicHtml,
    /let neteaseSearchRequestId = 0;/,
    "NetEase search should track request order"
  );
  assert.match(
    musicHtml,
    /let neteaseAccountRequestId = 0;/,
    "NetEase account collection loads should track request order"
  );
  assert.match(
    musicHtml,
    /const searchNeteaseSongs = async keyword => \{[\s\S]*?const requestId = \+\+neteaseSearchRequestId;[\s\S]*?const result = await api\.searchSongs\(\{ keyword: query, limit: 30, offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'search' \|\| requestId !== neteaseSearchRequestId\) return false;[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?if \(neteaseActiveView !== 'search' \|\| requestId !== neteaseSearchRequestId\) return false;[\s\S]*?renderNeteaseResults\(result\?\.songs \|\| \[\]\);/,
    "NetEase search results should sync liked ids before rendering row state"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(neteaseActiveView !== 'search' \|\| requestId !== neteaseSearchRequestId\) return false;[\s\S]*?Search failed/,
    "stale NetEase search failures should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /finally \{[\s\S]*?if \(requestId === neteaseSearchRequestId\) setNeteaseBusy\(false\);[\s\S]*?\}/,
    "stale NetEase search requests should not clear the busy state for a newer search"
  );
  assert.match(
    musicHtml,
    /const searchNeteaseSongs = async keyword => \{[\s\S]*?const requestId = \+\+neteaseSearchRequestId;[\s\S]*?const result = await api\.searchSongs\(\{ keyword: query, limit: 30, offset: 0 \}\);/,
    "NetEase search should be reusable by both submit and refresh actions"
  );
  assert.match(
    musicHtml,
    /let neteaseLastSearchKeyword = "";/,
    "NetEase search refresh should remember the previous successful search keyword"
  );
  assert.match(
    musicHtml,
    /neteaseLastSearchKeyword = query;[\s\S]*?renderNeteaseResults\(result\?\.songs \|\| \[\]\);/,
    "NetEase search should store the keyword only when a current search result is about to render"
  );
  assert.match(
    musicHtml,
    /const refreshNeteaseCurrentView = async \(\) => \{[\s\S]*?await initializeNeteaseView\(\);[\s\S]*?if \(neteaseActiveView === 'playlists'\) await loadNeteasePlaylists\(\);[\s\S]*?else if \(neteaseActiveView === 'liked'\) await loadNeteaseLiked\(\);[\s\S]*?else if \(neteaseActiveView === 'history'\) await loadNeteaseHistory\(\);[\s\S]*?const didSearch = await searchNeteaseSongs\(neteaseSearchInput\?\.value \|\| neteaseLastSearchKeyword\);[\s\S]*?if \(!didSearch\) refreshLabel = 'NetEase status';/,
    "NetEase refresh should reload the current account/search view after checking status"
  );
  assert.match(
    musicHtml,
    /<div class="netease-auth-gate" id="neteaseAuthGate" hidden>[\s\S]*?id="neteaseQrLoginMode"[\s\S]*?id="neteaseQrImage"[\s\S]*?id="neteaseOtherLoginButton"[\s\S]*?id="neteasePhoneLoginForm"[\s\S]*?id="neteasePhoneInput"[\s\S]*?id="neteaseSendCaptchaButton"[\s\S]*?id="neteaseQrLoginButton"/,
    "NetEase signed-out view should provide QR and phone verification login modes"
  );
  assert.doesNotMatch(
    musicHtml,
    /<header class="music-view-header">[\s\S]*?<h1 class="music-view-title">NetEase Cloud<\/h1>[\s\S]*?Search NetEase Cloud Music and play through Kairos\./,
    "NetEase page should not keep the old top title and status area"
  );
  assert.doesNotMatch(
    musicHtml,
    /id="neteaseRefreshButton"/,
    "NetEase page should not show the old top Refresh button"
  );
  assert.match(
    musicHtml,
    /let refreshLabel = \{ playlists: 'Playlists', liked: 'Liked Songs', history: 'History', search: 'Search' \}\[neteaseActiveView\] \|\| 'NetEase';[\s\S]*?toast\.message\(`[$]\{refreshLabel\} refreshed`\);/,
    "NetEase refresh toast should identify which view was refreshed"
  );
  assert.match(
    musicHtml,
    /neteaseSearchForm\?\.addEventListener\('submit', async event => \{[\s\S]*?event\.preventDefault\(\);[\s\S]*?await searchNeteaseSongs\(neteaseSearchInput\?\.value \|\| ''\);[\s\S]*?\}\);/,
    "NetEase search form should use the same search helper as refresh"
  );
  assert.match(
    musicHtml,
    /const songsResult = await api\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId, offset: 0 \}\);[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?renderNeteaseSongCollection\(playlist\.name/,
    "NetEase playlist detail rows should sync liked ids before rendering row state"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseAccountRequestId;[\s\S]*?const result = await api\.getUserPlaylists\(\{ offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist list responses should not overwrite newer account content"
  );
  assert.match(
    musicHtml,
    /const detailRequestId = \+\+neteaseAccountRequestId;[\s\S]*?const songsResult = await api\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId, offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist detail responses should not overwrite a newer selected playlist"
  );
  assert.match(
    musicHtml,
    /catch \(error\) \{[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;[\s\S]*?Unable to load playlist\./,
    "stale NetEase playlist detail errors should not overwrite a newer selected playlist"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getHistory\(\{ type: neteaseHistoryType \}\);[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?renderNeteaseSongCollection\('NetEase History'/,
    "NetEase history rows should sync liked ids before rendering row state"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseAccountRequestId;[\s\S]*?const result = await api\.getLikedSongs\(\);[\s\S]*?if \(neteaseActiveView !== 'liked' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase liked responses should not overwrite newer account content"
  );
  assert.match(
    musicHtml,
    /const requestId = \+\+neteaseAccountRequestId;[\s\S]*?const result = await api\.getHistory\(\{ type: neteaseHistoryType \}\);[\s\S]*?if \(neteaseActiveView !== 'history' \|\| requestId !== neteaseAccountRequestId\) return;[\s\S]*?await ensureNeteaseLikedIds\(\)\.catch[\s\S]*?if \(neteaseActiveView !== 'history' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase history responses should not overwrite newer account content"
  );
});

test("NetEase collection empty states stay contextual", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /neteaseResults\.innerHTML = `<p class="netease-empty">[$]\{options\.emptyMessage \|\| 'No songs found\.'\}<\/p>`;/,
    "NetEase result rendering should allow collection-specific empty messages"
  );
  assert.match(
    musicHtml,
    /renderNeteaseResults\(songs, \{ remember: false, queueSongs: songs, withFilter: true, showPlayCount: options\.showPlayCount === true, historyType: options\.historyType, emptyMessage: options\.emptyMessage \}\);/,
    "NetEase collection pages should pass their empty message to the shared result table"
  );
  assert.match(
    musicHtml,
    /const playlist = result\.playlist \|\| \{\};[\s\S]*?renderNeteaseSongCollection\(playlist\.name \|\| 'Liked Songs'[\s\S]*?coverUrl: playlist\.coverUrl \|\| ''[\s\S]*?emptyMessage: 'No liked songs yet\.'/,
    "NetEase liked view should render the account red-heart playlist instead of a synthetic liked collection"
  );
  assert.match(
    musicHtml,
    /renderNeteaseSongCollection\('NetEase History'[\s\S]*?historyType: neteaseHistoryType,[\s\S]*?emptyMessage: 'No NetEase listening history yet\.'/,
    "NetEase history should use a history-specific empty state"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getUserPlaylists\(\{ offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist requests should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /const songsResult = await api\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId, offset: 0 \}\);[\s\S]*?if \(neteaseActiveView !== 'playlists' \|\| detailRequestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase playlist detail requests should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getLikedSongs\(\);[\s\S]*?if \(neteaseActiveView !== 'liked' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase liked requests should not overwrite a newer active view"
  );
  assert.match(
    musicHtml,
    /const result = await api\.getHistory\(\{ type: neteaseHistoryType \}\);[\s\S]*?if \(neteaseActiveView !== 'history' \|\| requestId !== neteaseAccountRequestId\) return;/,
    "stale NetEase history requests should not overwrite a newer active view"
  );
});

test("NetEase history row menu follows history layout", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /let neteaseHistoryType = 1;/,
    "NetEase history should default to the API weekly record type"
  );
  assert.match(
    musicHtml,
    /data-history-type="1"[\s\S]*?最近一周[\s\S]*?data-history-type="0"[\s\S]*?所有时间/,
    "NetEase history should expose API range buttons for weekly and all-time records"
  );
  assert.match(
    musicHtml,
    /\.netease-history-tabs\{position:relative;display:inline-flex[\s\S]*?border:0;background:transparent/,
    "NetEase history range tabs should sit on the table border without a pill container"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] \.netease-history-tabs button\.netease-history-tab:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "NetEase history range tabs should override the global button hover background"
  );
  assert.match(
    musicHtml,
    /<span class="netease-history-indicator" aria-hidden="true"><\/span>[\s\S]*?const positionHistoryIndicator = \(\) => \{[\s\S]*?indicator\.style\.width = `\$\{active\.offsetWidth\}px`;[\s\S]*?indicator\.style\.transform = `translateX\(\$\{active\.offsetLeft\}px\)`;/,
    "NetEase history range tabs should share a smoothly moving underline indicator"
  );
  assert.match(
    musicHtml,
    /const nextType = Number\(button\.dataset\.historyType\);[\s\S]*?neteaseHistoryType = nextType;[\s\S]*?loadNeteaseHistory\(nextType\);/,
    "NetEase history range buttons should reload through the API type parameter"
  );
  assert.match(
    musicHtml,
    /const rowMenuHtml = options\.showPlayCount[\s\S]*?\? `<span class="track-row-menu-wrap">[\s\S]*?data-action="play-next"[\s\S]*?Play Next[\s\S]*?<\/span><\/span>`[\s\S]*?: `<span class="track-row-menu-wrap">[\s\S]*?data-action="add-queue"[\s\S]*?data-action="like"/,
    "NetEase history rows should use a history-specific menu instead of the full song action menu"
  );
  assert.doesNotMatch(
    musicHtml,
    /options\.showPlayCount\s*\?\s*`(?:(?!`\s*:)[\s\S])*data-action="add-queue"/,
    "NetEase history row menu should not include Add to Queue because Play Next already matches local History behavior"
  );
});

test("music controls suppress global hover backgrounds", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const playerCss = await fs.readFile(path.join(root, "app/music-player.css"), "utf8");

  assert.match(
    musicHtml,
    /body\[data-page="music"\] \.playlist-detail-table button\.track-play-button:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "track play buttons should override the global button hover background"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] \.playlist-detail-table button\.track-play-button:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\),[\s\S]*?button\.track-play-button:focus-visible:not[\s\S]*?transform:translate\(-50%,-50%\) scale\(1\)!important/,
    "track play buttons should preserve their centered transform while suppressing hover effects"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] button\.track-like-button:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "like buttons should override the global button hover background"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] button\.track-row-menu-trigger:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color:transparent!important[\s\S]*?box-shadow:none!important/,
    "row more buttons should override the global button hover background"
  );
  assert.match(
    playerCss,
    /#musicToggle:hover \{[\s\S]*?box-shadow: none !important/,
    "main player play button should not add a hover shadow"
  );
  assert.match(
    playerCss,
    /#musicPlayer \.music-playlist-panel header button:hover,[\s\S]*?#musicPlayer \.music-track-remove:focus-visible \{[\s\S]*?background-color: transparent !important;[\s\S]*?box-shadow: none !important/,
    "queue clear and remove buttons should suppress hover background and shadow"
  );
});

test("NetEase sidebar source can collapse after opening", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /if \(button\.dataset\.source === 'netease'\) \{[\s\S]*?const submenu = button\.closest\('\.music-submenu'\);[\s\S]*?if \(submenu\?\.dataset\.state !== 'open'\) \{[\s\S]*?button\.setAttribute\('aria-expanded', 'false'\);[\s\S]*?return;[\s\S]*?\}[\s\S]*?showNeteaseSection\(neteaseActiveView \|\| 'search'\);/,
    "NetEase source click should respect the submenu toggle's closed state instead of forcing it open"
  );
});

test("NetEase sidebar uses bundled app icon", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const icon = await fs.stat(path.join(root, "app/assets/netease-format.ico"));

  assert.ok(icon.isFile(), "NetEase sidebar icon should be bundled with app assets");
  assert.match(
    musicHtml,
    /<img class="music-item-icon-img" src="assets\/netease-format\.ico" alt="" aria-hidden="true">[\s\S]*?<span>Netease Music<\/span>/,
    "Netease Music sidebar entry should render the bundled ico instead of the generic cloud icon"
  );
});

test("NetEase sidebar labels use requested copy", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /<span>Netease Music<\/span>[\s\S]*?data-netease-view="playlists"[\s\S]*?<span>Playlist<\/span>[\s\S]*?data-netease-view="liked"[\s\S]*?<span>Like<\/span>/,
    "NetEase sidebar labels should read Netease Music, Playlist, and Like"
  );
});

test("NetEase sidebar account menu can log out", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main.js"), "utf8");
  const service = await fs.readFile(path.join(root, "electron/netease-api-service.js"), "utf8");

  assert.match(preload, /logout: \(\) => ipcRenderer\.invoke\("netease:logout"\)/, "preload should expose NetEase logout");
  assert.match(preload, /sendCaptcha: \(input\) => ipcRenderer\.invoke\("netease:send-captcha", input\)/, "preload should expose NetEase captcha sending");
  assert.match(preload, /loginWithPhone: \(input\) => ipcRenderer\.invoke\("netease:login-with-phone", input\)/, "preload should expose NetEase phone login");
  assert.match(preload, /openVerification: \(url\) => ipcRenderer\.invoke\("netease:open-verification", url\)/, "preload should expose NetEase verification links");
  assert.doesNotMatch(preload, /switchAccount|netease:switch-account/, "preload should not expose removed account switching");
  assert.match(main, /ipcMain\.handle\("netease:logout",\(\)=>neteaseService\.logout\(\)\);/, "main should register NetEase logout");
  assert.doesNotMatch(main, /netease:switch-account|switchAccount/, "main should not register removed account switching");
  assert.match(main, /ipcMain\.handle\("netease:send-captcha",\(_event,input\)=>neteaseService\.sendCaptcha\(input\)\);/, "main should register NetEase captcha sending");
  assert.match(main, /ipcMain\.handle\("netease:login-with-phone",\(_event,input\)=>neteaseService\.loginWithPhone\(input\)\);/, "main should register NetEase phone login");
  assert.match(main, /ipcMain\.handle\("netease:open-verification"[\s\S]*?shell\.openExternal\(target\)/, "main should open NetEase verification links through Electron shell");
  assert.match(service, /function neteaseFailure\(error, fallback\) \{[\s\S]*?needsVerification: Number\(code\) === 10004 \|\| Number\(code\) === 10003,[\s\S]*?retryAfter: Number\(code\) === 406 \? 60000 : 0/, "service should convert NetEase failures into normal UI responses");
  assert.match(service, /async function withSuppressedNeteaseErrors\(task\)[\s\S]*?if \(args\[0\] === "\[ERR\]"\) return;/, "service should suppress noisy NetEase API internal error logs");
  assert.doesNotMatch(service, /\?{4,}/, "service should not contain question-mark fallback messages");
  assert.match(service, /async sendCaptcha\(\{ phone, countrycode = "86" \} = \{\}\) \{[\s\S]*?neteaseApi\.captcha_sent\(\{ phone: targetPhone, ctcode:/, "service should send NetEase SMS captcha");
  assert.match(service, /async loginWithPhone\(\{ phone, captcha, countrycode = "86" \} = \{\}\) \{[\s\S]*?neteaseApi\.login_cellphone\(\{[\s\S]*?captcha: targetCaptcha,[\s\S]*?this\.cookie = body\.cookie;[\s\S]*?catch \(error\) \{[\s\S]*?return neteaseFailure\(error, "Phone login failed\."\);/, "service should login with phone captcha and return readable failures");
  assert.doesNotMatch(service, /this\.accounts|rememberAccount|switchAccount/, "service should not keep removed account switching state");
  assert.match(service, /async logout\(\) \{[\s\S]*?this\.cookie = "";[\s\S]*?this\.loginKey = "";[\s\S]*?await this\.save\(\);/, "logout should clear saved NetEase session state");
  assert.match(
    musicHtml,
    /neteaseSidebarAccount\?\.addEventListener\('click'[\s\S]*?if \(neteaseSidebarAccount\.disabled\) return;[\s\S]*?neteaseSidebarAccountMenu\.hidden = !next;[\s\S]*?neteaseSidebarAccount\.setAttribute\('aria-expanded', String\(next\)\);/,
    "sidebar account button should toggle its menu"
  );
  assert.match(
    musicHtml,
    /id="neteaseSidebarAccountMenu" role="menu" hidden>[\s\S]*?data-action="logout"[\s\S]*?Log Out[\s\S]*?neteaseSidebarAccountMenu\?\.addEventListener\('click'[\s\S]*?if \(button\.dataset\.action === 'logout'\) \{[\s\S]*?await api\?\.logout\?\.\(\);[\s\S]*?resetNeteaseSessionUi\(\);[\s\S]*?toast\.message\('Logged out'\);/,
    "account menu should directly show only logout"
  );
  assert.doesNotMatch(musicHtml, /renderNeteaseAccountMenu|data-action="account"|data-action="new-login"|switchAccount/, "account switching UI should be removed");
  assert.match(
    musicHtml,
    /neteaseLoginButton\?\.addEventListener\('click', \(\) => startNeteaseLoginFlow\(\{ force: true \}\)\);[\s\S]*?neteaseOtherLoginButton\?\.addEventListener\('click', \(\) => setNeteaseLoginMode\('phone'\)\);[\s\S]*?neteaseSendCaptchaButton\?\.addEventListener\('click', async \(\) => \{[\s\S]*?api\.sendCaptcha\(\{ phone, countrycode: '86' \}\);[\s\S]*?neteasePhoneLoginForm\?\.addEventListener\('submit', async event => \{[\s\S]*?api\.loginWithPhone\(\{ phone, captcha, countrycode: '86' \}\);/,
    "NetEase login UI should switch to phone mode, send captcha, and submit phone login"
  );
  assert.match(
    musicHtml,
    /id="neteaseVerificationPanel" hidden[\s\S]*?id="neteaseVerificationButton"[\s\S]*?const setNeteaseVerification = \(result = null\) => \{[\s\S]*?needsVerification[\s\S]*?neteaseVerificationButton\?\.addEventListener\('click', async \(\) => \{[\s\S]*?api\.openVerification\(neteaseVerificationUrl\);/,
    "phone login should show and open NetEase security verification links"
  );
  assert.match(
    musicHtml,
    /body\[data-page="music"\] button\.music-sidebar-account:hover:not\(\.kairos-create\):not\(\.habit-primary\):not\(\.play\):not\(\.send\)[\s\S]*?background-color: transparent!important;[\s\S]*?box-shadow: none!important/,
    "sidebar account button should suppress the global button hover shadow"
  );
  assert.match(
    musicHtml,
    /\.netease-phone-form\{display:grid!important;justify-items:stretch!important;[\s\S]*?\.netease-phone-submit\{width:100%;height:36px/,
    "phone login form should stretch the submit button instead of centering it as a small pill"
  );
});

test("NetEase search page renders daily recommendations and hot playlists", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const preload = await fs.readFile(path.join(root, "electron/preload.cjs"), "utf8");
  const main = await fs.readFile(path.join(root, "electron/main.js"), "utf8");
  const service = await fs.readFile(path.join(root, "electron/netease-api-service.js"), "utf8");

  assert.match(preload, /getSearchHome: \(input\) => ipcRenderer\.invoke\("netease:get-search-home", input\)/, "preload should expose NetEase search home");
  assert.match(main, /ipcMain\.handle\("netease:get-search-home",\(_event,input\)=>neteaseService\.getSearchHome\(input\)\);/, "main should register NetEase search home");
  assert.match(service, /async getSearchHome\(\{ songLimit = 10, playlistLimit = 8 \} = \{\}\) \{[\s\S]*?neteaseApi\.recommend_songs[\s\S]*?neteaseApi\.personalized[\s\S]*?dailySongs[\s\S]*?hotPlaylists/, "service should load daily songs and hot playlists");
  assert.doesNotMatch(service, /savedPlaylistIds/, "search home should not infer playlist collection by comparing saved playlist ids");
  assert.match(service, /function playlistSubscribedState\(body = \{\}\) \{[\s\S]*?source\.subscribed === true[\s\S]*?source\.isSubscribed === true[\s\S]*?source\.subscribedPlaylist === true[\s\S]*?source\.playlist\?\.subscribed === true/, "playlist detail should read subscribed state from NetEase dynamic playlist API fields");
  assert.match(service, /playlist_detail_dynamic\(this\.withCookie\(\{ id: playlistId \}\)\)[\s\S]*?subscribed: playlistSubscribedState\(detailResult\?\.body \|\| \{\}\)/, "playlist detail should return the API subscribed state to the renderer");
  assert.match(service, /async setPlaylistSubscribed\(\{ id, neteaseId, subscribed = true \} = \{\}\) \{[\s\S]*?const input = \{[\s\S]*?t: subscribed \? 1 : 2[\s\S]*?neteaseApi\.playlist_subscribe\(this\.withCookie\(input\)\)/, "playlist collection should use the NetEase playlist subscribe API");
  assert.match(service, /Number\(parsed\.code\) !== 406[\s\S]*?playlist_subscribe\(this\.withCookie\(\{ \.\.\.input, crypto: "weapi" \}\)\)/, "playlist collection should retry through weapi when NetEase rejects the eapi route as too frequent");
  assert.match(preload, /setPlaylistSubscribed: \(input\) => ipcRenderer\.invoke\("netease:set-playlist-subscribed", input\)/, "preload should expose playlist collection");
  assert.match(main, /ipcMain\.handle\("netease:set-playlist-subscribed",\(_event,input\)=>neteaseService\.setPlaylistSubscribed\(input\)\);/, "main should register playlist collection");
  assert.match(musicHtml, /\.netease-search-home\{display:grid;gap:28px/, "search home should have dedicated layout styles");
  assert.match(
    musicHtml,
    /const loadNeteaseSearchHome = async \(\{ force = false \} = \{\}\) => \{[\s\S]*?api\.getSearchHome\(\{ songLimit: 8, playlistLimit: 8 \}\);[\s\S]*?Daily Recommended Songs[\s\S]*?createNeteaseHomeSongTable\(dailySongs\)[\s\S]*?Hot Playlists[\s\S]*?makeNeteasePlaylistCard\(playlist, 'search-home'\)/,
    "search home should render daily songs and hot playlist cards"
  );
  assert.match(
    musicHtml,
    /const createNeteaseHomeSongTable = songs => \{[\s\S]*?table\.className = 'playlist-detail-table netease-results netease-home-table';[\s\S]*?track-like-button[\s\S]*?track-row-menu-trigger/,
    "daily recommendations should reuse the playlist song row styling and controls"
  );
  assert.match(
    musicHtml,
    /const showNeteaseSearchBack = \(\) => \{[\s\S]*?playlist-detail-back[\s\S]*?loadNeteaseSearchHome\(\{ force: true \}\);/,
    "search results should provide a back button to the recommendation home"
  );
  assert.match(
    musicHtml,
    /playlist-subscribe-button[\s\S]*?toggleNeteasePlaylistSubscribed\(options\.playlist, subscribeButton\)/,
    "NetEase playlist detail should show a save or unsave button next to Play All"
  );
  assert.match(
    musicHtml,
    /const openNeteasePlaylistDetail = async[\s\S]*?playlist\.subscribed = playlist\.subscribed === true \|\| songsResult\.subscribed === true;[\s\S]*?renderNeteaseSongCollection\(playlist\.name[\s\S]*?playlist/,
    "playlist detail should preserve API-confirmed collection state and allow dynamic detail to mark saved playlists"
  );
  assert.match(
    musicHtml,
    /if \(neteaseSearchHomeLoaded && !force && neteaseResults\.querySelector\('\.netease-search-home'\)\) return;/,
    "returning to Search should only skip loading when the recommendation home still exists in the DOM"
  );
  assert.match(
    musicHtml,
    /if \(view === 'search'\) \{[\s\S]*?if \(!neteaseLastSongs\.length\) loadNeteaseSearchHome\(\);[\s\S]*?else renderNeteaseResults\(neteaseLastSongs\);/,
    "opening the Search tab should load the recommendation home before any search results"
  );
  assert.match(
    musicHtml,
    /if \(!query\) \{[\s\S]*?await loadNeteaseSearchHome\(\{ force: true \}\);[\s\S]*?return true;[\s\S]*?\}/,
    "submitting an empty Search query should return to the recommendation home"
  );
});

test("shared player exposes liked control for current local and NetEase tracks", async () => {
  const playerJs = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");
  const playerCss = await fs.readFile(path.join(root, "app/music-player.css"), "utf8");

  assert.match(playerJs, /id="musicLike"[\s\S]*?aria-pressed="false"/, "shared player should render a current-song liked button");
  assert.match(playerJs, /const syncLikeButton = \(\) => \{[\s\S]*?els\.like\.setAttribute\('aria-pressed', String\(liked\)\);/, "liked button should mirror the active track");
  assert.match(playerJs, /if\(isNeteaseId\(track\.id\)\)\{[\s\S]*?setSongLiked\?\.\(\{id:track\.id,neteaseId:track\.neteaseId,liked:nextLiked\}\)/, "NetEase player likes should call the NetEase like API");
  assert.match(playerJs, /updateTrack\?\.\(\{id:track\.id,liked:nextLiked\}\)/, "local player likes should call the local music library");
  assert.match(playerCss, /\.music-like-button\[aria-pressed="true"\][\s\S]*?color: #ff4761/, "liked player button should become red when active");
});
test("NetEase Play All skips unavailable leading songs", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /const playNeteaseCollection = async songs => \{[\s\S]*?for \(const song of candidates\) \{[\s\S]*?await playNeteaseTrack\(song, songs, \{ forceSequence: true \}\);/,
    "NetEase Play All should try each song instead of failing only because the first song is unavailable"
  );
  assert.match(
    musicHtml,
    /if \(!options\.forceSequence && snapshot\.currentTrackId === song\.id && snapshot\.playing === true\)[\s\S]*?if \(!options\.forceSequence && snapshot\.currentTrackId === song\.id && snapshot\.playing === false\)/,
    "NetEase Play All should bypass single-row pause/resume toggles so it can rebuild the full collection queue"
  );
  assert.match(
    musicHtml,
    /throw lastError \|\| new Error\('No playable songs in this collection\.'\);/,
    "NetEase Play All should only fail after every candidate is unavailable"
  );
});

test("NetEase row playback builds a full visible queue like local playlists", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /const localPlaybackDetail = detail => \(\{[\s\S]*?tracks: musicState\.tracks \|\| \[\],[\s\S]*?\.\.\.detail[\s\S]*?\}\);/,
    "local queue notifications should carry local track metadata when replacing an online queue"
  );
  assert.match(
    musicHtml,
    /const localLibrarySyncDetail = \(detail = \{\}\) => \{[\s\S]*?const snapshot = getPlayerSnapshot\(\);[\s\S]*?if \(String\(snapshot\.currentTrackId \|\| ''\)\.startsWith\('netease:'\)\) return localPlaybackDetail\(detail\);[\s\S]*?queueTrackIds: musicState\.queueTrackIds \|\| \[\],[\s\S]*?currentTrackId: musicState\.currentTrackId \|\| null,[\s\S]*?playing: musicState\.playing === true,[\s\S]*?\.\.\.detail[\s\S]*?\}\);[\s\S]*?\};/,
    "local library metadata sync should not replace an active NetEase queue with stale local playback state"
  );
  assert.doesNotMatch(
    musicHtml,
    /notifyMusicPlayer\(\);/,
    "local metadata changes should not trigger an unscoped shared player refresh"
  );
  assert.match(
    musicHtml,
    /const getVisiblePlaylistTrackIds = \(\) => \{[\s\S]*?querySelectorAll\('tr\[data-track-id\]'\)[\s\S]*?\.filter\(row => !row\.hidden\)[\s\S]*?return visibleIds\.length \? visibleIds : model\.tracks\.map\(track => track\.id\);[\s\S]*?\};/,
    "local playlist row playback should derive its queue from the currently visible filtered rows"
  );
  assert.match(
    musicHtml,
    /const queueTrackIds = options\.queueTrackIds \|\| getVisiblePlaylistTrackIds\(\);[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{ queueTrackIds, currentTrackId: target\.id, playing: true/,
    "local playlist row playback should use visible queue ids and include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /playPlaylistTrack\(first\.id, \{ forceSequence: true, queueTrackIds: model\.tracks\.map\(track => track\.id\) \}\);/,
    "local playlist Play All should keep using the full playlist queue even when the table is filtered"
  );
  assert.match(
    musicHtml,
    /const getVisibleHistoryTrackIds = tracks => \{[\s\S]*?querySelectorAll\('\.history-row\[data-track-id\]'\)[\s\S]*?\.filter\(row => !row\.hidden\)[\s\S]*?return visibleIds\.length \? visibleIds : sourceIds;[\s\S]*?\};/,
    "local history row playback should derive its queue from the currently visible filtered rows"
  );
  assert.match(
    musicHtml,
    /const queueTrackIds = getVisibleHistoryTrackIds\(tracks\);[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{ queueTrackIds, currentTrackId: target\.id, playing: true, mode: 'sequence' \}\)\);/,
    "local history playback should use visible queue ids and include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const addSelectedTracksToQueue = async \(\) => \{[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{ queueTrackIds: musicState\.queueTrackIds \|\| \[\], currentTrackId: musicState\.currentTrackId \|\| null, playing: musicState\.playing === true \}\)\);/,
    "local multi-select Add to Queue should include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const addTrackToPlayNext = async track => \{[\s\S]*?notifyMusicPlayer\(localPlaybackDetail\(\{[\s\S]*?queueTrackIds: musicState\.queueTrackIds \|\| \[\],[\s\S]*?currentTrackId: musicState\.currentTrackId \|\| null,[\s\S]*?playing: musicState\.playing === true[\s\S]*?\}\)\);/,
    "local Play Next should include local metadata for the shared player"
  );
  assert.match(
    musicHtml,
    /const getVisibleNeteaseQueueSongs = fallbackSongs => \{[\s\S]*?querySelectorAll\('tbody tr\[data-id\]'\)[\s\S]*?\.filter\(row => !row\.hidden\)[\s\S]*?return visibleSongs\.length \? visibleSongs : source;[\s\S]*?\};/,
    "NetEase row playback should derive its queue from the currently visible filtered rows"
  );
  assert.match(
    musicHtml,
    /const queueSongs = options\.queueSongs \|\| songs;[\s\S]*?await playNeteaseTrack\(song, getVisibleNeteaseQueueSongs\(queueSongs\)\);/,
    "clicking a NetEase row should play that song while keeping the current visible result set as the queue"
  );
  assert.match(
    musicHtml,
    /const playNeteaseTrack = async \(song, queueSongs = \[\], options = \{\}\) => \{[\s\S]*?mode: options\.forceSequence \? 'sequence' : snapshot\.mode \|\| 'sequence'/,
    "NetEase row playback should preserve the current playback mode unless Play All explicitly resets it"
  );
  assert.match(
    musicHtml,
    /renderNeteaseResults\(songs, \{ remember: false, queueSongs: songs, withFilter: true, showPlayCount: options\.showPlayCount === true, historyType: options\.historyType, emptyMessage: options\.emptyMessage \}\);/,
    "NetEase account collections should pass their full song list into the same row playback queue path"
  );
  assert.match(
    musicHtml,
    /const queueSource = \(queueSongs\?\.length \? queueSongs : \[song\]\)\.filter\(item => item\?\.id\);[\s\S]*?const queueTrackIds = tracks\.map\(item => item\.id\);[\s\S]*?currentTrackId: track\.id/,
    "the shared player payload should include the full NetEase queue while starting at the clicked track"
  );
});

test("shared player skips unavailable NetEase songs while advancing the queue", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /const adjacentCandidates = direction => \{[\s\S]*?return ordered\.map\(track=>track\.id\);[\s\S]*?\};/,
    "shared player should calculate a finite candidate list before advancing"
  );
  assert.doesNotMatch(
    playerScript,
    /const nextId =/,
    "shared player should not keep the old single-id advance helper that bypasses skip-aware queue traversal"
  );
  assert.match(
    playerScript,
    /async function playAdjacentTrack\(direction=1\)\{[\s\S]*?for\(const id of adjacentCandidates\(direction\)\)\{[\s\S]*?const ok=await playTrack\(id,true,\{silentFailure:true\}\);[\s\S]*?if\(skipped\) toast\('message','Skipped unavailable songs'/,
    "shared player should keep trying later queue items when a NetEase track cannot be played"
  );
  assert.match(
    playerScript,
    /const silentFailure = options\.silentFailure === true;[\s\S]*?if\(!silentFailure\) toast\('error','Unable to refresh NetEase URL'\);[\s\S]*?catch\(error\)\{[\s\S]*?const message=playbackErrorText\(error\);[\s\S]*?if\(!silentFailure\) toast\('error',message\);/,
    "skip-aware queue advance should suppress per-track failure toasts while preserving source-aware normal errors"
  );
  assert.match(
    playerScript,
    /state\.playing=false;[\s\S]*?syncPlayButton\(\);[\s\S]*?updateQueuePlaybackState\(\);[\s\S]*?if\(skipped\) toast\('error','No playable songs left'/,
    "shared player should clear the playing state when every remaining queue candidate is unavailable"
  );
  assert.match(
    playerScript,
    /els\.audio\.onended=\(\)=>\{ playAdjacentTrack\(1\); \};/,
    "automatic track end should use the same skip-aware queue advance path"
  );
});

test("shared player queue removal preserves playback continuity", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /const removedCurrent=state\.currentTrackId===track\.id;[\s\S]*?const nextPlaying=Boolean\(nextCurrent\)&&state\.playing===true;[\s\S]*?loadTrack\(false\); await continueQueuePlayback\(removedCurrent&&nextPlaying\); emitState\(\);/,
    "removing a non-current queue item should preserve playing state, while removing the current item should continue playback with the next queued song"
  );
  assert.match(
    playerScript,
    /async function continueQueuePlayback\(shouldPlay\)\{[\s\S]*?await playLoadedAudio\(\);[\s\S]*?state\.playing=false;[\s\S]*?updateQueuePlaybackState\(\);/,
    "queue playback continuity should use the same playable URL refresh and error handling path as normal playback"
  );
  assert.match(
    playerScript,
    /els\.clear\.onclick=async\(\)=>\{[\s\S]*?suppressPausePersist=true; els\.audio\.pause\(\); suppressPausePersist=false;[\s\S]*?queueTrackIds:\[\],currentTrackId:null,playing:false/,
    "clearing the queue should explicitly stop audio without leaking a stale pause state into persistence"
  );
});

test("shared player queue item click targets share play pause behavior", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /async function toggleQueueTrack\(id\)\{[\s\S]*?if \(id===state\.currentTrackId && !els\.audio\.paused\) \{ els\.audio\.pause\(\); return; \}[\s\S]*?await playTrack\(id,true\);[\s\S]*?\}/,
    "queue item toggle should pause the current playing track and play other tracks"
  );
  assert.match(
    playerScript,
    /play\.onclick=e=>\{ e\.stopPropagation\(\); toggleQueueTrack\(track\.id\); \};/,
    "queue cover play button should use the shared queue toggle behavior"
  );
  assert.match(
    playerScript,
    /main\.onclick=\(\)=>toggleQueueTrack\(track\.id\);/,
    "queue title area should use the same play pause behavior as the cover play button"
  );
});

test("shared player queue reorder stays local-persistent only for local queues", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /async function persistQueueOrderFromDom\(\)\{[\s\S]*?state=\{\.\.\.state,queueTrackIds:nextQueue,currentTrackId:nextQueue\.includes\(state\.currentTrackId\)\?state\.currentTrackId:nextQueue\[0\]\|\|null\};[\s\S]*?if\(api&&!hasNeteaseQueue\(\)\) state=await api\.updatePlayback/,
    "queue drag reorder should update the in-memory shared player queue but only persist local queues"
  );
  assert.match(
    playerScript,
    /els\.playlist\.addEventListener\('dragend',async\(\)=>\{[\s\S]*?if\(hadDrag\) await persistQueueOrderFromDom\(\);/,
    "queue dragend should route all reorder persistence through the source-aware queue order helper"
  );
});

test("shared player queue empty state is source-neutral", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /e\.textContent='Queue is empty';/,
    "shared player should not describe an empty NetEase queue as a missing local import"
  );
  assert.match(
    playerScript,
    /<button aria-label="Queue" class="music-playlist-button" id="musicPlaylistToggle" type="button">/,
    "shared player queue toggle should use the same queue terminology as the queue panel"
  );
  assert.doesNotMatch(
    playerScript,
    /aria-label="Playlist" class="music-playlist-button"/,
    "shared player queue toggle should not expose old playlist terminology"
  );
  assert.doesNotMatch(
    playerScript,
    /No music imported yet/,
    "shared player queue empty copy should stay neutral across local and online sources"
  );
  assert.match(
    playerScript,
    /toast\('success','Queue cleared'\);/,
    "clearing the shared player should describe the action as a queue operation"
  );
  assert.doesNotMatch(
    playerScript,
    /Playlist cleared/,
    "shared player copy should not imply that clearing the queue removed a playlist"
  );
});

test("shared player artist fallback respects local and NetEase sources", async () => {
  const playerScript = await fs.readFile(path.join(root, "app/music-player.js"), "utf8");

  assert.match(
    playerScript,
    /const artistFallback = track => isNeteaseId\(track\?\.id\) \? 'NetEase Cloud' : 'Local music';/,
    "shared player should choose fallback artist text from the active track source"
  );
  assert.match(
    playerScript,
    /main\.querySelector\('\.music-track-subtitle'\)\.textContent=clean\(track\.artist\)\|\|artistFallback\(track\);/,
    "queue rows should not show Local music for NetEase songs with missing artist metadata"
  );
  assert.match(
    playerScript,
    /artist\.textContent=clean\(track\?\.artist\)\|\|artistFallback\(track\);/,
    "queue drag previews should use the same source-aware artist fallback"
  );
  assert.match(
    playerScript,
    /els\.artist\.textContent=clean\(t\.artist\)\|\|artistFallback\(t\);/,
    "the main shared player artist label should use the same source-aware fallback"
  );
});

test("NetEase first-play notification retries past shell player fallback mount", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const shellScript = await fs.readFile(path.join(root, "app/stitch-shell.js"), "utf8");

  assert.match(
    shellScript,
    /\[120, 360, 800, 1500\]\.forEach\(delay => setTimeout\(ensureShellPlayer, delay\)\)/,
    "shell should keep a delayed player mount fallback for Music routing"
  );
  assert.match(
    musicHtml,
    /\[40, 120, 260, 520, 900, 1500, 2200\]\.forEach\(\(delay, index, attempts\) => \{/,
    "NetEase direct playback notifications should retry longer than the shell fallback mount window"
  );
});

test("NetEase account song collections are not capped to tiny preview slices", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/netease-api-service.js"), "utf8");

  assert.match(
    musicHtml,
    /getUserPlaylists\(\{\s*offset:\s*0\s*\}\)/,
    "NetEase account playlist view should not hard-code a 50-playlist preview limit"
  );
  assert.match(
    neteaseService,
    /const MAX_ACCOUNT_PLAYLISTS = 500;[\s\S]*?async getUserPlaylists\(\{ limit = 0, offset = 0 \} = \{\}\)[\s\S]*?while \(playlists\.length < \(targetLimit \|\| MAX_ACCOUNT_PLAYLISTS\)\)/,
    "NetEase account playlists should be fetched in pages instead of a single tiny batch"
  );
  assert.doesNotMatch(
    musicHtml,
    /getPlaylistSongs\(\{\s*neteaseId:\s*playlist\.neteaseId,\s*limit:\s*200/,
    "NetEase playlist detail should not hard-code a 200-song preview limit"
  );
  assert.match(
    neteaseService,
    /while \(songs\.length < \(targetLimit \|\| MAX_ACCOUNT_SONGS\)\) \{[\s\S]*?playlist_track_all/,
    "NetEase playlist songs should be fetched in pages for full-account playlist playback"
  );
  assert.match(
    neteaseService,
    /async getLikedPlaylist\(profile\) \{[\s\S]*?neteaseApi\.user_playlist_create[\s\S]*?page\.find\(isLikedPlaylist\)/,
    "NetEase liked view should find the account red-heart playlist from created playlists"
  );
  assert.match(
    neteaseService,
    /async getLikedSongs\(\) \{[\s\S]*?const playlist = await this\.getLikedPlaylist\(auth\.profile\);[\s\S]*?const result = await this\.getPlaylistSongs\(\{ neteaseId: playlist\.neteaseId \}\);/,
    "NetEase liked view should load songs from the red-heart playlist instead of rebuilding a synthetic list"
  );
  assert.doesNotMatch(
    neteaseService,
    /for \(const part of chunks\(limitedIds, PAGE_SIZE\)\)|await neteaseApi\.song_detail\(this\.withCookie\(\{ ids: part\.join/,
    "NetEase liked view should not aggregate liked ids through song_detail batches"
  );
});

test("NetEase playlist cards reuse local tilted-card interaction", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");
  const neteaseService = await fs.readFile(path.join(root, "electron/netease-api-service.js"), "utf8");

  assert.match(
    musicHtml,
    /hero\.querySelector\('\.playlist-detail-meta'\)\.textContent = subtitle \|\| `[$]\{songs\.length\} track[$]\{songs\.length === 1 \? '' : 's'\}`;/,
    "NetEase detail hero fallback should use the same track/tracks wording as local playlist details"
  );
  assert.match(
    musicHtml,
    /const creator = playlist\.creator \|\| 'NetEase Cloud';[\s\S]*?`[$]\{trackCount\} track[$]\{trackCount === 1 \? '' : 's'\} \\u00b7 [$]\{creator\}`/,
    "NetEase playlist detail meta should include track count and source context like local playlist details"
  );
  assert.match(
    musicHtml,
    /const totalTracks = result\.playlists\.reduce\(\(sum, playlist\) => sum \+ \(Number\(playlist\.trackCount\) \|\| 0\), 0\);[\s\S]*?`[$]\{result\.playlists\.length\} playlist[$]\{result\.playlists\.length === 1 \? '' : 's'\} \\u00b7 [$]\{totalTracks\} track[$]\{totalTracks === 1 \? '' : 's'\}`/,
    "NetEase playlist summary should match the local playlists/tracks count format"
  );
  assert.match(
    musicHtml,
    /if \(!result\.playlists\.length\) \{[\s\S]*?empty\.className = 'netease-empty';[\s\S]*?empty\.textContent = 'No NetEase playlists found\.';[\s\S]*?neteaseAccountPanel\.replaceChildren\(wrap\);[\s\S]*?return;/,
    "NetEase playlist account view should show an explicit empty state instead of a blank grid"
  );
  assert.match(
    musicHtml,
    /card\.className = 'playlist-tilted-card';[\s\S]*?card\.querySelector\('\.playlist-card-meta'\)\.textContent = `\$\{playlist\.trackCount \|\| 0\} tracks`;[\s\S]*?attachTiltedCard\(card\);/,
    "NetEase playlist cards should use the same tilted hover behavior as local playlist cards"
  );
  assert.match(
    neteaseService,
    /fetchPages\(neteaseApi\.user_playlist_create\),[\s\S]*?fetchPages\(neteaseApi\.user_playlist_collect\)/,
    "NetEase playlist grouping should use the API's created and collected playlist endpoints directly"
  );
  assert.match(
    neteaseService,
    /function playlistRows\(body = \{\}\) \{[\s\S]*?if \(Array\.isArray\(body\.data\)\) return body\.data;[\s\S]*?body\.createdPlaylist[\s\S]*?body\.collectPlaylist[\s\S]*?body\.data\?\.createdPlaylist[\s\S]*?body\.data\?\.collectPlaylist/,
    "NetEase playlist grouping should parse the created and collected endpoint response shapes"
  );
  assert.doesNotMatch(
    neteaseService,
    /neteaseApi\.user_playlist\(/,
    "NetEase playlist grouping should not fetch one mixed user playlist and infer ownership in the UI"
  );
  assert.match(
    neteaseService,
    /createdPlaylists = createdResult\.playlists\.filter\(playlist => !isLikedPlaylist\(playlist\)\)\.map\(playlist => normalizePlaylist\(playlist, \{ owned: true \}\)\);[\s\S]*?savedPlaylists = savedResult\.playlists\.filter\(playlist => !isLikedPlaylist\(playlist\)\)\.map\(playlist => normalizePlaylist\(playlist, \{ subscribed: true \}\)\);/,
    "NetEase playlist service should use API-provided created and collected groups for ownership and collection state"
  );
  assert.match(
    musicHtml,
    /const createdGroup = Array\.isArray\(result\.createdPlaylists\) \? result\.createdPlaylists : result\.playlists;[\s\S]*?const savedGroup = Array\.isArray\(result\.savedPlaylists\) \? result\.savedPlaylists : \[\];[\s\S]*?appendPlaylistGroup\('Created Playlists', createdGroup \|\| \[\]\);[\s\S]*?appendPlaylistGroup\('Saved Playlists', savedGroup \|\| \[\]\);/,
    "NetEase playlist view should render API-provided groups and avoid an empty grouped page while the main process is still on an older response shape"
  );
  assert.match(
    musicHtml,
    /<div id="neteaseAccountPanel"><\/div>[\s\S]*?<div id="neteaseResults">/,
    "NetEase account and playlist detail hero should render above the song result table"
  );
});

test("NetEase loading states use shimmer placeholders", async () => {
  const musicHtml = await fs.readFile(path.join(root, "app/music.html"), "utf8");

  assert.match(
    musicHtml,
    /\.shimmer\{[\s\S]*?animation:shimmer 1\.35s ease-in-out infinite[\s\S]*?@keyframes shimmer/,
    "NetEase loading placeholders should have a visible shimmer animation"
  );
  assert.match(
    musicHtml,
    /const renderPlaylistLoading = \(\) => `[\s\S]*?netease-loading-card-grid[\s\S]*?netease-loading-card shimmer/,
    "playlist loading should show shimmering playlist cards"
  );
  assert.match(
    musicHtml,
    /const renderSongDetailLoading = \(\) => `[\s\S]*?netease-loading-hero[\s\S]*?netease-loading-cover shimmer/,
    "playlist detail loading should show a shimmering hero cover area"
  );
  assert.match(
    musicHtml,
    /const renderSongRowsLoading = \(label = 'Loading songs'\) => `[\s\S]*?netease-loading-row[\s\S]*?netease-loading-thumb shimmer/,
    "song loading should show shimmering table rows"
  );
  assert.match(
    musicHtml,
    /neteaseAccountPanel\.innerHTML = renderPlaylistLoading\(\);/,
    "loading playlists should use shimmer instead of static text"
  );
  assert.match(
    musicHtml,
    /neteaseAccountPanel\.innerHTML = renderSongDetailLoading\(\);[\s\S]*?neteaseResults\.innerHTML = renderSongRowsLoading\(\);/,
    "loading playlist songs should use shimmer in both hero and song rows"
  );
  assert.match(
    musicHtml,
    /neteaseResults\.innerHTML = renderSongRowsLoading\('Searching songs'\);/,
    "searching songs should use shimmering rows"
  );
});
