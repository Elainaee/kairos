/* Generated from app/pages/music/index.html. Do not hand-edit. */
(() => {
  const __candidateGlobal = globalThis;
  const __runtime = __candidateGlobal.__kairosNativeMusicCandidateRuntime;
  if (!__runtime) return;
  const document = __runtime.document;
  const window = __runtime.window;
  const location = window.location;
  const setTimeout = __runtime.setTimeout;
  const clearTimeout = __runtime.clearTimeout;
  const setInterval = __runtime.setInterval;
  const clearInterval = __runtime.clearInterval;
  const requestAnimationFrame = __runtime.requestAnimationFrame;
  const cancelAnimationFrame = __runtime.cancelAnimationFrame;

const group = document.getElementById('sidebarGroup');
const trigger = document.getElementById('sidebarTrigger');
const localPlaylistList = document.getElementById('localPlaylistList');
const localPlaylistStatus = document.getElementById('localPlaylistStatus');
const importLocalPlaylist = document.getElementById('importLocalPlaylist');
const playlistDetailBack = document.getElementById('playlistDetailBack');
const playlistDetailContent = document.getElementById('playlistDetailContent');
const historyList = document.getElementById('historyList');
const historyStatus = document.getElementById('historyStatus');
const neteaseStatus = document.getElementById('neteaseStatus');
const neteaseLoginButton = document.getElementById('neteaseLoginButton');
const neteaseOtherLoginButton = document.getElementById('neteaseOtherLoginButton');
const neteaseQrLoginButton = document.getElementById('neteaseQrLoginButton');
const neteaseQrLoginMode = document.getElementById('neteaseQrLoginMode');
const neteasePhoneLoginForm = document.getElementById('neteasePhoneLoginForm');
const neteasePhoneInput = document.getElementById('neteasePhoneInput');
const neteaseCaptchaInput = document.getElementById('neteaseCaptchaInput');
const neteaseSendCaptchaButton = document.getElementById('neteaseSendCaptchaButton');
const neteaseVerificationPanel = document.getElementById('neteaseVerificationPanel');
const neteaseVerificationText = document.getElementById('neteaseVerificationText');
const neteaseVerificationButton = document.getElementById('neteaseVerificationButton');
const neteaseRefreshButton = document.getElementById('neteaseRefreshButton');
const neteaseQrCard = document.getElementById('neteaseQrCard');
const neteaseQrImage = document.getElementById('neteaseQrImage');
const neteaseQrEmpty = document.getElementById('neteaseQrEmpty');
const neteaseQrStatus = document.getElementById('neteaseQrStatus');
const neteaseSearchForm = document.getElementById('neteaseSearchForm');
const neteaseSearchInput = document.getElementById('neteaseSearchInput');
const neteaseResults = document.getElementById('neteaseResults');
const neteaseAccountPanel = document.getElementById('neteaseAccountPanel');
const neteaseUrlStatus = document.getElementById('neteaseUrlStatus');
const getNeteaseQualityPreference = () => {
  try {
    const settings = window.KairosSettingsFeature?.read?.() || {};
    const value = settings?.music?.neteaseQuality || 'standard';
    return ['standard', 'higher', 'exhigh', 'lossless'].includes(value) ? value : 'standard';
  } catch {
    return 'standard';
  }
};
const neteaseAuthGate = document.getElementById('neteaseAuthGate');
const neteaseContent = document.getElementById('neteaseContent');
const neteaseSidebarAccountWrap = document.getElementById('neteaseSidebarAccountWrap');
const neteaseSidebarAccount = document.getElementById('neteaseSidebarAccount');
const neteaseSidebarAccountMenu = document.getElementById('neteaseSidebarAccountMenu');
const neteaseSidebarAvatar = document.getElementById('neteaseSidebarAvatar');
const neteaseSidebarAvatarFallback = document.getElementById('neteaseSidebarAvatarFallback');
const neteaseSidebarName = document.getElementById('neteaseSidebarName');
const musicSourceList = document.getElementById('musicSourceList');
const KEY = 'kairos-music-sidebar';
const SOURCE_ORDER_KEY = 'kairos-music-source-order';
const PLAYLIST_ORDER_KEY = 'kairos-music-playlist-orders';
const LIKED_PLAYLIST_ID = '__liked_songs__';
const LIKED_COVER_KEY = 'kairos-music-liked-cover';
const PLAYLIST_COVER_KEY = 'kairos-music-playlist-covers';
const PLAY_COUNT_KEY = 'kairos-music-play-counts';
  const kairosConfirmAlert=({title:t,description:d,action='Delete',cancel='Cancel'}={})=>new Promise(resolve=>{
    let dialog=document.getElementById('kairosAlertDialog');
    if(!dialog){dialog=document.createElement('dialog');dialog.id='kairosAlertDialog';dialog.className='kairos-alert-dialog';dialog.setAttribute('role','alertdialog');dialog.innerHTML='<form method="dialog" class="kairos-alert-content"><div class="kairos-alert-header"><div class="kairos-alert-media"><span class="material-symbols-outlined">warning</span></div><div><h2 class="kairos-alert-title"></h2><p class="kairos-alert-description"></p></div></div><footer class="kairos-alert-footer"><button class="kairos-alert-cancel" value="cancel" type="submit"></button><button class="kairos-alert-action" value="confirm" type="submit"></button></footer></form>';document.body.append(dialog)}
    dialog.querySelector('.kairos-alert-title').textContent=t||'Are you sure?';dialog.querySelector('.kairos-alert-description').textContent=d||'This action cannot be undone.';dialog.querySelector('.kairos-alert-cancel').textContent=cancel;dialog.querySelector('.kairos-alert-action').textContent=action;
    const done=value=>{dialog.removeEventListener('close',onClose);resolve(value)};const onClose=()=>done(dialog.returnValue==='confirm');
    dialog.addEventListener('close',onClose,{once:true});dialog.showModal();dialog.querySelector('.kairos-alert-cancel')?.focus();
  });

let musicState = { tracks: [] };
let currentPlaylistId = null;
let musicSyncing = false;
let musicStateSignature = "";
let musicSourceOrderHydrated = false;
let playbackState = { currentTrackId: null, playing: false };
let syncVisiblePlaylistPlayback = () => {};
let syncHistoryPlayback = () => {};
let detailReturnView = 'playlist';
let neteaseInitialized = false;
let neteaseLoginKey = "";
let neteaseLoginTimer = null;
let neteaseLoginRequestId = 0;
let neteaseLoginMode = 'qr';
let neteaseLoginInFlight = false;
let neteaseLoginCooldownUntil = 0;
let neteaseCaptchaTimer = null;
let neteaseCaptchaSeconds = 0;
let neteaseVerificationUrl = "";
let neteaseLastSongs = [];
let neteaseLastSearchKeyword = "";
let neteaseSearchHomeLoaded = false;
let neteaseVisibleSongs = [];
let neteaseActiveView = 'search';
let neteaseHistoryType = 1;
let neteaseSearchRequestId = 0;
let neteaseStatusRequestId = 0;
let neteaseAccountRequestId = 0;
let neteaseLikedIds = new Set();
let neteaseLikedIdsLoaded = false;
const getDesktopMusic = () => {
  if (window.kairosDesktop?.music) return window.kairosDesktop.music;
  try {
    return window.parent?.kairosDesktop?.music || null;
  } catch {
    return null;
  }
};
const musicRuntime = () => musicState.runtime ||= { sourceOrder: [], playCounts: {}, playlistOrders: {}, playlistCovers: {}, likedCover: '', sidebarState: 'expanded' };
const persistMusicRuntime = patch => { musicState.runtime = { ...musicRuntime(), ...patch }; getDesktopMusic()?.updateRuntime?.(patch).catch(() => {}); };

const getDesktopNetease = () => {
  if (window.kairosDesktop?.netease) return window.kairosDesktop.netease;
  try {
    return window.parent?.kairosDesktop?.netease || null;
  } catch {
    return null;
  }
};

const readMusicSourceOrder = () => {
  const order = musicRuntime().sourceOrder;
  return Array.isArray(order) ? order.filter(id => id === 'local' || id === 'netease') : [];
};

const writeMusicSourceOrder = () => {
  if (!musicSourceList) return;
  const order = Array.from(musicSourceList.querySelectorAll('[data-source-group]'))
    .map(item => item.dataset.sourceGroup)
    .filter(Boolean);
  persistMusicRuntime({ sourceOrder: order });
};

const applyMusicSourceOrder = () => {
  if (!musicSourceList) return;
  const order = readMusicSourceOrder();
  order.forEach(id => {
    const item = musicSourceList.querySelector(`[data-source-group="${id}"]`);
    if (item) musicSourceList.append(item);
  });
};

const initMusicSourceSort = () => {
  if (!musicSourceList) return;
  let draggedSource = null;
  let suppressSourceClickUntil = 0;
  const items = () => Array.from(musicSourceList.querySelectorAll('[data-source-group]'));
  applyMusicSourceOrder();
  musicSourceList.addEventListener('dragstart', event => {
    const item = event.target.closest('[data-source-group]');
    if (!item || !musicSourceList.contains(item)) return;
    draggedSource = item;
    item.classList.add('is-source-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', item.dataset.sourceGroup || '');
  });
  musicSourceList.addEventListener('dragover', event => {
    if (!draggedSource) return;
    const target = event.target.closest('[data-source-group]');
    items().forEach(item => item.classList.remove('source-drop-before', 'source-drop-after'));
    if (!target || target === draggedSource) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    target.classList.add(event.clientY < rect.top + rect.height / 2 ? 'source-drop-before' : 'source-drop-after');
  });
  musicSourceList.addEventListener('drop', event => {
    if (!draggedSource) return;
    const target = event.target.closest('[data-source-group]');
    items().forEach(item => item.classList.remove('source-drop-before', 'source-drop-after'));
    if (!target || target === draggedSource) return;
    event.preventDefault();
    const rect = target.getBoundingClientRect();
    if (event.clientY < rect.top + rect.height / 2) {
      musicSourceList.insertBefore(draggedSource, target);
    } else {
      musicSourceList.insertBefore(draggedSource, target.nextSibling);
    }
    writeMusicSourceOrder();
  });
  musicSourceList.addEventListener('dragend', () => {
    items().forEach(item => item.classList.remove('is-source-dragging', 'source-drop-before', 'source-drop-after'));
    draggedSource = null;
    suppressSourceClickUntil = Date.now() + 250;
  });
  musicSourceList.addEventListener('click', event => {
    if (Date.now() > suppressSourceClickUntil) return;
    event.preventDefault();
    event.stopPropagation();
  }, true);
};

const showInitialMusicSource = () => {
  const firstSource = musicSourceList?.querySelector('[data-source-group]')?.dataset.sourceGroup || 'local';
  document.querySelectorAll('[data-source]').forEach(item =>
    item.setAttribute('aria-checked', String(item.dataset.source === firstSource))
  );
  document.querySelectorAll('.music-sub-item').forEach(item => item.setAttribute('aria-checked', 'false'));
  document.querySelectorAll('.music-submenu').forEach(submenu => {
    const isFirst = submenu.dataset.sourceGroup === firstSource;
    submenu.dataset.state = isFirst ? 'open' : 'closed';
    submenu.querySelector('.music-submenu-trigger')?.setAttribute('aria-expanded', String(isFirst));
  });
  if (firstSource === 'netease') {
    const view = neteaseActiveView || 'search';
    document.querySelector(`[data-netease-view="${view}"]`)?.setAttribute('aria-checked', 'true');
    showNeteaseSection(view);
    return;
  }
  document.querySelector('[data-view="playlist"]')?.setAttribute('aria-checked', 'true');
  showMusicView('playlist');
};

const notifyMusicPlayer = (detail = {}) => {
  const payload = { source: location.href, at: Date.now(), refresh: true, ...detail };
  const applyTo = target => {
    try {
      target?.KairosMusicPlayer?.mount?.();
      if (target?.KairosMusicPlayer?.applyRefresh) {
        target.KairosMusicPlayer.applyRefresh(payload);
        return true;
      }
    } catch {}
    return false;
  };
  const directTargets = [window];
  try {
    if (window.parent && window.parent !== window) directTargets.push(window.parent);
  } catch {}
  const dispatchRefreshEvent = () => {
    try { window.dispatchEvent(new CustomEvent('kairos:music-refresh', { detail: payload })); } catch {}
    try {
      if (window.parent && window.parent !== window) {
        window.parent.dispatchEvent(new CustomEvent('kairos:music-refresh', { detail: payload }));
      }
    } catch {}
  };
  if (directTargets.some(applyTo)) return;
  const requiresDirectPlayer = Array.isArray(payload.tracks) && Boolean(payload.currentTrackId);
  if (requiresDirectPlayer) {
    [40, 120, 260, 520, 900, 1500, 2200].forEach((delay, index, attempts) => {
      setTimeout(() => {
        if (directTargets.some(applyTo)) return;
        if (index === attempts.length - 1) dispatchRefreshEvent();
      }, delay);
    });
    return;
  }
  [80, 220, 500].forEach(delay => {
    setTimeout(() => {
      if (directTargets.some(applyTo)) return;
      dispatchRefreshEvent();
    }, delay);
  });
  dispatchRefreshEvent();
};
const localPlaybackDetail = detail => ({
  tracks: musicState.tracks || [],
  ...detail
});
const localLibrarySyncDetail = (detail = {}) => {
  const snapshot = getPlayerSnapshot();
  if (String(snapshot.currentTrackId || '').startsWith('netease:')) return localPlaybackDetail(detail);
  return localPlaybackDetail({
    queueTrackIds: musicState.queueTrackIds || [],
    currentTrackId: musicState.currentTrackId || null,
    playing: musicState.playing === true,
    ...detail
  });
};

const showMusicView = view => {
  if (view !== 'playlist-detail') playlistDetailBack.hidden = false;
  document.querySelectorAll('[data-music-view]').forEach(section => {
    section.hidden = section.dataset.musicView !== view;
  });
};

const attachTiltedCard = card => {
  const inner = card.querySelector('.playlist-tilted-inner');
  const amplitude = 9;
  card.addEventListener('pointermove', event => {
    const rect = card.getBoundingClientRect();
    const offsetX = event.clientX - rect.left - rect.width / 2;
    const offsetY = event.clientY - rect.top - rect.height / 2;
    const rotateX = (offsetY / (rect.height / 2)) * -amplitude;
    const rotateY = (offsetX / (rect.width / 2)) * amplitude;
    inner.style.transform = `rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale(1.035)`;
  });
  card.addEventListener('pointerleave', () => {
    inner.style.transform = 'rotateX(0deg) rotateY(0deg) scale(1)';
  });
};

const formatTrackDuration = seconds => {
  if (!Number.isFinite(seconds) || seconds <= 0) return '--:--';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
};

const likedAriaLabel = liked => liked ? 'Remove from liked songs' : 'Add to liked songs';
const trackPlayIcon = () => '<svg class="track-play-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8.75 6.45c0-1.18 1.29-1.9 2.29-1.28l8.22 5.14c.94.59.94 1.96 0 2.55L11.04 18c-1 .62-2.29-.1-2.29-1.28V6.45Z" fill="currentColor"/></svg><svg class="track-pause-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7.4 5.2h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2H7.4c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Zm6 0h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2h-3.2c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Z" fill="currentColor"/></svg>';

const setNeteaseStatus = (message, ready = false) => {
  if (!neteaseStatus) return;
  neteaseStatus.classList.toggle('is-ready', ready);
  const text = neteaseStatus.querySelector('span:last-child');
  if (text) text.textContent = message;
};

const isNeteaseViewVisible = () => {
  const view = document.querySelector('[data-music-view="netease"]');
  return Boolean(view && !view.hidden);
};

const setNeteaseVerification = (result = null) => {
  neteaseVerificationUrl = result?.redirectUrl || "";
  const shouldShow = Boolean(result?.needsVerification && neteaseVerificationUrl);
  if (neteaseVerificationPanel) neteaseVerificationPanel.hidden = !shouldShow;
  if (neteaseVerificationText) {
    neteaseVerificationText.textContent = shouldShow
      ? 'NetEase blocked this login for account security. Complete verification, then try again.'
      : '';
  }
};

const setNeteaseLoginMode = mode => {
  neteaseLoginMode = mode === 'phone' ? 'phone' : 'qr';
  setNeteaseVerification(null);
  if (neteaseLoginMode === 'phone') {
    clearInterval(neteaseLoginTimer);
    neteaseLoginTimer = null;
    neteaseLoginKey = "";
  }
  if (neteaseQrLoginMode) neteaseQrLoginMode.hidden = neteaseLoginMode !== 'qr';
  if (neteasePhoneLoginForm) neteasePhoneLoginForm.hidden = neteaseLoginMode !== 'phone';
  if (neteaseLoginMode === 'qr' && isNeteaseViewVisible() && !neteaseLoginKey && !neteaseLoginInFlight && Date.now() >= neteaseLoginCooldownUntil) {
    setTimeout(() => startNeteaseLoginFlow(), 0);
  }
};

const renderNeteaseSidebarProfile = profile => {
  if (!neteaseSidebarAccountWrap) return;
  const hasProfile = Boolean(profile?.nickname || profile?.avatarUrl || profile?.userId);
  neteaseSidebarAccountWrap.hidden = false;
  if (neteaseSidebarAccount) neteaseSidebarAccount.setAttribute('aria-expanded', 'false');
  if (neteaseSidebarAccountMenu) neteaseSidebarAccountMenu.hidden = true;
  if (neteaseSidebarAccount) neteaseSidebarAccount.disabled = !hasProfile;
  const serviceIcon = document.querySelector('.music-sidebar-account-service');
  const chevron = document.querySelector('.music-sidebar-account-chevron');
  if (serviceIcon) serviceIcon.hidden = !hasProfile;
  if (chevron) chevron.hidden = !hasProfile;
  if (!hasProfile) {
    if (neteaseSidebarName) neteaseSidebarName.textContent = '\u672a\u767b\u5f55';
    if (neteaseSidebarAvatar) {
      neteaseSidebarAvatar.hidden = true;
      neteaseSidebarAvatar.removeAttribute('src');
    }
    if (neteaseSidebarAvatarFallback) neteaseSidebarAvatarFallback.hidden = false;
    return;
  }
  if (neteaseSidebarName) neteaseSidebarName.textContent = profile.nickname || 'NetEase Cloud';
  const avatarUrl = String(profile.avatarUrl || '').trim();
  if (neteaseSidebarAvatar) {
    neteaseSidebarAvatar.hidden = !avatarUrl;
    if (avatarUrl) neteaseSidebarAvatar.src = avatarUrl;
    else neteaseSidebarAvatar.removeAttribute('src');
  }
  if (neteaseSidebarAvatarFallback) neteaseSidebarAvatarFallback.hidden = Boolean(avatarUrl);
};

const setNeteaseAuthenticated = loggedIn => {
  if (neteaseAuthGate) neteaseAuthGate.hidden = Boolean(loggedIn);
  if (neteaseContent) neteaseContent.hidden = !loggedIn;
  if (!loggedIn) setNeteaseLoginMode(neteaseLoginMode);
};

const setNeteaseBusy = busy => {
  [neteaseLoginButton, neteaseRefreshButton, neteaseSearchForm?.querySelector('button')].forEach(button => {
    if (button) button.disabled = Boolean(busy);
  });
};

const getPlayerSnapshot = () => {
  try {
    const player = window.parent && window.parent !== window ? window.parent.KairosMusicPlayer : window.KairosMusicPlayer;
    return player?.getState?.() || {};
  } catch {
    return {};
  }
};

const postNeteaseUrlRefresh = (requestId, track = null, error = "") => {
  const detail = { requestId, track, error };
  try { window.dispatchEvent(new CustomEvent('kairos:netease-url-refreshed', { detail })); } catch {}
  try {
    if (window.parent && window.parent !== window) {
      window.parent.dispatchEvent(new CustomEvent('kairos:netease-url-refreshed', { detail }));
    }
  } catch {}
};

const handleNeteaseUrlRefresh = async event => {
  const requestId = event.detail?.requestId;
  const sourceTrack = event.detail?.track;
  if (!requestId || !sourceTrack) return;
  const api = getDesktopNetease();
  if (!api?.playSong) return postNeteaseUrlRefresh(requestId, null);
  try {
    const result = await api.playSong({ id: sourceTrack.id, neteaseId: sourceTrack.neteaseId, level: getNeteaseQualityPreference() });
    postNeteaseUrlRefresh(requestId, result?.ok ? result.track : null, result?.ok ? "" : result?.message || "Unable to refresh NetEase URL");
  } catch (error) {
    console.error('netease url refresh failed', error);
    postNeteaseUrlRefresh(requestId, null, error?.message || "Unable to refresh NetEase URL");
  }
};

const registerNeteaseUrlRefreshListener = () => {
  window.addEventListener('kairos:netease-refresh-url', handleNeteaseUrlRefresh);
  try {
    if (window.parent && window.parent !== window) {
      window.parent.addEventListener('kairos:netease-refresh-url', handleNeteaseUrlRefresh);
    }
  } catch {}
};

const updateNeteasePlaybackRows = (override = null) => {
  const snapshot = override || getPlayerSnapshot();
  const hasSnapshot = snapshot && Object.prototype.hasOwnProperty.call(snapshot, 'currentTrackId');
  const currentId = hasSnapshot ? (snapshot.currentTrackId || null) : (playbackState.currentTrackId || null);
  const playing = hasSnapshot ? snapshot.playing === true : playbackState.playing === true;
  neteaseResults?.querySelectorAll('tbody tr[data-id]').forEach(row => {
    const isCurrent = row.dataset.id === currentId;
    const isActive = isCurrent && playing;
    row.classList.toggle('is-playing', isActive);
    const button = row.querySelector('.track-play-button');
    const number = row.querySelector('.track-number');
    if (button) {
      button.dataset.state = isActive ? 'pause' : 'play';
      button.setAttribute('aria-label', isActive ? 'Pause track' : 'Play track');
    }
    if (number) number.textContent = isActive ? '' : number.dataset.indexLabel || number.textContent;
  });
};

const neteaseNumericId = song => String(song?.neteaseId || song?.id || '').replace(/^netease:/, '');
const isNeteaseSongLiked = song => song?.liked === true || neteaseLikedIds.has(neteaseNumericId(song));
const refreshNeteaseVisibleIndexes = () => {
  let visibleIndex = 0;
  neteaseResults?.querySelectorAll('tbody tr[data-id]').forEach(row => {
    const number = row.querySelector('.track-number');
    if (!number) return;
    if (row.hidden) return;
    visibleIndex += 1;
    number.dataset.indexLabel = String(visibleIndex).padStart(2, '0');
    if (!row.classList.contains('is-playing')) number.textContent = number.dataset.indexLabel;
  });
  return visibleIndex;
};
const getVisibleNeteaseQueueSongs = fallbackSongs => {
  const source = Array.isArray(fallbackSongs) ? fallbackSongs : [];
  const byId = new Map(source.map(song => [song.id, song]));
  const visibleSongs = [...(neteaseResults?.querySelectorAll('tbody tr[data-id]') || [])]
    .filter(row => !row.hidden)
    .map(row => byId.get(row.dataset.id))
    .filter(Boolean);
  return visibleSongs.length ? visibleSongs : source;
};
const updateNeteaseLikeRows = () => {
  neteaseResults?.querySelectorAll('tbody tr[data-id]').forEach(row => {
    const button = row.querySelector('.track-like-button');
    if (!button) return;
    const id = String(row.dataset.neteaseId || '').replace(/^netease:/, '');
    const liked = neteaseLikedIdsLoaded ? neteaseLikedIds.has(id) : row.dataset.liked === 'true';
    row.dataset.liked = String(liked);
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', liked ? 'Remove from NetEase liked songs' : 'Add to NetEase liked songs');
    const menuLike = row.querySelector('[data-action="like"] span:last-child');
    if (menuLike) menuLike.textContent = liked ? 'Remove from Liked' : 'Like';
  });
};

const updateNeteasePlayerLikeState = song => {
  const id = neteaseNumericId(song);
  if (!id) return;
  notifyMusicPlayer({
    tracks: [{ ...makeNeteaseTrackShell(song), liked: isNeteaseSongLiked(song) }],
    likedTrackId: `netease:${id}`,
    liked: isNeteaseSongLiked(song)
  });
};

const closeNeteaseRowMenus = () => {
  neteaseResults?.querySelectorAll('.track-row-menu:not([hidden])').forEach(menu => {
    menu.hidden = true;
    menu.parentElement?.querySelector('.track-row-menu-trigger')?.setAttribute('aria-expanded', 'false');
  });
};

const shimmerLine = (className = 'medium') => `<span class="netease-loading-line shimmer ${className}"></span>`;
const renderPlaylistLoading = () => `
  <div class="netease-loading" aria-busy="true" aria-label="Loading playlists">
    ${shimmerLine('medium')}
    <div class="netease-loading-card-grid">
      ${Array.from({ length: 4 }, () => '<span class="netease-loading-card shimmer"></span>').join('')}
    </div>
  </div>
`;
const renderSongDetailLoading = () => `
  <div class="netease-loading" aria-busy="true" aria-label="Loading songs">
    <div class="netease-loading-hero">
      <span class="netease-loading-cover shimmer"></span>
      <span class="netease-loading-copy">
        ${shimmerLine('short')}
        ${shimmerLine('medium')}
        ${shimmerLine('medium')}
        <span class="netease-loading-button shimmer"></span>
      </span>
    </div>
  </div>
`;
const renderSongRowsLoading = (label = 'Loading songs') => `
  <div class="netease-loading-table" aria-busy="true" aria-label="${label}">
    ${Array.from({ length: 6 }, () => `
      <span class="netease-loading-row">
        <span class="netease-loading-thumb shimmer"></span>
        ${shimmerLine('medium')}
        ${shimmerLine('medium')}
        ${shimmerLine('short')}
      </span>
    `).join('')}
  </div>
`;

const ensureNeteaseLikedIds = async (force = false) => {
  if (neteaseLikedIdsLoaded && !force) return neteaseLikedIds;
  const api = getDesktopNetease();
  if (!api?.getLikedSongIds) return neteaseLikedIds;
  const result = await api.getLikedSongIds();
  if (result?.ok) {
    neteaseLikedIds = new Set((result.ids || []).map(id => String(id)));
    neteaseLikedIdsLoaded = true;
    updateNeteaseLikeRows();
  }
  return neteaseLikedIds;
};

const syncNeteaseCachedLike = (id, liked) => {
  [neteaseLastSongs, neteaseVisibleSongs].forEach(list => {
    (list || []).forEach(item => {
      if (neteaseNumericId(item) === id) item.liked = liked;
    });
  });
};

const toggleNeteaseLike = async (song, button = null) => {
  const api = getDesktopNetease();
  if (!api?.setSongLiked) return;
  const id = neteaseNumericId(song);
  if (!id) return;
  if (!neteaseLikedIdsLoaded) await ensureNeteaseLikedIds().catch(() => {});
  const currentLiked = neteaseLikedIdsLoaded ? neteaseLikedIds.has(id) : isNeteaseSongLiked(song);
  const nextLiked = !currentLiked;
  nextLiked ? neteaseLikedIds.add(id) : neteaseLikedIds.delete(id);
  syncNeteaseCachedLike(id, nextLiked);
  if (song) song.liked = nextLiked;
  updateNeteaseLikeRows();
  if (button) button.disabled = true;
  try {
    const result = await api.setSongLiked({ id, liked: nextLiked });
    if (!result?.ok) throw new Error(result?.message || 'Unable to update NetEase liked songs.');
    updateNeteasePlayerLikeState(song);
    toast[nextLiked ? 'success' : 'message'](nextLiked ? 'Added to NetEase liked songs' : 'Removed from NetEase liked songs');
    if (!nextLiked && neteaseActiveView === 'liked') {
      neteaseLastSongs = neteaseLastSongs.filter(item => neteaseNumericId(item) !== id);
      neteaseVisibleSongs = neteaseVisibleSongs.filter(item => neteaseNumericId(item) !== id);
      const row = neteaseResults?.querySelector(`tr[data-netease-id="${CSS.escape(id)}"]`);
      row?.remove();
      const visibleRows = refreshNeteaseVisibleIndexes() || 0;
      const totalLabel = neteaseResults?.querySelector('.playlist-detail-tab sup');
      const resultsLabel = neteaseResults?.querySelector('.playlist-input-results');
      const metaLabel = neteaseAccountPanel?.querySelector('.playlist-detail-meta');
      if (totalLabel) totalLabel.textContent = String(visibleRows);
      if (resultsLabel) resultsLabel.textContent = `${visibleRows} result${visibleRows === 1 ? '' : 's'}`;
      if (metaLabel) metaLabel.textContent = `${visibleRows} track${visibleRows === 1 ? '' : 's'}`;
      if (!visibleRows && neteaseResults) neteaseResults.innerHTML = '<p class="netease-empty">No liked songs yet.</p>';
    }
  } catch (error) {
    nextLiked ? neteaseLikedIds.delete(id) : neteaseLikedIds.add(id);
    syncNeteaseCachedLike(id, !nextLiked);
    if (song) song.liked = !nextLiked;
    updateNeteaseLikeRows();
    updateNeteasePlayerLikeState(song);
    toast.error('Like failed', error?.message || 'Please login and try again.');
  } finally {
    if (button) button.disabled = false;
  }
};

const makeNeteaseTrackShell = song => ({
  id: song.id,
  neteaseId: song.neteaseId,
  title: song.title || 'NetEase song',
  artist: song.artist || 'NetEase Cloud',
  album: song.album || '',
  coverUrl: song.coverUrl || '',
  duration: Number(song.duration) || 0,
  liked: isNeteaseSongLiked(song),
  source: 'netease'
});

const neteasePlaybackDetail = (snapshot, detail = {}) => ({
  tracks: Array.isArray(snapshot?.tracks) ? snapshot.tracks.filter(item => String(item?.id || '').startsWith('netease:')) : [],
  queueTrackIds: Array.isArray(snapshot?.queueTrackIds) ? snapshot.queueTrackIds.filter(id => String(id).startsWith('netease:')) : [],
  mode: snapshot?.mode || 'sequence',
  ...detail
});

const playNeteaseTrack = async (song, queueSongs = [], options = {}) => {
  const snapshot = getPlayerSnapshot();
  if (!options.forceSequence && snapshot.currentTrackId === song.id && snapshot.playing === true) {
    playbackState = { currentTrackId: song.id, playing: false };
    notifyMusicPlayer(neteasePlaybackDetail(snapshot, { currentTrackId: song.id, playing: false }));
    syncPlaybackRows(playbackState);
    return null;
  }
  if (!options.forceSequence && snapshot.currentTrackId === song.id && snapshot.playing === false) {
    playbackState = { currentTrackId: song.id, playing: true };
    notifyMusicPlayer(neteasePlaybackDetail(snapshot, { currentTrackId: song.id, playing: true }));
    syncPlaybackRows(playbackState);
    return null;
  }
  const api = getDesktopNetease();
  if (!api?.playSong) return null;
  if (neteaseUrlStatus) neteaseUrlStatus.textContent = 'Getting playable URL...';
  const result = await api.playSong({ id: song.id, neteaseId: song.neteaseId, level: getNeteaseQualityPreference() });
  if (!result?.ok || !result.track?.playUrl) {
    throw new Error(result?.message || 'No playable URL returned.');
  }
  const track = result.track;
  const queueSource = (queueSongs?.length ? queueSongs : [song]).filter(item => item?.id);
  const queueMap = new Map(queueSource.map(item => [item.id, makeNeteaseTrackShell(item)]));
  queueMap.set(track.id, { ...(queueMap.get(track.id) || {}), ...track });
  const tracks = [...queueMap.values()];
  const queueTrackIds = tracks.map(item => item.id);
  notifyMusicPlayer({
    tracks,
    queueTrackIds,
    currentTrackId: track.id,
    playing: true,
    mode: options.forceSequence ? 'sequence' : snapshot.mode || 'sequence'
  });
  playbackState = { currentTrackId: track.id, playing: true };
  if (neteaseUrlStatus) neteaseUrlStatus.textContent = `Playing ${track.title || 'NetEase song'} through Kairos Player.`;
  toast.success('Playing from NetEase', track.title || 'NetEase song');
  syncPlaybackRows(playbackState);
  return track;
};

const playNeteaseCollection = async songs => {
  const candidates = (songs || []).filter(song => song?.id);
  let lastError = null;
  for (const song of candidates) {
    try {
      const track = await playNeteaseTrack(song, songs, { forceSequence: true });
      const snapshot = getPlayerSnapshot();
      if (!track && snapshot.currentTrackId === song.id) return null;
      if (track) {
        if (song !== candidates[0]) toast.message('Skipped unavailable songs', `Started from ${track.title || 'the first playable song'}.`);
        return track;
      }
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('No playable songs in this collection.');
};

const enqueueNeteaseTrack = async (song, mode = 'queue') => {
  if (!song?.id) throw new Error('Missing NetEase song.');
  const api = getDesktopNetease();
  if (!api?.playSong) throw new Error('NetEase API is unavailable.');
  const track = makeNeteaseTrackShell(song);
  const snapshot = getPlayerSnapshot();
  const isCurrentNetease = String(snapshot.currentTrackId || '').startsWith('netease:');
  const switchingFromLocalQueue = !isCurrentNetease && Boolean(snapshot.currentTrackId || snapshot.queueTrackIds?.length);
  const currentTrackId = isCurrentNetease ? snapshot.currentTrackId : track.id;
  const existingTracks = Array.isArray(snapshot.tracks)
    ? snapshot.tracks.filter(item => String(item?.id || '').startsWith('netease:'))
    : [];
  const trackMap = new Map(existingTracks.map(item => [item.id, item]));
  (neteaseVisibleSongs || []).forEach(item => {
    if (item?.id && !trackMap.has(item.id)) trackMap.set(item.id, makeNeteaseTrackShell(item));
  });
  trackMap.set(track.id, { ...(trackMap.get(track.id) || {}), ...track });
  const existingQueue = Array.isArray(snapshot.queueTrackIds)
    ? snapshot.queueTrackIds.filter(id => String(id).startsWith('netease:') && id !== track.id)
    : [];
  const currentIndex = isCurrentNetease ? existingQueue.indexOf(currentTrackId) : -1;
  const insertIndex = mode === 'next' ? (currentIndex >= 0 ? currentIndex + 1 : 0) : existingQueue.length;
  existingQueue.splice(insertIndex, 0, track.id);
  const playing = isCurrentNetease && snapshot.playing === true && Boolean(currentTrackId);
  notifyMusicPlayer({
    tracks: [...trackMap.values()],
    queueTrackIds: existingQueue,
    currentTrackId,
    playing,
    mode: snapshot.mode || 'sequence'
  });
  playbackState = { currentTrackId, playing };
  syncPlaybackRows(playbackState);
  if (switchingFromLocalQueue) {
    const reason = mode === 'next'
      ? 'Online songs cannot play next after local tracks.'
      : 'Online songs use a separate queue from local tracks.';
    toast.message('Switched to NetEase queue', `${track.title || 'NetEase song'} \u00b7 ${reason}`);
  } else {
    toast.success(mode === 'next' ? 'Added to play next' : 'Added to queue', track.title || 'NetEase song');
  }
};

const renderNeteaseResults = (songs, options = {}) => {
  if (!neteaseResults) return;
  neteaseVisibleSongs = songs || [];
  if (options.remember !== false) neteaseLastSongs = songs || [];
  if (!songs?.length) {
    neteaseVisibleSongs = [];
    neteaseResults.innerHTML = `<p class="netease-empty">${options.emptyMessage || 'No songs found.'}</p>`;
    return;
  }
  const queueSongs = options.queueSongs || songs;
  const table = document.createElement('table');
  table.className = 'playlist-detail-table netease-results';
  table.innerHTML = '<thead><tr><th class="track-index">#</th><th>Title</th><th>Album</th><th class="track-like">Like</th><th class="track-duration">Time</th><th class="track-actions"></th></tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');
  songs.forEach((song, index) => {
    const row = document.createElement('tr');
    row.dataset.id = song.id;
    row.dataset.neteaseId = neteaseNumericId(song);
    row.dataset.liked = String(isNeteaseSongLiked(song));
    row.dataset.searchText = `${song.title || ''} ${song.artist || ''} ${song.album || ''}`.toLowerCase();
    const playCell = document.createElement('td');
    playCell.className = 'track-play-cell';
    const number = document.createElement('span');
    number.className = 'track-number';
    number.textContent = String(index + 1).padStart(2, '0');
    number.dataset.indexLabel = number.textContent;
    const playButton = document.createElement('button');
    playButton.className = 'track-play-button';
    playButton.type = 'button';
    playButton.setAttribute('aria-label', 'Play track');
    playButton.dataset.state = 'play';
    playButton.innerHTML = trackPlayIcon();
    playButton.addEventListener('click', async () => {
      playButton.disabled = true;
      try {
        await playNeteaseTrack(song, getVisibleNeteaseQueueSongs(queueSongs));
      } catch (error) {
        console.error('netease play failed', error);
        if (neteaseUrlStatus) neteaseUrlStatus.textContent = error?.message || 'Play failed.';
        toast.error('Play failed', error?.message || 'This song is unavailable.');
      } finally {
        playButton.disabled = false;
      }
    });
    playCell.append(number, playButton);

    const titleCell = document.createElement('td');
    titleCell.innerHTML = '<div class="track-title-cell"><span class="track-cover"></span><span class="track-main"><span class="track-name"></span><span class="track-artist"></span></span></div>';
    const cover = titleCell.querySelector('.track-cover');
    if (song.coverUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = song.coverUrl;
      cover.append(img);
    } else {
      cover.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">music_note</span>';
    }
    titleCell.querySelector('.track-name').textContent = song.title || 'NetEase song';
    titleCell.querySelector('.track-artist').textContent = song.artist || 'NetEase Cloud';

    const albumCell = document.createElement('td');
    albumCell.className = 'track-album';
    albumCell.textContent = song.album || '';
    const likeCell = document.createElement('td');
    likeCell.className = 'track-like';
    const likeButton = document.createElement('button');
    likeButton.className = 'track-like-button';
    likeButton.type = 'button';
    likeButton.setAttribute('aria-label', isNeteaseSongLiked(song) ? 'Remove from NetEase liked songs' : 'Add to NetEase liked songs');
    likeButton.setAttribute('aria-pressed', String(isNeteaseSongLiked(song)));
    likeButton.innerHTML = '<span class="material-symbols-outlined">favorite</span>';
    likeButton.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await toggleNeteaseLike(song, likeButton);
    });
    likeCell.append(likeButton);
    const timeCell = document.createElement('td');
    timeCell.className = 'track-duration';
    timeCell.textContent = formatTrackDuration(Number(song.duration) || 0);
    const actionCell = document.createElement('td');
    actionCell.className = options.showPlayCount ? 'track-actions history-actions' : 'track-actions';
    const rowMenuHtml = options.showPlayCount
      ? `<span class="track-row-menu-wrap"><button class="track-row-menu-trigger" type="button" aria-label="More actions" aria-expanded="false"><span class="material-symbols-outlined">more_horiz</span></button><span class="track-row-menu" hidden><button type="button" data-action="play-next"><span class="material-symbols-outlined">queue_play_next</span><span>Play Next</span></button></span></span>`
      : `<span class="track-row-menu-wrap"><button class="track-row-menu-trigger" type="button" aria-label="More actions" aria-expanded="false"><span class="material-symbols-outlined">more_horiz</span></button><span class="track-row-menu" hidden><button type="button" data-action="play-next"><span class="material-symbols-outlined">queue_play_next</span><span>Play Next</span></button><button type="button" data-action="add-queue"><span class="material-symbols-outlined">playlist_add</span><span>Add to Queue</span></button><button type="button" data-action="like"><span class="material-symbols-outlined">favorite</span><span>${isNeteaseSongLiked(song) ? 'Remove from Liked' : 'Like'}</span></button></span></span>`;
    actionCell.innerHTML = options.showPlayCount
      ? `<span class="history-play-count"><span class="material-symbols-outlined">play_arrow</span>${Number(song.playCount) || 0}</span>${rowMenuHtml}`
      : rowMenuHtml;
    const trigger = actionCell.querySelector('.track-row-menu-trigger');
    const menu = actionCell.querySelector('.track-row-menu');
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.track-row-menu').forEach(item => { if (item !== menu) item.hidden = true; });
      menu.hidden = !menu.hidden;
      trigger.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.querySelectorAll('button[data-action]').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        try {
          if (button.dataset.action === 'like') await toggleNeteaseLike(song, likeButton);
          else await enqueueNeteaseTrack(song, button.dataset.action === 'play-next' ? 'next' : 'queue');
        } catch (error) {
          console.error('netease queue failed', error);
          toast.error('Add failed', error?.message || 'This song is unavailable.');
        }
      });
    });
    row.append(playCell, titleCell, albumCell, likeCell, timeCell, actionCell);
    tbody.append(row);
  });
  if (options.withFilter) {
    const tabs = document.createElement('div');
    tabs.className = 'playlist-detail-tabs';
    const historyToggle = options.historyType === 0 || options.historyType === 1
      ? `<span class="netease-history-tabs" role="group" aria-label="History range">
          <button class="netease-history-tab" type="button" data-history-type="1" aria-pressed="${options.historyType === 1}">最近一周</button>
          <button class="netease-history-tab" type="button" data-history-type="0" aria-pressed="${options.historyType === 0}">所有时间</button>
          <span class="netease-history-indicator" aria-hidden="true"></span>
        </span>`
      : '';
    tabs.innerHTML = `
      <div class="playlist-detail-tab-row"><div class="playlist-detail-tab">Songs <sup>${songs.length}</sup></div>${historyToggle}</div>
      <label class="playlist-input-group">
        <span class="playlist-input-addon"><span class="material-symbols-outlined">search</span></span>
        <input type="search" placeholder="Search">
        <span class="playlist-input-results">${songs.length} results</span>
      </label>
    `;
    const input = tabs.querySelector('input');
    const resultsLabel = tabs.querySelector('.playlist-input-results');
    const positionHistoryIndicator = () => {
      const group = tabs.querySelector('.netease-history-tabs');
      const indicator = tabs.querySelector('.netease-history-indicator');
      const active = tabs.querySelector('.netease-history-tab[aria-pressed="true"]');
      if (!group || !indicator || !active) return;
      indicator.style.width = `${active.offsetWidth}px`;
      indicator.style.transform = `translateX(${active.offsetLeft}px)`;
    };
    input.addEventListener('input', () => {
      const query = input.value.trim().toLowerCase();
      tbody.querySelectorAll('tr[data-id]').forEach(row => {
        const match = !query || row.dataset.searchText.includes(query);
        row.hidden = !match;
      });
      const visible = refreshNeteaseVisibleIndexes() || 0;
      resultsLabel.textContent = `${visible} result${visible === 1 ? '' : 's'}`;
      updateNeteasePlaybackRows();
    });
    tabs.querySelectorAll('[data-history-type]').forEach(button => {
      button.addEventListener('click', () => {
        const nextType = Number(button.dataset.historyType);
        if (nextType === neteaseHistoryType) return;
        tabs.querySelectorAll('[data-history-type]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
        positionHistoryIndicator();
        neteaseHistoryType = nextType;
        loadNeteaseHistory(nextType);
      });
    });
    requestAnimationFrame(positionHistoryIndicator);
    neteaseResults.replaceChildren(tabs, table);
  } else {
    neteaseResults.replaceChildren(table);
  }
  neteaseResults.onclick = event => {
    if (event.target.closest('.track-row-menu-wrap')) return;
    closeNeteaseRowMenus();
  };
  refreshNeteaseVisibleIndexes();
  updateNeteasePlaybackRows();
  ensureNeteaseLikedIds().catch(() => {});
};

