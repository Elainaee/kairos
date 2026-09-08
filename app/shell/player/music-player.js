(function(){
  if (window.KairosMusicPlayer) return;

  const html = `
<section aria-label="Music player" data-i18n-aria-label="player.workspace" id="musicPlayer">
<div><div class="music-player-track"><button aria-label="Album cover" data-i18n-aria-label="player.albumCover" id="musicCoverButton" type="button" tabindex="-1"><span class="music-icon material-symbols-outlined" id="musicCoverIcon">music_note</span><img alt="Album cover" data-i18n-alt="player.albumCover" class="hidden" id="musicCover"></button><div class="min-w-0"><h3 class="music-player-title" id="musicTitle">Choose a song</h3><p class="music-player-artist" id="musicArtist">Local ambience</p></div></div>
<div class="music-transport"><div class="music-transport-controls"><button aria-label="Add current song to liked" data-i18n-aria-label="player.addCurrentToLiked" aria-pressed="false" class="music-like-button" id="musicLike" type="button"><span class="music-icon material-symbols-outlined">favorite</span></button><button aria-label="Previous" data-i18n-aria-label="player.previous" id="musicPrevious" type="button"><svg aria-hidden="true" class="transport-skip-icon" viewBox="0 0 24 24"><path d="M5 5.5a1.2 1.2 0 0 1 2.4 0v13a1.2 1.2 0 0 1-2.4 0v-13Z" fill="currentColor"/><path d="M19.1 5.8c.82-.52 1.9.06 1.9 1.04v10.32c0 .98-1.08 1.56-1.9 1.04l-8.1-5.16a1.23 1.23 0 0 1 0-2.08l8.1-5.16Z" fill="currentColor"/></svg></button><button aria-label="Play" data-i18n-aria-label="player.play" id="musicToggle" type="button"><span class="music-icon material-symbols-outlined" id="musicToggleIcon">play_arrow</span></button><button aria-label="Next" data-i18n-aria-label="player.next" id="musicNext" type="button"><svg aria-hidden="true" class="transport-skip-icon" viewBox="0 0 24 24"><path d="M4.9 5.8C4.08 5.28 3 5.86 3 6.84v10.32c0 .98 1.08 1.56 1.9 1.04l8.1-5.16a1.23 1.23 0 0 0 0-2.08L4.9 5.8Z" fill="currentColor"/><path d="M16.6 5.5a1.2 1.2 0 0 1 2.4 0v13a1.2 1.2 0 0 1-2.4 0v-13Z" fill="currentColor"/></svg></button><button aria-label="Playback mode" data-i18n-aria-label="player.playbackMode" aria-pressed="false" class="music-shuffle" id="musicMode" title="Sequence" data-i18n-title="player.sequence" type="button"><span class="music-icon material-symbols-outlined" id="musicModeIcon">format_list_numbered</span></button></div><div class="music-timeline"><time id="musicCurrent">0:00</time><div class="elastic-progress"><div aria-label="Playback position" data-i18n-aria-label="player.position" aria-valuemax="100" aria-valuemin="0" aria-valuenow="0" class="elastic-progress-root" id="elasticProgressRoot" role="slider" tabindex="0"><div class="elastic-progress-track-wrap"><div class="elastic-progress-track"><i id="elasticProgressRange"></i></div></div><input class="music-range" id="musicProgress" max="100" min="0" tabindex="-1" type="range" value="0"></div></div><time id="musicDuration">0:00</time></div></div>
<div class="music-player-right"><div class="elastic-volume" id="elasticVolume"><span class="music-icon material-symbols-outlined elastic-volume-icon" id="volumeIcon">volume_down</span><div aria-label="Volume" data-i18n-aria-label="player.volume" aria-valuemax="100" aria-valuemin="0" aria-valuenow="70" class="elastic-volume-root" id="elasticVolumeRoot" role="slider" tabindex="0"><div class="elastic-volume-track-wrap"><div class="elastic-volume-track"><i id="elasticVolumeRange"></i></div></div><input id="musicVolume" max="100" min="0" tabindex="-1" type="range" value="70"></div><span class="music-icon material-symbols-outlined elastic-volume-icon">volume_up</span><output id="elasticVolumeValue">70</output></div><button aria-label="Queue" data-i18n-aria-label="player.toggleQueue" class="music-playlist-button" id="musicPlaylistToggle" type="button"><span class="music-icon material-symbols-outlined">queue_music</span></button></div></div>
<audio id="musicAudio" preload="auto"></audio>
<div class="music-playlist-panel" id="musicPlaylistPanel" hidden><header><div class="music-queue-title"><span class="music-icon material-symbols-outlined">queue_music</span><strong data-i18n="player.queue">Queue</strong></div><div><button class="music-queue-clear" data-i18n="player.clearAll" type="button" id="musicClearButton">Clear All</button><button aria-label="Close queue" data-i18n-aria-label="player.closeQueue" class="music-queue-close" id="musicPlaylistClose" type="button"><span class="music-icon material-symbols-outlined">close</span></button></div></header><div class="music-queue-scroll"><ol id="musicPlaylist"></ol></div><footer><p id="musicStatus" role="status"></p></footer></div>
</section>`;

  const fmt = s => !Number.isFinite(s) || s < 0 ? '0:00' : `${Math.floor(s/60)}:${String(Math.floor(s%60)).padStart(2,'0')}`;
  const clean = value => String(value || '').replace(/[\u0000-\u001f\u007f-\u009f\ufffd]+/g, '').trim();
  const decay = (value, max = 50) => (2 * (1 / (1 + Math.exp(-(value / max))) - .5)) * max;

  function mount(){
    if (document.getElementById('musicPlayer')) return window.KairosMusicPlayer;
    if (new URLSearchParams(location.search).get('embed') === '1' && window.parent !== window) return window.KairosMusicPlayer;
    document.body.insertAdjacentHTML('beforeend', html);
    window.dispatchEvent(new CustomEvent('kairos:music-player-ready'));

    const $ = id => document.getElementById(id);
    const els = {
      audio:$('musicAudio'), coverButton:$('musicCoverButton'), cover:$('musicCover'), coverIcon:$('musicCoverIcon'),
      title:$('musicTitle'), artist:$('musicArtist'), like:$('musicLike'), toggle:$('musicToggle'), toggleIcon:$('musicToggleIcon'), previous:$('musicPrevious'), next:$('musicNext'),
      mode:$('musicMode'), modeIcon:$('musicModeIcon'), current:$('musicCurrent'), duration:$('musicDuration'), progress:$('musicProgress'),
      progressRoot:$('elasticProgressRoot'), progressRange:$('elasticProgressRange'), volume:$('musicVolume'), volumeRoot:$('elasticVolumeRoot'),
      volumeRange:$('elasticVolumeRange'), volumeValue:$('elasticVolumeValue'), volumeIcon:$('volumeIcon'), elasticVolume:$('elasticVolume'),
      playlistToggle:$('musicPlaylistToggle'), playlistPanel:$('musicPlaylistPanel'), playlistClose:$('musicPlaylistClose'), playlist:$('musicPlaylist'), clear:$('musicClearButton'), status:$('musicStatus')
    };
    document.body.appendChild(els.playlistPanel);
    const tr = (key, params, fallback = key) => window.KairosI18n?.t?.(key, params, fallback) || fallback;
    const trPlural = (key, count, fallback) => window.KairosI18n?.plural?.(key, count, {}, fallback) || fallback;
    const translatePlayer = () => {
      window.KairosI18n?.translateDom?.(document.getElementById('musicPlayer'));
      window.KairosI18n?.translateDom?.(els.playlistPanel);
    };
    translatePlayer();

    let state = { tracks: [], queueTrackIds: [], currentTrackId: null, mode: 'sequence', playing: false, volume: 70, muted: false, positions: {} };
    let saveTimer = null, volumeDragging = false, progressDragging = false, pendingSeek = null, suppressPausePersist = false, queueDragging = false, draggedQueueId = null, queueDragCard = null, countedPlayTrackId = null, externalRefreshVersion = 0, lastAppliedRefreshAt = 0, playbackAttemptDepth = 0, lastPersistedPositionKey = '', lastQueueStatusBucket = -1;
    const durationCache = new Map();
    const desktop = () => window.kairosDesktop?.music || null;
    const runtime = () => state.runtime ||= { lastSource:'local', neteasePlayback:null, playCounts:{} };
    const persistRuntime = patch => { state.runtime = { ...runtime(), ...patch }; desktop()?.updateRuntime?.(patch).catch(() => {}); };
    const neteaseDesktop = () => {
      if (window.kairosDesktop?.netease) return window.kairosDesktop.netease;
      try { return window.parent?.kairosDesktop?.netease || null; } catch { return null; }
    };
    const getNeteaseQualityPreference = () => {
      try {
        const settings = window.KairosSettingsFeature?.read?.() || window.parent?.KairosSettingsFeature?.read?.() || {};
        const value = settings?.music?.neteaseQuality || 'standard';
        return ['standard','higher','exhigh','lossless'].includes(value) ? value : 'standard';
      } catch {
        return 'standard';
      }
    };
    const toast = (type, title, description='') => window.dispatchEvent(new CustomEvent('kairos:toast',{detail:{type,title,description}}));
    const isNeteaseId = id => String(id || '').startsWith('netease:');
    const isNeteaseUrlStale = track => {
      if (!isNeteaseId(track?.id)) return false;
      if (!track.playUrl) return true;
      const expiresAt = Number(track.urlExpiresAt || 0);
      return expiresAt > 0 && Date.now() > expiresAt - 60000;
    };
    const hasNeteaseQueue = () => isNeteaseId(state.currentTrackId) || (state.queueTrackIds || []).some(isNeteaseId);
    const isGlobalPlayerSettingPatch = patch => {
      const keys = Object.keys(patch || {});
      return keys.length > 0 && keys.every(key => key === 'volume' || key === 'muted' || key === 'mode');
    };
    const shouldPersistPlayback = patch => {
      if (hasNeteaseQueue() && !isGlobalPlayerSettingPatch(patch)) return false;
      if (isNeteaseId(patch?.currentTrackId)) return false;
      if (Array.isArray(patch?.queueTrackIds) && patch.queueTrackIds.some(isNeteaseId)) return false;
      if (patch?.position?.trackId && isNeteaseId(patch.position.trackId)) return false;
      return true;
    };
    const queueTracks = () => { const byId = new Map((state.tracks || []).map(t => [t.id, t])); return (state.queueTrackIds || []).map(id => byId.get(id)).filter(Boolean); };
    const currentTrack = () => queueTracks().find(t => t.id === state.currentTrackId) || queueTracks()[0] || null;
    const readNeteasePlayback = () => {
      try {
        const saved = runtime().neteasePlayback;
        const queueTrackIds = Array.isArray(saved?.queueTrackIds) ? saved.queueTrackIds.filter(isNeteaseId) : [];
        const tracks = Array.isArray(saved?.tracks) ? saved.tracks.filter(track => isNeteaseId(track?.id)) : [];
        if (!queueTrackIds.length || !tracks.length) return null;
        return {
          tracks,
          queueTrackIds,
          currentTrackId: queueTrackIds.includes(saved.currentTrackId) ? saved.currentTrackId : queueTrackIds[0],
          mode: ['sequence','loop','shuffle','single'].includes(saved.mode) ? saved.mode : 'sequence',
          positions: saved.positions && typeof saved.positions === 'object' ? saved.positions : {}
        };
      } catch { return null; }
    };
    const saveNeteasePlayback = () => {
      if (!hasNeteaseQueue()) return;
      const queueTrackIds = (state.queueTrackIds || []).filter(isNeteaseId);
      const tracks = (state.tracks || []).filter(track => isNeteaseId(track?.id));
      if (!queueTrackIds.length || !tracks.length) return;
      const positions = Object.fromEntries(Object.entries(state.positions || {}).filter(([id]) => isNeteaseId(id)));
      persistRuntime({ neteasePlayback: {
        tracks,
        queueTrackIds,
        currentTrackId: queueTrackIds.includes(state.currentTrackId) ? state.currentTrackId : queueTrackIds[0],
        mode: state.mode || 'sequence',
        positions,
        updatedAt: new Date().toISOString()
      }, lastSource: 'netease' });
    };
    const rememberPlaybackSource = () => {
      if (hasNeteaseQueue()) { saveNeteasePlayback(); return; }
      const queueTrackIds = state.queueTrackIds || [];
      if (state.currentTrackId || queueTrackIds.length) {
        persistRuntime({ lastSource: 'local' });
        return;
      }
      persistRuntime({ lastSource: 'empty' });
    };
    const clearNeteasePlayback = () => {
      persistRuntime({ neteasePlayback: null, lastSource: 'empty' });
    };
    window.addEventListener('kairos:netease-cache-cleared', clearNeteasePlayback);
    const restoreLastPlaybackSource = nextState => {
      const savedRuntime = nextState.runtime || {};
      const lastSource = savedRuntime.lastSource || 'local';
      if (lastSource === 'empty') return { ...nextState, queueTrackIds: [], currentTrackId: null, playing: false };
      if (lastSource !== 'netease') return nextState;
      const saved = savedRuntime.neteasePlayback;
      if (!saved) return nextState;
      const localTracks = (nextState.tracks || []).filter(track => !isNeteaseId(track?.id));
      return {
        ...nextState,
        tracks: [...localTracks, ...saved.tracks],
        queueTrackIds: saved.queueTrackIds,
        currentTrackId: saved.currentTrackId,
        mode: saved.mode || nextState.mode || 'sequence',
        playing: false,
        positions: { ...(nextState.positions || {}), ...(saved.positions || {}) }
      };
    };
    const persist = patch => { const api = desktop(); if (!api || !shouldPersistPlayback(patch)) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => api.updatePlayback(patch).catch(()=>{}), 180); };
    const persistNow = patch => { const api = desktop(); if (!api || !shouldPersistPlayback(patch)) return; clearTimeout(saveTimer); api.updatePlayback(patch).catch(()=>{}); };
    const remainingSeconds = () => queueTracks().reduce((sum,t) => !Number.isFinite(t.duration)||t.duration<=0 ? sum : sum + (t.id===state.currentTrackId ? Math.max(0,t.duration-(els.audio.currentTime||0)) : t.duration), 0);
    const remainingText = s => {
      if (!Number.isFinite(s)||s<=0) return '';
      const minutes=Math.round(s/60);
      return minutes<60
        ? tr('player.remainingMinutes',{minutes},` · ${minutes} min remaining`)
        : tr('player.remainingHours',{hours:Math.floor(minutes/60),minutes:minutes%60},` · ${Math.floor(minutes/60)}h ${String(minutes%60).padStart(2,'0')}m remaining`);
    };
    const artistFallback = track => isNeteaseId(track?.id) ? tr('music.neteaseCloud',{},'NetEase Cloud') : tr('music.localMusic',{},'Local music');
    const syncTrackCopy = track => {
      els.title.textContent = track ? clean(track.title)||clean(track.fileName)||tr('player.untitled',{},'Untitled') : tr('player.chooseSong',{},'Choose a song');
      els.artist.textContent = track ? clean(track.artist)||artistFallback(track) : tr('player.localAmbience',{},'Local ambience');
    };
    // The legacy window is file:-backed and keeps its original URL.  The Vue
    // development shell is http:-backed, so route local audio through the
    // Electron-owned protocol rather than creating a second audio element.
    const playableUrl = track => {
      if (location.protocol === 'http:' && String(track?.playUrl || '').startsWith('file:') && track?.id) return `kairos-media://track/${encodeURIComponent(track.id)}`;
      return track?.playUrl || '';
    };
    // Keep the artwork URL already resolved by the music library. In
    // particular, persisted covers are returned as data: URLs and are valid in
    // both the legacy document and the Vue shell. Only file: artwork needs the
    // Electron-owned bridge when Vue is served over http.
    const neteaseThumbnailUrl = value => {
      const url = String(value || '');
      if (!/^https?:\/\/p\d+\.music\.126\.net\//i.test(url) || /[?&]param=\d+y\d+/i.test(url)) return url;
      return `${url}${url.includes('?') ? '&' : '?'}param=160y160`;
    };
    const coverUrlCandidates = track => {
      const rawCoverUrl = track?.coverUrl || '';
      // Older saved NetEase queues contain a mixture of http and https cover
      // hosts. Vue's renderer policy intentionally blocks insecure images, so
      // upgrade the NetEase CDN URL before assigning it to <img>.
      const secureCoverUrl = /^http:\/\/p\d+\.music\.126\.net\//i.test(rawCoverUrl)
        ? rawCoverUrl.replace(/^http:/i, 'https:')
        : rawCoverUrl;
      // Queue artwork is rendered at 40 px. Asking NetEase for a bounded
      // thumbnail avoids multi-megabyte originals arriving after the row has
      // already fallen back to its placeholder.
      const coverUrl = neteaseThumbnailUrl(secureCoverUrl);
      const persistedCoverUrl = track?.id && track && track.coverAssetId
        ? `kairos-media://cover/${encodeURIComponent(track.id)}`
        : '';
      if (location.protocol === 'http:' && track?.id && coverUrl.startsWith('file:')) {
        return [`kairos-media://cover/${encodeURIComponent(track.id)}`];
      }
      const urls = [];
      if (coverUrl) urls.push(coverUrl);
      if (/^https:\/\/p[34]\.music\.126\.net\//i.test(coverUrl)) {
        const alternateHost = coverUrl.replace(/^https:\/\/p([34])\./i, (_, host) => `https://p${host === '3' ? '4' : '3'}.`);
        urls.push(alternateHost);
      }
      if (secureCoverUrl && secureCoverUrl !== coverUrl) urls.push(secureCoverUrl);
      if (persistedCoverUrl) urls.push(persistedCoverUrl);
      return [...new Set(urls.filter(Boolean))];
    };
    const displayCoverUrl = track => coverUrlCandidates(track)[0] || '';
    const attachCoverFallback = (img, track) => {
      const candidates = coverUrlCandidates(track);
      let candidateIndex = 0;
      img.onerror = () => {
        candidateIndex += 1;
        if (candidates[candidateIndex]) { img.src = candidates[candidateIndex]; return; }
        img.removeAttribute('src');
        img.classList.add('hidden');
      };
    };
    const setCover = t => { const coverUrl=displayCoverUrl(t); if (coverUrl) { attachCoverFallback(els.cover,t); els.cover.src=coverUrl; els.cover.classList.remove('hidden'); els.coverIcon.style.opacity='0'; } else { els.cover.removeAttribute('src'); els.cover.classList.add('hidden'); els.coverIcon.style.opacity='1'; } };
    const syncLikeButton = () => {
      const t = currentTrack();
      const liked = t?.liked === true;
      els.like.disabled = !t;
      els.like.setAttribute('aria-pressed', String(liked));
      els.like.setAttribute('aria-label', liked ? tr('player.removeCurrentFromLiked', {}, 'Remove current song from liked') : tr('player.addCurrentToLiked', {}, 'Add current song to liked'));
    };
    const updateCurrentTrackLiked = liked => {
      const t = currentTrack();
      if (!t) return;
      state.tracks = (state.tracks || []).map(track => track.id === t.id ? { ...track, liked } : track);
      syncLikeButton();
      emitState();
      renderQueue();
    };
    const modeButton = () => { const m=state.mode||'sequence'; const labelKey={sequence:'player.sequence',loop:'player.loop',shuffle:'player.shuffle',single:'player.repeatOne'}[m]||'player.sequence'; const fallback={sequence:'Sequence',loop:'Loop',shuffle:'Shuffle',single:'Repeat one'}[m]||'Sequence'; els.modeIcon.textContent={sequence:'format_list_numbered',loop:'repeat',shuffle:'shuffle',single:'repeat_one'}[m]||'format_list_numbered'; els.mode.title=tr(labelKey,{},fallback); els.mode.setAttribute('aria-pressed',String(m!=='sequence')); };
    const intendedPlaying = () => state.playing === true && els.audio.paused;
    const syncPlayButton = () => { const active = !els.audio.paused || intendedPlaying(); els.toggleIcon.textContent = active ? 'pause' : 'play_arrow'; els.toggle.setAttribute('aria-label', active ? tr('player.pause',{},'Pause') : tr('player.play',{},'Play')); els.toggle.classList.toggle('is-paused', active); };
    const emitState = () => {
      rememberPlaybackSource();
      const detail={...state,queueTrackIds:state.queueTrackIds||[],currentTrackId:state.currentTrackId||null,playing:state.playing===true,currentTime:els.audio.currentTime||0,at:Date.now()};
      window.dispatchEvent(new CustomEvent('kairos:music-state-changed',{detail}));
      try { if(window.parent&&window.parent!==window) window.parent.postMessage({type:'kairos:music-state-changed',detail},'*'); } catch {}
      try { document.querySelectorAll('iframe').forEach(frame=>frame.contentWindow?.postMessage({type:'kairos:music-state-changed',detail},'*')); } catch {}
    };
    const requestNeteaseUrlRefresh = async track => {
      if (!track?.neteaseId && !isNeteaseId(track?.id)) return null;
      const api = neteaseDesktop();
      if (api?.playSong) {
        try {
          const result = await api.playSong({ id: track.id, neteaseId: track.neteaseId, level: getNeteaseQualityPreference() });
          if (result?.ok && result.track?.playUrl) return result.track;
          if (result?.message) throw new Error(result.message);
        } catch (error) {
          throw new Error(error?.message || tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL'));
        }
      }
      const response = await new Promise(resolve => {
      const requestId = `netease-url-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      let done = false;
      const finish = detail => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        window.removeEventListener('kairos:netease-url-refreshed', onResponse);
        resolve(detail || {});
      };
      const onResponse = event => {
        if (event.detail?.requestId !== requestId) return;
        finish(event.detail || {});
      };
      const timer = setTimeout(() => finish({ error: tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL') }), 9000);
      window.addEventListener('kairos:netease-url-refreshed', onResponse);
      const detail = { requestId, track };
      window.dispatchEvent(new CustomEvent('kairos:netease-refresh-url', { detail }));
      if (window.parent && window.parent !== window) window.parent.dispatchEvent(new CustomEvent('kairos:netease-refresh-url', { detail }));
      });
      if (response?.track?.playUrl) return response.track;
      if (response?.error) throw new Error(response.error);
      return null;
    };
    const readLocalPlayCounts = () => runtime().playCounts || {};
    const writeLocalPlayCount = id => {
      const counts=readLocalPlayCounts();
      const entry=counts[id]||{};
      counts[id]={count:Math.max(0,Number(entry.count)||0)+1,lastPlayedAt:new Date().toISOString()};
      persistRuntime({ playCounts: counts });
      state.tracks=(state.tracks||[]).map(track=>track.id===id?{...track,playCount:Math.max(Number(track.playCount)||0,counts[id].count),lastPlayedAt:counts[id].lastPlayedAt}:track);
    };
    const emitMusicRefresh = detail => {
      const eventDetail={source:'player',...detail};
      window.dispatchEvent(new CustomEvent('kairos:music-refresh',{detail:eventDetail}));
      if(window.parent&&window.parent!==window) window.parent.dispatchEvent(new CustomEvent('kairos:music-refresh',{detail:eventDetail}));
    };
    const countCurrentPlay = () => {
      const id=state.currentTrackId;
      if(!id||countedPlayTrackId===id) return;
      countedPlayTrackId=id;
      if(isNeteaseId(id)) {
        emitState();
        return;
      }
      writeLocalPlayCount(id);
      emitState();
      emitMusicRefresh({source:'player-play-count',tracks:state.tracks});
      const api=desktop();
      if(api?.updateTrack && !String(id).startsWith('netease:')) {
        api.updateTrack({id,incrementPlayCount:true}).then(nextState=>{
          state={...state,tracks:nextState.tracks||state.tracks};
          emitState();
          emitMusicRefresh({source:'player-play-count',tracks:state.tracks});
        }).catch(()=>{ countedPlayTrackId=null; });
      }
    };
    const applyVolume = () => { const v=Number.isFinite(state.volume)?state.volume:70; els.audio.volume=state.muted?0:Math.max(0,Math.min(1,v/100)); els.volume.value=v; els.volumeRange.style.width=`${v}%`; els.volumeValue.value=v; els.volumeRoot.setAttribute('aria-valuenow',v); els.volumeIcon.textContent=state.muted||els.audio.volume===0?'volume_off':els.audio.volume<.5?'volume_down':'volume_up'; };
    const applyRouteLayout = event => {
      const root = document.getElementById('musicPlayer');
      if (!root) return;
      const requestedView = String(event?.detail?.view || document.body.dataset.kairosVuePage || '');
      const routeView = ['calendar','habits','schedule','music'].includes(requestedView)
        ? requestedView
        : (document.body.classList.contains('kairos-music-view') || location.hash === '#music' ? 'music'
          : document.body.classList.contains('kairos-secondary-view') ? 'secondary' : 'calendar');
      const inMusic = routeView === 'music';
      root.hidden = routeView !== 'calendar' && !inMusic;
      if (root.hidden) root.style.setProperty('display', 'none', 'important');
      else root.style.removeProperty('display');
      if (root.hidden) setQueueOpen(false);
      if (inMusic) {
        root.hidden = false;
        root.style.left = '0px';
        root.style.right = '0px';
        root.style.top = 'auto';
        root.style.bottom = '0px';
        root.style.setProperty('height', '80px', 'important');
      }
      settleQueuePosition();
    };

    function queuePlayIcon(){
      return '<svg class="music-queue-play-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8.75 6.45c0-1.18 1.29-1.9 2.29-1.28l8.22 5.14c.94.59.94 1.96 0 2.55L11.04 18c-1 .62-2.29-.1-2.29-1.28V6.45Z" fill="currentColor"/></svg><svg class="music-queue-pause-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7.4 5.2h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2H7.4c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Zm6 0h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2h-3.2c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Z" fill="currentColor"/></svg>';
    }
    function queueCover(track){
      const c=document.createElement('div'); c.className='music-queue-cover';
      const coverUrl=displayCoverUrl(track);
      if (coverUrl) { const img=document.createElement('img'); img.alt=''; attachCoverFallback(img,track); img.src=coverUrl; c.append(img); }
      else { const i=document.createElement('span'); i.className='music-icon material-symbols-outlined'; i.textContent='music_note'; c.append(i); }
      const play=document.createElement('button'); play.type='button'; play.className='music-queue-play-button'; play.dataset.state=track.id===state.currentTrackId && !els.audio.paused?'pause':'play'; play.setAttribute('aria-label',play.dataset.state==='pause'?tr('player.pauseTrack',{},'Pause track'):tr('player.playTrack',{},'Play track')); play.innerHTML=queuePlayIcon(); play.onclick=e=>{ e.stopPropagation(); toggleQueueTrack(track.id); };
      c.append(play);
      return c;
    }
    async function toggleQueueTrack(id){
      if (id===state.currentTrackId && !els.audio.paused) { els.audio.pause(); return; }
      await playTrack(id,true);
    }
    function queueItem(track,index){
      const li=document.createElement('li'); li.className=track.id===state.currentTrackId?'current':''; li.dataset.id=track.id; li.draggable=true;
      li.append(queueCover(track));
      const main=document.createElement('button'); main.type='button'; main.className='music-track-main'; main.innerHTML='<span class="music-track-title"></span><span class="music-track-subtitle"></span>'; main.querySelector('.music-track-title').textContent=clean(track.title)||clean(track.fileName)||tr('player.untitled',{},'Untitled'); main.querySelector('.music-track-subtitle').textContent=clean(track.artist)||artistFallback(track); main.onclick=()=>toggleQueueTrack(track.id);
      const remove=document.createElement('button'); remove.type='button'; remove.className='music-track-remove'; remove.setAttribute('aria-label',tr('player.removeFromQueue',{title:track.title||track.fileName||tr('player.untitled',{},'Untitled')},`Remove ${track.title||track.fileName||'track'} from queue`)); remove.innerHTML='<span class="music-icon material-symbols-outlined">close</span>'; remove.onclick=async e=>{ e.stopPropagation(); const wasNeteaseQueue=hasNeteaseQueue(); const api=desktop(); const nextQueue=(state.queueTrackIds||[]).filter(id=>id!==track.id); const removedCurrent=state.currentTrackId===track.id; const nextCurrent=removedCurrent?(nextQueue[0]||null):state.currentTrackId; const nextPlaying=Boolean(nextCurrent)&&state.playing===true; state={...state,queueTrackIds:nextQueue,currentTrackId:nextCurrent,playing:nextPlaying}; if(api&&!wasNeteaseQueue) state=await api.updatePlayback({queueTrackIds:nextQueue,currentTrackId:nextCurrent,playing:nextPlaying}); loadTrack(false); await continueQueuePlayback(removedCurrent&&nextPlaying); emitState(); };
      li.append(main,remove); return li;
    }
    function renderQueue(){
      els.playlist.replaceChildren();
      const queue = queueTracks();
      if (!queue.length) { const e=document.createElement('li'); e.className='music-playlist-empty'; e.textContent=tr('player.queueEmpty',{},'Queue is empty'); els.playlist.append(e); els.status.textContent=trPlural('player.queueCount',0,'0 Tracks'); return; }
      const cur=currentTrack(); if (cur) els.playlist.append(queueItem(cur,queue.indexOf(cur)));
      const upcoming=queue.filter(t=>t.id!==cur?.id); if (upcoming.length) { const s=document.createElement('li'); s.className='music-queue-section'; s.textContent=tr('player.upcoming',{},'Upcoming'); els.playlist.append(s); }
      queue.forEach((t,i)=>{ if(t.id!==cur?.id) els.playlist.append(queueItem(t,i)); });
      updateQueueStatus(queue);
      updateQueuePlaybackState();
    }
    function updateQueueStatus(queue = queueTracks()){
      const rem=remainingText(remainingSeconds());
      const tracks=trPlural('player.queueCount',queue.length,`${queue.length} Track${queue.length===1?'':'s'}`);
      els.status.textContent=tr('player.queueSummary',{tracks,remaining:rem},`${tracks}${rem}`);
    }
    function updateQueuePlaybackState(){
      els.playlist.querySelectorAll('li[data-id]').forEach(item=>{
        const isCurrent=item.dataset.id===state.currentTrackId;
        item.classList.toggle('current',isCurrent);
        const button=item.querySelector('.music-queue-play-button');
        if(button){
          const isPause=isCurrent&&!els.audio.paused;
          button.dataset.state=isPause?'pause':'play';
          button.setAttribute('aria-label',isPause?tr('player.pauseTrack',{},'Pause track'):tr('player.playTrack',{},'Play track'));
        }
      });
    }
    const clearQueueDropHints = () => els.playlist.querySelectorAll('.drop-before,.drop-after').forEach(item=>item.classList.remove('drop-before','drop-after'));
    function makeQueueDragCard(track){
      const card=document.createElement('div'); card.className='music-queue-drag-card';
      const cover=document.createElement('span'); cover.className='music-queue-drag-cover';
      const coverUrl=displayCoverUrl(track);
      if(coverUrl){ const img=document.createElement('img'); img.alt=''; attachCoverFallback(img,track); img.src=coverUrl; cover.append(img); }
      else cover.innerHTML='<span class="music-icon material-symbols-outlined">music_note</span>';
      const copy=document.createElement('span'); copy.className='music-queue-drag-copy';
      const title=document.createElement('span'); title.className='music-queue-drag-title'; title.textContent=clean(track?.title)||clean(track?.fileName)||tr('player.untitled',{},'Untitled');
      const artist=document.createElement('span'); artist.className='music-queue-drag-artist'; artist.textContent=clean(track?.artist)||artistFallback(track);
      copy.append(title,artist); card.append(cover,copy); document.body.append(card); return card;
    }
    async function persistQueueOrderFromDom(){
      const nextQueue=[...els.playlist.querySelectorAll('li[data-id]')].map(item=>item.dataset.id).filter(Boolean);
      if(!nextQueue.length) return;
      state={...state,queueTrackIds:nextQueue,currentTrackId:nextQueue.includes(state.currentTrackId)?state.currentTrackId:nextQueue[0]||null};
      const api=desktop();
      if(api&&!hasNeteaseQueue()) state=await api.updatePlayback({queueTrackIds:state.queueTrackIds,currentTrackId:state.currentTrackId,playing:state.playing===true&&Boolean(state.currentTrackId)});
      renderQueue(); emitState();
    }
    function loadTrack(restore=true){
      const t=currentTrack();
      if (!t) { els.audio.removeAttribute('src'); syncTrackCopy(null); els.current.textContent=els.duration.textContent='0:00'; els.progress.value=0; els.progressRange.style.width='0%'; setCover(null); syncLikeButton(); syncPlayButton(); renderQueue(); return; }
      state.currentTrackId=t.id;
      lastPersistedPositionKey='';
      lastQueueStatusBucket=-1;
      const sourceUrl = playableUrl(t);
      if (sourceUrl) {
        if (els.audio.src!==sourceUrl) { els.audio.src=sourceUrl; els.audio.load(); }
      } else if (isNeteaseId(t.id)) {
        els.audio.removeAttribute('src');
        els.audio.load();
      }
      const knownDuration = Number.isFinite(t.duration) && t.duration > 0 ? t.duration : durationCache.get(t.id) || (sourceUrl && els.audio.src === sourceUrl && Number.isFinite(els.audio.duration) ? els.audio.duration : 0);
      if (knownDuration) durationCache.set(t.id, knownDuration);
      syncTrackCopy(t); els.duration.textContent=knownDuration?fmt(knownDuration):'0:00'; setCover(t); syncLikeButton(); pendingSeek=restore?state.positions?.[t.id]||0:null; syncPlayButton(); renderQueue();
    }
    function waitForPlayable(timeout=4500){
      if(!els.audio.src || els.audio.readyState>=HTMLMediaElement.HAVE_CURRENT_DATA) return Promise.resolve();
      return new Promise((resolve,reject)=>{
        let done=false;
        const finish=fn=>{ if(done) return; done=true; clearTimeout(timer); els.audio.removeEventListener('canplay',onReady); els.audio.removeEventListener('loadeddata',onReady); els.audio.removeEventListener('error',onError); fn(); };
        const onReady=()=>finish(resolve);
        const onError=()=>finish(()=>reject(new Error('Audio failed to load')));
        const timer=setTimeout(()=>finish(resolve),timeout);
        els.audio.addEventListener('canplay',onReady,{once:true});
        els.audio.addEventListener('loadeddata',onReady,{once:true});
        els.audio.addEventListener('error',onError,{once:true});
      });
    }
    const reportPlaybackFailure = error => {
      // Keep runtime diagnostics useful without exposing signed media query data.
      try {
        const source = new URL(els.audio.currentSrc || els.audio.src || location.href);
        console.warn('Kairos audio playback failed', {
          name: error?.name || '',
          message: error?.message || '',
          mediaError: els.audio.error?.code || 0,
          networkState: els.audio.networkState,
          readyState: els.audio.readyState,
          protocol: source.protocol,
          host: source.host
        });
      } catch {}
    };
    async function playLoadedAudio(retryNetease=true){
      const track = currentTrack();
      if (isNeteaseUrlStale(track)) {
        const refreshed = await refreshNeteaseTrackUrl(track);
        if (!refreshed) throw new Error(tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL'));
      }
      playbackAttemptDepth += 1;
      try {
        await waitForPlayable();
        await els.audio.play();
        countCurrentPlay();
      } catch (error) {
        reportPlaybackFailure(error);
        // A signed NetEase URL may become invalid between state hydration and
        // the first media request. Refresh it once in this same attempt; the
        // old onerror path used to race the outer catch and never replay.
        if (!retryNetease || !isNeteaseId(track?.id)) throw error;
        const refreshed = await refreshNeteaseTrackUrl(track);
        if (!refreshed) throw new Error(tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL'));
        return playLoadedAudio(false);
      } finally {
        playbackAttemptDepth = Math.max(0, playbackAttemptDepth - 1);
      }
    }
    const playbackErrorText = error => {
      reportPlaybackFailure(error);
      return error?.message === tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL') ? tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL') : tr('player.audioPlayFailed',{},'Unable to play this audio file');
    };
    async function continueQueuePlayback(shouldPlay){
      if(!shouldPlay){ if(!state.currentTrackId&&!els.audio.paused) els.audio.pause(); return; }
      try{
        await playLoadedAudio();
      }catch(error){
        const message=playbackErrorText(error);
        state.playing=false;
        els.status.textContent=message;
        toast('error',message);
        syncPlayButton();
        updateQueuePlaybackState();
        emitState();
      }
    }
    async function refreshNeteaseTrackUrl(track){
      const nextTrack = await requestNeteaseUrlRefresh(track);
      if (!nextTrack?.playUrl) return null;
      state.tracks = (state.tracks || []).map(item => item.id === nextTrack.id ? { ...item, ...nextTrack } : item);
      if (state.currentTrackId === nextTrack.id) loadTrack(true);
      emitState();
      return nextTrack;
    }
    async function playTrack(id, shouldPlay=true, options={}){
      const silentFailure = options.silentFailure === true;
      if(!id) return false;
      const previousTrackId=state.currentTrackId;
      state.currentTrackId=id;
      countedPlayTrackId=null;
      state.playing=shouldPlay;
      persistNow({currentTrackId:id,playing:state.playing});
      let t=currentTrack();
      if(isNeteaseId(id)&&isNeteaseUrlStale(t)){
        t=await refreshNeteaseTrackUrl(t);
        if(!t?.playUrl){
          state.currentTrackId=previousTrackId;
          state.playing=false;
          els.status.textContent=tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL');
          if(!silentFailure) toast('error',tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL'));
          loadTrack(false);
          syncPlayButton();
          updateQueuePlaybackState();
          emitState();
          return false;
        }
      }
      loadTrack(true);
      emitState();
      if(shouldPlay) {
        try{
          await playLoadedAudio();
        }catch(error){
          const message=playbackErrorText(error);
          state.playing=false;
          els.status.textContent=message;
          if(!silentFailure) toast('error',message);
          syncPlayButton();
          updateQueuePlaybackState();
          emitState();
          return false;
        }
      }
      return true;
    }
    const adjacentCandidates = direction => {
      const queue=queueTracks();
      if(!queue.length) return [];
      if(state.mode==='single') return [state.currentTrackId||queue[0].id].filter(Boolean);
      if(state.mode==='shuffle') return queue.map(track=>track.id).filter(id=>id!==state.currentTrackId).sort(()=>Math.random()-.5);
      const currentIndex=Math.max(0,queue.findIndex(track=>track.id===state.currentTrackId));
      const ordered=direction<0?queue.slice(0,currentIndex).reverse():queue.slice(currentIndex+1);
      if(state.mode==='loop') ordered.push(...(direction<0?queue.slice(currentIndex+1).reverse():queue.slice(0,currentIndex+1)));
      return ordered.map(track=>track.id);
    };
    async function playAdjacentTrack(direction=1){
      let skipped=0;
      for(const id of adjacentCandidates(direction)){
        const ok=await playTrack(id,true,{silentFailure:true});
        if(ok){
          if(skipped) toast('message',trPlural('player.skippedUnavailable',skipped,`Skipped unavailable songs`),trPlural('player.skippedUnavailableDescription',skipped,`${skipped} songs skipped.`));
          return true;
        }
        skipped+=1;
      }
      state.playing=false;
      syncPlayButton();
      updateQueuePlaybackState();
      emitState();
      if(skipped) toast('error',tr('player.noPlayableSongsLeft',{},'No playable songs left'),tr('player.noPlayableSongsLeftDescription',{},'Every remaining song is unavailable.'));
      return false;
    }
    async function refresh(restore=true, shouldEmit=true, options={}){
      const api=desktop();
      const guardedVersion=options.guardExternalVersion;
      let nextState=state;
      if(api) nextState=await api.getState();
      if(guardedVersion!==undefined && externalRefreshVersion!==guardedVersion) return false;
      if(options.restoreLastSource) nextState=restoreLastPlaybackSource(nextState);
      state=nextState;
      if(!Number.isFinite(state.volume)) state.volume=70;
      state.mode||='sequence';
      state.playing=state.playing===true;
      state.queueTrackIds ||= [];
      if(state.currentTrackId && !queueTracks().some(track=>track.id===state.currentTrackId)) state.currentTrackId = queueTracks()[0]?.id || null;
      modeButton();
      applyVolume();
      loadTrack(restore);
      if(shouldEmit) emitState();
      return true;
    }

    const positionQueue = () => {
      if (els.playlistPanel.hidden) return;
      const gap=12, margin=12, r=els.playlistToggle.getBoundingClientRect();
      const above=Math.max(180,r.top-gap-margin);
      const w=Math.min(340,window.innerWidth-margin*2);
      const h=Math.min(520,above);
      Object.assign(els.playlistPanel.style, {
        position:'fixed', zIndex:'9999', width:`${w}px`, height:`${h}px`,
        left:`${Math.min(window.innerWidth-w-margin,Math.max(margin,r.right-w))}px`,
        top:`${Math.max(margin,r.top-h-gap)}px`, right:'auto', bottom:'auto'
      });
    };
    const settleQueuePosition = () => {
      if (els.playlistPanel.hidden) return;
      requestAnimationFrame(positionQueue);
      // The Vue Calendar shell aligns its shared player after iframe layout
      // settles. Recalculate after those passes so Queue stays attached to
      // the button instead of being left at a stale/off-screen coordinate.
      [60, 180, 420].forEach(delay => setTimeout(positionQueue, delay));
    };
    const setQueueOpen = open => {
      els.playlistPanel.hidden = !open;
      els.playlistToggle.setAttribute('aria-expanded', String(open));
      if (open) settleQueuePosition();
    };
    const updateElasticVolume = value => { const n=Math.round(Math.min(100,Math.max(0,value))); els.volume.value=n; els.volumeRange.style.width=`${n}%`; els.volumeValue.value=n; els.volumeRoot.setAttribute('aria-valuenow',n); els.volume.dispatchEvent(new Event('input',{bubbles:true})); };
    const moveElasticVolume = e => { if(!volumeDragging) return; const r=els.volumeRoot.getBoundingClientRect(); updateElasticVolume((e.clientX-r.left)/r.width*100); const outside=e.clientX<r.left?r.left-e.clientX:e.clientX>r.right?e.clientX-r.right:0; const over=decay(outside); const track=els.volumeRoot.querySelector('.elastic-volume-track-wrap'); track.style.transformOrigin=e.clientX<r.left+r.width/2?'right':'left'; track.style.transform=`scaleX(${1+over/r.width}) scaleY(${1-over/250})`; els.elasticVolume.style.translate=`${(e.clientX<r.left?-1:e.clientX>r.right?1:0)*over}px 0`; };
    const releaseVolume = () => { volumeDragging=false; els.elasticVolume.style.translate='0 0'; els.volumeRoot.querySelector('.elastic-volume-track-wrap').style.transform='scaleX(1) scaleY(1)'; };

    els.toggle.onclick=async()=>{ const track=currentTrack(); if(!els.audio.src&&!track) return; if(els.audio.paused){ try{ await playLoadedAudio(); }catch(error){ const message=playbackErrorText(error); state.playing=false; els.status.textContent=message; toast('error',message); syncPlayButton(); updateQueuePlaybackState(); emitState(); } } else els.audio.pause(); };
    els.like.onclick=async()=>{
      const track=currentTrack();
      if(!track) return;
      const nextLiked=track.liked!==true;
      updateCurrentTrackLiked(nextLiked);
      els.like.disabled=true;
      try{
        if(isNeteaseId(track.id)){
          const api=neteaseDesktop();
          const result=await api?.setSongLiked?.({id:track.id,neteaseId:track.neteaseId,liked:nextLiked});
          if(!result?.ok) throw new Error(result?.message||'Unable to update NetEase liked songs.');
        }else{
          const api=desktop();
          const nextState=await api?.updateTrack?.({id:track.id,liked:nextLiked});
          if(nextState?.tracks) state={...state,tracks:nextState.tracks};
        }
        toast(nextLiked?'success':'message',nextLiked?tr('player.likedAdded',{},'Added to liked songs'):tr('player.likedRemoved',{},'Removed from liked songs'),clean(track.title)||clean(track.fileName)||'');
        syncLikeButton();
        emitState();
      }catch(error){
        updateCurrentTrackLiked(!nextLiked);
        toast('error',tr('player.likeFailed',{},'Like failed'),error?.message||tr('legacy.tryAgain',{},'Please try again.'));
      }finally{
        els.like.disabled=false;
      }
    };
    els.previous.onclick=()=>{ if(els.audio.currentTime>4){els.audio.currentTime=0;return;} playAdjacentTrack(-1); };
    els.next.onclick=()=>{ playAdjacentTrack(1); };
    els.mode.onclick=()=>{ const m=['sequence','loop','shuffle','single']; state.mode=m[(m.indexOf(state.mode||'sequence')+1)%m.length]; modeButton(); persist({mode:state.mode}); emitState(); };
    els.playlistToggle.onclick=()=>{ setQueueOpen(els.playlistPanel.hidden); };
    els.playlistClose.onclick=()=>{ setQueueOpen(false); };
    els.clear.onclick=async()=>{ const wasNeteaseQueue=hasNeteaseQueue(); const api=desktop(); suppressPausePersist=true; els.audio.pause(); suppressPausePersist=false; state={...state,queueTrackIds:[],currentTrackId:null,playing:false}; if(wasNeteaseQueue) clearNeteasePlayback(); if(api&&!wasNeteaseQueue) state=await api.updatePlayback({queueTrackIds:[],currentTrackId:null,playing:false}); loadTrack(false); emitState(); toast('success',tr('player.queueCleared',{},'Queue cleared')); };
    els.volumeRoot.addEventListener('pointerdown', e=>{ volumeDragging=true; els.volumeRoot.setPointerCapture(e.pointerId); moveElasticVolume(e); });
    els.volumeRoot.addEventListener('pointermove', moveElasticVolume); els.volumeRoot.addEventListener('pointerup', releaseVolume); els.volumeRoot.addEventListener('pointercancel', releaseVolume);
    els.volumeRoot.addEventListener('keydown', e=>{ if(!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)) return; e.preventDefault(); const d=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1; updateElasticVolume(e.key==='Home'?0:e.key==='End'?100:Number(els.volume.value)+d); });
    els.volume.oninput=()=>{ state.volume=Number(els.volume.value); state.muted=state.volume===0; applyVolume(); persist({volume:state.volume,muted:state.muted}); };
    els.progress.oninput=()=>{ progressDragging=true; if(els.audio.duration) els.audio.currentTime=els.progress.value/100*els.audio.duration; els.progressRange.style.width=`${els.progress.value}%`; progressDragging=false; };
    els.audio.onplay=()=>{ state.playing=true; persist({playing:true}); countCurrentPlay(); syncPlayButton(); updateQueuePlaybackState(); emitState(); };
    els.audio.onpause=()=>{ if(!suppressPausePersist){ state.playing=false; persist({playing:false}); } syncPlayButton(); updateQueuePlaybackState(); emitState(); };
    els.audio.onloadedmetadata=()=>{ const t=currentTrack(); els.duration.textContent=fmt(els.audio.duration); if(t&&Number.isFinite(els.audio.duration)){ t.duration=els.audio.duration; durationCache.set(t.id, els.audio.duration); } if(pendingSeek) els.audio.currentTime=Math.min(pendingSeek,Math.max(0,els.audio.duration-2)); pendingSeek=null; };
    els.audio.ontimeupdate=()=>{
      if(progressDragging) return;
      if(!els.audio.paused&&state.currentTrackId) countCurrentPlay();
      const currentTime=els.audio.currentTime||0;
      const p=els.audio.duration?currentTime/els.audio.duration*100:0;
      els.progress.value=p;
      els.progressRange.style.width=`${p}%`;
      els.progressRoot.setAttribute('aria-valuenow',String(Math.round(p)));
      els.current.textContent=fmt(currentTime);
      const t=currentTrack();
      const positionKey=t?`${t.id}:${Math.floor(currentTime/5)}`:'';
      if(t&&positionKey!==lastPersistedPositionKey){
        lastPersistedPositionKey=positionKey;
        state.positions={...(state.positions||{}),[t.id]:currentTime};
        persist({position:{trackId:t.id,seconds:currentTime}});
      }
      const queueStatusBucket=Math.floor(currentTime/15);
      if(!els.playlistPanel.hidden&&!queueDragging&&queueStatusBucket!==lastQueueStatusBucket){
        lastQueueStatusBucket=queueStatusBucket;
        updateQueueStatus();
      }
    };
    els.audio.onended=()=>{ playAdjacentTrack(1); };
    els.audio.onerror=async()=>{ const t=currentTrack(); reportPlaybackFailure(); if(!isNeteaseId(t?.id) || playbackAttemptDepth>0 || state.playing!==true) return; const fail=message=>{ state.playing=false; els.status.textContent=message; toast('error',message); syncPlayButton(); updateQueuePlaybackState(); emitState(); }; const refreshed=await refreshNeteaseTrackUrl(t); if(!refreshed){ fail(tr('player.refreshUrlFailed',{},'Unable to refresh NetEase URL')); return; } playLoadedAudio(false).catch(error=>fail(playbackErrorText(error))); };
    els.playlist.addEventListener('dragstart',e=>{ const item=e.target.closest('li[data-id]'); if(!item||e.target.closest('button')){ e.preventDefault(); return; } draggedQueueId=item.dataset.id; queueDragging=true; item.classList.add('is-dragging'); e.dataTransfer.effectAllowed='move'; e.dataTransfer.setData('text/plain',draggedQueueId); queueDragCard?.remove(); queueDragCard=makeQueueDragCard(queueTracks().find(track=>track.id===draggedQueueId)); e.dataTransfer.setDragImage(queueDragCard,24,23); });
    els.playlist.addEventListener('dragover',e=>{ const item=e.target.closest('li[data-id]'); if(!item||!draggedQueueId||item.dataset.id===draggedQueueId) return; e.preventDefault(); const dragged=els.playlist.querySelector(`li[data-id="${CSS.escape(draggedQueueId)}"]`); if(!dragged) return; clearQueueDropHints(); const rect=item.getBoundingClientRect(); const after=e.clientY>rect.top+rect.height/2; item.classList.add(after?'drop-after':'drop-before'); els.playlist.insertBefore(dragged,after?item.nextSibling:item); });
    els.playlist.addEventListener('dragleave',e=>e.target.closest('li[data-id]')?.classList.remove('drop-before','drop-after'));
    els.playlist.addEventListener('dragend',async()=>{ els.playlist.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(item=>item.classList.remove('is-dragging','drop-before','drop-after')); queueDragCard?.remove(); queueDragCard=null; const hadDrag=Boolean(draggedQueueId); draggedQueueId=null; queueDragging=false; if(hadDrag) await persistQueueOrderFromDom(); });
    document.addEventListener('pointerdown', e=>{ if(els.playlistPanel.hidden) return; if(els.playlistPanel.contains(e.target)||els.playlistToggle.contains(e.target)) return; setQueueOpen(false); });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') setQueueOpen(false); });
    window.addEventListener('resize', settleQueuePosition);
    window.addEventListener('kairos:player-route-layout', applyRouteLayout);
    if ('MutationObserver' in window && document.body instanceof Node) new MutationObserver(applyRouteLayout).observe(document.body, { attributes:true, attributeFilter:['class','data-kairos-vue-page'] });
    async function applyMusicRefresh(detail = {}) {
      const incomingAt = Number(detail?.at || 0);
      if (incomingAt > 0 && incomingAt < lastAppliedRefreshAt) return;
      if (incomingAt > 0) lastAppliedRefreshAt = incomingAt;
      externalRefreshVersion += 1;
      const hasPlaybackPatch = detail?.currentTrackId || Array.isArray(detail?.queueTrackIds) || detail?.playing !== undefined || detail?.mode;
      const hasIncomingTracks = Array.isArray(detail?.tracks) && detail.tracks.some(track => track?.id);
      if (Array.isArray(detail?.tracks)) {
        const byId = new Map((state.tracks || []).map(track => [track.id, track]));
        detail.tracks.forEach(track => {
          if (track?.id) byId.set(track.id, { ...(byId.get(track.id) || {}), ...track });
        });
        state.tracks = [...byId.values()];
      }
      if (detail?.likedTrackId) {
        state.tracks = (state.tracks || []).map(track => track.id === detail.likedTrackId ? { ...track, liked: detail.liked === true } : track);
        syncLikeButton();
      }
      if (!hasIncomingTracks && !hasPlaybackPatch) await refresh(false, false);
      else if (hasPlaybackPatch && !(state.tracks || []).length) await refresh(false, false);
      if (Array.isArray(detail?.queueTrackIds)) {
        const validIds = new Set((state.tracks || []).map(track => track.id));
        state.queueTrackIds = detail.queueTrackIds.filter(id => validIds.has(id));
      }
      if (detail?.mode && ['sequence','loop','shuffle','single'].includes(detail.mode)) {
        state.mode = detail.mode;
        modeButton();
      }
      if (detail?.playing !== undefined) {
        state.playing = detail.playing === true;
      }
      if (Object.prototype.hasOwnProperty.call(detail || {}, 'currentTrackId')) {
        state.currentTrackId = detail.currentTrackId || null;
        loadTrack(false);
      } else if (Array.isArray(detail?.queueTrackIds)) {
        loadTrack(false);
      }
      if (detail?.playing === true && (els.audio.src || currentTrack())) await playLoadedAudio().catch(error=>{ const message=playbackErrorText(error); state.playing=false; els.status.textContent=message; toast('error',message); syncPlayButton(); updateQueuePlaybackState(); emitState(); });
      if (detail?.playing === false && !els.audio.paused) els.audio.pause();
      syncPlayButton();
      emitState();
    }
    window.KairosMusicPlayer.applyRefresh = applyMusicRefresh;
    window.KairosMusicPlayer.getState = () => ({ ...state, queueTrackIds: [...(state.queueTrackIds || [])], tracks: [...(state.tracks || [])] });
    window.KairosMusicPlayer.executeCommand = async command => {
      if (command?.type === 'get_state') return window.KairosMusicPlayer.getState();
      if (command?.type === 'apply_patch') await applyMusicRefresh({ ...(command.patch || {}), at: Date.now() });
      else if (command?.type === 'play' && els.audio.paused) await playLoadedAudio();
      else if (command?.type === 'pause' && !els.audio.paused) els.audio.pause();
      else if (command?.type === 'next') await playAdjacentTrack(1);
      else if (command?.type === 'previous') {
        if (els.audio.currentTime > 4) els.audio.currentTime = 0;
        else await playAdjacentTrack(-1);
      }
      else if (command?.type === 'volume') {
        if (command.muted !== undefined) state.muted = command.muted === true;
        if (command.value !== undefined) state.volume = Math.max(0, Math.min(100, Number(command.value) || 0));
        if (command.relative !== undefined) state.volume = Math.max(0, Math.min(100, (Number(state.volume) || 0) + Number(command.relative || 0)));
        applyVolume(); persistNow({ volume: state.volume, muted: state.muted }); emitState();
      }
      return window.KairosMusicPlayer.getState();
    };
    if (!window.__kairosAiMusicCommandBound && window.kairosDesktop?.music?.onCommand) {
      window.__kairosAiMusicCommandBound = true;
      window.kairosDesktop.music.onCommand(async ({ requestId, command }) => {
        try { const result = await window.KairosMusicPlayer.executeCommand(command); window.kairosDesktop.music.completeCommand({ requestId, ok: true, result }); }
        catch (error) { window.kairosDesktop.music.completeCommand({ requestId, ok: false, error: error?.message || String(error) }); }
      });
    }
    window.addEventListener('kairos:music-refresh', event => { applyMusicRefresh(event.detail); });
    window.addEventListener('kairos:locale-changed', () => {
      translatePlayer();
      modeButton();
      syncLikeButton();
      syncPlayButton();
      syncTrackCopy(currentTrack());
      renderQueue();
    });
    const initialRefreshVersion = externalRefreshVersion;
    refresh(true, true, { guardExternalVersion: initialRefreshVersion, restoreLastSource: true }).then(applied => {
      if (!applied) return;
      suppressPausePersist = true;
      els.audio.pause();
      suppressPausePersist = false;
      syncPlayButton();
      applyRouteLayout();
      window.dispatchEvent(new CustomEvent('kairos:music-player-ready'));
    });
    return window.KairosMusicPlayer;
  }

  window.KairosMusicPlayer = { mount };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once:true });
  else mount();
})();
