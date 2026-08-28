(() => {
  const ensureScript = (attribute, source, ready) => {
    if (ready()) return Promise.resolve();
    const existing = document.querySelector(`script[${attribute}]`);
    if (existing) return new Promise(resolve => existing.addEventListener('load', resolve, { once: true }));
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.setAttribute(attribute, 'true');
      script.src = source;
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.append(script);
    });
  };
  const ensureI18n = async () => {
    if (window.KairosI18n) return;
    await ensureScript('data-kairos-i18n-messages', '../../i18n/i18n-messages.js', () => Boolean(window.KairosI18nMessages));
    await ensureScript('data-kairos-i18n', '../../i18n/i18n-core.js', () => Boolean(window.KairosI18n));
  };
  const ensureThemes = () => {
    if (window.KairosThemes) return Promise.resolve();
    const existing = document.querySelector('script[data-kairos-themes]');
    if (existing) return new Promise(resolve => existing.addEventListener('load', resolve, { once: true }));
    return new Promise(resolve => {
      const script = document.createElement('script');
      script.dataset.kairosThemes = 'true';
      script.src = '../../themes/theme-core.js';
      script.addEventListener('load', resolve, { once: true });
      script.addEventListener('error', resolve, { once: true });
      document.head.append(script);
    });
  };
  window.KairosEnsureI18n = ensureI18n;
  window.KairosEnsureThemes = ensureThemes;
  const t = (key, fallback, params) => window.KairosI18n?.t?.(key, params, fallback) || fallback;
  const MOTION_CLASS = 'kairos-reduce-motion';
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  const applyMotionPreference = reduce => document.documentElement.classList.toggle(MOTION_CLASS, reduce === true);
  const numberInRange = (value, fallback, min, max) => {
    const number = Number(value);
    return Math.max(min, Math.min(max, Number.isFinite(number) ? number : fallback));
  };
  const applyCalendarBackground = settings => {
    const raw = settings?.appearance?.calendarBackground || {};
    const source = raw.source === 'custom' ? 'custom' : 'builtin';
    const id = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(String(raw.id || '')) ? String(raw.id) : 'default.jpg';
    const blur = numberInRange(raw.blur, 6, 0, 32);
    const brightness = numberInRange(raw.brightness, 95, 55, 140);
    document.documentElement.classList.add('kairos-calendar-background-enabled');
    document.documentElement.style.setProperty('--kairos-calendar-background-image', `url("kairos-background://${source}/${encodeURIComponent(id)}")`);
    document.documentElement.style.setProperty('--kairos-calendar-background-blur', `${blur}px`);
    document.documentElement.style.setProperty('--kairos-calendar-background-brightness', `${brightness}%`);
  };
  if (!document.getElementById('kairos-motion-preference-style')) document.head.insertAdjacentHTML('beforeend', '<style id="kairos-motion-preference-style">html.kairos-reduce-motion *,html.kairos-reduce-motion *::before,html.kairos-reduce-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}</style>');
  if (!embedded) applyCalendarBackground({});
  ensureThemes();
  window.addEventListener('kairos:settings-changed', event => { const settings = event.detail || {}; window.KairosThemes?.applyTheme?.(settings?.appearance?.theme); window.KairosI18n?.setLocale?.(settings?.general?.language); window.KairosI18n?.setTimeFormat?.(settings?.general?.timeFormat); applyMotionPreference(settings?.accessibility?.reduceMotion === true); if (!embedded) applyCalendarBackground(settings); });
  const page = document.body.dataset.page || 'calendar';
  const ensureCalendarControllers = () => {
    if (!['calendar', 'schedule'].includes(page)) return Promise.resolve();
    if (!document.querySelector('link[href^="../../features/calendar/schedule-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../features/calendar/schedule-feature.css?v=33">');
    if (!document.querySelector('link[href^="../../features/calendar/date-range-picker.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../features/calendar/date-range-picker.css?v=3">');
    if (window.KairosScheduleControllerReady) return window.KairosScheduleControllerReady;
    window.KairosScheduleControllerReady = new Promise(resolve => {
      const loadScheduleFeature = () => {
        if (window.openScheduleFeature || window.renderSchedules) { resolve(); return; }
        const existing = document.querySelector('script[src^="../../features/calendar/schedule-feature.js"]');
        if (existing) { existing.addEventListener('load', resolve, { once:true }); existing.addEventListener('error', resolve, { once:true }); return; }
        const script = document.createElement('script');
        script.src = '../../features/calendar/schedule-feature.js?v=54';
        script.addEventListener('load', resolve, { once:true });
        script.addEventListener('error', resolve, { once:true });
        document.body.appendChild(script);
      };
      if (window.KairosCalendarCore) { loadScheduleFeature(); return; }
      const existing = document.querySelector('script[src^="../../features/calendar/calendar-core.cjs"]');
      if (existing) { existing.addEventListener('load', loadScheduleFeature, { once:true }); existing.addEventListener('error', loadScheduleFeature, { once:true }); return; }
      const script = document.createElement('script');
      script.src = '../../features/calendar/calendar-core.cjs?v=1';
      script.addEventListener('load', loadScheduleFeature, { once:true });
      script.addEventListener('error', loadScheduleFeature, { once:true });
      document.body.appendChild(script);
    });
    return window.KairosScheduleControllerReady;
  };
  if (embedded && !window.KairosPendingState) {
    try {
      const raw = new URLSearchParams(location.search).get('scheduleState') || window.top.localStorage.getItem('kairos-mvp-state');
      if (raw) window.KairosPendingState = JSON.parse(raw);
    } catch {}
  }
  if (embedded) {
    window.KairosEmbeddedControllersReady = ensureCalendarControllers();
    window.KairosEmbeddedControllersReady.finally(() => {
      try { window.top.postMessage({ type:'kairos:embedded-ready', page }, '*'); } catch {}
    });
    window.addEventListener('message', event => {
      const message = event.data;
      if (message?.type === 'kairos:motion-preference' && event.source === window.top) applyMotionPreference(message.reduce === true);
      if (message?.type === 'kairos:state-sync' && event.source === window.top) {
        const settings = message.state?.settings || {};
        window.KairosThemes?.applyTheme?.(settings?.appearance?.theme);
        window.KairosI18n?.setLocale?.(settings?.general?.language);
        window.KairosI18n?.setTimeFormat?.(settings?.general?.timeFormat);
        applyMotionPreference(settings?.accessibility?.reduceMotion === true);
      }
      if (message?.type === 'kairos:locale-sync' && event.source === window.top) window.KairosI18n?.setLocale?.(message.preference || message.locale);
    });
    document.documentElement.classList.add('kairos-embedded-root');
    document.body.classList.add('kairos-embedded');
    const embeddedMain = document.querySelector('body > main');
    [...document.body.children].forEach(node => {
      if (node !== embeddedMain && node.matches('header, nav, aside')) node.remove();
    });
    if (document.body.dataset.page === 'calendar') {
      embeddedMain?.querySelector(':scope > header')?.remove();
      embeddedMain?.querySelector(':scope > div.flex.flex-1 > section')?.classList.add('kairos-calendar-glass');
    }
    embeddedMain?.classList.add('kairos-page-main');
    return;
  }
  if (!document.querySelector('link[href^="../../features/calendar/schedule-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../features/calendar/schedule-feature.css?v=33">');
  if (!document.querySelector('link[href^="../../features/calendar/date-range-picker.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../features/calendar/date-range-picker.css?v=3">');
  if (!document.querySelector('link[href^="../../features/reminders/reminder-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../features/reminders/reminder-feature.css?v=1">');
  if (!document.querySelector('link[href^="../../features/settings/settings-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="../../features/settings/settings-feature.css?v=1">');
  ensureCalendarControllers();
  const spaShell = page === 'calendar';
  const labels = spaShell
    ? [['calendar','#calendar','calendar_today',t('nav.calendar','Calendar'),'nav.calendar'],['habits','#habits','repeat',t('nav.habits','Habits'),'nav.habits'],['schedule','#schedule','checklist',t('nav.schedule','Schedule'),'nav.schedule'],['music','#music','queue_music',t('nav.music','Music'),'nav.music']]
    : [['calendar','../calendar/index.html','calendar_today',t('nav.calendar','Calendar'),'nav.calendar'],['habits','../habits/index.html','repeat',t('nav.habits','Habits'),'nav.habits'],['schedule','../schedule/index.html','checklist',t('nav.schedule','Schedule'),'nav.schedule'],['music','../music/index.html','queue_music',t('nav.music','Music'),'nav.music']];
  document.body.classList.add('kairos-shell-body');
  [...document.body.children].forEach(node => {
    const classes = node.classList;
    if ((node.tagName === 'ASIDE' || node.tagName === 'NAV') && classes.contains('fixed') && [...classes].some(name => name.includes('w-[280px]'))) node.remove();
  });
  const main = document.querySelector('body > main');
  if (!main) return;
  main.classList.add('kairos-page-main');
  const oldHeader = document.querySelector('body > header.kairos-topbar') || main.querySelector(':scope > header') || document.querySelector('body > header.fixed') || [...document.querySelectorAll('body > nav.fixed')].find(node => node.classList.contains('right-0'));
  const header = document.createElement('header');
  header.className = 'kairos-topbar';
  header.innerHTML = `<nav class="kairos-nav kairos-gooey-nav" aria-label="${t('nav.primary','Primary navigation')}" data-i18n-aria-label="nav.primary"><span class="kairos-gooey-effect" aria-hidden="true"></span>${labels.map(([id,href,icon,label,key])=>`<a class="${page===id?'active':''}" href="${href}"><span class="material-symbols-outlined">${icon}</span><span data-i18n="${key}">${label}</span></a>`).join('')}</nav><div class="kairos-actions"><button class="kairos-create"><span class="material-symbols-outlined">add</span><span data-i18n="common.createNew">${t('common.createNew','Create New')}</span></button><button class="kairos-icon-button kairos-reminder-button" data-i18n-aria-label="common.reminders" data-i18n-title="common.reminders" aria-label="${t('common.reminders','Reminders')}" aria-expanded="false" title="${t('common.reminders','Reminders')}"><span class="material-symbols-outlined">notifications</span><i class="kairos-reminder-badge" hidden></i></button><button class="kairos-icon-button kairos-settings-button" data-i18n-aria-label="common.settings" data-i18n-title="common.settings" aria-label="${t('common.settings','Settings')}" title="${t('common.settings','Settings')}" type="button"><span class="material-symbols-outlined">settings</span></button><div class="kairos-window-controls" aria-label="Window controls"><button class="kairos-window-minimize" type="button" aria-label="${t('electron.minimize','Minimize')}" title="${t('electron.minimize','Minimize')}"><span class="kairos-window-glyph kairos-window-glyph--minimize" aria-hidden="true"></span></button><button class="kairos-window-maximize" type="button" aria-label="${t('electron.maximize','Maximize')}" title="${t('electron.maximize','Maximize')}"><span class="kairos-window-glyph kairos-window-glyph--maximize" aria-hidden="true"></span></button><button class="kairos-window-close" type="button" aria-label="${t('common.close','Close')}" title="${t('common.close','Close')}"><span class="kairos-window-glyph kairos-window-glyph--close" aria-hidden="true"></span></button></div></div>`;
  oldHeader?.remove();
  main.before(header);
  header.querySelector('.kairos-window-minimize')?.addEventListener('click', () => window.kairosDesktop?.windowControls?.minimize?.());
  const maximizeButton = header.querySelector('.kairos-window-maximize');
  let windowMaximized = false;
  const syncWindowMaximized = maximized => {
    windowMaximized = Boolean(maximized);
    maximizeButton?.classList.toggle('is-window-maximized', windowMaximized);
    const glyph = maximizeButton?.querySelector('.kairos-window-glyph');
    glyph?.classList.toggle('kairos-window-glyph--maximize', !windowMaximized);
    glyph?.classList.toggle('kairos-window-glyph--restore', windowMaximized);
    const label = windowMaximized ? t('electron.restore','Restore') : t('electron.maximize','Maximize');
    maximizeButton?.setAttribute('aria-label', label);
    maximizeButton?.setAttribute('title', label);
  };
  maximizeButton?.addEventListener('click', () => window.kairosDesktop?.windowControls?.toggleMaximize?.());
  const stopWindowMaximizedChanges = window.kairosDesktop?.windowControls?.onMaximizedChanged?.(syncWindowMaximized);
  window.kairosDesktop?.windowControls?.isMaximized?.().then(syncWindowMaximized).catch(() => {});
  window.addEventListener('kairos:locale-changed', () => syncWindowMaximized(windowMaximized));
  window.addEventListener('beforeunload', () => stopWindowMaximizedChanges?.(), { once:true });
  header.querySelector('.kairos-window-close')?.addEventListener('click', () => window.kairosDesktop?.windowControls?.close?.());

  const gooeyNav = header.querySelector('.kairos-gooey-nav');
  const gooeyEffect = gooeyNav?.querySelector('.kairos-gooey-effect');
  const gooeyLinks = [...(gooeyNav?.querySelectorAll('a') || [])];
  const placeGooeyEffect = link => {
    if (!gooeyNav || !gooeyEffect || !link) return;
    const navRect = gooeyNav.getBoundingClientRect();
    const linkRect = link.getBoundingClientRect();
    gooeyEffect.style.setProperty('--gooey-x', `${linkRect.left - navRect.left}px`);
    gooeyEffect.style.setProperty('--gooey-y', `${linkRect.top - navRect.top}px`);
    gooeyEffect.style.setProperty('--gooey-w', `${linkRect.width}px`);
    gooeyEffect.style.setProperty('--gooey-h', `${linkRect.height}px`);
  };
  const refreshGooeyEffect = () => {
    const activeLink = gooeyNav?.querySelector('a.active');
    if (activeLink) placeGooeyEffect(activeLink);
  };
  const gooeyNoise = (amount = 1) => amount / 2 - Math.random() * amount;
  const gooeyPoint = (distance, index, total) => {
    const angle = ((360 + gooeyNoise(8)) / total) * index * (Math.PI / 180);
    return [distance * Math.cos(angle), distance * Math.sin(angle)];
  };
  const burstGooeyParticles = () => {
    if (!gooeyEffect || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    gooeyEffect.querySelectorAll('.kairos-gooey-particle').forEach(node => node.remove());
    const count = 12;
    for (let index = 0; index < count; index += 1) {
      const start = gooeyPoint(48, count - index, count);
      const end = gooeyPoint(8 + gooeyNoise(5), count - index, count);
      const particle = document.createElement('span');
      particle.className = 'kairos-gooey-particle';
      particle.style.cssText = `--start-x:${start[0]}px;--start-y:${start[1]}px;--end-x:${end[0]}px;--end-y:${end[1]}px;--particle-time:${520 + gooeyNoise(160)}ms;--particle-scale:${.75 + Math.random() * .35}`;
      particle.appendChild(document.createElement('i'));
      gooeyEffect.appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once:true });
    }
    gooeyEffect.classList.remove('is-bursting');
    void gooeyEffect.offsetWidth;
    gooeyEffect.classList.add('is-bursting');
  };
  const spaFrames = new Map();
  const spaPages = {
    habits: ['../habits/index.html?embed=1&v=41', 'Habits'],
    schedule: ['../schedule/index.html?embed=1&v=47', 'Schedule'],
    music: ['../music/index.html?embed=1&v=82', 'Music']
  };
  const titleKeyForView = view => `app.title.${view in spaPages ? view : 'calendar'}`;
  const syncDocumentTitle = view => { document.title = t(titleKeyForView(view), view === 'calendar' ? 'Kairos | Intentional Dashboard' : `Kairos | ${spaPages[view]?.[1] || 'Kairos'}`); };
  const syncScheduleState = frame => {
    if (!frame?.contentWindow) return;
    window.kairosDesktop?.appState?.get?.().then(state => frame.contentWindow?.postMessage({ type:'kairos:state-sync', state }, '*')).catch(() => {});
  };
  const syncMotionPreference = frame => frame?.contentWindow?.postMessage({ type:'kairos:motion-preference', reduce:document.documentElement.classList.contains(MOTION_CLASS) }, '*');
  const syncLocale = frame => frame?.contentWindow?.postMessage({ type:'kairos:locale-sync', preference:window.KairosI18n?.getPreference?.() || 'system' }, '*');
  const getSpaView = () => {
    const requestedHash = location.hash.slice(1);
    const requested = requestedHash === 'tasks' ? 'schedule' : requestedHash === 'stats' ? 'music' : requestedHash;
    return requested in spaPages || requested === 'calendar' ? requested : 'calendar';
  };
  const showSpaView = (view, options = {}) => {
    if (!spaShell) return;
    const nextView = view in spaPages ? view : 'calendar';
    document.body.classList.toggle('kairos-secondary-view', nextView !== 'calendar');
    document.body.classList.toggle('kairos-music-view', nextView === 'music');
    document.body.classList.toggle('kairos-calendar-background-active', nextView === 'calendar');
    const syncShellPlayer = () => {
      const shellPlayer = document.getElementById('musicPlayer');
      if (!shellPlayer) {
        window.KairosMusicPlayer?.mount?.();
        return false;
      }
      shellPlayer.hidden = !['calendar', 'music'].includes(nextView);
      if (nextView === 'music') {
        shellPlayer.style.left = '0px';
        shellPlayer.style.right = '0px';
        shellPlayer.style.top = 'auto';
        shellPlayer.style.bottom = '0px';
        shellPlayer.style.setProperty('height', '80px', 'important');
      }
      window.dispatchEvent(new CustomEvent('kairos:player-route-layout', { detail:{ view:nextView } }));
      return true;
    };
    syncShellPlayer();
    requestAnimationFrame(() => {
      syncShellPlayer();
      requestAnimationFrame(syncShellPlayer);
    });
    [80, 220].forEach(delay => setTimeout(syncShellPlayer, delay));
    if (nextView !== 'calendar' && !main.hidden) {
      const calendarPanel = main.querySelector(':scope > div.flex.flex-1 > section');
      const player = document.getElementById('musicPlayer');
      if (calendarPanel && player) {
        const rect = calendarPanel.getBoundingClientRect();
        player.style.left = `${Math.max(0, rect.left)}px`;
        player.style.right = `${Math.max(0, window.innerWidth - rect.right)}px`;
      }
    }
    main.hidden = nextView !== 'calendar';
    spaFrames.forEach((frame, id) => { frame.hidden = id !== nextView; });
    if (nextView !== 'calendar') {
      let frame = spaFrames.get(nextView);
      if (!frame) {
        frame = document.createElement('iframe');
        frame.className = 'kairos-spa-view';
        let frameUrl = spaPages[nextView][0];
        frame.src = frameUrl;
        frame.title = t(titleKeyForView(nextView), `Kairos ${spaPages[nextView][1]}`);
        frame.dataset.view = nextView;
        document.body.appendChild(frame);
        frame.addEventListener('load', () => { syncScheduleState(frame); syncMotionPreference(frame); syncLocale(frame); });
        spaFrames.set(nextView, frame);
      }
      frame.hidden = false;
      syncScheduleState(frame);
      syncMotionPreference(frame);
      syncLocale(frame);
    }
    gooeyLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${nextView}`));
    requestAnimationFrame(refreshGooeyEffect);
    if (options.history) history.pushState({ kairosView:nextView }, '', `#${nextView}`);
    syncDocumentTitle(nextView);
  };
  const ensureShellPlayer = () => {
    if (!spaShell) return;
    const view = getSpaView();
    if (!['calendar', 'music'].includes(view)) return;
    window.KairosMusicPlayer?.mount?.();
    const player = document.getElementById('musicPlayer');
    if (!player) return;
    player.hidden = false;
    player.style.display = '';
    if (view === 'music') {
      document.body.classList.add('kairos-secondary-view', 'kairos-music-view');
      player.style.left = '0px';
      player.style.right = '0px';
      player.style.top = 'auto';
      player.style.bottom = '0px';
      player.style.setProperty('height', '80px', 'important');
    }
    window.dispatchEvent(new CustomEvent('kairos:player-route-layout', { detail:{ view } }));
  };
  requestAnimationFrame(refreshGooeyEffect);
  document.fonts?.ready.then(refreshGooeyEffect);
  window.addEventListener('load', refreshGooeyEffect, { once:true });
  window.addEventListener('resize', refreshGooeyEffect);
  if ('ResizeObserver' in window && gooeyNav) {
    const gooeyResizeObserver = new ResizeObserver(refreshGooeyEffect);
    gooeyResizeObserver.observe(gooeyNav);
    gooeyLinks.forEach(link => gooeyResizeObserver.observe(link));
  }
  gooeyLinks.forEach(link => link.addEventListener('click', event => {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.classList.contains('active')) return;
    event.preventDefault();
    gooeyLinks.forEach(item => item.classList.toggle('active', item === link));
    placeGooeyEffect(link);
    burstGooeyParticles();
    if (spaShell) {
      showSpaView(link.getAttribute('href').slice(1), { history:true });
      return;
    }
    setTimeout(() => { location.href = link.href; }, 360);
  }));

  if (spaShell) {
    window.addEventListener('message', event => {
      const message = event.data;
      if (!message || message.type !== 'kairos:pet-react') return;
      const isSpaFrame = [...spaFrames.values()].some(frame => frame.contentWindow === event.source);
      if (!isSpaFrame) return;
      window.kairosDesktop?.pet?.react(message.action, { title: message.payload?.title }).catch(() => {});
    });
    window.kairosDesktop?.onShellCommand?.(command => {
      const type = command?.type;
      if (type === 'settings') {
        const source = header.querySelector('.kairos-settings-button');
        const openSettings = () => window.KairosSettingsFeature?.open?.(source);
        if (window.KairosSettingsFeature?.open) openSettings();
        else setTimeout(openSettings, 80);
        return;
      }
      if (['calendar', 'schedule', 'habits', 'music'].includes(type)) {
        showSpaView(type, { history:true });
        if (type === 'schedule' && typeof command.scheduleId === 'string' && command.scheduleId) {
          const openSchedule = () => spaFrames.get('schedule')?.contentWindow?.postMessage({ type:'kairos:open-schedule', id:command.scheduleId }, '*');
          const frame = spaFrames.get('schedule');
          frame?.addEventListener('load', openSchedule, { once:true });
          setTimeout(openSchedule, 120);
        }
      }
    });
    window.addEventListener('popstate', () => showSpaView(getSpaView()));
    window.addEventListener('kairos:music-player-ready', () => showSpaView(getSpaView()));
    window.addEventListener('kairos:music-content-ready', () => showSpaView(getSpaView()));
    window.addEventListener('kairos:settings-changed', event => {
      window.KairosThemes?.applyTheme?.(event.detail?.appearance?.theme);
      window.KairosI18n?.setLocale?.(event.detail?.general?.language);
      window.KairosI18n?.setTimeFormat?.(event.detail?.general?.timeFormat);
      applyMotionPreference(event.detail?.accessibility?.reduceMotion === true);
      applyCalendarBackground(event.detail);
      spaFrames.forEach(syncMotionPreference);
      spaFrames.forEach(syncLocale);
    });
    window.addEventListener('kairos:locale-changed', () => {
      const view = getSpaView();
      syncDocumentTitle(view);
      spaFrames.forEach(frame => { frame.title = t(titleKeyForView(frame.dataset.view), `Kairos ${spaPages[frame.dataset.view]?.[1] || 'Kairos'}`); });
    });
    window.addEventListener('kairos:music-state-changed', event => {
      const frame = spaFrames.get('music');
      if (!frame?.contentWindow) return;
      frame.contentWindow.postMessage({ type:'kairos:music-state-changed', detail:event.detail }, '*');
    });
    showSpaView(getSpaView());
    requestAnimationFrame(() => requestAnimationFrame(ensureShellPlayer));
    [120, 360, 800, 1500].forEach(delay => setTimeout(ensureShellPlayer, delay));
    setInterval(ensureShellPlayer, 2000);
  }

  const preloadTargets = spaShell ? Object.values(spaPages).map(([href]) => href) : labels.map(([,href]) => href);
  preloadTargets.forEach(href => {
    if (!spaShell && href === location.pathname.split('/').pop()) return;
    const preload = document.createElement('link');
    preload.rel = 'prefetch';
    preload.href = href;
    document.head.appendChild(preload);
  });
  if (page !== 'calendar') return;
  const content = main.querySelector(':scope > div.flex.flex-1');
  const calendar = content?.querySelector(':scope > section');
  const rightRail = content?.querySelector(':scope > section:nth-of-type(2)');
  calendar?.classList.add('kairos-calendar-glass');
  if (calendar && !document.getElementById('calendarFullscreenButton')) {
    const calendarToolbar = calendar.firstElementChild;
    const fullscreenButton = document.createElement('button');
    fullscreenButton.id = 'calendarFullscreenButton';
    fullscreenButton.type = 'button';
    fullscreenButton.className = 'calendar-fullscreen-button';
    fullscreenButton.dataset.i18nAriaLabel = 'calendar.fullscreen';
    fullscreenButton.setAttribute('aria-label',t('calendar.fullscreen','Enter calendar fullscreen'));
    fullscreenButton.setAttribute('aria-pressed','false');
    fullscreenButton.innerHTML = '<span class="material-symbols-outlined">fullscreen</span>';
    const todayButton = calendarToolbar?.querySelector('#scheduleTodayButton');
    if (calendarToolbar && todayButton) {
      const actions = document.createElement('div');
      actions.className = 'calendar-toolbar-actions';
      calendarToolbar.insertBefore(actions,todayButton);
      actions.append(todayButton,fullscreenButton);
    } else calendarToolbar?.append(fullscreenButton);
    const calendarHomeParent = calendar.parentNode;
    const calendarHomeNext = calendar.nextSibling;
    const syncFullscreenButton = () => {
      const active = calendar.classList.contains('calendar-fullscreen-fallback-active');
      fullscreenButton.setAttribute('aria-pressed',String(active));
      const labelKey = active ? 'calendar.fullscreenExit' : 'calendar.fullscreen';
      fullscreenButton.dataset.i18nAriaLabel = labelKey;
      fullscreenButton.setAttribute('aria-label',t(labelKey,active?'Exit calendar fullscreen':'Enter calendar fullscreen'));
      fullscreenButton.querySelector('.material-symbols-outlined').textContent = active?'fullscreen_exit':'fullscreen';
      calendar.classList.toggle('calendar-is-fullscreen',active);
    };
    const toggleWindowCalendar = force => {
      const active = typeof force === 'boolean' ? force : !calendar.classList.contains('calendar-fullscreen-fallback-active');
      const applyState = () => {
        if (active) document.body.append(calendar);
        else if (calendarHomeParent) calendarHomeParent.insertBefore(calendar,calendarHomeNext);
        calendar.classList.toggle('calendar-fullscreen-fallback-active',active);
        document.body.classList.toggle('calendar-fullscreen-fallback',active);
        syncFullscreenButton();
      };
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) document.startViewTransition(applyState);
      else applyState();
    };
    fullscreenButton.addEventListener('click',() => toggleWindowCalendar());
    window.addEventListener('kairos:locale-changed', syncFullscreenButton);
    document.addEventListener('keydown',event => {
      if (event.key === 'Escape' && calendar.classList.contains('calendar-fullscreen-fallback-active')) toggleWindowCalendar(false);
    });
    syncFullscreenButton();
  }
  const alignPlayer = () => {
    const player = document.getElementById('musicPlayer');
    if (!calendar || !player) return;
    const rect = calendar.getBoundingClientRect();
    const railRect = rightRail?.getBoundingClientRect();
    player.style.left = `${Math.max(0,rect.left)}px`;
    player.style.right = `${Math.max(0,window.innerWidth-rect.right)}px`;
    player.style.top = `${Math.max(0,rect.bottom)}px`;
    player.style.bottom = `${Math.max(0,window.innerHeight-(railRect?.bottom ?? window.innerHeight))}px`;
    player.style.setProperty('height','auto','important');
  };
  const settlePlayerAlignment = () => {
    requestAnimationFrame(() => requestAnimationFrame(alignPlayer));
    [0,60,180,420].forEach(delay => setTimeout(alignPlayer,delay));
  };
  settlePlayerAlignment();
  document.fonts?.ready.then(settlePlayerAlignment);
  window.addEventListener('load',alignPlayer,{once:true});
  window.addEventListener('resize',alignPlayer);
  if ('ResizeObserver' in window) {
    const playerResizeObserver = new ResizeObserver(alignPlayer);
    playerResizeObserver.observe(calendar);
    if (rightRail) playerResizeObserver.observe(rightRail);
  }
})();
if (new URLSearchParams(location.search).get('embed') !== '1') {
  const loadReminderFeature=()=>{
    if (document.querySelector('script[src^="../../features/reminders/reminder-feature.js"]')) return;
    const reminderFeatureScript=document.createElement('script');
    reminderFeatureScript.src='../../features/reminders/reminder-feature.js?v=7';
    document.body.appendChild(reminderFeatureScript);
  };
  const reminderCoreScript=document.createElement('script');
  reminderCoreScript.src='../../features/reminders/reminder-core.cjs?v=1';
  reminderCoreScript.onload=loadReminderFeature;
  reminderCoreScript.onerror=loadReminderFeature;
  document.body.appendChild(reminderCoreScript);
  const loadSettingsFeature = () => {
    if (document.querySelector('script[src^="../../features/settings/settings-feature.js"]')) return;
    const settingsFeatureScript=document.createElement('script');
    settingsFeatureScript.src='../../features/settings/settings-feature.js?v=1';
    document.body.appendChild(settingsFeatureScript);
  };
  window.KairosEnsureI18n?.().then(loadSettingsFeature, loadSettingsFeature);
}
document.documentElement.classList.remove('kairos-boot');