const setNeteaseSearchVisible = visible => {
  if (neteaseSearchForm) neteaseSearchForm.hidden = !visible;
  if (neteaseResults) neteaseResults.hidden = false;
  if (neteaseAccountPanel) neteaseAccountPanel.replaceChildren();
};

const updatePlaylistSubscribeButton = (button, subscribed) => {
  if (!button) return;
  button.dataset.subscribed = String(Boolean(subscribed));
  button.setAttribute('aria-pressed', String(Boolean(subscribed)));
  button.querySelector('.material-symbols-outlined').textContent = subscribed ? 'favorite' : 'favorite_border';
  button.querySelector('span:last-child').textContent = subscribed ? 'Unsave' : 'Save';
};

const toggleNeteasePlaylistSubscribed = async (playlist, button) => {
  const api = getDesktopNetease();
  if (!api?.setPlaylistSubscribed || !playlist?.neteaseId) return;
  const nextSubscribed = button?.dataset.subscribed !== 'true';
  updatePlaylistSubscribeButton(button, nextSubscribed);
  if (button) button.disabled = true;
  try {
    const result = await api.setPlaylistSubscribed({ neteaseId: playlist.neteaseId, subscribed: nextSubscribed });
    if (!result?.ok) throw new Error(result?.message || 'Unable to update playlist collection.');
    playlist.subscribed = nextSubscribed;
    toast[nextSubscribed ? 'success' : 'message'](nextSubscribed ? 'Playlist saved' : 'Playlist unsaved', playlist.name || '');
  } catch (error) {
    updatePlaylistSubscribeButton(button, !nextSubscribed);
    toast.error('Playlist update failed', error?.message || 'Please login and try again.');
  } finally {
    if (button) button.disabled = false;
  }
};

