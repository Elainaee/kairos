(() => {
  const MOTION_CLASS = 'kairos-reduce-motion';
  const applyMotionPreference = reduce => document.documentElement.classList.toggle(MOTION_CLASS, reduce === true);
  if (!document.getElementById('kairos-motion-preference-style')) document.head.insertAdjacentHTML('beforeend', '<style id="kairos-motion-preference-style">html.kairos-reduce-motion *,html.kairos-reduce-motion *::before,html.kairos-reduce-motion *::after{animation-duration:.001ms!important;animation-iteration-count:1!important;transition-duration:.001ms!important;scroll-behavior:auto!important}</style>');
  try { applyMotionPreference(JSON.parse(localStorage.getItem('kairos-settings') || '{}')?.accessibility?.reduceMotion === true); } catch {}
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  if (embedded) {
    window.addEventListener('message', event => {
      const message = event.data;
      if (message?.type === 'kairos:motion-preference' && event.source === window.top) applyMotionPreference(message.reduce === true);
    });
    document.documentElement.classList.add('kairos-embedded-root');
    document.body.classList.add('kairos-embedded');
    const embeddedMain = document.querySelector('body > main');
    [...document.body.children].forEach(node => {
      if (node !== embeddedMain && node.matches('header, nav, aside')) node.remove();
    });
    embeddedMain?.classList.add('kairos-page-main');
    return;
  }
  if (!document.querySelector('link[href^="schedule-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="schedule-feature.css?v=30">');
  if (!document.querySelector('link[href^="date-range-picker.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="date-range-picker.css?v=3">');
  if (!document.querySelector('link[href^="reminder-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="reminder-feature.css?v=1">');
  if (!document.querySelector('link[href^="settings-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="settings-feature.css?v=1">');
  const page = document.body.dataset.page || 'calendar';
  const spaShell = page === 'calendar';
  const labels = spaShell
    ? [['calendar','#calendar','calendar_today','Calendar'],['habits','#habits','repeat','Habits'],['schedule','#schedule','checklist','Schedule'],['notes','#notes','edit_note','Notes'],['music','#music','queue_music','Music']]
    : [['calendar','index.html','calendar_today','Calendar'],['habits','habits.html','repeat','Habits'],['schedule','schedule.html','checklist','Schedule'],['notes','notes.html','edit_note','Notes'],['music','music.html','queue_music','Music']];
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
  header.innerHTML = `<a class="kairos-brand kairos-brand-shiny" href="index.html"><span class="kairos-brand-mark kairos-brand-mark-shiny material-symbols-outlined">auto_awesome</span><span class="kairos-brand-name-shiny">Kairos</span></a><nav class="kairos-nav kairos-gooey-nav" aria-label="Primary navigation"><span class="kairos-gooey-effect" aria-hidden="true"></span>${labels.map(([id,href,icon,label])=>`<a class="${page===id?'active':''}" href="${href}"><span class="material-symbols-outlined">${icon}</span><span>${label}</span></a>`).join('')}</nav><div class="kairos-actions"><button class="kairos-create"><span class="material-symbols-outlined">add</span>Create New</button><button class="kairos-icon-button kairos-reminder-button" aria-label="Reminders" aria-expanded="false" title="Reminders"><span class="material-symbols-outlined">notifications</span><i class="kairos-reminder-badge" hidden></i></button><button class="kairos-icon-button kairos-settings-button" aria-label="Settings" title="Settings" type="button"><span class="material-symbols-outlined">settings</span></button></div>`;
  oldHeader?.remove();
  main.before(header);

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
    habits: ['habits.html?embed=1&v=41', 'Habits'],
    schedule: ['schedule.html?embed=1&v=47', 'Schedule'],
    notes: ['notes.html?embed=1&v=1', 'Notes'],
    music: ['music.html?embed=1&v=82', 'Music']
  };
  const syncScheduleState = frame => {
    if (!frame?.contentWindow) return;
    try {
      const state = JSON.parse(localStorage.getItem('kairos-mvp-state') || '{}');
      frame.contentWindow.postMessage({ type:'kairos:state-sync', state }, '*');
    } catch {}
  };
  const syncMotionPreference = frame => frame?.contentWindow?.postMessage({ type:'kairos:motion-preference', reduce:document.documentElement.classList.contains(MOTION_CLASS) }, '*');
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
        try {
          const sharedState = JSON.parse(localStorage.getItem('kairos-mvp-state') || '{}');
          frame.name = `kairos-state:${JSON.stringify(sharedState)}`;
          if (nextView === 'schedule') frameUrl += `&scheduleState=${encodeURIComponent(JSON.stringify({schedules:Array.isArray(sharedState.schedules)?sharedState.schedules:[]}))}`;
        } catch {}
        frame.src = frameUrl;
        frame.title = `Kairos ${spaPages[nextView][1]}`;
        frame.dataset.view = nextView;
        document.body.appendChild(frame);
        frame.addEventListener('load', () => { syncScheduleState(frame); syncMotionPreference(frame); });
        spaFrames.set(nextView, frame);
      }
      frame.hidden = false;
      syncScheduleState(frame);
      syncMotionPreference(frame);
    }
    gooeyLinks.forEach(link => link.classList.toggle('active', link.getAttribute('href') === `#${nextView}`));
    requestAnimationFrame(refreshGooeyEffect);
    if (options.history) history.pushState({ kairosView:nextView }, '', `#${nextView}`);
    document.title = nextView === 'calendar' ? 'Clarity Calendar | Intentional Dashboard' : `Clarity Calendar | ${spaPages[nextView][1]}`;
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
      if (['calendar', 'schedule', 'habits', 'notes', 'music'].includes(type)) {
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
      applyMotionPreference(event.detail?.accessibility?.reduceMotion === true);
      spaFrames.forEach(syncMotionPreference);
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
    fullscreenButton.setAttribute('aria-label','全屏显示月历');
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
      fullscreenButton.setAttribute('aria-label',active?'退出全屏月历':'全屏显示月历');
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
  if ('MutationObserver' in window && content) {
    let alignmentFrame = 0;
    const playerMutationObserver = new MutationObserver(() => {
      cancelAnimationFrame(alignmentFrame);
      alignmentFrame = requestAnimationFrame(alignPlayer);
    });
    playerMutationObserver.observe(content,{childList:true,subtree:true,attributes:true,attributeFilter:['class','style']});
  }
})();

{
  if (!document.querySelector('link[href^="schedule-feature.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="schedule-feature.css?v=30">');
  if (!document.querySelector('link[href^="date-range-picker.css"]')) document.head.insertAdjacentHTML('beforeend','<link rel="stylesheet" href="date-range-picker.css?v=3">');
  const loadScheduleFeature=()=>{
    if (document.querySelector('script[src^="schedule-feature.js"]')) return;
    const scheduleFeatureScript=document.createElement('script');
    scheduleFeatureScript.src='schedule-feature.js?v=42';
    document.body.appendChild(scheduleFeatureScript);
  };
  const calendarCoreScript=document.createElement('script');
  calendarCoreScript.src='calendar-core.cjs?v=1';
  calendarCoreScript.onload=loadScheduleFeature;
  calendarCoreScript.onerror=loadScheduleFeature;
  document.body.appendChild(calendarCoreScript);
}
if (new URLSearchParams(location.search).get('embed') !== '1') {
  const loadReminderFeature=()=>{
    if (document.querySelector('script[src^="reminder-feature.js"]')) return;
    const reminderFeatureScript=document.createElement('script');
    reminderFeatureScript.src='reminder-feature.js?v=7';
    document.body.appendChild(reminderFeatureScript);
  };
  const reminderCoreScript=document.createElement('script');
  reminderCoreScript.src='reminder-core.cjs?v=1';
  reminderCoreScript.onload=loadReminderFeature;
  reminderCoreScript.onerror=loadReminderFeature;
  document.body.appendChild(reminderCoreScript);
  const settingsFeatureScript=document.createElement('script');
  settingsFeatureScript.src='settings-feature.js?v=1';
  document.body.appendChild(settingsFeatureScript);
}
document.documentElement.classList.remove('kairos-boot');
