(function(){
  if (window.KairosMusicPlayer) return;

  const html = `
<section aria-label="Music player" id="musicPlayer">
<div><div class="music-player-track"><button aria-label="Album cover" id="musicCoverButton" type="button" tabindex="-1"><span class="music-icon material-symbols-outlined" id="musicCoverIcon">music_note</span><img alt="Album cover" class="hidden" id="musicCover"></button><div class="min-w-0"><h3 class="music-player-title" id="musicTitle">Choose a song</h3><p class="music-player-artist" id="musicArtist">Local ambience</p></div></div>
<div class="music-transport"><div class="music-transport-controls"><button aria-label="Previous" id="musicPrevious" type="button"><svg aria-hidden="true" class="transport-skip-icon" viewBox="0 0 24 24"><path d="M5 5.5a1.2 1.2 0 0 1 2.4 0v13a1.2 1.2 0 0 1-2.4 0v-13Z" fill="currentColor"/><path d="M19.1 5.8c.82-.52 1.9.06 1.9 1.04v10.32c0 .98-1.08 1.56-1.9 1.04l-8.1-5.16a1.23 1.23 0 0 1 0-2.08l8.1-5.16Z" fill="currentColor"/></svg></button><button aria-label="Play" id="musicToggle" type="button"><span class="music-icon material-symbols-outlined" id="musicToggleIcon">play_arrow</span></button><button aria-label="Next" id="musicNext" type="button"><svg aria-hidden="true" class="transport-skip-icon" viewBox="0 0 24 24"><path d="M4.9 5.8C4.08 5.28 3 5.86 3 6.84v10.32c0 .98 1.08 1.56 1.9 1.04l8.1-5.16a1.23 1.23 0 0 0 0-2.08L4.9 5.8Z" fill="currentColor"/><path d="M16.6 5.5a1.2 1.2 0 0 1 2.4 0v13a1.2 1.2 0 0 1-2.4 0v-13Z" fill="currentColor"/></svg></button><button aria-label="Playback mode" aria-pressed="false" class="music-shuffle" id="musicMode" title="Sequence" type="button"><span class="music-icon material-symbols-outlined" id="musicModeIcon">format_list_numbered</span></button></div><div class="music-timeline"><time id="musicCurrent">0:00</time><div class="elastic-progress"><div aria-label="Playback position" aria-valuemax="100" aria-valuemin="0" aria-valuenow="0" class="elastic-progress-root" id="elasticProgressRoot" role="slider" tabindex="0"><div class="elastic-progress-track-wrap"><div class="elastic-progress-track"><i id="elasticProgressRange"></i></div></div><input class="music-range" id="musicProgress" max="100" min="0" tabindex="-1" type="range" value="0"></div></div><time id="musicDuration">0:00</time></div></div>
<div class="music-player-right"><div class="elastic-volume" id="elasticVolume"><span class="music-icon material-symbols-outlined elastic-volume-icon" id="volumeIcon">volume_down</span><div aria-label="Volume" aria-valuemax="100" aria-valuemin="0" aria-valuenow="70" class="elastic-volume-root" id="elasticVolumeRoot" role="slider" tabindex="0"><div class="elastic-volume-track-wrap"><div class="elastic-volume-track"><i id="elasticVolumeRange"></i></div></div><input id="musicVolume" max="100" min="0" tabindex="-1" type="range" value="70"></div><span class="music-icon material-symbols-outlined elastic-volume-icon">volume_up</span><output id="elasticVolumeValue">70</output></div><button aria-label="Playlist" class="music-playlist-button" id="musicPlaylistToggle" type="button"><span class="music-icon material-symbols-outlined">queue_music</span></button></div></div>
<audio id="musicAudio"></audio>
<div class="music-playlist-panel" id="musicPlaylistPanel" hidden><header><div class="music-queue-title"><span class="music-icon material-symbols-outlined">queue_music</span><strong>Queue</strong></div><div><button type="button" id="musicClearButton">Clear All</button><button aria-label="Close playlist" class="music-queue-close" id="musicPlaylistClose" type="button"><span class="music-icon material-symbols-outlined">close</span></button></div></header><div class="music-queue-scroll"><ol id="musicPlaylist"></ol></div><footer><p id="musicStatus" role="status"></p></footer></div>
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
      title:$('musicTitle'), artist:$('musicArtist'), toggle:$('musicToggle'), toggleIcon:$('musicToggleIcon'), previous:$('musicPrevious'), next:$('musicNext'),
      mode:$('musicMode'), modeIcon:$('musicModeIcon'), current:$('musicCurrent'), duration:$('musicDuration'), progress:$('musicProgress'),
      progressRoot:$('elasticProgressRoot'), progressRange:$('elasticProgressRange'), volume:$('musicVolume'), volumeRoot:$('elasticVolumeRoot'),
      volumeRange:$('elasticVolumeRange'), volumeValue:$('elasticVolumeValue'), volumeIcon:$('volumeIcon'), elasticVolume:$('elasticVolume'),
      playlistToggle:$('musicPlaylistToggle'), playlistPanel:$('musicPlaylistPanel'), playlistClose:$('musicPlaylistClose'), playlist:$('musicPlaylist'), clear:$('musicClearButton'), status:$('musicStatus')
    };
    document.body.appendChild(els.playlistPanel);

    let state = { tracks: [], queueTrackIds: [], currentTrackId: null, mode: 'sequence', playing: false, volume: 70, muted: false, positions: {} };
    let saveTimer = null, volumeDragging = false, progressDragging = false, pendingSeek = null, suppressPausePersist = false;
    const durationCache = new Map();
    try { localStorage.removeItem('kairos-music-runtime'); localStorage.removeItem('kairos-music-owner'); } catch {}
    const desktop = () => window.kairosDesktop?.music || null;
    const queueTracks = () => { const byId = new Map((state.tracks || []).map(t => [t.id, t])); return (state.queueTrackIds || []).map(id => byId.get(id)).filter(Boolean); };
    const currentTrack = () => queueTracks().find(t => t.id === state.currentTrackId) || queueTracks()[0] || null;
    const persist = patch => { const api = desktop(); if (!api) return; clearTimeout(saveTimer); saveTimer = setTimeout(() => api.updatePlayback(patch).catch(()=>{}), 180); };
    const persistNow = patch => { const api = desktop(); if (!api) return; clearTimeout(saveTimer); api.updatePlayback(patch).catch(()=>{}); };
    const remainingSeconds = () => queueTracks().reduce((sum,t) => !Number.isFinite(t.duration)||t.duration<=0 ? sum : sum + (t.id===state.currentTrackId ? Math.max(0,t.duration-(els.audio.currentTime||0)) : t.duration), 0);
    const remainingText = s => { if (!Number.isFinite(s)||s<=0) return ''; const m=Math.round(s/60); return m<60 ? `${m} min remaining` : `${Math.floor(m/60)}h ${String(m%60).padStart(2,'0')}m remaining`; };
    const setCover = t => { if (t?.coverUrl) { els.cover.src=t.coverUrl; els.cover.classList.remove('hidden'); els.coverIcon.style.opacity='0'; } else { els.cover.removeAttribute('src'); els.cover.classList.add('hidden'); els.coverIcon.style.opacity='1'; } };
    const modeButton = () => { const m=state.mode||'sequence'; els.modeIcon.textContent={sequence:'format_list_numbered',loop:'repeat',shuffle:'shuffle',single:'repeat_one'}[m]||'format_list_numbered'; els.mode.title={sequence:'Sequence',loop:'Loop',shuffle:'Shuffle',single:'Repeat one'}[m]||'Sequence'; els.mode.setAttribute('aria-pressed',String(m!=='sequence')); };
    const intendedPlaying = () => state.playing === true && els.audio.paused;
    const syncPlayButton = () => { const active = !els.audio.paused || intendedPlaying(); els.toggleIcon.textContent = active ? 'pause' : 'play_arrow'; els.toggle.classList.toggle('is-paused', active); };
    const emitState = () => window.dispatchEvent(new CustomEvent('kairos:music-state-changed',{detail:{...state,queueTrackIds:state.queueTrackIds||[],currentTrackId:state.currentTrackId||null,playing:state.playing===true,currentTime:els.audio.currentTime||0}}));
    const applyVolume = () => { const v=Number.isFinite(state.volume)?state.volume:70; els.audio.volume=state.muted?0:Math.max(0,Math.min(1,v/100)); els.volume.value=v; els.volumeRange.style.width=`${v}%`; els.volumeValue.value=v; els.volumeRoot.setAttribute('aria-valuenow',v); els.volumeIcon.textContent=state.muted||els.audio.volume===0?'volume_off':els.audio.volume<.5?'volume_down':'volume_up'; };
    const applyRouteLayout = () => {
      const root = document.getElementById('musicPlayer');
      if (!root) return;
      const inSecondary = document.body.classList.contains('kairos-secondary-view');
      const inMusic = document.body.classList.contains('kairos-music-view') || location.hash === '#music';
      root.hidden = inSecondary && !inMusic;
      if (inMusic) {
        root.hidden = false;
        root.style.left = '0px';
        root.style.right = '0px';
        root.style.top = 'auto';
        root.style.bottom = '0px';
        root.style.setProperty('height', '80px', 'important');
      }
    };

    function queueCover(track){
      const c=document.createElement('div'); c.className='music-queue-cover';
      if (track.coverUrl) { const img=document.createElement('img'); img.alt=''; img.src=track.coverUrl; c.append(img); }
      else { const i=document.createElement('span'); i.className='music-icon material-symbols-outlined'; i.textContent='music_note'; c.append(i); }
      if (track.id===state.currentTrackId) { const eq=document.createElement('span'); eq.className='music-icon material-symbols-outlined music-eq'; eq.textContent=els.audio.paused?'play_arrow':'graphic_eq'; c.append(eq); }
      return c;
    }
    function queueItem(track,index){
      const li=document.createElement('li'); li.className=track.id===state.currentTrackId?'current':''; li.dataset.id=track.id; li.append(queueCover(track));
      const main=document.createElement('button'); main.type='button'; main.className='music-track-main'; main.innerHTML='<span class="music-track-title"></span><span class="music-track-subtitle"></span>'; main.querySelector('.music-track-title').textContent=clean(track.title)||clean(track.fileName)||'Untitled'; main.querySelector('.music-track-subtitle').textContent=clean(track.artist)||'Local music'; main.onclick=()=>playTrack(track.id,true);
      const remove=document.createElement('button'); remove.type='button'; remove.className='music-track-remove'; remove.setAttribute('aria-label',`Remove ${track.title||track.fileName||'track'}`); remove.innerHTML='<span class="music-icon material-symbols-outlined">more_vert</span>'; remove.onclick=async e=>{ e.stopPropagation(); const api=desktop(); if(api) state=await api.removeTrack(track.id); else state.tracks.splice(index,1); loadTrack(false); window.dispatchEvent(new CustomEvent('kairos:music-state-changed',{detail:state})); };
      li.append(main,remove); return li;
    }
    function renderQueue(){
      els.playlist.replaceChildren();
      const queue = queueTracks();
      if (!queue.length) { const e=document.createElement('li'); e.className='music-playlist-empty'; e.textContent='No music imported yet'; els.playlist.append(e); els.status.textContent='0 Tracks'; return; }
      const cur=currentTrack(); if (cur) els.playlist.append(queueItem(cur,queue.indexOf(cur)));
      const upcoming=queue.filter(t=>t.id!==cur?.id); if (upcoming.length) { const s=document.createElement('li'); s.className='music-queue-section'; s.textContent='Upcoming'; els.playlist.append(s); }
      queue.forEach((t,i)=>{ if(t.id!==cur?.id) els.playlist.append(queueItem(t,i)); });
      const rem=remainingText(remainingSeconds()); els.status.textContent=`${queue.length} Track${queue.length===1?'':'s'}${rem?` \u00b7 ${rem}`:''}`;
    }
    function loadTrack(restore=true){
      const t=currentTrack();
      if (!t) { els.audio.removeAttribute('src'); els.title.textContent='Choose a song'; els.artist.textContent='Local ambience'; els.current.textContent=els.duration.textContent='0:00'; els.progress.value=0; els.progressRange.style.width='0%'; setCover(null); syncPlayButton(); renderQueue(); return; }
      state.currentTrackId=t.id; if (els.audio.src!==t.playUrl) { els.audio.src=t.playUrl; els.audio.load(); }
      const knownDuration = Number.isFinite(t.duration) && t.duration > 0 ? t.duration : durationCache.get(t.id) || (els.audio.src === t.playUrl && Number.isFinite(els.audio.duration) ? els.audio.duration : 0);
      if (knownDuration) durationCache.set(t.id, knownDuration);
      els.title.textContent=clean(t.title)||clean(t.fileName)||'Untitled'; els.artist.textContent=clean(t.artist)||'Local music'; els.duration.textContent=knownDuration?fmt(knownDuration):'0:00'; setCover(t); pendingSeek=restore?state.positions?.[t.id]||0:null; syncPlayButton(); renderQueue();
    }
    async function playTrack(id, shouldPlay=true){ if(!id) return; state.currentTrackId=id; state.playing=shouldPlay; persistNow({currentTrackId:id,playing:state.playing}); loadTrack(true); emitState(); if(shouldPlay) try{ await els.audio.play(); }catch{ state.playing=false; els.status.textContent='Unable to play this audio file'; emitState(); } }
    const nextId = d => { const a=queueTracks(); if(!a.length) return null; if(state.mode==='single') return state.currentTrackId||a[0].id; if(state.mode==='shuffle') return a[Math.floor(Math.random()*a.length)]?.id||null; const i=Math.max(0,a.findIndex(t=>t.id===state.currentTrackId))+d; return i>=0&&i<a.length?a[i].id:state.mode==='loop'?a[(i+a.length)%a.length].id:null; };
    async function refresh(restore=true, shouldEmit=true){ const api=desktop(); if(api) state=await api.getState(); if(!Number.isFinite(state.volume)) state.volume=70; state.mode||='sequence'; state.playing=state.playing===true; state.queueTrackIds ||= []; if(state.currentTrackId && !queueTracks().some(track=>track.id===state.currentTrackId)) state.currentTrackId = queueTracks()[0]?.id || null; modeButton(); applyVolume(); loadTrack(restore); if(shouldEmit) emitState(); }

    const positionQueue = () => { if (els.playlistPanel.hidden) return; const gap=12, margin=12, r=els.playlistToggle.getBoundingClientRect(); const above=Math.max(180,r.top-gap-margin); const w=Math.min(340,window.innerWidth-margin*2); const h=Math.min(520,above); els.playlistPanel.style.cssText += `width:${w}px;height:${h}px;left:${Math.min(window.innerWidth-w-margin,Math.max(margin,r.right-w))}px;top:${Math.max(margin,r.top-h-gap)}px;right:auto;bottom:auto;`; };
    const updateElasticVolume = value => { const n=Math.round(Math.min(100,Math.max(0,value))); els.volume.value=n; els.volumeRange.style.width=`${n}%`; els.volumeValue.value=n; els.volumeRoot.setAttribute('aria-valuenow',n); els.volume.dispatchEvent(new Event('input',{bubbles:true})); };
    const moveElasticVolume = e => { if(!volumeDragging) return; const r=els.volumeRoot.getBoundingClientRect(); updateElasticVolume((e.clientX-r.left)/r.width*100); const outside=e.clientX<r.left?r.left-e.clientX:e.clientX>r.right?e.clientX-r.right:0; const over=decay(outside); const track=els.volumeRoot.querySelector('.elastic-volume-track-wrap'); track.style.transformOrigin=e.clientX<r.left+r.width/2?'right':'left'; track.style.transform=`scaleX(${1+over/r.width}) scaleY(${1-over/250})`; els.elasticVolume.style.translate=`${(e.clientX<r.left?-1:e.clientX>r.right?1:0)*over}px 0`; };
    const releaseVolume = () => { volumeDragging=false; els.elasticVolume.style.translate='0 0'; els.volumeRoot.querySelector('.elastic-volume-track-wrap').style.transform='scaleX(1) scaleY(1)'; };

    els.toggle.onclick=()=>{ if(!els.audio.src) return; els.audio.paused?els.audio.play():els.audio.pause(); };
    els.previous.onclick=()=>{ if(els.audio.currentTime>4){els.audio.currentTime=0;return;} const id=nextId(-1); if(id) playTrack(id,true); };
    els.next.onclick=()=>{ const id=nextId(1); if(id) playTrack(id,true); };
    els.mode.onclick=()=>{ const m=['sequence','loop','shuffle','single']; state.mode=m[(m.indexOf(state.mode||'sequence')+1)%m.length]; modeButton(); persist({mode:state.mode}); };
    els.playlistToggle.onclick=()=>{ els.playlistPanel.hidden=!els.playlistPanel.hidden; if(!els.playlistPanel.hidden) requestAnimationFrame(positionQueue); };
    els.playlistClose.onclick=()=>{ els.playlistPanel.hidden=true; };
    els.clear.onclick=async()=>{ const api=desktop(); state={...state,queueTrackIds:[],currentTrackId:null,playing:false}; if(api) state=await api.updatePlayback({queueTrackIds:[],currentTrackId:null,playing:false}); loadTrack(false); emitState(); };
    els.volumeRoot.addEventListener('pointerdown', e=>{ volumeDragging=true; els.volumeRoot.setPointerCapture(e.pointerId); moveElasticVolume(e); });
    els.volumeRoot.addEventListener('pointermove', moveElasticVolume); els.volumeRoot.addEventListener('pointerup', releaseVolume); els.volumeRoot.addEventListener('pointercancel', releaseVolume);
    els.volumeRoot.addEventListener('keydown', e=>{ if(!['ArrowLeft','ArrowDown','ArrowRight','ArrowUp','Home','End'].includes(e.key)) return; e.preventDefault(); const d=['ArrowLeft','ArrowDown'].includes(e.key)?-1:1; updateElasticVolume(e.key==='Home'?0:e.key==='End'?100:Number(els.volume.value)+d); });
    els.volume.oninput=()=>{ state.volume=Number(els.volume.value); state.muted=state.volume===0; applyVolume(); persist({volume:state.volume,muted:state.muted}); };
    els.progress.oninput=()=>{ progressDragging=true; if(els.audio.duration) els.audio.currentTime=els.progress.value/100*els.audio.duration; els.progressRange.style.width=`${els.progress.value}%`; progressDragging=false; };
    els.audio.onplay=()=>{ state.playing=true; persist({playing:true}); syncPlayButton(); renderQueue(); emitState(); };
    els.audio.onpause=()=>{ if(!suppressPausePersist){ state.playing=false; persist({playing:false}); } syncPlayButton(); renderQueue(); emitState(); };
    els.audio.onloadedmetadata=()=>{ const t=currentTrack(); els.duration.textContent=fmt(els.audio.duration); if(t&&Number.isFinite(els.audio.duration)){ t.duration=els.audio.duration; durationCache.set(t.id, els.audio.duration); } if(pendingSeek) els.audio.currentTime=Math.min(pendingSeek,Math.max(0,els.audio.duration-2)); pendingSeek=null; };
    els.audio.ontimeupdate=()=>{ if(progressDragging) return; const p=els.audio.duration?els.audio.currentTime/els.audio.duration*100:0; els.progress.value=p; els.progressRange.style.width=`${p}%`; els.current.textContent=fmt(els.audio.currentTime); const t=currentTrack(); if(t&&Math.floor(els.audio.currentTime)%5===0) persist({position:{trackId:t.id,seconds:els.audio.currentTime}}); if(!els.playlistPanel.hidden) renderQueue(); };
    els.audio.onended=()=>{ const id=nextId(1); if(id) playTrack(id,true); };
    document.addEventListener('pointerdown', e=>{ if(els.playlistPanel.hidden) return; if(els.playlistPanel.contains(e.target)||els.playlistToggle.contains(e.target)) return; els.playlistPanel.hidden=true; });
    document.addEventListener('keydown', e=>{ if(e.key==='Escape') els.playlistPanel.hidden=true; });
    window.addEventListener('resize', positionQueue);
    window.addEventListener('kairos:player-route-layout', applyRouteLayout);
    if ('MutationObserver' in window) new MutationObserver(applyRouteLayout).observe(document.body, { attributes:true, attributeFilter:['class'] });
    window.addEventListener('kairos:music-refresh', async event => {
      const hasPlaybackPatch = event.detail?.currentTrackId || Array.isArray(event.detail?.queueTrackIds) || event.detail?.playing !== undefined || event.detail?.mode;
      if (!hasPlaybackPatch) await refresh(false, false);
      else if (!(state.tracks || []).length) await refresh(false, false);
      if (Array.isArray(event.detail?.queueTrackIds)) {
        const validIds = new Set((state.tracks || []).map(track => track.id));
        state.queueTrackIds = event.detail.queueTrackIds.filter(id => validIds.has(id));
      }
      if (event.detail?.mode && ['sequence','loop','shuffle','single'].includes(event.detail.mode)) {
        state.mode = event.detail.mode;
        modeButton();
      }
      if (event.detail?.playing !== undefined) {
        state.playing = event.detail.playing === true;
      }
      if (event.detail?.currentTrackId) {
        state.currentTrackId = event.detail.currentTrackId;
        loadTrack(false);
      } else if (Array.isArray(event.detail?.queueTrackIds)) {
        loadTrack(false);
      }
      if (event.detail?.playing === true && els.audio.src) await els.audio.play().catch(()=>{ els.status.textContent='Unable to play this audio file'; });
      if (event.detail?.playing === false && !els.audio.paused) els.audio.pause();
      syncPlayButton();
      emitState();
    });
    refresh(true).then(() => {
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