const openNeteasePlaylistDetail = async (playlist, backTo = 'search-home') => {
  const api = getDesktopNetease();
  if (!api?.getPlaylistSongs || !playlist?.neteaseId) return;
  const detailRequestId = ++neteaseAccountRequestId;
  neteaseAccountPanel.replaceChildren();
  neteaseResults.innerHTML = renderSongRowsLoading();
  try {
    const songsResult = await api.getPlaylistSongs({ neteaseId: playlist.neteaseId, offset: 0 });
    if (neteaseActiveView !== 'search' && neteaseActiveView !== 'playlists') return;
    if (detailRequestId !== neteaseAccountRequestId) return;
    if (!songsResult?.ok) throw new Error(songsResult?.message || 'Unable to load playlist.');
    playlist.subscribed = playlist.subscribed === true || songsResult.subscribed === true;
    await ensureNeteaseLikedIds().catch(() => {});
    if (detailRequestId !== neteaseAccountRequestId) return;
    const trackCount = songsResult.songs?.length || 0;
    renderNeteaseSongCollection(playlist.name, songsResult.songs || [], `${trackCount} track${trackCount === 1 ? '' : 's'} \u00b7 ${playlist.creator || 'NetEase Music'}`, {
      coverUrl: playlist.coverUrl,
      kicker: 'Playlist',
      backTo,
      playlist
    });
  } catch (error) {
    console.error('load netease playlist failed', error);
    neteaseResults.innerHTML = '';
    neteaseAccountPanel.innerHTML = `<p class="netease-empty">${error?.message || 'Unable to load playlist.'}</p>`;
  }
};

const makeNeteasePlaylistCard = (playlist, backTo = 'search-home') => {
  const card = document.createElement('div');
  card.className = 'playlist-tilted-card';
  card.tabIndex = 0;
  card.setAttribute('role', 'button');
  card.setAttribute('aria-label', `Open ${playlist.name || 'NetEase playlist'}`);
  card.innerHTML = `
    <span class="playlist-tilted-inner">
      <span class="playlist-card-cover"></span>
      <span class="playlist-card-overlay"></span>
      <span class="playlist-card-badge"><span class="material-symbols-outlined" style="font-size:16px;width:16px">queue_music</span>${playlist.trackCount || 0}</span>
      <span class="playlist-card-info">
        <span class="playlist-card-title"></span>
        <span class="playlist-card-meta"></span>
      </span>
    </span>
  `;
  renderCoverNode(card.querySelector('.playlist-card-cover'), playlist.coverUrl || '', 'playlist-card');
  card.querySelector('.playlist-card-title').textContent = playlist.name || 'NetEase playlist';
  card.querySelector('.playlist-card-meta').textContent = `${playlist.trackCount || 0} tracks`;
  attachTiltedCard(card);
  const open = () => openNeteasePlaylistDetail(playlist, backTo);
  card.addEventListener('click', event => {
    event.stopPropagation();
    open();
  });
  card.addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    open();
  });
  return card;
};

const createNeteaseHomeSongTable = songs => {
  const table = document.createElement('table');
  table.className = 'playlist-detail-table netease-results netease-home-table';
  table.innerHTML = '<tbody></tbody>';
  const tbody = table.querySelector('tbody');
  songs.forEach((song, index) => {
    const row = document.createElement('tr');
    row.dataset.id = song.id;
    row.dataset.neteaseId = neteaseNumericId(song);
    row.dataset.liked = String(isNeteaseSongLiked(song));
    row.dataset.searchText = `${song.title || ''} ${song.artist || ''} ${song.album || ''}`.toLowerCase();
    row.innerHTML = `
      <td class="track-play-cell"><span class="track-number">${String(index + 1).padStart(2, '0')}</span><button class="track-play-button" type="button" aria-label="Play track" data-state="play">${trackPlayIcon()}</button></td>
      <td><div class="track-title-cell"><span class="track-cover"></span><span class="track-main"><span class="track-name"></span><span class="track-artist"></span></span></div></td>
      <td class="track-album"></td>
      <td class="track-like"><button class="track-like-button" type="button" aria-label="${isNeteaseSongLiked(song) ? 'Remove from NetEase liked songs' : 'Add to NetEase liked songs'}" aria-pressed="${isNeteaseSongLiked(song)}"><span class="material-symbols-outlined">favorite</span></button></td>
      <td class="track-duration">${formatTrackDuration(Number(song.duration) || 0)}</td>
      <td class="track-actions"><span class="track-row-menu-wrap"><button class="track-row-menu-trigger" type="button" aria-label="More actions" aria-expanded="false"><span class="material-symbols-outlined">more_horiz</span></button><span class="track-row-menu" hidden><button type="button" data-action="play-next"><span class="material-symbols-outlined">queue_play_next</span><span>Play Next</span></button><button type="button" data-action="add-queue"><span class="material-symbols-outlined">playlist_add</span><span>Add to Queue</span></button><button type="button" data-action="like"><span class="material-symbols-outlined">favorite</span><span>${isNeteaseSongLiked(song) ? 'Remove from Liked' : 'Like'}</span></button></span></span></td>
    `;
    const number = row.querySelector('.track-number');
    number.dataset.indexLabel = number.textContent;
    const cover = row.querySelector('.track-cover');
    if (song.coverUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = song.coverUrl;
      cover.append(img);
    } else {
      cover.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">music_note</span>';
    }
    row.querySelector('.track-name').textContent = song.title || 'NetEase song';
    row.querySelector('.track-artist').textContent = song.artist || 'NetEase Music';
    row.querySelector('.track-album').textContent = song.album || '';
    row.querySelector('.track-play-button').addEventListener('click', async event => {
      event.stopPropagation();
      try {
        await playNeteaseTrack(song, songs);
      } catch (error) {
        toast.error('Play failed', error?.message || 'This song is unavailable.');
      }
    });
    const likeButton = row.querySelector('.track-like-button');
    likeButton.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      await toggleNeteaseLike(song, likeButton);
    });
    const trigger = row.querySelector('.track-row-menu-trigger');
    const menu = row.querySelector('.track-row-menu');
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      document.querySelectorAll('.track-row-menu').forEach(item => { if (item !== menu) item.hidden = true; });
      menu.hidden = !menu.hidden;
      trigger.setAttribute('aria-expanded', String(!menu.hidden));
    });
    menu.querySelectorAll('button[data-action]').forEach(button => {
      button.addEventListener('click', async event => {
        event.stopPropagation();
        menu.hidden = true;
        trigger.setAttribute('aria-expanded', 'false');
        try {
          if (button.dataset.action === 'like') await toggleNeteaseLike(song, likeButton);
          else await enqueueNeteaseTrack(song, button.dataset.action === 'play-next' ? 'next' : 'queue');
        } catch (error) {
          toast.error('Add failed', error?.message || 'This song is unavailable.');
        }
      });
    });
    tbody.append(row);
  });
  return table;
};

const showNeteaseSearchBack = () => {
  if (!neteaseAccountPanel) return;
  const back = document.createElement('button');
  back.className = 'playlist-detail-back netease-search-back';
  back.type = 'button';
  back.innerHTML = '<span class="material-symbols-outlined">arrow_back</span><span>Back</span>';
  back.addEventListener('click', () => {
    if (neteaseSearchInput) neteaseSearchInput.value = '';
    loadNeteaseSearchHome({ force: true });
  });
  neteaseAccountPanel.replaceChildren(back);
};

const loadNeteaseSearchHome = async ({ force = false } = {}) => {
  const api = getDesktopNetease();
  if (!api?.getSearchHome || !neteaseResults) return;
  if (neteaseSearchHomeLoaded && !force && neteaseResults.querySelector('.netease-search-home')) return;
  const requestId = ++neteaseSearchRequestId;
  setNeteaseSearchVisible(true);
  if (neteaseAccountPanel) neteaseAccountPanel.replaceChildren();
  neteaseLastSongs = [];
  neteaseLastSearchKeyword = "";
  neteaseVisibleSongs = [];
  neteaseResults.innerHTML = renderPlaylistLoading();
  try {
    const result = await api.getSearchHome({ songLimit: 8, playlistLimit: 8 });
    if (neteaseActiveView !== 'search' || requestId !== neteaseSearchRequestId) return;
    if (!result?.ok) throw new Error(result?.message || 'Unable to load NetEase home.');
    await ensureNeteaseLikedIds().catch(() => {});
    if (neteaseActiveView !== 'search' || requestId !== neteaseSearchRequestId) return;
    const dailySongs = result.dailySongs || [];
    const hotPlaylists = result.hotPlaylists || [];
    neteaseVisibleSongs = dailySongs;
    const home = document.createElement('div');
    home.className = 'netease-search-home';
    const daily = document.createElement('section');
    daily.className = 'netease-home-section';
    daily.innerHTML = '<div class="netease-home-section-head"><div><h2 class="netease-home-title">Daily Recommended Songs</h2></div></div>';
    if (!dailySongs.length) {
      const empty = document.createElement('p');
      empty.className = 'netease-empty';
      empty.textContent = 'No daily recommendations available.';
      daily.append(empty);
    } else {
      daily.append(createNeteaseHomeSongTable(dailySongs));
    }
    const playlists = document.createElement('section');
    playlists.className = 'netease-home-section';
    playlists.innerHTML = '<div class="netease-home-section-head"><div><h2 class="netease-home-title">Hot Playlists</h2></div></div>';
    const grid = document.createElement('div');
    grid.className = 'local-playlist-list';
    if (!hotPlaylists.length) {
      const empty = document.createElement('p');
      empty.className = 'netease-empty';
      empty.textContent = 'No hot playlists available.';
      grid.append(empty);
    }
    hotPlaylists.forEach(playlist => grid.append(makeNeteasePlaylistCard(playlist, 'search-home')));
    playlists.append(grid);
    home.append(daily, playlists);
    neteaseResults.replaceChildren(home);
    neteaseSearchHomeLoaded = true;
    updateNeteasePlaybackRows();
  } catch (error) {
    if (neteaseActiveView !== 'search' || requestId !== neteaseSearchRequestId) return;
    console.error('load netease search home failed', error);
    neteaseResults.innerHTML = `<p class="netease-empty">${error?.message || 'Unable to load NetEase home.'}</p>`;
  }
};

const renderNeteaseSongCollection = (title, songs = [], subtitle = '', options = {}) => {
  setNeteaseSearchVisible(false);
  if (neteaseAccountPanel) {
    neteaseAccountPanel.onclick = event => {
      if (!event.target.closest('.track-row-menu-wrap')) closeNeteaseRowMenus();
    };
    const hero = document.createElement('div');
    hero.className = 'playlist-detail-hero';
    hero.innerHTML = `
      <div class="playlist-detail-cover"></div>
      <div>
        <p class="playlist-detail-kicker"></p>
        <h1 class="playlist-detail-title"></h1>
        <p class="playlist-detail-meta"></p>
        <div class="playlist-detail-actions">
          <button class="playlist-play-all" type="button"><span class="material-symbols-outlined">play_arrow</span><span>Play All</span></button>
          ${options.playlist ? '<button class="playlist-subscribe-button" type="button" aria-pressed="false" data-subscribed="false"><span class="material-symbols-outlined">favorite_border</span><span>Save</span></button>' : ''}
        </div>
      </div>
    `;
    const cover = hero.querySelector('.playlist-detail-cover');
    const coverUrl = options.coverUrl || songs.find(song => song?.coverUrl)?.coverUrl || '';
    renderCoverNode(cover, coverUrl);
    cover.classList.toggle('is-liked', options.kind === 'liked');
    hero.querySelector('.playlist-detail-kicker').textContent = options.kicker || 'NetEase';
    hero.querySelector('.playlist-detail-title').textContent = title;
    hero.querySelector('.playlist-detail-meta').textContent = subtitle || `${songs.length} track${songs.length === 1 ? '' : 's'}`;
    const playAll = hero.querySelector('.playlist-play-all');
    playAll.disabled = !songs.length;
    playAll.addEventListener('click', async () => {
      playAll.disabled = true;
      try {
        await playNeteaseCollection(songs);
      } catch (error) {
        console.error('netease play all failed', error);
        toast.error('Play failed', error?.message || 'This song is unavailable.');
      } finally {
        playAll.disabled = !songs.length;
      }
    });
    const subscribeButton = hero.querySelector('.playlist-subscribe-button');
    if (subscribeButton && options.playlist) {
      updatePlaylistSubscribeButton(subscribeButton, options.playlist.subscribed === true);
      subscribeButton.addEventListener('click', () => toggleNeteasePlaylistSubscribed(options.playlist, subscribeButton));
    }
    if (options.backTo === 'playlists') {
      const back = document.createElement('button');
      back.className = 'playlist-detail-back';
      back.type = 'button';
      back.innerHTML = '<span class="material-symbols-outlined">arrow_back</span><span>Back</span>';
      back.addEventListener('click', () => loadNeteasePlaylists());
      neteaseAccountPanel.replaceChildren(back, hero);
    } else if (options.backTo === 'search-home') {
      const back = document.createElement('button');
      back.className = 'playlist-detail-back';
      back.type = 'button';
      back.innerHTML = '<span class="material-symbols-outlined">arrow_back</span><span>Back</span>';
      back.addEventListener('click', () => loadNeteaseSearchHome({ force: true }));
      neteaseAccountPanel.replaceChildren(back, hero);
    } else {
      neteaseAccountPanel.replaceChildren(hero);
    }
  }
  renderNeteaseResults(songs, { remember: false, queueSongs: songs, withFilter: true, showPlayCount: options.showPlayCount === true, historyType: options.historyType, emptyMessage: options.emptyMessage });
};

const loadNeteasePlaylists = async () => {
  const api = getDesktopNetease();
  if (!api?.getUserPlaylists || !neteaseAccountPanel) return;
  const requestId = ++neteaseAccountRequestId;
  setNeteaseSearchVisible(false);
  neteaseResults.innerHTML = '';
  neteaseAccountPanel.innerHTML = renderPlaylistLoading();
  try {
    const result = await api.getUserPlaylists({ offset: 0 });
    if (neteaseActiveView !== 'playlists' || requestId !== neteaseAccountRequestId) return;
    if (!result?.ok) throw new Error(result?.message || 'Unable to load playlists.');
    const wrap = document.createElement('div');
    wrap.innerHTML = '<header class="music-view-header"><div><h2 class="music-view-title">NetEase Playlists</h2><p class="music-view-subtitle"></p></div></header>';
    const totalTracks = result.playlists.reduce((sum, playlist) => sum + (Number(playlist.trackCount) || 0), 0);
    wrap.querySelector('.music-view-subtitle').textContent = `${result.playlists.length} playlist${result.playlists.length === 1 ? '' : 's'} \u00b7 ${totalTracks} track${totalTracks === 1 ? '' : 's'}`;
    if (!result.playlists.length) {
      const empty = document.createElement('p');
      empty.className = 'netease-empty';
      empty.textContent = 'No NetEase playlists found.';
      wrap.append(empty);
      neteaseAccountPanel.replaceChildren(wrap);
      return;
    }
    const makePlaylistCard = playlist => {
      const card = document.createElement('div');
      card.className = 'playlist-tilted-card';
      card.tabIndex = 0;
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', `Open ${playlist.name || 'NetEase playlist'}`);
      card.innerHTML = `
        <span class="playlist-tilted-inner">
          <span class="playlist-card-cover"></span>
          <span class="playlist-card-overlay"></span>
          <span class="playlist-card-badge"><span class="material-symbols-outlined" style="font-size:16px;width:16px">queue_music</span>${playlist.trackCount || 0}</span>
          <span class="playlist-card-info">
            <span class="playlist-card-title"></span>
            <span class="playlist-card-meta"></span>
          </span>
        </span>
      `;
      renderCoverNode(card.querySelector('.playlist-card-cover'), playlist.coverUrl || '', 'playlist-card');
      card.querySelector('.playlist-card-title').textContent = playlist.name || 'NetEase playlist';
      card.querySelector('.playlist-card-meta').textContent = `${playlist.trackCount || 0} tracks`;
      attachTiltedCard(card);
      const openPlaylist = async () => {
        const detailRequestId = ++neteaseAccountRequestId;
        neteaseAccountPanel.innerHTML = renderSongDetailLoading();
        neteaseResults.innerHTML = renderSongRowsLoading();
        try {
          const songsResult = await api.getPlaylistSongs({ neteaseId: playlist.neteaseId, offset: 0 });
          if (neteaseActiveView !== 'playlists' || detailRequestId !== neteaseAccountRequestId) return;
    if (!songsResult?.ok) throw new Error(songsResult?.message || 'Unable to load playlist.');
    playlist.subscribed = playlist.subscribed === true || songsResult.subscribed === true;
    await ensureNeteaseLikedIds().catch(() => {});
          if (neteaseActiveView !== 'playlists' || detailRequestId !== neteaseAccountRequestId) return;
          const trackCount = songsResult.songs?.length || 0;
          const creator = playlist.creator || 'NetEase Cloud';
          playlist.subscribed = playlist.subscribed === true || songsResult.subscribed === true;
          renderNeteaseSongCollection(playlist.name, songsResult.songs || [], `${trackCount} track${trackCount === 1 ? '' : 's'} \u00b7 ${creator}`, {
            coverUrl: playlist.coverUrl,
            kicker: 'Playlist',
            backTo: 'playlists',
            playlist
          });
        } catch (error) {
          if (neteaseActiveView !== 'playlists' || detailRequestId !== neteaseAccountRequestId) return;
          console.error('load netease playlist failed', error);
          neteaseResults.innerHTML = '';
          neteaseAccountPanel.innerHTML = `<p class="netease-empty">${error?.message || 'Unable to load playlist.'}</p>`;
        }
      };
      card.addEventListener('click', async event => {
        event.stopPropagation();
        await openPlaylist();
      });
      card.addEventListener('keydown', async event => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        await openPlaylist();
      });
      return card;
    };
    const appendPlaylistGroup = (title, playlists) => {
      const section = document.createElement('section');
      section.className = 'netease-playlist-group';
      section.innerHTML = `<h3 class="netease-playlist-group-title">${title}</h3>`;
      if (!playlists.length) {
        const empty = document.createElement('p');
        empty.className = 'netease-empty';
        empty.textContent = title === 'Created Playlists' ? 'No created playlists found.' : 'No saved playlists found.';
        section.append(empty);
        wrap.append(section);
        return;
      }
      const grid = document.createElement('div');
      grid.className = 'local-playlist-list';
      playlists.forEach(playlist => grid.append(makePlaylistCard(playlist)));
      section.append(grid);
      wrap.append(section);
    };
    const createdGroup = Array.isArray(result.createdPlaylists) ? result.createdPlaylists : result.playlists;
    const savedGroup = Array.isArray(result.savedPlaylists) ? result.savedPlaylists : [];
    appendPlaylistGroup('Created Playlists', createdGroup || []);
    appendPlaylistGroup('Saved Playlists', savedGroup || []);
    neteaseAccountPanel.replaceChildren(wrap);
  } catch (error) {
    if (neteaseActiveView !== 'playlists' || requestId !== neteaseAccountRequestId) return;
    console.error('load netease playlists failed', error);
    neteaseAccountPanel.innerHTML = `<p class="netease-empty">${error?.message || 'Unable to load playlists.'}</p>`;
  }
};

const loadNeteaseLiked = async () => {
  const api = getDesktopNetease();
  if (!api?.getLikedSongs) return;
  const requestId = ++neteaseAccountRequestId;
  setNeteaseSearchVisible(false);
  neteaseAccountPanel.innerHTML = renderSongDetailLoading();
  neteaseResults.innerHTML = renderSongRowsLoading('Loading liked songs');
  try {
    const result = await api.getLikedSongs();
    if (neteaseActiveView !== 'liked' || requestId !== neteaseAccountRequestId) return;
    if (!result?.ok) throw new Error(result?.message || 'Unable to load liked songs.');
    neteaseLikedIds = new Set((result.ids || []).map(id => String(id)));
    neteaseLikedIdsLoaded = true;
    const total = result.total || result.songs?.length || 0;
    const playlist = result.playlist || {};
    renderNeteaseSongCollection(playlist.name || 'Liked Songs', result.songs || [], `${total} track${total === 1 ? '' : 's'}`, {
      kind: 'liked',
      kicker: 'Playlist',
      coverUrl: playlist.coverUrl || '',
      emptyMessage: 'No liked songs yet.'
    });
  } catch (error) {
    if (neteaseActiveView !== 'liked' || requestId !== neteaseAccountRequestId) return;
    console.error('load netease liked failed', error);
    neteaseAccountPanel.replaceChildren();
    neteaseResults.innerHTML = `<p class="netease-empty">${error?.message || 'Unable to load liked songs.'}</p>`;
  }
};

const loadNeteaseHistory = async (type = neteaseHistoryType) => {
  const api = getDesktopNetease();
  if (!api?.getHistory) return;
  neteaseHistoryType = type === 0 ? 0 : 1;
  const requestId = ++neteaseAccountRequestId;
  setNeteaseSearchVisible(false);
  neteaseAccountPanel.innerHTML = renderSongDetailLoading();
  neteaseResults.innerHTML = renderSongRowsLoading('Loading history');
  try {
    const result = await api.getHistory({ type: neteaseHistoryType });
    if (neteaseActiveView !== 'history' || requestId !== neteaseAccountRequestId) return;
    if (!result?.ok) throw new Error(result?.message || 'Unable to load history.');
    await ensureNeteaseLikedIds().catch(() => {});
    if (neteaseActiveView !== 'history' || requestId !== neteaseAccountRequestId) return;
    const total = result.songs?.length || 0;
    renderNeteaseSongCollection('NetEase History', result.songs || [], `${total} track${total === 1 ? '' : 's'}`, {
      kicker: 'History',
      showPlayCount: true,
      historyType: neteaseHistoryType,
      emptyMessage: 'No NetEase listening history yet.'
    });
  } catch (error) {
    if (neteaseActiveView !== 'history' || requestId !== neteaseAccountRequestId) return;
    console.error('load netease history failed', error);
    neteaseAccountPanel.replaceChildren();
    neteaseResults.innerHTML = `<p class="netease-empty">${error?.message || 'Unable to load history.'}</p>`;
  }
};

const showNeteaseSection = (view = 'search') => {
  neteaseActiveView = view;
  showMusicView('netease');
  if (neteaseAuthGate && !neteaseAuthGate.hidden) setNeteaseLoginMode(neteaseLoginMode);
  document.querySelectorAll('.netease-sub-item').forEach(item => item.setAttribute('aria-checked', String(item.dataset.neteaseView === view)));
  if (view === 'search') {
    setNeteaseSearchVisible(true);
    if (!neteaseLastSongs.length) loadNeteaseSearchHome();
    else renderNeteaseResults(neteaseLastSongs);
  }
  if (view === 'playlists') loadNeteasePlaylists();
  if (view === 'liked') loadNeteaseLiked();
  if (view === 'history') loadNeteaseHistory();
};

const initializeNeteaseView = async () => {
  const api = getDesktopNetease();
  if (!api?.getStatus) {
    setNeteaseStatus('NetEase API is unavailable in this build.');
    renderNeteaseSidebarProfile(null);
    setNeteaseAuthenticated(false);
    return;
  }
  const requestId = ++neteaseStatusRequestId;
  setNeteaseStatus('Checking NetEase status...');
  try {
    const status = await api.getStatus();
    if (requestId !== neteaseStatusRequestId) return;
    neteaseInitialized = true;
    if (status?.loggedIn) {
      const name = status.profile?.nickname ? ` as ${status.profile.nickname}` : '';
      setNeteaseStatus(`Logged in${name}.`, true);
      renderNeteaseSidebarProfile(status.profile);
      setNeteaseAuthenticated(true);
      await ensureNeteaseLikedIds(true).catch(() => {});
      if (requestId !== neteaseStatusRequestId) return;
    } else {
      neteaseLikedIds = new Set();
      neteaseLikedIdsLoaded = false;
      setNeteaseStatus('Anonymous mode. Login may improve availability.', true);
      renderNeteaseSidebarProfile(null);
      setNeteaseAuthenticated(false);
    }
  } catch (error) {
    if (requestId !== neteaseStatusRequestId) return;
    console.error('netease status failed', error);
    setNeteaseStatus('Unable to check NetEase status.');
    renderNeteaseSidebarProfile(null);
    setNeteaseAuthenticated(false);
  }
};

const searchNeteaseSongs = async keyword => {
  const api = getDesktopNetease();
  const query = String(keyword || '').trim();
  if (!query) {
    await loadNeteaseSearchHome({ force: true });
    return true;
  }
  if (!api?.searchSongs) return false;
  const requestId = ++neteaseSearchRequestId;
  setNeteaseBusy(true);
  if (neteaseResults) neteaseResults.innerHTML = renderSongRowsLoading('Searching songs');
  if (neteaseUrlStatus) neteaseUrlStatus.textContent = '';
  try {
    const result = await api.searchSongs({ keyword: query, limit: 30, offset: 0 });
    if (neteaseActiveView !== 'search' || requestId !== neteaseSearchRequestId) return false;
    await ensureNeteaseLikedIds().catch(() => {});
    if (neteaseActiveView !== 'search' || requestId !== neteaseSearchRequestId) return false;
    neteaseLastSearchKeyword = query;
    renderNeteaseResults(result?.songs || []);
    showNeteaseSearchBack();
    return true;
  } catch (error) {
    if (neteaseActiveView !== 'search' || requestId !== neteaseSearchRequestId) return false;
    console.error('netease search failed', error);
    if (neteaseResults) neteaseResults.innerHTML = '<p class="netease-empty">Search failed. Please try again.</p>';
    toast.error('Search failed', error?.message || 'Please try again.');
    return false;
  } finally {
    if (requestId === neteaseSearchRequestId) setNeteaseBusy(false);
  }
};

const refreshNeteaseCurrentView = async () => {
  setNeteaseBusy(true);
  try {
    await initializeNeteaseView();
    let refreshLabel = { playlists: 'Playlists', liked: 'Liked Songs', history: 'History', search: 'Search' }[neteaseActiveView] || 'NetEase';
    if (neteaseActiveView === 'playlists') await loadNeteasePlaylists();
    else if (neteaseActiveView === 'liked') await loadNeteaseLiked();
    else if (neteaseActiveView === 'history') await loadNeteaseHistory();
    else if (neteaseActiveView === 'search') {
      const didSearch = await searchNeteaseSongs(neteaseSearchInput?.value || neteaseLastSearchKeyword);
      if (!didSearch) refreshLabel = 'NetEase status';
    }
    toast.message(`${refreshLabel} refreshed`);
  } catch (error) {
    console.error('netease refresh failed', error);
    toast.error('Refresh failed', error?.message || 'Please try again.');
  } finally {
    setNeteaseBusy(false);
  }
};

const pollNeteaseLogin = async () => {
  const api = getDesktopNetease();
  if (!api?.loginCheck || !neteaseLoginKey) return;
  const loginKey = neteaseLoginKey;
  try {
    const result = await api.loginCheck({ key: loginKey });
    if (loginKey !== neteaseLoginKey) return;
    if (result?.code === 803 || result?.loggedIn) {
      clearInterval(neteaseLoginTimer);
      neteaseLoginTimer = null;
      neteaseLoginKey = "";
      toast.success('NetEase login success', result.nickname || '');
      await initializeNeteaseView();
      return;
    }
    if (result?.code === 800) {
      clearInterval(neteaseLoginTimer);
      neteaseLoginTimer = null;
      if (neteaseQrStatus) neteaseQrStatus.textContent = 'QR code expired. Click Login again.';
      setNeteaseStatus('QR code expired.');
      return;
    }
    if (neteaseQrStatus) neteaseQrStatus.textContent = result?.message || 'Waiting for scan...';
  } catch (error) {
    console.error('netease login check failed', error);
  }
};

const hydrateTrackDuration = (track, cell) => {
  if (!track || Number.isFinite(track.duration) && track.duration > 0 || !track.playUrl || !cell) return;
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.src = track.playUrl;
  audio.onloadedmetadata = async () => {
    const duration = audio.duration;
    if (!Number.isFinite(duration) || duration <= 0) return;
    track.duration = duration;
    cell.textContent = formatTrackDuration(duration);
    const desktopMusic = getDesktopMusic();
    if (desktopMusic?.updateTrack) {
      try { musicState = await desktopMusic.updateTrack({ id: track.id, duration }); } catch {}
    }
  };
  audio.onerror = () => {};
};

const cleanMusicText = value => String(value || '').split('').filter(ch => { const code = ch.charCodeAt(0); return code >= 32 && code !== 127 && code !== 65533 && code !== 9633 && code !== 9647; }).join('').trim();

const historyPlayIcon = () => '<svg class="history-play-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8.75 6.45c0-1.18 1.29-1.9 2.29-1.28l8.22 5.14c.94.59.94 1.96 0 2.55L11.04 18c-1 .62-2.29-.1-2.29-1.28V6.45Z" fill="currentColor"/></svg><svg class="history-pause-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7.4 5.2h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2H7.4c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Zm6 0h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2h-3.2c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Z" fill="currentColor"/></svg>';

const readLocalPlayCounts = () => {
  return musicRuntime().playCounts || {};
};

const clearLocalPlayCount = trackId => {
  const counts = readLocalPlayCounts();
  delete counts[trackId];
  persistMusicRuntime({ playCounts: counts });
};

const toast = (() => {
  let root = null;
  const ensureRoot = () => {
    if (root) return root;
    root = document.createElement('div');
    root.className = 'kairos-sonner';
    root.setAttribute('aria-live', 'polite');
    document.body.append(root);
    return root;
  };
  const show = (type, title, description = '') => {
    const item = document.createElement('div');
    item.className = `kairos-toast ${type}`;
    const icon = type === 'success' ? 'check' : type === 'error' ? 'priority_high' : 'info';
    item.innerHTML = `<span class="kairos-toast-icon"><span class="material-symbols-outlined">${icon}</span></span><span><span class="kairos-toast-title"></span><span class="kairos-toast-description"></span></span>`;
    item.querySelector('.kairos-toast-title').textContent = title;
    const descriptionNode = item.querySelector('.kairos-toast-description');
    descriptionNode.textContent = description;
    descriptionNode.hidden = !description;
    ensureRoot().prepend(item);
    requestAnimationFrame(() => item.classList.add('is-visible'));
    setTimeout(() => {
      item.classList.remove('is-visible');
      setTimeout(() => item.remove(), 220);
    }, 2600);
  };
  return {
    success: (title, description) => show('success', title, description),
    error: (title, description) => show('error', title, description),
    message: (title, description) => show('message', title, description)
  };
})();

window.addEventListener('kairos:toast', event => {
  const detail = event.detail || {};
  const type = ['success', 'error', 'message'].includes(detail.type) ? detail.type : 'message';
  toast[type](detail.title || '', detail.description || '');
});

const applyPlaybackState = detail => {
  if (Array.isArray(detail?.tracks)) {
    detail.tracks.forEach(track => {
      const id = neteaseNumericId(track);
      if (!id || track.liked === undefined) return;
      track.liked === true ? neteaseLikedIds.add(id) : neteaseLikedIds.delete(id);
      syncNeteaseCachedLike(id, track.liked === true);
    });
    if (detail.tracks.some(track => String(track?.id || '').startsWith('netease:') && track.liked !== undefined)) {
      neteaseLikedIdsLoaded = true;
      updateNeteaseLikeRows();
    }
  }
  if (!detail?.currentTrackId) {
    playbackState = { currentTrackId: null, playing: false };
    syncPlaybackRows();
    return;
  }
  playbackState = { currentTrackId: detail.currentTrackId, playing: detail.playing === true };
  syncPlaybackRows();
};

const syncPlaybackRows = (override = null) => {
  if (override) playbackState = override;
  syncVisiblePlaylistPlayback();
  syncHistoryPlayback();
  updateNeteasePlaybackRows(override);
};

window.addEventListener('kairos:music-state-changed', event => applyPlaybackState(event.detail));
window.addEventListener('message', event => {
  if (event.data?.type === 'kairos:music-state-changed') applyPlaybackState(event.data.detail);
});

window.addEventListener('kairos:music-refresh', event => {
  if (Array.isArray(event.detail?.tracks)) {
    musicState = { ...musicState, tracks: event.detail.tracks };
    if (!document.querySelector('[data-music-view="history"]')?.hidden) renderHistory();
  }
});

const getMusicStateSignature = state => JSON.stringify({
  tracks: (state.tracks || []).map(track => [track.id, track.path, track.fileSize, track.updatedAt]),
  playlists: (state.playlists || []).map(playlist => [playlist.id, playlist.folderPath, playlist.trackIds])
});

const readPlaylistOrders = () => {
  return musicRuntime().playlistOrders || {};
};

const playlistOrderKey = playlist => playlist?.id || playlist?.folderPath || playlist?.name || 'playlist';

const savePlaylistOrder = (playlist, trackIds) => {
  const orders = readPlaylistOrders();
  orders[playlistOrderKey(playlist)] = trackIds;
  if (playlist?.folderPath) orders[playlist.folderPath] = trackIds;
  persistMusicRuntime({ playlistOrders: orders });
};

const removeSavedPlaylistOrder = playlist => {
  const orders = readPlaylistOrders();
  delete orders[playlistOrderKey(playlist)];
  if (playlist?.folderPath) delete orders[playlist.folderPath];
  persistMusicRuntime({ playlistOrders: orders });
};

const readPlaylistCovers = () => {
  return musicRuntime().playlistCovers || {};
};

const playlistCoverKey = playlist => playlist?.id || playlist?.folderPath || '';

const getCustomPlaylistCover = playlist => {
  if (!playlist) return '';
  if (playlist.id === LIKED_PLAYLIST_ID) return musicRuntime().likedCover || '';
  const covers = readPlaylistCovers();
  return covers[playlistCoverKey(playlist)] || covers[playlist.folderPath] || '';
};

const saveCustomPlaylistCover = (playlist, dataUrl) => {
  if (!playlist) return;
  if (playlist.id === LIKED_PLAYLIST_ID) {
    persistMusicRuntime({ likedCover: dataUrl });
    return;
  }
  const covers = readPlaylistCovers();
  covers[playlistCoverKey(playlist)] = dataUrl;
  if (playlist.folderPath) covers[playlist.folderPath] = dataUrl;
  persistMusicRuntime({ playlistCovers: covers });
};

const orderPlaylistTrackIds = playlist => {
  const ids = Array.isArray(playlist?.trackIds) ? playlist.trackIds : [];
  const orders = readPlaylistOrders();
  const saved = orders[playlistOrderKey(playlist)] || orders[playlist?.folderPath];
  if (!Array.isArray(saved) || !saved.length) return ids;
  const valid = new Set(ids);
  return [...saved.filter(id => valid.has(id)), ...ids.filter(id => !saved.includes(id))];
};

const applySavedPlaylistOrders = state => ({
  ...state,
  playlists: (state.playlists || []).map(playlist => ({
    ...playlist,
    trackIds: orderPlaylistTrackIds(playlist)
  }))
});

const getPlaylistModel = playlistId => {
  const tracks = Array.isArray(musicState.tracks) ? musicState.tracks : [];
  if (playlistId === LIKED_PLAYLIST_ID) {
    const likedTracks = tracks.filter(track => track.liked === true);
    const byId = new Map(likedTracks.map(track => [track.id, track]));
    const likedPlaylist = {
      id: LIKED_PLAYLIST_ID,
      name: 'Liked Songs',
      type: 'liked',
      trackIds: likedTracks.map(track => track.id),
      coverUrl: getCustomPlaylistCover({ id: LIKED_PLAYLIST_ID })
    };
    const orderedTrackIds = orderPlaylistTrackIds(likedPlaylist);
    return {
      playlist: { ...likedPlaylist, trackIds: orderedTrackIds },
      tracks: orderedTrackIds.map(id => byId.get(id)).filter(Boolean)
    };
  }
  const playlists = Array.isArray(musicState.playlists) ? musicState.playlists : [];
  const playlist = playlists.find(item => item.id === playlistId) || playlists[0];
  if (!playlist) return null;
  const byId = new Map(tracks.map(track => [track.id, track]));
  const orderedTrackIds = orderPlaylistTrackIds(playlist);
  const orderedPlaylist = { ...playlist, trackIds: orderedTrackIds };
  const playlistTracks = orderedTrackIds.map(id => byId.get(id)).filter(Boolean);
  return { playlist: orderedPlaylist, tracks: playlistTracks };
};

const playlistDisplayCover = (playlist, firstTrack) => getCustomPlaylistCover(playlist) || (playlist?.id === LIKED_PLAYLIST_ID ? (playlist?.coverUrl || firstTrack?.coverUrl || '') : (firstTrack?.coverUrl || playlist?.coverUrl || ''));

const renderCoverNode = (container, coverUrl, fallbackClass = '') => {
  container.replaceChildren();
  if (coverUrl) {
    const img = document.createElement('img');
    img.alt = '';
    img.src = coverUrl;
    container.append(img);
    return;
  }
  if (fallbackClass === 'playlist-card') {
    container.innerHTML = '<span class="playlist-card-cover-placeholder"><span class="material-symbols-outlined">album</span></span>';
  } else {
    container.innerHTML = '<div class="playlist-detail-cover-placeholder"><span class="material-symbols-outlined">album</span></div>';
  }
};

const syncPlaylistCardCover = (playlist, tracks) => {
  const card = localPlaylistList.querySelector(`.playlist-tilted-card[data-playlist-id="${CSS.escape(playlist.id)}"]`);
  const cover = card?.querySelector('.playlist-card-cover');
  if (!cover) return;
  renderCoverNode(cover, playlistDisplayCover(playlist, tracks?.[0]), 'playlist-card');
};

const deletePlaylist = async (playlist, triggerButton = null) => {
  if (!playlist?.id) return;
  const title = playlist.name || 'Local Playlist';
  const ok = await kairosConfirmAlert({
    title: 'Delete playlist?',
    description: `${title} will be removed from your library.`,
    action: 'Delete',
    cancel: 'Cancel'
  });
  if (!ok) return;
  const desktopMusic = getDesktopMusic();
  if (!desktopMusic?.removePlaylist) {
    localPlaylistStatus.textContent = 'Delete is unavailable in this view.';
    toast.error('Delete unavailable', 'Desktop music API is not available here.');
    return;
  }
  if (triggerButton) triggerButton.disabled = true;
  try {
    removeSavedPlaylistOrder(playlist);
    musicState = applySavedPlaylistOrders(await desktopMusic.removePlaylist(playlist.id));
    if (currentPlaylistId === playlist.id) {
      currentPlaylistId = null;
      showMusicView('playlist');
    }
    renderLocalPlaylist();
    notifyMusicPlayer(localPlaybackDetail({ queueTrackIds: musicState.queueTrackIds || [], currentTrackId: musicState.currentTrackId || null, playing: false }));
    toast.success('Playlist deleted', title);
  } catch (error) {
    console.error('removePlaylist failed', error);
    localPlaylistStatus.textContent = 'Delete failed. Please try again.';
    toast.error('Delete failed', 'Please try again.');
  } finally {
    if (triggerButton) triggerButton.disabled = false;
  }
};

const renderPlaylistDetail = playlistId => {
  const model = getPlaylistModel(playlistId);
  playlistDetailContent.replaceChildren();
  if (!model) {
    playlistDetailContent.innerHTML = '<div class="music-placeholder"><h2>Playlist not found</h2><p></p></div>';
    return;
  }
  currentPlaylistId = model.playlist.id;
  const isLikedPlaylist = model.playlist.id === LIKED_PLAYLIST_ID;
  playlistDetailBack.hidden = isLikedPlaylist;
  const firstTrack = model.tracks[0];
  const coverUrl = playlistDisplayCover(model.playlist, firstTrack);
  const title = model.playlist.name || 'Local Playlist';
  const hero = document.createElement('div');
  hero.className = 'playlist-detail-hero';
  hero.innerHTML = `
    <div class="playlist-detail-cover"></div>
    <div>
      <p class="playlist-detail-kicker">Playlist</p>
      <h1 class="playlist-detail-title"></h1>
      <p class="playlist-detail-meta"></p>
      <div class="playlist-detail-actions">
        <button class="playlist-play-all" type="button"><span class="material-symbols-outlined">play_arrow</span><span>Play All</span></button>
        <div class="playlist-manage">
          <button class="playlist-manage-trigger" id="playlistManageTrigger" type="button" aria-label="Manage playlist" aria-haspopup="menu" aria-expanded="false"><span class="material-symbols-outlined">more_horiz</span></button>
          <div class="playlist-menu" id="playlistManageMenu" role="menu" hidden>
            <button class="playlist-menu-item" type="button" data-action="cover"><span class="material-symbols-outlined">image</span><span>Change Cover</span></button>
            <div class="playlist-menu-separator"></div>
            ${isLikedPlaylist ? '' : '<button class="playlist-menu-item" type="button" data-action="refresh"><span class="material-symbols-outlined">refresh</span><span>Refresh Folder</span></button><div class="playlist-menu-separator"></div>'}
            <button class="playlist-menu-item" type="button" data-action="select"><span class="material-symbols-outlined">checklist</span><span>Select Songs</span></button>
            ${isLikedPlaylist ? '' : '<button class="playlist-menu-item" type="button" data-action="hidden"><span class="material-symbols-outlined">visibility_off</span><span>Hidden Songs</span></button><div class="playlist-menu-separator"></div><button class="playlist-menu-item danger" type="button" data-action="delete"><span class="material-symbols-outlined">delete</span><span>Delete Playlist</span></button>'}
          </div>
        </div>
      </div>
    </div>
  `;
  const cover = hero.querySelector('.playlist-detail-cover');
  renderCoverNode(cover, coverUrl);
  cover.classList.toggle('is-liked', isLikedPlaylist);
  const editCover = document.createElement('button');
  editCover.className = 'playlist-cover-edit';
  editCover.type = 'button';
  editCover.setAttribute('aria-label', 'Change playlist cover');
  editCover.innerHTML = '<span class="material-symbols-outlined">edit</span>';
  cover.append(editCover);
  hero.querySelector('.playlist-detail-title').textContent = title;
  hero.querySelector('.playlist-detail-kicker').textContent = isLikedPlaylist ? 'Like' : 'Playlist';
  hero.querySelector('.playlist-detail-meta').textContent = `${model.tracks.length} track${model.tracks.length === 1 ? '' : 's'} ${!isLikedPlaylist && model.playlist.folderPath ? `\u00b7 ${model.playlist.folderPath}` : ''}`;
  const updateTrackPlaybackRows = () => {
    tbody?.querySelectorAll('tr[data-track-id]').forEach(row => {
      const isActive = row.dataset.trackId === playbackState.currentTrackId && playbackState.playing;
      row.classList.toggle('is-playing', isActive);
      const button = row.querySelector('.track-play-button');
      if (button) {
        button.dataset.state = isActive ? 'pause' : 'play';
        button.setAttribute('aria-label', isActive ? 'Pause track' : 'Play track');
      }
    });
  };
  const getVisiblePlaylistTrackIds = () => {
    const visibleIds = [...tbody.querySelectorAll('tr[data-track-id]')]
      .filter(row => !row.hidden)
      .map(row => row.dataset.trackId)
      .filter(id => id && model.tracks.find(track => track.id === id)?.available !== false);
    return visibleIds.length ? visibleIds : model.tracks.filter(track => track.available !== false).map(track => track.id);
  };
  const playPlaylistTrack = async (trackId, options = {}) => {
    const target = model.tracks.find(track => track.id === trackId);
    const desktopMusic = getDesktopMusic();
    if (!target) return;
    if (target.available === false) {
      toast.error('File unavailable', 'The local file was moved or deleted.');
      return;
    }
    if (playbackState.currentTrackId === target.id && playbackState.playing) {
      playbackState = { currentTrackId: target.id, playing: false };
      if (desktopMusic?.updatePlayback) {
        try { musicState = await desktopMusic.updatePlayback({ currentTrackId: target.id, playing: false }); } catch (error) { console.error('updatePlayback failed', error); }
      }
      notifyMusicPlayer({ currentTrackId: target.id, playing: false });
      syncPlaybackRows(playbackState);
      return;
    }
    const queueTrackIds = (options.queueTrackIds || getVisiblePlaylistTrackIds()).filter(id => model.tracks.find(track => track.id === id)?.available !== false);
    const playbackPatch = {
      queueTrackIds,
      currentTrackId: target.id,
      playing: true,
      ...(options.forceSequence ? { mode: 'sequence' } : {})
    };
    musicState = {
      ...musicState,
      queueTrackIds,
      currentTrackId: target.id,
      playing: true,
      ...(options.forceSequence ? { mode: 'sequence' } : {})
    };
    if (desktopMusic) {
      try {
        musicState = await desktopMusic.updatePlayback(playbackPatch);
      } catch (error) {
        console.error('updatePlayback failed', error);
      }
    }
    playbackState = { currentTrackId: target.id, playing: true };
    syncPlaybackRows(playbackState);
    notifyMusicPlayer(localPlaybackDetail({ queueTrackIds, currentTrackId: target.id, playing: true, ...(options.forceSequence ? { mode: 'sequence' } : {}) }));
  };
  hero.querySelector('.playlist-play-all').addEventListener('click', async () => {
    const playable = model.tracks.filter(track => track.available !== false);
    const first = playable[0];
    if (first) await playPlaylistTrack(first.id, { forceSequence: true, queueTrackIds: playable.map(track => track.id) });
    else toast.error('No playable songs', 'The local files in this playlist are unavailable.');
  });

  const tabs = document.createElement('div');
  tabs.className = 'playlist-detail-tabs';
  tabs.innerHTML = `
    <div class="playlist-detail-tab">Songs <sup>${model.tracks.length}</sup></div>
    <label class="playlist-input-group">
      <span class="playlist-input-addon"><span class="material-symbols-outlined">search</span></span>
      <input id="playlistDetailSearch" type="search" placeholder="Search">
      <span class="playlist-input-results" id="playlistSearchResults">${model.tracks.length} results</span>
    </label>
  `;

  const table = document.createElement('table');
  table.className = 'playlist-detail-table';
  table.innerHTML = `
    <thead><tr><th class="track-index">#</th><th>Title</th><th>Album</th><th class="track-like">Like</th><th class="track-duration">Time</th><th class="track-actions"></th></tr></thead>
    <tbody></tbody>
  `;
  const tbody = table.querySelector('tbody');
  const resultsLabel = tabs.querySelector('#playlistSearchResults');
  const selectionBar = document.createElement('div');
  selectionBar.className = 'playlist-selection-bar';
  selectionBar.hidden = true;
  selectionBar.innerHTML = '<span class="playlist-selection-text"></span><span class="playlist-selection-actions"><button type="button" data-action="cancel">Cancel</button><button type="button" data-action="queue">Add to Queue</button><button class="danger" type="button" data-action="apply">Remove Selected</button></span>';
  let detailMode = 'songs';
  const selectedTrackIds = new Set();
  const selectedHiddenPaths = new Set();
  const manageTrigger = hero.querySelector('#playlistManageTrigger');
  const manageMenu = hero.querySelector('#playlistManageMenu');
  const closeManageMenu = () => {
    manageMenu.hidden = true;
    manageTrigger.setAttribute('aria-expanded', 'false');
  };
  const updateSelectionBar = () => {
    if (detailMode === 'select') {
      selectionBar.hidden = false;
      selectionBar.querySelector('.playlist-selection-text').textContent = `${selectedTrackIds.size} selected`;
      selectionBar.querySelector('[data-action="queue"]').hidden = false;
      selectionBar.querySelector('[data-action="queue"]').disabled = selectedTrackIds.size === 0;
      selectionBar.querySelector('[data-action="apply"]').textContent = isLikedPlaylist ? 'Remove from Liked' : 'Remove Selected';
      selectionBar.querySelector('[data-action="apply"]').disabled = selectedTrackIds.size === 0;
      return;
    }
    if (detailMode === 'hidden') {
      selectionBar.hidden = false;
      selectionBar.querySelector('.playlist-selection-text').textContent = `${selectedHiddenPaths.size} selected`;
      selectionBar.querySelector('[data-action="queue"]').hidden = true;
      selectionBar.querySelector('[data-action="apply"]').textContent = 'Restore Selected';
      selectionBar.querySelector('[data-action="apply"]').disabled = selectedHiddenPaths.size === 0;
      return;
    }
    selectionBar.hidden = true;
  };
  const setDetailMode = mode => {
    detailMode = mode;
    selectedTrackIds.clear();
    selectedHiddenPaths.clear();
    table.classList.toggle('is-selecting', mode !== 'songs');
    tabs.querySelector('.playlist-detail-tab').innerHTML = mode === 'hidden' ? `Hidden <sup>${model.playlist.hiddenTracks?.length || 0}</sup>` : `Songs <sup>${model.tracks.length}</sup>`;
    updateSelectionBar();
    renderRows(playlistDetailContent.querySelector('#playlistDetailSearch')?.value || '');
  };
  const refreshCurrentPlaylist = async () => {
    const desktopMusic = getDesktopMusic();
    if (!desktopMusic?.refreshPlaylist) return;
    const manageIcon = manageTrigger.querySelector('.material-symbols-outlined');
    manageTrigger.classList.add('is-refreshing');
    manageTrigger.setAttribute('aria-label', 'Refreshing folder');
    if (manageIcon) manageIcon.textContent = 'sync';
    try {
      musicState = applySavedPlaylistOrders(await desktopMusic.refreshPlaylist(model.playlist.id));
      localPlaylistStatus.textContent = 'Folder refreshed';
      toast.success('Folder refreshed');
      if (manageIcon) manageIcon.textContent = 'check';
      await new Promise(resolve => setTimeout(resolve, 320));
      renderPlaylistDetail(model.playlist.id);
      notifyMusicPlayer(localLibrarySyncDetail());
    } catch (error) {
      console.error('refreshPlaylist failed', error);
      localPlaylistStatus.textContent = 'Refresh failed. Please try again.';
      toast.error('Refresh failed', 'Please try again.');
    } finally {
      manageTrigger.classList.remove('is-refreshing');
      manageTrigger.setAttribute('aria-label', 'Manage playlist');
      if (manageIcon) manageIcon.textContent = 'more_horiz';
    }
  };
  const changePlaylistCover = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        saveCustomPlaylistCover(model.playlist, String(reader.result || ''));
        if (!isLikedPlaylist) syncPlaylistCardCover(model.playlist, model.tracks);
        renderPlaylistDetail(model.playlist.id);
        toast.success('Cover updated');
      });
      reader.readAsDataURL(file);
    }, { once: true });
    input.click();
  };
  hero.querySelector('.playlist-cover-edit')?.addEventListener('click', changePlaylistCover);
  const removeSelectedTracks = async () => {
    if (!selectedTrackIds.size) return;
    const desktopMusic = getDesktopMusic();
    if (isLikedPlaylist) {
      if (!desktopMusic?.updateTrack) return;
      const count = selectedTrackIds.size;
      try {
        for (const id of selectedTrackIds) {
          musicState = applySavedPlaylistOrders(await desktopMusic.updateTrack({ id, liked: false }));
        }
        notifyMusicPlayer(localLibrarySyncDetail());
        toast.success(`${count} song${count === 1 ? '' : 's'} removed`, 'Removed from liked songs.');
        renderPlaylistDetail(LIKED_PLAYLIST_ID);
      } catch (error) {
        console.error('remove liked tracks failed', error);
        toast.error('Remove failed', 'Please try again.');
      }
      return;
    }
    if (!desktopMusic?.removeTracksFromPlaylist) return;
    try {
      const count = selectedTrackIds.size;
      musicState = applySavedPlaylistOrders(await desktopMusic.removeTracksFromPlaylist(model.playlist.id, [...selectedTrackIds]));
      notifyMusicPlayer(localPlaybackDetail({ queueTrackIds: musicState.queueTrackIds || [], currentTrackId: musicState.currentTrackId || null, playing: musicState.playing === true }));
      toast.success(`${count} song${count === 1 ? '' : 's'} removed`, 'Hidden from this playlist.');
      renderPlaylistDetail(model.playlist.id);
    } catch (error) {
      console.error('removeTracksFromPlaylist failed', error);
      localPlaylistStatus.textContent = 'Remove failed. Please try again.';
      toast.error('Remove failed', 'Please try again.');
    }
  };
  const addSelectedTracksToQueue = async () => {
    if (!selectedTrackIds.size) return;
    const desktopMusic = getDesktopMusic();
    if (!desktopMusic?.updatePlayback) return;
    const selectedIds = model.tracks.map(track => track.id).filter(id => selectedTrackIds.has(id));
    const queueTrackIds = [
      ...(musicState.queueTrackIds || []),
      ...selectedIds.filter(id => !(musicState.queueTrackIds || []).includes(id))
    ];
    const currentTrackId = musicState.currentTrackId || queueTrackIds[0] || null;
    try {
      musicState = applySavedPlaylistOrders(await desktopMusic.updatePlayback({
        queueTrackIds,
        currentTrackId,
        playing: musicState.playing === true && Boolean(currentTrackId)
      }));
      notifyMusicPlayer(localPlaybackDetail({ queueTrackIds: musicState.queueTrackIds || [], currentTrackId: musicState.currentTrackId || null, playing: musicState.playing === true }));
      toast.success(`${selectedIds.length} song${selectedIds.length === 1 ? '' : 's'} added to queue`);
      setDetailMode('songs');
    } catch (error) {
      console.error('addSelectedTracksToQueue failed', error);
      toast.error('Add to queue failed', 'Please try again.');
    }
  };
  const addTrackToPlayNext = async track => {
    const desktopMusic = getDesktopMusic();
    if (!track?.id || !desktopMusic?.updatePlayback) return;
    const queue = (musicState.queueTrackIds || []).filter(id => id !== track.id);
    const currentTrackId = musicState.currentTrackId || track.id;
    const currentIndex = queue.indexOf(currentTrackId);
    const insertIndex = currentIndex >= 0 ? currentIndex + 1 : 0;
    queue.splice(insertIndex, 0, track.id);
    try {
      musicState = applySavedPlaylistOrders(await desktopMusic.updatePlayback({
        queueTrackIds: queue,
        currentTrackId,
        playing: musicState.playing === true && Boolean(currentTrackId)
      }));
      notifyMusicPlayer(localPlaybackDetail({
        queueTrackIds: musicState.queueTrackIds || [],
        currentTrackId: musicState.currentTrackId || null,
        playing: musicState.playing === true
      }));
      toast.success('Added to play next', cleanMusicText(track.title) || cleanMusicText(track.fileName) || 'Untitled');
    } catch (error) {
      console.error('addTrackToPlayNext failed', error);
      toast.error('Play next failed', 'Please try again.');
    }
  };
  const removeSingleTrack = async trackId => {
    selectedTrackIds.clear();
    selectedTrackIds.add(trackId);
    await removeSelectedTracks();
  };
  const restoreSelectedTracks = async () => {
    if (!selectedHiddenPaths.size) return;
    const desktopMusic = getDesktopMusic();
    if (!desktopMusic?.restoreHiddenTracks) return;
    try {
      const count = selectedHiddenPaths.size;
      musicState = applySavedPlaylistOrders(await desktopMusic.restoreHiddenTracks(model.playlist.id, [...selectedHiddenPaths]));
      toast.success(`${count} song${count === 1 ? '' : 's'} restored`);
      renderPlaylistDetail(model.playlist.id);
      setTimeout(() => renderPlaylistDetail(model.playlist.id), 0);
    } catch (error) {
      console.error('restoreHiddenTracks failed', error);
      localPlaylistStatus.textContent = 'Restore failed. Please try again.';
      toast.error('Restore failed', 'Please try again.');
    }
  };
  const toggleTrackLike = async (track, button) => {
    const desktopMusic = getDesktopMusic();
    const liked = !(track.liked === true);
    track.liked = liked;
    button.setAttribute('aria-pressed', String(liked));
    button.setAttribute('aria-label', likedAriaLabel(liked));
    if (!desktopMusic?.updateTrack) return;
    button.disabled = true;
    try {
      musicState = applySavedPlaylistOrders(await desktopMusic.updateTrack({ id: track.id, liked }));
      toast[liked ? 'success' : 'message'](liked ? 'Added to liked songs' : 'Removed from liked songs');
      if (isLikedPlaylist && !liked) renderPlaylistDetail(LIKED_PLAYLIST_ID);
    } catch (error) {
      console.error('toggle like failed', error);
      track.liked = !liked;
      button.setAttribute('aria-pressed', String(track.liked === true));
      button.setAttribute('aria-label', likedAriaLabel(track.liked === true));
      toast.error('Like failed', 'Please try again.');
    } finally {
      button.disabled = false;
    }
  };
  let draggedTrackId = null;
  let dragCard = null;
  const clearDropHints = () => tbody.querySelectorAll('.drop-before,.drop-after').forEach(row => row.classList.remove('drop-before', 'drop-after'));
  const makeDragCard = track => {
    const card = document.createElement('div');
    card.className = 'playlist-drag-card';
    const cover = document.createElement('span');
    cover.className = 'playlist-drag-card-cover';
    if (track?.coverUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = track.coverUrl;
      cover.append(img);
    } else {
      cover.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">music_note</span>';
    }
    const copy = document.createElement('span');
    copy.className = 'playlist-drag-card-copy';
    const name = document.createElement('span');
    name.className = 'playlist-drag-card-title';
    name.textContent = cleanMusicText(track?.title) || cleanMusicText(track?.fileName) || 'Untitled';
    const artist = document.createElement('span');
    artist.className = 'playlist-drag-card-artist';
    artist.textContent = cleanMusicText(track?.artist) || 'Local music';
    copy.append(name, artist);
    card.append(cover, copy);
    document.body.append(card);
    return card;
  };
  const persistPlaylistOrder = async () => {
    const visibleIds = [...tbody.querySelectorAll('tr[data-track-id]')].map(row => row.dataset.trackId);
    if (!visibleIds.length) return;
    const currentIds = model.tracks.map(track => track.id);
    const visibleSet = new Set(visibleIds);
    const nextIds = [...visibleIds, ...currentIds.filter(id => !visibleSet.has(id))];
    const byId = new Map(model.tracks.map(track => [track.id, track]));
    model.playlist.trackIds = nextIds;
    model.tracks = nextIds.map(id => byId.get(id)).filter(Boolean);
    savePlaylistOrder(model.playlist, nextIds);
    const statePlaylist = musicState.playlists?.find(playlist => playlist.id === model.playlist.id);
    if (statePlaylist) statePlaylist.trackIds = nextIds;
    if (isLikedPlaylist) {
      notifyMusicPlayer(localLibrarySyncDetail());
      renderPlaylistDetail(LIKED_PLAYLIST_ID);
      return;
    }
    renderCoverNode(cover, playlistDisplayCover(model.playlist, model.tracks[0]));
    syncPlaylistCardCover(model.playlist, model.tracks);
    const desktopMusic = getDesktopMusic();
    if (desktopMusic?.reorderPlaylist) {
      try {
        musicState = applySavedPlaylistOrders(await desktopMusic.reorderPlaylist(model.playlist.id, nextIds));
      } catch (error) {
        console.error('reorderPlaylist failed', error);
      }
    } else if (desktopMusic?.reorder) {
      try {
        musicState = applySavedPlaylistOrders(await desktopMusic.reorder(nextIds));
      } catch (error) {
        console.error('reorder fallback failed', error);
      }
    }
    notifyMusicPlayer(localLibrarySyncDetail());
  };
  const renderRows = query => {
    tbody.replaceChildren();
    const normalized = (query || '').trim().toLowerCase();
    if (detailMode === 'hidden') {
      const hiddenTracks = model.playlist.hiddenTracks || [];
      const filteredHidden = hiddenTracks.filter(track => !normalized || `${track.title || ''} ${track.artist || ''} ${track.fileName || ''}`.toLowerCase().includes(normalized));
      resultsLabel.textContent = `${filteredHidden.length} result${filteredHidden.length === 1 ? '' : 's'}`;
      filteredHidden.forEach((track, index) => {
        const row = document.createElement('tr');
        row.dataset.hiddenPath = track.path;
        row.innerHTML = `
          <td class="track-play-cell"><button class="track-select-button" type="button" aria-label="Select hidden song" aria-pressed="${selectedHiddenPaths.has(track.path)}"><span class="checkmark">check</span></button></td>
          <td><div class="track-title-cell"><span class="track-cover"></span><span class="track-main"><span class="track-name"></span><span class="track-artist"></span></span></div></td>
          <td class="track-album"></td>
          <td class="track-like"></td>
          <td class="track-duration">${track.available ? '' : 'Missing'}</td>
          <td class="track-actions"></td>
        `;
        const trackCover = row.querySelector('.track-cover');
        if (track.coverUrl) {
          const img = document.createElement('img');
          img.alt = '';
          img.src = track.coverUrl;
          trackCover.append(img);
        } else {
          trackCover.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">music_note</span>';
        }
        row.querySelector('.track-name').textContent = cleanMusicText(track.title) || cleanMusicText(track.fileName) || `Hidden ${index + 1}`;
        row.querySelector('.track-artist').textContent = track.available ? (cleanMusicText(track.artist) || 'Local music') : 'File unavailable';
        row.querySelector('.track-album').textContent = cleanMusicText(track.album) || track.path;
        const selectButton = row.querySelector('.track-select-button');
        selectButton.addEventListener('click', () => {
          const next = selectButton.getAttribute('aria-pressed') !== 'true';
          selectButton.setAttribute('aria-pressed', String(next));
          next ? selectedHiddenPaths.add(track.path) : selectedHiddenPaths.delete(track.path);
          updateSelectionBar();
        });
        tbody.append(row);
      });
      updateSelectionBar();
      return;
    }
    const filtered = model.tracks
      .filter(track => !normalized || `${track.title || ''} ${track.artist || ''} ${track.album || ''}`.toLowerCase().includes(normalized))
    resultsLabel.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
    filtered.forEach((track, index) => {
        const row = document.createElement('tr');
        row.dataset.trackId = track.id;
        const unavailable = track.available === false;
        row.classList.toggle('is-unavailable', unavailable);
        row.draggable = detailMode === 'songs' && !unavailable;
        row.innerHTML = `
          <td class="track-play-cell">${detailMode === 'select' ? `<button class="track-select-button" type="button" aria-label="Select song" aria-pressed="${selectedTrackIds.has(track.id)}"><span class="checkmark">check</span></button>` : `<span class="track-number">${String(index + 1).padStart(2, '0')}</span><button class="track-play-button send" type="button" aria-label="${unavailable ? 'File unavailable' : 'Play track'}" data-state="play" ${unavailable ? 'disabled' : ''}><svg class="track-play-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8.75 6.45c0-1.18 1.29-1.9 2.29-1.28l8.22 5.14c.94.59.94 1.96 0 2.55L11.04 18c-1 .62-2.29-.1-2.29-1.28V6.45Z" fill="currentColor"/></svg><svg class="track-pause-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7.4 5.2h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2H7.4c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Zm6 0h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2h-3.2c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Z" fill="currentColor"/></svg></button>`}</td>
          <td><div class="track-title-cell"><span class="track-cover"></span><span class="track-main"><span class="track-name"></span><span class="track-artist"></span></span></div></td>
          <td class="track-album"></td>
          <td class="track-like"><button class="track-like-button" type="button" aria-label="${likedAriaLabel(track.liked === true)}" aria-pressed="${track.liked === true}"><span class="material-symbols-outlined">favorite</span></button></td>
          <td class="track-duration"></td>
          <td class="track-actions"><span class="track-row-menu-wrap"><button class="track-row-menu-trigger" type="button" aria-label="More actions" aria-expanded="false"><span class="material-symbols-outlined">more_horiz</span></button><span class="track-row-menu" hidden>${unavailable ? '' : `<button type="button" data-action="play-next"><span class="material-symbols-outlined">queue_play_next</span><span>Play Next</span></button>`}${isLikedPlaylist ? '' : `<button type="button" data-action="like"><span class="material-symbols-outlined">favorite</span><span>${track.liked ? 'Remove from Liked' : 'Like'}</span></button>`}<button class="danger" type="button" data-action="remove"><span class="material-symbols-outlined">${isLikedPlaylist ? 'heart_minus' : 'visibility_off'}</span><span>${isLikedPlaylist ? 'Remove from Liked' : 'Remove from Playlist'}</span></button></span></span></td>
        `;
        const selectButton = row.querySelector('.track-select-button');
        if (selectButton) {
          selectButton.addEventListener('click', () => {
            const next = selectButton.getAttribute('aria-pressed') !== 'true';
            selectButton.setAttribute('aria-pressed', String(next));
            next ? selectedTrackIds.add(track.id) : selectedTrackIds.delete(track.id);
            updateSelectionBar();
          });
        }
        row.querySelector('.track-like-button')?.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          toggleTrackLike(track, event.currentTarget);
        });
        const rowMenuTrigger = row.querySelector('.track-row-menu-trigger');
        const rowMenu = row.querySelector('.track-row-menu');
        rowMenuTrigger?.addEventListener('click', event => {
          event.preventDefault();
          event.stopPropagation();
          const next = rowMenu.hidden;
          document.querySelectorAll('.track-row-menu:not([hidden])').forEach(menu => {
            menu.hidden = true;
            menu.parentElement?.querySelector('.track-row-menu-trigger')?.setAttribute('aria-expanded', 'false');
          });
          rowMenu.hidden = !next;
          rowMenuTrigger.setAttribute('aria-expanded', String(next));
        });
        rowMenu?.addEventListener('click', event => {
          const action = event.target.closest('[data-action]')?.dataset.action;
          if (!action) return;
          event.preventDefault();
          event.stopPropagation();
          rowMenu.hidden = true;
          rowMenuTrigger.setAttribute('aria-expanded', 'false');
          if (action === 'play-next') addTrackToPlayNext(track);
          if (action === 'like') toggleTrackLike(track, row.querySelector('.track-like-button'));
          if (action === 'remove') {
            if (isLikedPlaylist) toggleTrackLike(track, row.querySelector('.track-like-button'));
            else removeSingleTrack(track.id);
          }
        });
        const trackCover = row.querySelector('.track-cover');
        if (track.coverUrl) {
          const img = document.createElement('img');
          img.alt = '';
          img.src = track.coverUrl;
          trackCover.append(img);
        } else {
          trackCover.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">music_note</span>';
        }
        row.querySelector('.track-name').textContent = cleanMusicText(track.title) || cleanMusicText(track.fileName) || 'Untitled';
        row.querySelector('.track-artist').textContent = unavailable ? 'File unavailable' : (cleanMusicText(track.artist) || 'Local music');
        row.querySelector('.track-album').textContent = cleanMusicText(track.album) || title;
        const durationCell = row.querySelector('.track-duration');
        durationCell.textContent = unavailable ? 'Missing' : formatTrackDuration(track.duration);
        if (!unavailable) hydrateTrackDuration(track, durationCell);
        tbody.append(row);
      });
    updateTrackPlaybackRows();
  };
  playlistDetailContent.append(hero, tabs, selectionBar, table);
  syncVisiblePlaylistPlayback = updateTrackPlaybackRows;
  manageTrigger.addEventListener('click', event => {
    event.preventDefault();
    event.stopPropagation();
    manageMenu.hidden = !manageMenu.hidden;
    manageTrigger.setAttribute('aria-expanded', String(!manageMenu.hidden));
  });
  playlistDetailContent.onclick = event => {
    if (!event.target.closest('.playlist-manage')) closeManageMenu();
    if (!event.target.closest('.track-row-menu-wrap')) {
      playlistDetailContent.querySelectorAll('.track-row-menu:not([hidden])').forEach(menu => {
        menu.hidden = true;
        menu.parentElement?.querySelector('.track-row-menu-trigger')?.setAttribute('aria-expanded', 'false');
      });
    }
  };
  manageMenu.addEventListener('click', async event => {
    const item = event.target.closest('[data-action]');
    if (!item) return;
    event.preventDefault();
    event.stopPropagation();
    closeManageMenu();
    const action = item.dataset.action;
    if (action === 'refresh') await refreshCurrentPlaylist();
    if (action === 'cover') changePlaylistCover();
    if (action === 'select') setDetailMode('select');
    if (action === 'hidden' && !isLikedPlaylist) setDetailMode('hidden');
    if (action === 'delete' && !isLikedPlaylist) await deletePlaylist(model.playlist, item);
  });
  selectionBar.addEventListener('click', async event => {
    const action = event.target.closest('[data-action]')?.dataset.action;
    if (!action) return;
    if (action === 'cancel') setDetailMode('songs');
    if (action === 'queue' && detailMode === 'select') await addSelectedTracksToQueue();
    if (action === 'apply' && detailMode === 'select') await removeSelectedTracks();
    if (action === 'apply' && detailMode === 'hidden') await restoreSelectedTracks();
  });
  tbody.addEventListener('click', event => {
    const button = event.target.closest('.track-play-button');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    const row = button.closest('tr[data-track-id]');
    if (row?.dataset.trackId) playPlaylistTrack(row.dataset.trackId);
  });
  tbody.addEventListener('dragstart', event => {
    if (detailMode !== 'songs') {
      event.preventDefault();
      return;
    }
    const row = event.target.closest('tr[data-track-id]');
    if (!row || event.target.closest('button, input, a')) {
      event.preventDefault();
      return;
    }
    draggedTrackId = row.dataset.trackId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedTrackId);
    dragCard?.remove();
    dragCard = makeDragCard(model.tracks.find(track => track.id === draggedTrackId));
    event.dataTransfer.setDragImage(dragCard, 24, 23);
  });
  tbody.addEventListener('dragover', event => {
    const row = event.target.closest('tr[data-track-id]');
    if (!row || !draggedTrackId || row.dataset.trackId === draggedTrackId) return;
    event.preventDefault();
    const dragged = tbody.querySelector(`tr[data-track-id="${CSS.escape(draggedTrackId)}"]`);
    if (!dragged) return;
    const rect = row.getBoundingClientRect();
    const after = event.clientY > rect.top + rect.height / 2;
    clearDropHints();
    row.classList.add(after ? 'drop-after' : 'drop-before');
    tbody.insertBefore(dragged, after ? row.nextSibling : row);
  });
  tbody.addEventListener('dragleave', event => {
    event.target.closest('tr[data-track-id]')?.classList.remove('drop-before', 'drop-after');
  });
  tbody.addEventListener('dragend', async () => {
    tbody.querySelectorAll('.is-dragging,.drop-before,.drop-after').forEach(row => row.classList.remove('is-dragging', 'drop-before', 'drop-after'));
    dragCard?.remove();
    dragCard = null;
    const hadDrag = Boolean(draggedTrackId);
    draggedTrackId = null;
    if (hadDrag) await persistPlaylistOrder();
  });
  renderRows('');
  playlistDetailContent.querySelector('#playlistDetailSearch')?.addEventListener('input', event => renderRows(event.target.value));
};

const getHistoryTracks = () => {
  const localCounts = readLocalPlayCounts();
  return (Array.isArray(musicState.tracks) ? musicState.tracks : [])
  .map(track => {
    const local = localCounts[track.id] || {};
    const playCount = Math.max(Number(track.playCount) || 0, Number(local.count) || 0);
    const lastPlayedAt = String(track.lastPlayedAt || local.lastPlayedAt || '');
    return { ...track, playCount, lastPlayedAt };
  })
  .filter(track => (Number(track.playCount) || 0) > 0)
  .sort((a, b) => (Number(b.playCount) || 0) - (Number(a.playCount) || 0) || String(b.lastPlayedAt || '').localeCompare(String(a.lastPlayedAt || '')));
};

const updateHistoryPlaybackRows = () => {
  historyList?.querySelectorAll('.history-row[data-track-id]').forEach(row => {
    const isActive = row.dataset.trackId === playbackState.currentTrackId && playbackState.playing;
    row.classList.toggle('is-playing', isActive);
    const button = row.querySelector('.track-play-button');
    if (button) {
      button.dataset.state = isActive ? 'pause' : 'play';
      button.setAttribute('aria-label', isActive ? 'Pause track' : 'Play track');
    }
  });
};
const getVisibleHistoryTrackIds = tracks => {
  const sourceIds = tracks.map(track => track.id);
  const visibleIds = [...(historyList?.querySelectorAll('.history-row[data-track-id]') || [])]
    .filter(row => !row.hidden)
    .map(row => row.dataset.trackId)
    .filter(id => sourceIds.includes(id));
  return visibleIds.length ? visibleIds : sourceIds;
};

const playHistoryTrack = async trackId => {
  const tracks = getHistoryTracks();
  const target = tracks.find(track => track.id === trackId);
  const desktopMusic = getDesktopMusic();
  if (!target) return;
  if (playbackState.currentTrackId === target.id && playbackState.playing) {
    playbackState = { currentTrackId: target.id, playing: false };
    if (desktopMusic?.updatePlayback) {
      try { musicState = await desktopMusic.updatePlayback({ currentTrackId: target.id, playing: false }); } catch (error) { console.error('updatePlayback failed', error); }
    }
    notifyMusicPlayer({ currentTrackId: target.id, playing: false });
    syncPlaybackRows(playbackState);
    return;
  }
  const queueTrackIds = getVisibleHistoryTrackIds(tracks);
  musicState = { ...musicState, queueTrackIds, currentTrackId: target.id, playing: true, mode: 'sequence' };
  if (desktopMusic?.updatePlayback) {
    try {
      musicState = applySavedPlaylistOrders(await desktopMusic.updatePlayback({ queueTrackIds, currentTrackId: target.id, playing: true, mode: 'sequence' }));
    } catch (error) {
      console.error('updatePlayback failed', error);
    }
  }
  playbackState = { currentTrackId: target.id, playing: true };
  syncPlaybackRows(playbackState);
  notifyMusicPlayer(localPlaybackDetail({ queueTrackIds, currentTrackId: target.id, playing: true, mode: 'sequence' }));
};

const addHistoryTrackToPlayNext = async track => {
  const desktopMusic = getDesktopMusic();
  if (!track?.id || !desktopMusic?.updatePlayback) return;
  const queue = (musicState.queueTrackIds || []).filter(id => id !== track.id);
  const currentTrackId = musicState.currentTrackId || track.id;
  const currentIndex = queue.indexOf(currentTrackId);
  queue.splice(currentIndex >= 0 ? currentIndex + 1 : 0, 0, track.id);
  try {
    musicState = applySavedPlaylistOrders(await desktopMusic.updatePlayback({
      queueTrackIds: queue,
      currentTrackId,
      playing: musicState.playing === true && Boolean(currentTrackId)
    }));
    notifyMusicPlayer(localPlaybackDetail({ queueTrackIds: musicState.queueTrackIds || [], currentTrackId: musicState.currentTrackId || null, playing: musicState.playing === true }));
    toast.success('Added to play next', cleanMusicText(track.title) || cleanMusicText(track.fileName) || 'Untitled');
  } catch (error) {
    console.error('addHistoryTrackToPlayNext failed', error);
    toast.error('Play next failed', 'Please try again.');
  }
};

const clearHistoryTrackRecord = async track => {
  if (!track?.id) return;
  clearLocalPlayCount(track.id);
  const desktopMusic = getDesktopMusic();
  if (desktopMusic?.updateTrack) {
    try { musicState = applySavedPlaylistOrders(await desktopMusic.updateTrack({ id: track.id, playCount: 0 })); } catch (error) { console.error('clear play count failed', error); }
  }
  musicState = { ...musicState, tracks: (musicState.tracks || []).map(item => item.id === track.id ? { ...item, playCount: 0, lastPlayedAt: null } : item) };
  renderHistory();
  toast.success('Play record cleared');
};

const renderHistory = () => {
  if (!historyList || !historyStatus) return;
  historyList.replaceChildren();
  const tracks = getHistoryTracks();
  if (!tracks.length) {
    historyList.innerHTML = '<div class="local-playlist-empty">No local listening history yet.</div>';
    historyStatus.textContent = '0 songs';
    syncHistoryPlayback = () => {};
    return;
  }
  const tabs = document.createElement('div');
  tabs.className = 'playlist-detail-tabs';
  tabs.innerHTML = `
    <div class="playlist-detail-tab">Songs <sup>${tracks.length}</sup></div>
    <label class="playlist-input-group">
      <span class="playlist-input-addon"><span class="material-symbols-outlined">search</span></span>
      <input id="historySearch" type="search" placeholder="Search">
      <span class="playlist-input-results" id="historySearchResults">${tracks.length} results</span>
    </label>
  `;
  const table = document.createElement('table');
  table.className = 'playlist-detail-table';
  table.innerHTML = '<thead><tr><th class="track-index">#</th><th>Title</th><th>Album</th><th class="track-like">Like</th><th class="track-duration">Time</th><th class="track-actions"></th></tr></thead><tbody></tbody>';
  const tbody = table.querySelector('tbody');
  const resultsLabel = tabs.querySelector('#historySearchResults');
  const renderRows = query => {
    tbody.replaceChildren();
    const normalized = (query || '').trim().toLowerCase();
    const filtered = tracks.filter(track => !normalized || `${track.title || ''} ${track.artist || ''} ${track.album || ''}`.toLowerCase().includes(normalized));
    resultsLabel.textContent = `${filtered.length} result${filtered.length === 1 ? '' : 's'}`;
    filtered.forEach((track, index) => {
    const row = document.createElement('tr');
    row.className = 'history-row';
    row.dataset.trackId = track.id;
    row.innerHTML = `
      <td class="track-play-cell"><span class="track-number">${String(index + 1).padStart(2, '0')}</span><button class="track-play-button send" type="button" aria-label="Play track" data-state="play"><svg class="track-play-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M8.75 6.45c0-1.18 1.29-1.9 2.29-1.28l8.22 5.14c.94.59.94 1.96 0 2.55L11.04 18c-1 .62-2.29-.1-2.29-1.28V6.45Z" fill="currentColor"/></svg><svg class="track-pause-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M7.4 5.2h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2H7.4c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Zm6 0h3.2c.66 0 1.2.54 1.2 1.2v11.2c0 .66-.54 1.2-1.2 1.2h-3.2c-.66 0-1.2-.54-1.2-1.2V6.4c0-.66.54-1.2 1.2-1.2Z" fill="currentColor"/></svg></button></td>
      <td><div class="track-title-cell"><span class="track-cover"></span><span class="track-main"><span class="track-name"></span><span class="track-artist"></span></span></div></td>
      <td class="track-album"></td>
      <td class="track-like"><button class="track-like-button" type="button" aria-label="${likedAriaLabel(track.liked === true)}" aria-pressed="${track.liked === true}"><span class="material-symbols-outlined">favorite</span></button></td>
      <td class="track-duration"></td>
      <td class="track-actions history-actions"><span class="history-play-count"><span class="material-symbols-outlined">play_arrow</span>${Number(track.playCount) || 0}</span><span class="track-row-menu-wrap"><button class="track-row-menu-trigger" type="button" aria-label="More actions" aria-expanded="false"><span class="material-symbols-outlined">more_horiz</span></button><span class="track-row-menu" hidden><button type="button" data-action="play-next"><span class="material-symbols-outlined">queue_play_next</span><span>Play Next</span></button><button class="danger" type="button" data-action="clear-record"><span class="material-symbols-outlined">delete_sweep</span><span>Clear Play Record</span></button></span></span></td>
    `;
    const cover = row.querySelector('.track-cover');
    if (track.coverUrl) {
      const img = document.createElement('img');
      img.alt = '';
      img.src = track.coverUrl;
      cover.append(img);
    } else {
      cover.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px">music_note</span>';
    }
    row.querySelector('.track-name').textContent = cleanMusicText(track.title) || cleanMusicText(track.fileName) || 'Untitled';
    row.querySelector('.track-artist').textContent = cleanMusicText(track.artist) || 'Local music';
    row.querySelector('.track-album').textContent = cleanMusicText(track.album) || '';
    row.querySelector('.track-duration').textContent = formatTrackDuration(track.duration);
    row.querySelector('.track-play-button')?.addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); playHistoryTrack(track.id); });
    row.querySelector('.track-like-button')?.addEventListener('click', async event => {
      event.preventDefault();
      event.stopPropagation();
      const button = event.currentTarget;
      const liked = !(track.liked === true);
      track.liked = liked;
      button.setAttribute('aria-pressed', String(liked));
      button.setAttribute('aria-label', likedAriaLabel(liked));
      const desktopMusic = getDesktopMusic();
      if (desktopMusic?.updateTrack) {
        button.disabled = true;
        try {
          musicState = applySavedPlaylistOrders(await desktopMusic.updateTrack({ id: track.id, liked }));
          toast[liked ? 'success' : 'message'](liked ? 'Added to liked songs' : 'Removed from liked songs');
        } catch (error) {
          console.error('toggle history like failed', error);
          track.liked = !liked;
          button.setAttribute('aria-pressed', String(track.liked === true));
          button.setAttribute('aria-label', likedAriaLabel(track.liked === true));
          toast.error('Like failed', 'Please try again.');
        } finally {
          button.disabled = false;
        }
      }
    });
    const rowMenuTrigger = row.querySelector('.track-row-menu-trigger');
    const rowMenu = row.querySelector('.track-row-menu');
    rowMenuTrigger?.addEventListener('click', event => {
      event.preventDefault();
      event.stopPropagation();
      const next = rowMenu.hidden;
      historyList.querySelectorAll('.track-row-menu:not([hidden])').forEach(menu => {
        menu.hidden = true;
        menu.parentElement?.querySelector('.track-row-menu-trigger')?.setAttribute('aria-expanded', 'false');
      });
      rowMenu.hidden = !next;
      rowMenuTrigger.setAttribute('aria-expanded', String(next));
    });
    rowMenu?.addEventListener('click', async event => {
      const action = event.target.closest('[data-action]')?.dataset.action;
      if (!action) return;
      event.preventDefault();
      event.stopPropagation();
      rowMenu.hidden = true;
      rowMenuTrigger.setAttribute('aria-expanded', 'false');
      if (action === 'play-next') await addHistoryTrackToPlayNext(track);
      if (action === 'clear-record') await clearHistoryTrackRecord(track);
    });
    tbody.append(row);
    });
    updateHistoryPlaybackRows();
  };
  historyList.append(tabs, table);
  renderRows('');
  tabs.querySelector('#historySearch')?.addEventListener('input', event => renderRows(event.target.value));
  const total = tracks.reduce((sum, track) => sum + (Number(track.playCount) || 0), 0);
  historyStatus.textContent = `${tracks.length} song${tracks.length === 1 ? '' : 's'} \u00b7 ${total} play${total === 1 ? '' : 's'}`;
  syncHistoryPlayback = updateHistoryPlaybackRows;
  updateHistoryPlaybackRows();
};

const renderLocalPlaylist = () => {
  localPlaylistList.replaceChildren();
  const tracks = Array.isArray(musicState.tracks) ? musicState.tracks : [];
  const playlists = Array.isArray(musicState.playlists) ? musicState.playlists : [];
  if (!playlists.length) {
    const empty = document.createElement('div');
    empty.className = 'local-playlist-empty';
    empty.textContent = 'No local playlist folder imported yet.';
    localPlaylistList.append(empty);
    localPlaylistStatus.textContent = '0 playlists';
    return;
  }

  const byId = new Map(tracks.map(track => [track.id, track]));
  playlists.forEach(playlist => {
    const playlistTracks = orderPlaylistTrackIds(playlist).map(id => byId.get(id)).filter(Boolean);
    const firstTrack = playlistTracks[0];
    const card = document.createElement('div');
    card.className = 'playlist-tilted-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', `Open ${playlist.name || 'Local Playlist'}`);
    const openPlaylistDetail = () => {
      detailReturnView = 'playlist';
      renderPlaylistDetail(playlist.id);
      showMusicView('playlist-detail');
    };
    card.addEventListener('click', event => {
      event.stopPropagation();
      openPlaylistDetail();
    });
    card.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      openPlaylistDetail();
    });
    card.innerHTML = `
      <span class="playlist-tilted-inner">
        <span class="playlist-card-cover"></span>
        <span class="playlist-card-overlay"></span>
        <span class="playlist-card-badge"><span class="material-symbols-outlined" style="font-size:16px;width:16px">queue_music</span>${playlistTracks.length}</span>
        <span class="playlist-card-info">
          <span class="playlist-card-title"></span>
          <span class="playlist-card-meta"></span>
        </span>
      </span>
    `;
    const cover = card.querySelector('.playlist-card-cover');
    const coverUrl = playlistDisplayCover(playlist, firstTrack);
    renderCoverNode(cover, coverUrl, 'playlist-card');
    const title = playlist.name || 'Local Playlist';
    card.querySelector('.playlist-card-title').textContent = title;
    card.querySelector('.playlist-card-meta').textContent = `${playlistTracks.length} track${playlistTracks.length === 1 ? '' : 's'} ${firstTrack ? `\u00b7 ${cleanMusicText(firstTrack.title) || cleanMusicText(firstTrack.fileName) || 'Untitled'}` : ''}`;
    card.dataset.playlistId = playlist.id;
    attachTiltedCard(card);
    localPlaylistList.append(card);
  });
  localPlaylistStatus.textContent = `${playlists.length} playlist${playlists.length === 1 ? '' : 's'} \u00b7 ${tracks.length} track${tracks.length === 1 ? '' : 's'}`;
  // Delegated click bypasses 3D transform interference
  localPlaylistList.onclick = event => {
    const card = event.target.closest('.playlist-tilted-card');
    if (!card || !card.dataset.playlistId) return;
    detailReturnView = 'playlist';
    renderPlaylistDetail(card.dataset.playlistId);
    showMusicView('playlist-detail');
  };
};

const refreshMusicState = async ({ forceRender = true } = {}) => {
  if (musicSyncing) return;
  musicSyncing = true;
  const desktopMusic = getDesktopMusic();
  try {
    if (!desktopMusic) {
      if (forceRender) renderLocalPlaylist();
      return;
    }
    let nextState;
    nextState = await desktopMusic.getState();
    const nextSignature = getMusicStateSignature(nextState);
    const changed = nextSignature !== musicStateSignature;
    musicState = applySavedPlaylistOrders(nextState);
    playbackState = { currentTrackId: musicState.currentTrackId || null, playing: musicState.playing === true };
    musicStateSignature = nextSignature;
    if (!musicSourceOrderHydrated) {
      applyMusicSourceOrder();
      showInitialMusicSource();
      musicSourceOrderHydrated = true;
    }
    if (forceRender || changed) {
      if (currentPlaylistId && !document.querySelector('[data-music-view="playlist-detail"]')?.hidden) {
        renderPlaylistDetail(currentPlaylistId);
      } else if (!document.querySelector('[data-music-view="history"]')?.hidden) {
        renderHistory();
      } else {
        renderLocalPlaylist();
      }
    }
  } catch (error) {
    console.error('refreshMusicState failed', error);
    if (forceRender) {
      renderLocalPlaylist();
      localPlaylistStatus.textContent = 'Unable to load local playlists. Retrying...';
      toast.error('Unable to load playlists', 'Retrying...');
      setTimeout(() => refreshMusicState({ forceRender: true }), 600);
    }
  } finally {
    musicSyncing = false;
  }
};

const rejectedImportReasonLabels = {
  unsupported_format: 'unsupported format',
  empty_file: 'empty file',
  unreadable_file: 'unreadable file'
};
const summarizeRejectedImports = rejected => {
  const counts = new Map();
  (rejected || []).forEach(item => {
    const label = rejectedImportReasonLabels[item?.reason] || 'skipped';
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts].map(([label, count]) => `${count} ${label}`).join(', ');
};

importLocalPlaylist.addEventListener('click', async () => {
  const desktopMusic = getDesktopMusic();
  if (!desktopMusic) {
    localPlaylistStatus.textContent = 'Desktop music import is unavailable in this view.';
    toast.error('Import unavailable', 'Desktop music API is not available here.');
    return;
  }
  localPlaylistStatus.textContent = 'Opening folder picker...';
  toast.message('Opening folder picker');
  const result = await desktopMusic.chooseFolder();
  musicState = applySavedPlaylistOrders(result.state || result);
  musicStateSignature = getMusicStateSignature(musicState);
  renderLocalPlaylist();
  if (result.rejected?.length) {
    const rejectedSummary = summarizeRejectedImports(result.rejected);
    localPlaylistStatus.textContent = `${result.imported?.length || 0} imported, ${result.rejected.length} skipped: ${rejectedSummary}`;
    toast.message('Playlist imported', `${result.imported?.length || 0} imported, ${rejectedSummary}`);
  } else {
    toast.success('Playlist imported');
  }
});

playlistDetailBack.addEventListener('click', () => {
  showMusicView(detailReturnView || 'playlist');
});

trigger.addEventListener('click', () => {
  const next = group.dataset.state === 'expanded' ? 'collapsed' : 'expanded';
  group.dataset.state = next;
  persistMusicRuntime({ sidebarState: next });
});

document.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'b') {
    e.preventDefault();
    trigger.click();
  }
});

const saved = musicRuntime().sidebarState;
if (saved) group.dataset.state = saved;
initMusicSourceSort();

// Submenu toggle
document.querySelectorAll('.music-submenu-trigger').forEach(trigger => {
  trigger.addEventListener('click', () => {
    const submenu = trigger.closest('.music-submenu');
    const next = submenu.dataset.state === 'open' ? 'closed' : 'open';
    submenu.dataset.state = next;
    trigger.setAttribute('aria-expanded', String(next === 'open'));
  });
});

// Sub-item selection
document.querySelectorAll('.music-sub-item').forEach(button => {
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    if (button.classList.contains('netease-sub-item')) return;
    document.querySelectorAll('.music-sub-item').forEach(item =>
      item.setAttribute('aria-checked', 'false')
    );
    button.setAttribute('aria-checked', 'true');
    document.querySelectorAll('[data-source]').forEach(item =>
      item.setAttribute('aria-checked', String(item.dataset.source === 'local'))
    );
    const view = button.dataset.view || 'playlist';
    if (view === 'liked') {
      detailReturnView = 'playlist';
      renderPlaylistDetail(LIKED_PLAYLIST_ID);
      showMusicView('playlist-detail');
      return;
    }
    if (view === 'history') renderHistory();
    showMusicView(view);
  });
});

// Source toggle (NetEase Cloud)
document.querySelectorAll('[data-source]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-source]').forEach(item =>
      item.setAttribute('aria-checked', String(item === button))
    );
    if (button.dataset.source === 'netease') {
      const submenu = button.closest('.music-submenu');
      if (submenu?.dataset.state !== 'open') {
        button.setAttribute('aria-expanded', 'false');
        return;
      }
      document.querySelectorAll('.music-sub-item').forEach(item => item.setAttribute('aria-checked', 'false'));
      button.setAttribute('aria-expanded', 'true');
      showNeteaseSection(neteaseActiveView || 'search');
      if (!neteaseInitialized) initializeNeteaseView();
    } else {
      showMusicView('playlist');
      document.querySelector('[data-view="playlist"]')?.setAttribute('aria-checked', 'true');
    }
  });
});

document.querySelectorAll('.netease-sub-item').forEach(button => {
  button.addEventListener('click', event => {
    event.stopPropagation();
    document.querySelectorAll('[data-source]').forEach(item => item.setAttribute('aria-checked', String(item.dataset.source === 'netease')));
    document.querySelectorAll('.music-sub-item').forEach(item => item.setAttribute('aria-checked', 'false'));
    button.setAttribute('aria-checked', 'true');
    showNeteaseSection(button.dataset.neteaseView || 'search');
    if (!neteaseInitialized) initializeNeteaseView();
  });
});

const startNeteaseLoginFlow = async ({ force = false } = {}) => {
  const api = getDesktopNetease();
  if (!api?.startLogin) return;
  if (neteaseLoginInFlight || (neteaseLoginKey && !force)) return;
  const now = Date.now();
  if (now < neteaseLoginCooldownUntil) {
    const seconds = Math.ceil((neteaseLoginCooldownUntil - now) / 1000);
    const message = `\u64cd\u4f5c\u9891\u7e41\uff0c\u8bf7 ${seconds}s \u540e\u518d\u8bd5`;
    if (neteaseQrEmpty) {
      neteaseQrEmpty.hidden = false;
      neteaseQrEmpty.textContent = message;
    }
    if (neteaseQrStatus) neteaseQrStatus.textContent = message;
    return;
  }
  neteaseLoginInFlight = true;
  if (force) {
    clearInterval(neteaseLoginTimer);
    neteaseLoginTimer = null;
    neteaseLoginKey = "";
  }
  setNeteaseLoginMode('qr');
  const requestId = ++neteaseLoginRequestId;
  setNeteaseBusy(true);
  setNeteaseStatus('Creating login QR code...');
  if (neteaseQrImage) {
    neteaseQrImage.hidden = true;
    neteaseQrImage.removeAttribute('src');
  }
  if (neteaseQrEmpty) {
    neteaseQrEmpty.hidden = false;
    neteaseQrEmpty.textContent = '\u6b63\u5728\u751f\u6210\u4e8c\u7ef4\u7801...';
  }
  if (neteaseQrStatus) neteaseQrStatus.textContent = '\u6b63\u5728\u751f\u6210\u4e8c\u7ef4\u7801...';
  try {
    const result = await api.startLogin();
    if (requestId !== neteaseLoginRequestId) return;
    if (!result?.ok || !result.qrImg) {
      if (result?.code === 406 || result?.retryAfter) {
        neteaseLoginCooldownUntil = Date.now() + (Number(result.retryAfter) || 60000);
      }
      const message = result?.message || 'Unable to create login QR code.';
      if (neteaseQrEmpty) {
        neteaseQrEmpty.hidden = false;
        neteaseQrEmpty.textContent = message;
      }
      if (neteaseQrStatus) neteaseQrStatus.textContent = message;
      toast.error('Login QR unavailable', message);
      return;
    }
    neteaseLoginKey = result.key || "";
    neteaseLoginCooldownUntil = 0;
    if (neteaseQrImage) {
      neteaseQrImage.src = result.qrImg;
      neteaseQrImage.hidden = false;
    }
    if (neteaseQrEmpty) neteaseQrEmpty.hidden = true;
    if (neteaseQrStatus) neteaseQrStatus.textContent = '\u7b49\u5f85\u626b\u7801\u4e2d...';
    setNeteaseStatus('Waiting for QR scan...', true);
    clearInterval(neteaseLoginTimer);
    neteaseLoginTimer = setInterval(pollNeteaseLogin, 2400);
    pollNeteaseLogin();
  } catch (error) {
    if (requestId !== neteaseLoginRequestId) return;
    console.error('netease login failed', error);
    setNeteaseStatus(error?.message || 'Login failed.');
    toast.error('Login failed', error?.message || 'Please try again.');
  } finally {
    neteaseLoginInFlight = false;
    if (requestId === neteaseLoginRequestId) setNeteaseBusy(false);
  }
};

const closeNeteaseAccountMenu = () => {
  if (neteaseSidebarAccountMenu) neteaseSidebarAccountMenu.hidden = true;
  if (neteaseSidebarAccount) neteaseSidebarAccount.setAttribute('aria-expanded', 'false');
};

const resetNeteaseSessionUi = () => {
  clearInterval(neteaseLoginTimer);
  neteaseLoginTimer = null;
  neteaseLoginKey = "";
  clearInterval(neteaseCaptchaTimer);
  neteaseCaptchaTimer = null;
  neteaseCaptchaSeconds = 0;
  setNeteaseVerification(null);
  if (neteaseSendCaptchaButton) neteaseSendCaptchaButton.textContent = '\u83b7\u53d6\u9a8c\u8bc1\u7801';
  neteaseInitialized = false;
  neteaseLikedIds = new Set();
  neteaseLikedIdsLoaded = false;
  neteaseSearchHomeLoaded = false;
  neteaseLastSongs = [];
  neteaseVisibleSongs = [];
  renderNeteaseSidebarProfile(null);
  setNeteaseAuthenticated(false);
  if (neteaseQrImage) {
    neteaseQrImage.hidden = true;
    neteaseQrImage.removeAttribute('src');
  }
  if (neteaseQrEmpty) {
    neteaseQrEmpty.hidden = false;
    neteaseQrEmpty.textContent = '\u6b63\u5728\u751f\u6210\u4e8c\u7ef4\u7801...';
  }
  if (neteaseResults) neteaseResults.innerHTML = '<p class="netease-empty">Search for a song to start.</p>';
  if (neteaseAccountPanel) neteaseAccountPanel.replaceChildren();
};

neteaseLoginButton?.addEventListener('click', () => startNeteaseLoginFlow({ force: true }));

const startCaptchaCountdown = () => {
  clearInterval(neteaseCaptchaTimer);
  neteaseCaptchaSeconds = 60;
  const tick = () => {
    if (!neteaseSendCaptchaButton) return;
    neteaseSendCaptchaButton.disabled = neteaseCaptchaSeconds > 0;
    neteaseSendCaptchaButton.textContent = neteaseCaptchaSeconds > 0 ? `${neteaseCaptchaSeconds}s` : '\u83b7\u53d6\u9a8c\u8bc1\u7801';
    if (neteaseCaptchaSeconds <= 0) {
      clearInterval(neteaseCaptchaTimer);
      neteaseCaptchaTimer = null;
      return;
    }
    neteaseCaptchaSeconds -= 1;
  };
  tick();
  neteaseCaptchaTimer = setInterval(tick, 1000);
};

neteaseOtherLoginButton?.addEventListener('click', () => setNeteaseLoginMode('phone'));
neteaseQrLoginButton?.addEventListener('click', () => setNeteaseLoginMode('qr'));
neteaseVerificationButton?.addEventListener('click', async () => {
  if (!neteaseVerificationUrl) return;
  const api = getDesktopNetease();
  if (api?.openVerification) await api.openVerification(neteaseVerificationUrl);
  else window.open(neteaseVerificationUrl, '_blank', 'noopener');
});

neteaseSendCaptchaButton?.addEventListener('click', async () => {
  const api = getDesktopNetease();
  const phone = neteasePhoneInput?.value?.trim() || '';
  if (!api?.sendCaptcha || !phone) {
    toast.error('Phone required', 'Please enter your phone number.');
    return;
  }
  neteaseSendCaptchaButton.disabled = true;
  try {
    const result = await api.sendCaptcha({ phone, countrycode: '86' });
    if (!result?.ok) throw new Error(result?.message || 'Unable to send verification code.');
    toast.success('Verification code sent');
    startCaptchaCountdown();
  } catch (error) {
    neteaseSendCaptchaButton.disabled = false;
    toast.error('Send failed', error?.message || 'Please try again.');
  }
});

neteasePhoneLoginForm?.addEventListener('submit', async event => {
  event.preventDefault();
  const api = getDesktopNetease();
  const phone = neteasePhoneInput?.value?.trim() || '';
  const captcha = neteaseCaptchaInput?.value?.trim() || '';
  if (!api?.loginWithPhone || !phone || !captcha) {
    toast.error('Login failed', 'Please enter your phone number and verification code.');
    return;
  }
  setNeteaseBusy(true);
  setNeteaseVerification(null);
  try {
    const result = await api.loginWithPhone({ phone, captcha, countrycode: '86' });
    if (!result?.ok) {
      setNeteaseVerification(result);
      toast.error('Login failed', result?.message || 'Phone login failed.');
      return;
    }
    clearInterval(neteaseCaptchaTimer);
    neteaseCaptchaTimer = null;
    neteaseLoginKey = "";
    await initializeNeteaseView();
    if (neteaseActiveView === 'search') await loadNeteaseSearchHome({ force: true });
    toast.success('Logged in', result.profile?.nickname || 'Netease Music');
  } catch (error) {
    toast.error('Login failed', error?.message || 'Please check the verification code.');
  } finally {
    setNeteaseBusy(false);
  }
});

neteaseSidebarAccount?.addEventListener('click', event => {
  event.stopPropagation();
  if (neteaseSidebarAccount.disabled) return;
  const next = neteaseSidebarAccountMenu?.hidden !== false;
  if (neteaseSidebarAccountMenu) neteaseSidebarAccountMenu.hidden = !next;
  neteaseSidebarAccount.setAttribute('aria-expanded', String(next));
});

neteaseSidebarAccountMenu?.addEventListener('click', async event => {
  const button = event.target.closest('button[data-action]');
  if (!button) return;
  event.stopPropagation();
  const api = getDesktopNetease();
  closeNeteaseAccountMenu();
  if (button.dataset.action === 'logout') {
    await api?.logout?.();
    resetNeteaseSessionUi();
    setNeteaseStatus('Logged out.');
    toast.message('Logged out');
  }
});

document.addEventListener('pointerdown', event => {
  if (neteaseSidebarAccountWrap?.contains(event.target)) return;
  closeNeteaseAccountMenu();
});

neteaseRefreshButton?.addEventListener('click', refreshNeteaseCurrentView);

neteaseSearchForm?.addEventListener('submit', async event => {
  event.preventDefault();
  await searchNeteaseSongs(neteaseSearchInput?.value || '');
});
registerNeteaseUrlRefreshListener();
showInitialMusicSource();
initializeNeteaseView();
refreshMusicState().finally(() => {
  try {
    window.dispatchEvent(new CustomEvent('kairos:music-content-ready'));
    if (window.parent && window.parent !== window) window.parent.dispatchEvent(new CustomEvent('kairos:music-content-ready'));
  } catch {}
});

})();
