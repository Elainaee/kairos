(() => {
  if (window.KairosSettingsFeature) return;

  // Settings is also hosted by the Vue shell. Resolve bundled artwork from this
  // source file, rather than from the host document, so the original NetEase
  // brand asset remains valid in both renderers.
  const featureScriptUrl = document.currentScript?.src
    || document.querySelector('script[data-vue-settings-feature]')?.src
    || window.location.href;
  const featureAssetUrl = path => new URL(path, featureScriptUrl).href;

  const STORAGE_KEY = 'kairos-settings';
  const defaults = {
    general: { language: 'system', timeFormat: 'system' },
    appearance: { theme: 'system', calendarBackground: { source: 'builtin', id: 'default.jpg', blur: 6, brightness: 95 } },
    accessibility: { reduceMotion: false },
    ai: { replyStyle: 'companion', memoryEnabled: true, webSearchMode: 'ask' },
    music: { neteaseQuality: 'standard' },
    reminders: { deadline: '1440', event: '30', match: '30', snoozeMinutes: '10', desktopNotifications: true }
  };
  const t = (key, fallback, params) => window.KairosI18n?.t?.(key, params) || fallback;
  const buildSections = () => [
    ['general', 'tune', t('settings.general', 'General')],
    ['appearance', 'palette', t('settings.appearance', 'Appearance')],
    ['reminders', 'notifications', t('settings.reminders', 'Reminders')],
    ['agent', 'smart_toy', t('settings.agent', 'Agent')],
    ['music', 'queue_music', t('settings.music', 'Music')],
    ['data', 'database', t('settings.data', 'Data')]
  ];
  let sections = buildSections();
  const buildChoices = () => ({
    language: [['system', t('settings.systemDefault', 'System default')], ['en', t('settings.english', 'English')], ['zh-CN', t('settings.simplifiedChinese', 'Simplified Chinese')]],
    timeFormat: [['system', t('settings.systemDefault', 'System default')], ['12h', t('settings.12hour', '12-hour')], ['24h', t('settings.24hour', '24-hour')]],
    theme: [['system', t('settings.systemDefault', 'System default')], ['light', t('settings.light', 'Light')], ['dark', t('settings.dark', 'Dark')]],
    replyStyle: [['companion', 'Warm companion'], ['concise', 'Concise execution'], ['learning', 'Focused learning']],
    webSearchMode: [['ask', 'Ask every time'], ['off', 'Off']],
    neteaseQuality: [['standard', 'Standard'], ['higher', 'Higher'], ['exhigh', 'Very high'], ['lossless', 'Lossless']],
    reminderOffset: [['none', t('time.none', 'No reminder')], ['0', t('time.atStart', 'At start time')], ['10', t('time.minutesBefore', '10 minutes before', { count: 10 })], ['30', t('time.minutesBefore', '30 minutes before', { count: 30 })], ['60', t('time.hourBefore', '1 hour before')], ['1440', t('time.dayBefore', '1 day before')]],
    snoozeMinutes: [['5', t('time.minutes', '5 minutes', { count: 5 })], ['10', t('time.minutes', '10 minutes', { count: 10 })], ['15', t('time.minutes', '15 minutes', { count: 15 })], ['30', t('time.minutes', '30 minutes', { count: 30 })]]
  });
  let choices = buildChoices();
  const merge = input => ({
    general: { ...defaults.general, ...(input?.general || {}) },
    appearance: { ...defaults.appearance, ...(input?.appearance || {}), calendarBackground: { ...defaults.appearance.calendarBackground, ...(input?.appearance?.calendarBackground || {}) } },
    accessibility: { ...defaults.accessibility, ...(input?.accessibility || {}) },
    ai: { ...defaults.ai, ...(input?.ai || {}) },
    music: { ...defaults.music, ...(input?.music || {}) },
    reminders: { ...defaults.reminders, ...(input?.reminders || {}) }
  });
  const readLocal = () => { try { return merge(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { return merge({}); } };
  const readDesktopSettings = async () => {
    const api = window.kairosDesktop?.appState;
    if (!api?.get) return null;
    const desktopState = await api.get();
    return desktopState?.settings ? merge(desktopState.settings) : null;
  };
  const writeDesktopSettings = async value => {
    const api = window.kairosDesktop?.appState;
    if (!api?.get || !api?.save) return;
    const desktopState = await api.get();
    await api.save({ ...desktopState, settings: value });
  };

  let state = readLocal();
  const applyMotionPreference = () => document.documentElement.classList.toggle('kairos-reduce-motion', state.accessibility.reduceMotion === true);
  applyMotionPreference();
  let dialog;
  let activeSection = 'general';
  let previousFocus;
  let providerCatalog = [];
  let providerSettings;
  let neteaseStatus;
  let calendarBackgrounds = [];
  let statusTimer;
  const agentProviderIds = new Set(['openai', 'doubao']);

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const toast = (title, type = 'success', description = '') => window.dispatchEvent(new CustomEvent('kairos:toast', { detail: { type, title, description } }));
  const persist = patch => {
    state = merge({ ...state, ...patch, ai: { ...state.ai, ...(patch.ai || {}) } });
    applyMotionPreference();
    window.KairosI18n?.setLocale?.(state.general.language);
    window.KairosI18n?.setTimeFormat?.(state.general.timeFormat);
    writeDesktopSettings(state).catch(error => console.warn('Unable to save Kairos settings:', error));
    window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
    flashSaved();
  };
  const flashSaved = (message = t('settings.saved', 'Saved')) => {
    const node = dialog?.querySelector('[data-save-status]');
    if (!node) return;
    node.textContent = message;
    node.classList.add('is-visible');
    clearTimeout(statusTimer);
    statusTimer = setTimeout(() => node.classList.remove('is-visible'), 1800);
  };
  const select = (id, label, value, rows, path) => `
    <label class="kairos-setting-row" for="${id}">
      <span class="kairos-setting-copy"><span class="kairos-setting-label">${label}</span></span>
      <span class="kairos-select-wrap"><select id="${id}" data-setting-path="${path}">${rows.map(([key, text]) => `<option value="${key}" ${key === value ? 'selected' : ''}>${text}</option>`).join('')}</select><span class="material-symbols-outlined">expand_more</span></span>
    </label>`;
  const toggle = (id, label, checked, path, hint = '') => `
    <label class="kairos-setting-row kairos-toggle-row" for="${id}">
      <span class="kairos-setting-copy"><span class="kairos-setting-label">${label}</span>${hint ? `<small>${hint}</small>` : ''}</span>
      <span class="kairos-switch"><input id="${id}" data-setting-path="${path}" type="checkbox" ${checked ? 'checked' : ''}><i></i></span>
    </label>`;
  const action = (label, icon, actionLabel, dataAttribute, enabled) => `
    <div class="kairos-setting-row">
      <span class="kairos-setting-copy"><span class="kairos-setting-label">${label}</span></span>
      <span class="kairos-select-wrap"><button class="kairos-data-action-button" type="button" ${dataAttribute} ${enabled ? '' : 'disabled'}><span class="material-symbols-outlined">${icon}</span>${actionLabel}</button></span>
    </div>`;
  const calendarBackgroundValue = value => {
    const candidate = { ...defaults.appearance.calendarBackground, ...(value || {}) };
    const source = candidate.source === 'custom' ? 'custom' : 'builtin';
    const candidateId = String(candidate.id || '').normalize('NFC');
    const id = candidateId && !candidateId.startsWith('.') && !/[\\/<>:"|?*\u0000-\u001f\u007f]/.test(candidateId) && /\.(?:jpe?g|png|webp)$/i.test(candidateId) ? candidateId : defaults.appearance.calendarBackground.id;
    const blur = Math.max(0, Math.min(32, Number(candidate.blur) || 0));
    const brightness = Math.max(55, Math.min(140, Number(candidate.brightness) || 100));
    return { source, id, blur, brightness };
  };
  const calendarBackgroundUrl = value => {
    const background = calendarBackgroundValue(value);
    return `kairos-background://${background.source}/${encodeURIComponent(background.id)}`;
  };
  const calendarRangeProgress = (value, min, max) => `${Math.round(((Number(value) - min) / (max - min)) * 100)}%`;
  const calendarRange = ({ id, label, value, min, max, step, dataAttribute, outputAttribute, suffix }) => `
    <label class="kairos-setting-row kairos-range-row" for="${id}">
      <span class="kairos-setting-copy"><span class="kairos-setting-label">${label}</span><small><output ${outputAttribute}>${value}</output>${suffix}</small></span>
      <span class="kairos-elastic-range" style="--calendar-range-progress:${calendarRangeProgress(value, min, max)}"><span class="kairos-elastic-range-track-wrap" aria-hidden="true"><span class="kairos-elastic-range-track"><i></i></span></span><input id="${id}" ${dataAttribute} type="range" min="${min}" max="${max}" step="${step}" value="${value}"></span>
    </label>`;
  const syncCalendarBackgroundPreview = value => {
    const preview = dialog?.querySelector('.kairos-calendar-background-preview');
    if (!preview) return;
    const background = calendarBackgroundValue(value);
    preview.style.setProperty('--calendar-background-preview-image', `url("${calendarBackgroundUrl(background)}")`);
    preview.style.setProperty('--calendar-background-preview-blur', `${background.blur}px`);
    preview.style.setProperty('--calendar-background-preview-brightness', `${background.brightness}%`);
  };
  const calendarBackgroundMarkup = () => {
    const background = calendarBackgroundValue(state.appearance.calendarBackground);
    // Legacy installs can have both a packaged default and a migrated custom
    // copy with the same file id. They are visually identical, so show one
    // card only; retain the active source when it is selected.
    const cards = calendarBackgrounds.reduce((items, item) => {
      const existing = items.findIndex(card => card.id === item.id);
      if (existing < 0) items.push(item);
      else if (item.source === background.source && item.id === background.id) items.splice(existing, 1, item);
      return items;
    }, []);
    if (!cards.some(item => item.source === background.source && item.id === background.id)) cards.unshift({ source: background.source, id: background.id, label: 'Default' });
    const backgroundCard = item => {
      const selected = item.source === background.source && item.id === background.id;
      const label = item.label || 'Untitled background';
      const removeButton = item.id === 'default.jpg' ? '' : `<button class="kairos-background-card-delete" type="button" data-calendar-background-delete aria-label="Delete ${escapeHtml(label)}" title="Delete background"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>`;
      return `<article class="kairos-background-card${selected ? ' is-selected' : ''}" data-calendar-background-card data-calendar-background-source="${item.source}" data-calendar-background-id="${escapeHtml(item.id)}"><button class="kairos-background-card-image" type="button" data-calendar-background-card-select aria-pressed="${selected}" aria-label="Select ${escapeHtml(label)}" style="--calendar-background-card-image:url(&quot;${calendarBackgroundUrl(item)}&quot;)"><span class="material-symbols-outlined" aria-hidden="true">check</span></button>${removeButton}<button class="kairos-background-card-name" type="button" data-calendar-background-rename aria-label="Rename ${escapeHtml(label)}" title="Click to rename">${escapeHtml(label)}</button></article>`;
    };
    return card('Calendar background', `
      <div class="kairos-background-card-grid">${cards.map(backgroundCard).join('')}<button class="kairos-background-import-card" type="button" data-import-calendar-background ${window.kairosDesktop?.calendarBackgrounds?.chooseImport ? '' : 'disabled'}><span class="material-symbols-outlined" aria-hidden="true">add</span><strong>Import image</strong></button></div>
      <div class="kairos-settings-group kairos-calendar-background-settings">${calendarRange({ id: 'kairosCalendarBackgroundBlur', label: 'Blur', value: background.blur, min: 0, max: 32, step: 1, dataAttribute: 'data-calendar-background-blur', outputAttribute: 'data-calendar-background-blur-value', suffix: ' px' })}${calendarRange({ id: 'kairosCalendarBackgroundBrightness', label: 'Brightness', value: background.brightness, min: 55, max: 140, step: 1, dataAttribute: 'data-calendar-background-brightness', outputAttribute: 'data-calendar-background-brightness-value', suffix: '%' })}</div>
      <div class="kairos-calendar-background-preview" style="--calendar-background-preview-image:url(&quot;${calendarBackgroundUrl(background)}&quot;);--calendar-background-preview-blur:${background.blur}px;--calendar-background-preview-brightness:${background.brightness}%"><span>Calendar preview</span></div>
      `);
  };
  const card = (title, body) => `<section class="kairos-ai-card"><header><h3>${title}</h3></header>${body}</section>`;
  const credentialRow = (kind, label, configured, createdAt, keyHint = '', source = 'none') => `
    <div class="kairos-credential-row" data-credential="${kind}">
      <strong>${label}</strong>
      <span class="kairos-credential-mask ${configured ? '' : 'is-empty'}">${configured ? escapeHtml(keyHint || '********') : 'Not configured'}</span>
      <time>${configured && createdAt ? new Date(createdAt).toLocaleDateString('zh-CN') : ''}</time>
      <span class="kairos-credential-actions"><button type="button" data-edit-key="${kind}" aria-label="Edit ${label}" title="Edit key"><span class="material-symbols-outlined">edit</span></button>${configured ? `<button type="button" data-clear-key="${kind}" aria-label="Delete ${label}" title="Delete key"><span class="material-symbols-outlined">delete</span></button>` : ''}</span>
    </div>`;
  const providerMarkup = () => {
    const availableProviders = providerCatalog.filter(item => agentProviderIds.has(item.id));
    const savedProvider = providerSettings?.defaultProvider;
    const provider = agentProviderIds.has(savedProvider) ? savedProvider : availableProviders[0]?.id || 'openai';
    const entry = providerSettings?.providers?.[provider] || {};
    const catalogEntry = availableProviders.find(item => item.id === provider);
    const models = [...new Set([...(catalogEntry?.availableModels || catalogEntry?.models || []), ...(entry.discoveredModels || []), entry.model].filter(Boolean))];
    const enabledModels = new Set(Array.isArray(entry.enabledModels) ? entry.enabledModels : []);
    const defaultModel = enabledModels.has(entry.model) ? entry.model : models.find(model => enabledModels.has(model)) || '';
    const modelPicker = `<div class="kairos-setting-row kairos-model-picker-row"><span class="kairos-setting-copy"><span class="kairos-setting-label">Default model</span></span><details class="kairos-model-picker" data-model-picker><summary><span>${escapeHtml(defaultModel || 'Select models')}</span><span class="material-symbols-outlined">expand_more</span></summary><div class="kairos-model-picker-menu"><small>勾选后显示在聊天中；点击已勾选模型的名称设为默认。</small>${models.map(model => `<div class="kairos-model-picker-option"><label><input type="checkbox" data-provider-model-toggle value="${escapeHtml(model)}" ${enabledModels.has(model) ? 'checked' : ''}><span class="material-symbols-outlined">${enabledModels.has(model) ? 'check_box' : 'check_box_outline_blank'}</span></label><button type="button" data-set-default-model value="${escapeHtml(model)}" ${enabledModels.has(model) ? '' : 'disabled'}>${escapeHtml(model)}${model === defaultModel ? '<em>Default</em>' : ''}</button></div>`).join('') || '<span class="kairos-setting-hint">Refresh from account to load models.</span>'}</div></details></div>`;
    const refreshedAt = entry.modelCatalogUpdatedAt ? `Last refreshed ${new Date(entry.modelCatalogUpdatedAt).toLocaleString('zh-CN')}` : 'Refresh lists the chat-capable models visible to this account.';
    return `
      <div class="kairos-settings-group">
        ${select('kairosAgentProvider', 'Default provider', provider, availableProviders.map(item => [item.id, item.name]), 'provider')}
        ${modelPicker}
      </div>
      ${credentialRow('provider', 'Model API Key', entry.configured, entry.createdAt, entry.keyHint, entry.source)}
      <div class="kairos-key-utility"><button type="button" data-test-provider><span class="material-symbols-outlined">network_check</span>Test connection</button><button type="button" data-refresh-provider-models ${entry.configured ? '' : 'disabled'} title="${entry.configured ? 'Refresh models available to this account' : 'Configure an API key first'}"><span class="material-symbols-outlined">sync</span>Refresh from account</button><output data-test-result aria-live="polite"></output></div>
      <small class="kairos-setting-hint" data-model-refresh-result>${refreshedAt}</small>`;
  };
  const dataMarkup = () => {
    return sectionView('data', t('settings.data', 'Data'), `
      ${card(t('settings.appData', 'App Data'), `
        <div class="kairos-settings-group">
          ${action(t('settings.exportAppData', 'Export app data'), 'ios_share', t('settings.export', 'export'), 'data-export-app-state', window.kairosDesktop?.appState?.exportCurrent)}
          ${action(t('settings.importJson', 'Import JSON'), 'file_open', t('settings.import', 'import'), 'data-import-app-state', window.kairosDesktop?.appState?.importJson)}
        </div>`)}
    `);
  };
  const sectionView = (id, title, body) => `
    <section class="kairos-settings-section kairos-settings-panel-view" data-settings-panel="${id}" hidden>
      <header class="kairos-settings-section-header"><h3>${title}</h3></header>${body}
    </section>`;
  const agentMarkup = () => sectionView('agent', 'Agent', `
    ${card('Model & Keys', `
      <div data-provider-settings>${providerMarkup()}</div>
      ${credentialRow('firecrawl', 'FireCrawl API Key', providerSettings?.firecrawl?.configured, providerSettings?.firecrawl?.createdAt, providerSettings?.firecrawl?.keyHint, providerSettings?.firecrawl?.source)}
      ${select('kairosWebSearchMode', 'Web search', state.ai.webSearchMode, choices.webSearchMode, 'ai.webSearchMode')}
      `)}
    ${card('Response', `
      <div class="kairos-settings-group">
        ${select('kairosReplyStyle', 'Reply style', state.ai.replyStyle, choices.replyStyle, 'ai.replyStyle')}
        ${toggle('kairosMemoryEnabled', 'Long-term memory', state.ai.memoryEnabled, 'ai.memoryEnabled')}
      </div>
      <div class="kairos-danger-row"><span><strong>Reset memory</strong></span><button type="button" data-reset-memories>Clear all</button></div>`)}
  `);
  const remindersMarkup = () => sectionView('reminders', t('settings.reminders', 'Reminders'), `
    ${card(t('settings.defaultRules', 'Default Rules'), `
      <div class="kairos-settings-group">
        ${select('kairosReminderDeadline', t('settings.deadlineDefault', 'Deadline default'), state.reminders.deadline, choices.reminderOffset, 'reminders.deadline')}
        ${select('kairosReminderEvent', t('settings.eventDefault', 'Event default'), state.reminders.event, choices.reminderOffset, 'reminders.event')}
        ${select('kairosReminderMatch', t('settings.matchDefault', 'Match default'), state.reminders.match, choices.reminderOffset, 'reminders.match')}
        ${select('kairosReminderSnooze', t('settings.snoozeDuration', 'Snooze duration'), state.reminders.snoozeMinutes, choices.snoozeMinutes, 'reminders.snoozeMinutes')}
        ${toggle('kairosDesktopNotifications', t('settings.windowsNotifications', 'Windows notifications'), state.reminders.desktopNotifications, 'reminders.desktopNotifications', t('settings.windowsNotificationsHint', 'When off, in-app reminders and the desktop pet stay available.'))}
      </div>`)}
  `);
  const musicMarkup = () => {
    const profile = neteaseStatus?.loggedIn ? neteaseStatus.profile || {} : null;
    const brand = `<span class="kairos-netease-brand"><img src="${featureAssetUrl('../../assets/icons/netease-format.ico')}" alt="" aria-hidden="true">Netease Music</span>`;
    const controls = `
      <div class="kairos-settings-group">
        ${select('kairosNeteaseQuality', 'Streaming quality', state.music.neteaseQuality, choices.neteaseQuality, 'music.neteaseQuality')}
      </div>
      <div class="kairos-netease-tools">
        <button type="button" data-netease-refresh ${window.kairosDesktop?.netease?.getStatus ? '' : 'disabled'}><span class="material-symbols-outlined">refresh</span>Refresh account data</button>
        <button type="button" data-netease-clear-cache><span class="material-symbols-outlined">ink_eraser</span>Clear local cache</button>
      </div>`;
    if (!profile) return sectionView('music', 'Music', `${card(brand, `<div class="kairos-netease-account is-signed-out"><span class="material-symbols-outlined" aria-hidden="true">account_circle</span><strong>Not signed in</strong><button type="button" data-netease-login>Log in</button></div>${controls}`)}`);
    const avatar = String(profile.avatarUrl || '').trim();
    const name = escapeHtml(profile.nickname || 'NetEase Cloud');
    const userId = profile.userId ? `<span>ID ${escapeHtml(profile.userId)}</span>` : '';
    return sectionView('music', 'Music', `${card(brand, `<div class="kairos-netease-account"><span class="kairos-netease-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : '<span class="material-symbols-outlined" aria-hidden="true">account_circle</span>'}</span><span class="kairos-netease-account-copy"><strong>${name}</strong>${userId}</span><button type="button" data-netease-logout>Log out</button></div>${controls}`)}`);
  };
  const render = () => {
    dialog.innerHTML = `
      <form method="dialog" class="kairos-settings-panel">
        <aside class="kairos-settings-sidebar"><button class="kairos-settings-back" type="button" data-settings-back aria-label="Back" title="Back"><span class="material-symbols-outlined">arrow_back</span></button><span class="kairos-settings-kicker">${t('settings.preferences', 'Preferences')}</span><h2 id="kairosSettingsTitle">${t('settings.title', 'Settings')}</h2><nav class="kairos-settings-nav" aria-label="Settings categories">${sections.map(([id, icon, label]) => `<button class="${id === activeSection ? 'active' : ''}" data-settings-tab="${id}" type="button"><span class="material-symbols-outlined">${icon}</span><span>${label}</span></button>`).join('')}</nav></aside>
        <div class="kairos-settings-content">
          ${sectionView('general', t('settings.general', 'General'), `<div class="kairos-settings-group">${select('kairosLanguage', t('settings.language', 'Language'), state.general.language, choices.language, 'general.language')}${select('kairosTimeFormat', t('settings.timeFormat', 'Time format'), state.general.timeFormat, choices.timeFormat, 'general.timeFormat')}</div>`)}
          ${sectionView('appearance', t('settings.appearance', 'Appearance'), `<div class="kairos-settings-group">${select('kairosTheme', t('settings.themeMode', 'Theme mode'), state.appearance.theme, choices.theme, 'appearance.theme')}${toggle('kairosReduceMotion', t('settings.reduceMotion', 'Reduce motion'), state.accessibility.reduceMotion, 'accessibility.reduceMotion')}</div>${calendarBackgroundMarkup()}`)}
          ${remindersMarkup()}
          ${agentMarkup()}
          ${musicMarkup()}
          ${dataMarkup()}
          <output class="kairos-settings-save-status" data-save-status aria-live="polite">Saved</output>
        </div>
      </form>
      <section class="kairos-settings-confirm" data-confirm hidden role="alertdialog" aria-modal="true" aria-labelledby="kairosConfirmTitle"><div><h3 id="kairosConfirmTitle"></h3><p data-confirm-copy></p><footer><button type="button" data-confirm-cancel>Cancel</button><button type="button" data-confirm-action></button></footer></div></section>`;
    bindDialog();
    showSection(activeSection);
  };
  const showSection = id => {
    activeSection = id;
    dialog.querySelectorAll('[data-settings-tab]').forEach(tab => tab.classList.toggle('active', tab.dataset.settingsTab === id));
    dialog.querySelectorAll('[data-settings-panel]').forEach(panel => { panel.hidden = panel.dataset.settingsPanel !== id; });
  };
  const setByPath = (path, value) => {
    const [group, key] = path.split('.');
    persist({ [group]: { ...state[group], [key]: value } });
  };
  const confirmAction = ({ title, copy, action, dangerous = false, input, onConfirm }) => {
    const modal = dialog.querySelector('[data-confirm]');
    modal.querySelector('#kairosConfirmTitle').textContent = title;
    modal.querySelector('[data-confirm-copy]').textContent = copy;
    const accept = modal.querySelector('[data-confirm-action]');
    accept.textContent = action;
    accept.classList.toggle('is-danger', dangerous);
    modal.querySelector('[data-confirm-input]')?.remove();
    let inputNode;
    if (input) {
      inputNode = document.createElement('input');
      inputNode.dataset.confirmInput = '';
      inputNode.type = input.type || 'password';
      inputNode.autocomplete = 'off';
      inputNode.placeholder = input.placeholder || 'Enter API key';
      inputNode.value = input.value || '';
      if (input.maxLength) inputNode.maxLength = input.maxLength;
      modal.querySelector('footer').before(inputNode);
    }
    modal.hidden = false;
    (inputNode || accept).focus();
    if (inputNode?.type === 'text') inputNode.select();
    const close = () => { modal.hidden = true; accept.onclick = null; };
    modal.querySelector('[data-confirm-cancel]').onclick = close;
    accept.onclick = async () => { const value = inputNode?.value.trim(); if (input && !value) { inputNode.focus(); return; } accept.disabled = true; try { await onConfirm(value); close(); } catch (error) { toast('Action not completed', 'error', error?.message || 'Please try again.'); } finally { accept.disabled = false; } };
  };
  const openNeteaseLogin = () => {
    const api = window.kairosDesktop?.netease;
    if (!api?.startLogin || !api?.loginCheck) return;
    const modal = dialog.querySelector('[data-confirm]');
    const title = modal.querySelector('#kairosConfirmTitle');
    const copy = modal.querySelector('[data-confirm-copy]');
    const cancel = modal.querySelector('[data-confirm-cancel]');
    const refresh = modal.querySelector('[data-confirm-action]');
    modal.querySelector('[data-confirm-input]')?.remove();
    modal.querySelector('.kairos-netease-login')?.remove();
    title.textContent = 'Log in to Netease Music';
    copy.textContent = 'Scan with your own Netease Music account. This integration is for personal learning use only and does not redistribute music content.';
    refresh.textContent = 'Refresh QR';
    refresh.classList.remove('is-danger');
    const login = document.createElement('div');
    login.className = 'kairos-netease-login';
    const image = document.createElement('img');
    image.alt = 'Netease Music login QR code';
    image.hidden = true;
    const status = document.createElement('output');
    status.textContent = 'Generating QR code...';
    login.append(image, status);
    modal.querySelector('footer').before(login);
    let timer = null;
    let closed = false;
    const close = () => {
      closed = true;
      clearInterval(timer);
      modal.hidden = true;
      refresh.onclick = null;
    };
    const poll = async key => {
      try {
        const result = await api.loginCheck({ key });
        if (closed) return;
        if (result?.code === 803 || result?.loggedIn) {
          clearInterval(timer);
          neteaseStatus = await api.getStatus().catch(() => null);
          close();
          render();
          flashSaved('Logged in');
          return;
        }
        if (result?.code === 800) {
          clearInterval(timer);
          status.textContent = 'QR code expired.';
          refresh.disabled = false;
        }
      } catch {
        if (!closed) status.textContent = 'Unable to check login status.';
      }
    };
    const load = async () => {
      clearInterval(timer);
      refresh.disabled = true;
      image.hidden = true;
      status.textContent = 'Generating QR code...';
      try {
        const result = await api.startLogin();
        if (closed) return;
        if (!result?.ok || !result.key || !result.qrImg) throw new Error(result?.message || 'Unable to generate QR code.');
        image.src = result.qrImg;
        image.hidden = false;
        status.textContent = 'Waiting for scan...';
        refresh.disabled = false;
        timer = setInterval(() => poll(result.key), 2400);
        poll(result.key);
      } catch (error) {
        if (!closed) {
          status.textContent = error?.message || 'Unable to generate QR code.';
          refresh.disabled = false;
        }
      }
    };
    cancel.onclick = close;
    refresh.onclick = load;
    modal.hidden = false;
    cancel.focus();
    load();
  };
  const refreshProviderData = async () => {
    if (!window.kairosDesktop) return;
    [providerCatalog, providerSettings, neteaseStatus, calendarBackgrounds] = await Promise.all([
      window.kairosDesktop.listProviders(),
      window.kairosDesktop.getProviderSettings(),
      window.kairosDesktop.netease?.getStatus ? window.kairosDesktop.netease.getStatus().catch(() => null) : Promise.resolve(null),
      window.kairosDesktop.calendarBackgrounds?.listBuiltins ? window.kairosDesktop.calendarBackgrounds.listBuiltins().catch(() => []) : Promise.resolve([])
    ]);
  };
  const refreshCalendarBackgroundData = async () => {
    const api = window.kairosDesktop?.calendarBackgrounds;
    calendarBackgrounds = await (api?.listBuiltins ? api.listBuiltins().catch(() => []) : Promise.resolve([]));
  };
  const saveCalendarBackground = patch => {
    const calendarBackground = calendarBackgroundValue({ ...state.appearance.calendarBackground, ...patch });
    persist({ appearance: { ...state.appearance, calendarBackground } });
    return calendarBackground;
  };
  const saveProvider = async input => {
    const keepModelPickerOpen = dialog.querySelector('[data-model-picker]')?.open;
    const scrollTop = dialog.querySelector('.kairos-settings-content')?.scrollTop || 0;
    providerSettings = await window.kairosDesktop.saveProviderSettings(input);
    render();
    requestAnimationFrame(() => {
      if (keepModelPickerOpen) dialog.querySelector('[data-model-picker]')?.setAttribute('open', '');
      const content = dialog.querySelector('.kairos-settings-content');
      if (content) content.scrollTop = scrollTop;
    });
    flashSaved('Model settings saved');
  };
  const saveKey = async (kind, apiKey) => {
    const label = kind === 'firecrawl' ? 'FireCrawl API Key' : 'Model API Key';
    if (kind === 'firecrawl') providerSettings = await window.kairosDesktop.saveFirecrawlSettings({ apiKey });
    else {
      const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
      const model = providerSettings?.providers?.[provider]?.model || providerCatalog.find(item => item.id === provider)?.defaultModel;
      providerSettings = await window.kairosDesktop.saveProviderSettings({ provider, defaultProvider: provider, model, credentialMode: 'saved', apiKey });
    }
    render();
    flashSaved(`${label} saved`);
  };
  const editKey = kind => confirmAction({ title: 'Replace API key?', copy: 'The new key replaces the current setting and is stored in local secure storage.', action: 'Save key', input: { placeholder: 'Enter a new API key' }, onConfirm: value => saveKey(kind, value) });
  const clearKey = kind => confirmAction({ title: 'Clear API key?', copy: 'This service will remain unavailable until a new key is configured.', action: 'Clear key', dangerous: true, onConfirm: async () => {
    if (kind === 'firecrawl') providerSettings = await window.kairosDesktop.saveFirecrawlSettings({ clear: true });
    else {
      const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
      const model = providerSettings?.providers?.[provider]?.model || providerCatalog.find(item => item.id === provider)?.defaultModel;
      providerSettings = await window.kairosDesktop.saveProviderSettings({ provider, defaultProvider: provider, model, credentialMode: 'saved', clearKey: true });
    }
    render();
    flashSaved('API key cleared');
  }});
  const clearNeteaseLocalCache = () => {
    window.kairosDesktop?.music?.updateRuntime?.({ neteasePlayback: null, lastSource: 'empty' }).catch(() => {});
    window.dispatchEvent(new CustomEvent('kairos:netease-cache-cleared'));
    if (window.parent && window.parent !== window) window.parent.dispatchEvent(new CustomEvent('kairos:netease-cache-cleared'));
  };
  const bindDialog = () => {
    if (!dialog.dataset.modelPickerDismissBound) {
      document.addEventListener('pointerdown', event => {
        if (!dialog.open) return;
        const picker = dialog.querySelector('[data-model-picker][open]');
        if (picker && !picker.contains(event.target)) picker.removeAttribute('open');
      }, true);
      dialog.dataset.modelPickerDismissBound = 'true';
    }
    dialog.querySelector('[data-settings-back]')?.addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-settings-tab]').forEach(tab => tab.addEventListener('click', () => showSection(tab.dataset.settingsTab)));
    dialog.querySelectorAll('[data-setting-path]').forEach(input => input.addEventListener('change', async event => {
      const path = event.target.dataset.settingPath;
      if (path === 'provider') {
        const provider = event.target.value;
        const model = providerCatalog.find(item => item.id === provider)?.defaultModel || '';
        await saveProvider({ provider, defaultProvider: provider, model, credentialMode: providerSettings?.providers?.[provider]?.credentialMode || 'session' });
        return;
      }
      setByPath(path, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    }));
    dialog.querySelectorAll('[data-provider-model-toggle]').forEach(input => input.addEventListener('change', async event => {
      const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
      const checkedModels = [...dialog.querySelectorAll('[data-provider-model-toggle]:checked')].map(item => item.value);
      const entry = providerSettings?.providers?.[provider] || {};
      const model = checkedModels.includes(entry.model) ? entry.model : checkedModels[0] || entry.model || providerCatalog.find(item => item.id === provider)?.defaultModel || '';
      await saveProvider({ provider, defaultProvider: provider, model, enabledModels: checkedModels, credentialMode: entry.credentialMode || 'session' });
    }));
    dialog.querySelectorAll('[data-set-default-model]').forEach(button => button.addEventListener('click', async event => {
      const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
      const entry = providerSettings?.providers?.[provider] || {};
      const enabledModels = [...dialog.querySelectorAll('[data-provider-model-toggle]:checked')].map(input => input.value);
      await saveProvider({ provider, defaultProvider: provider, model: event.currentTarget.value, enabledModels, credentialMode: entry.credentialMode || 'session' });
    }));
    dialog.querySelectorAll('[data-calendar-background-card-select]').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('[data-calendar-background-card]');
      saveCalendarBackground({ source: card.dataset.calendarBackgroundSource, id: card.dataset.calendarBackgroundId });
      render();
    }));
    dialog.querySelectorAll('[data-calendar-background-card-image]').forEach(card => {
      card.addEventListener('pointermove', event => {
        if (event.pointerType !== 'mouse') return;
        const bounds = card.getBoundingClientRect();
        card.style.setProperty('--calendar-card-tilt-x', `${Math.max(-8, Math.min(8, ((event.clientY - bounds.top) / bounds.height - .5) * -16))}deg`);
        card.style.setProperty('--calendar-card-tilt-y', `${Math.max(-8, Math.min(8, ((event.clientX - bounds.left) / bounds.width - .5) * 16))}deg`);
      });
      card.addEventListener('pointerleave', () => { card.style.removeProperty('--calendar-card-tilt-x'); card.style.removeProperty('--calendar-card-tilt-y'); });
    });
    dialog.querySelectorAll('[data-calendar-background-rename]').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('[data-calendar-background-card]');
      const previousName = button.textContent.trim();
      const input = document.createElement('input');
      input.className = 'kairos-background-card-name-input';
      input.value = previousName;
      input.maxLength = 80;
      input.setAttribute('aria-label', 'Background name');
      button.replaceWith(input);
      input.focus();
      input.select();
      let finished = false;
      const finish = async save => {
        if (finished) return;
        finished = true;
        const name = input.value.trim();
        if (!save || !name || name === previousName) { render(); return; }
        try {
          const renamed = await window.kairosDesktop?.calendarBackgrounds?.rename?.({ source: card.dataset.calendarBackgroundSource, id: card.dataset.calendarBackgroundId, name });
          if (!renamed?.id) throw new Error('calendar_background_name_invalid');
          saveCalendarBackground({ source: renamed.source, id: renamed.id });
          await refreshCalendarBackgroundData();
          render();
          flashSaved('Calendar background renamed');
        } catch (error) {
          render();
          const message = error?.message === 'calendar_background_name_invalid' ? 'Use a name without file-system characters such as / or :.' : 'That name is unavailable. Please try another.';
          toast('Unable to rename calendar background', 'error', message);
        }
      };
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } if (event.key === 'Escape') { event.preventDefault(); finish(false); } });
      input.addEventListener('blur', () => finish(true));
    }));
    dialog.querySelectorAll('[data-calendar-background-delete]').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('[data-calendar-background-card]');
      const id = card.dataset.calendarBackgroundId;
      const label = card.querySelector('[data-calendar-background-rename]')?.textContent.trim() || 'this background';
      confirmAction({ title: `Delete ${label}?`, copy: 'This permanently removes the image from your Kairos background library.', action: 'Delete', dangerous: true, onConfirm: async () => {
        try {
          await window.kairosDesktop?.calendarBackgrounds?.remove?.(id);
        } catch (error) {
          const message = error?.message === 'calendar_background_last_protected' ? 'At least one calendar background must remain.' : 'This background cannot be deleted.';
          throw new Error(message);
        }
        const active = calendarBackgroundValue(state.appearance.calendarBackground);
        if (active.id === id) saveCalendarBackground({ source: 'custom', id: 'default.jpg' });
        await refreshCalendarBackgroundData();
        render();
        flashSaved('Calendar background deleted');
      }});
    }));
    const bindCalendarRange = (selector, key, valueSelector, min, max) => dialog.querySelector(selector)?.addEventListener('input', event => {
      const background = saveCalendarBackground({ [key]: Number(event.target.value) });
      const output = dialog.querySelector(valueSelector);
      if (output) output.textContent = background[key];
      event.target.closest('.kairos-elastic-range')?.style.setProperty('--calendar-range-progress', calendarRangeProgress(background[key], min, max));
      syncCalendarBackgroundPreview(background);
    });
    bindCalendarRange('[data-calendar-background-blur]', 'blur', '[data-calendar-background-blur-value]', 0, 32);
    bindCalendarRange('[data-calendar-background-brightness]', 'brightness', '[data-calendar-background-brightness-value]', 55, 140);
    dialog.querySelector('[data-import-calendar-background]')?.addEventListener('click', async event => {
      const button = event.currentTarget;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      try {
        const selection = await window.kairosDesktop?.calendarBackgrounds?.chooseImport?.();
        if (selection?.canceled || !selection?.token) return;
        confirmAction({ title: 'Name calendar background', copy: 'Choose a name for this imported image. Kairos will then copy it into your user data.', action: 'Import', input: { type: 'text', value: selection.suggestedName || '', placeholder: 'e.g. Evening focus', maxLength: 80 }, onConfirm: async name => {
          const background = await window.kairosDesktop.calendarBackgrounds.completeImport({ token: selection.token, name });
          saveCalendarBackground({ source: 'custom', id: background.id });
          await refreshCalendarBackgroundData();
          render();
          flashSaved('Calendar background imported');
        }});
      } catch (error) {
        const message = error?.message === 'calendar_background_file_too_large' ? 'Image must be 20 MB or smaller.' : 'Choose a valid JPG, PNG, or WebP image.';
        toast('Unable to import calendar background', 'error', message);
      } finally {
        if (button.isConnected) {
          button.disabled = false;
          button.removeAttribute('aria-busy');
        }
      }
    });
    dialog.querySelectorAll('[data-edit-key]').forEach(button => button.addEventListener('click', () => editKey(button.dataset.editKey)));
    dialog.querySelectorAll('[data-clear-key]').forEach(button => button.addEventListener('click', () => clearKey(button.dataset.clearKey)));
    dialog.querySelector('[data-test-provider]')?.addEventListener('click', async event => {
      const result = dialog.querySelector('[data-test-result]');
      event.currentTarget.disabled = true;
      result.textContent = 'Testing connection...';
      try {
        const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
        const outcome = await window.kairosDesktop.testProvider(provider);
        result.textContent = outcome?.ok === false ? (outcome.message || 'Connection failed') : 'Connection successful';
        result.className = outcome?.ok === false ? 'is-error' : 'is-success';
      } catch (error) { result.textContent = error?.message || 'Connection failed. Check your key and network.'; result.className = 'is-error'; }
      finally { event.currentTarget.disabled = false; }
    });
    dialog.querySelector('[data-refresh-provider-models]')?.addEventListener('click', async event => {
      const result = dialog.querySelector('[data-model-refresh-result]');
      event.currentTarget.disabled = true;
      result.textContent = 'Refreshing models from this account...';
      try {
        const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
        const outcome = await window.kairosDesktop.refreshProviderModels(provider);
        providerSettings = outcome?.settings || await window.kairosDesktop.getProviderSettings();
        providerCatalog = await window.kairosDesktop.listProviders();
        render();
        flashSaved(outcome?.models?.length ? `${outcome.models.length} account models refreshed` : 'No chat-capable models returned by this account');
      } catch (error) {
        result.textContent = error?.message || 'Unable to refresh models. Check your key and account permissions.';
        result.className = 'is-error';
      } finally {
        if (event.currentTarget.isConnected) event.currentTarget.disabled = false;
      }
    });
    dialog.querySelector('[data-reset-memories]')?.addEventListener('click', () => confirmAction({ title: 'Clear all AI memories?', copy: 'This permanently deletes every long-term memory saved by Kairos.', action: 'Clear all', dangerous: true, onConfirm: async () => {
      await window.kairosDesktop.memories.clear();
      flashSaved('All AI memories cleared');
    }}));
    dialog.querySelector('[data-netease-login]')?.addEventListener('click', openNeteaseLogin);
    dialog.querySelector('[data-netease-logout]')?.addEventListener('click', () => confirmAction({ title: 'Log out of Netease Music?', copy: 'Your local Netease Music session will be removed from Kairos.', action: 'Log out', dangerous: true, onConfirm: async () => {
      neteaseStatus = await window.kairosDesktop.netease.logout();
      render();
      flashSaved('Logged out');
    }}));
    dialog.querySelector('[data-netease-refresh]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        neteaseStatus = await window.kairosDesktop?.netease?.getStatus?.() || null;
        render();
        flashSaved('Netease account refreshed');
      } catch (error) {
        toast('Unable to refresh Netease account', 'error', error?.message || 'Please try again.');
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    dialog.querySelector('[data-netease-clear-cache]')?.addEventListener('click', () => confirmAction({ title: 'Clear Netease local cache?', copy: 'This removes saved Netease queue and playback metadata from this device. It does not log out or delete local music.', action: 'Clear cache', dangerous: true, onConfirm: async () => {
      clearNeteaseLocalCache();
      flashSaved('Netease local cache cleared');
    }}));
    dialog.querySelector('[data-export-app-state]')?.addEventListener('click', async () => {
      const result = await window.kairosDesktop?.appState?.exportCurrent?.();
      if (result?.canceled) return;
      flashSaved('App data exported');
    });
    dialog.querySelector('[data-import-app-state]')?.addEventListener('click', () => confirmAction({ title: 'Import app data?', copy: 'Choose a Kairos JSON export. The imported data will replace current app-state after you select a file.', action: 'Choose file', dangerous: true, onConfirm: async () => {
      const result = await window.kairosDesktop?.appState?.importJson?.();
      if (result?.canceled) return;
      flashSaved('App data imported');
    }}));
  };
  const buildDialog = async () => {
    dialog = document.createElement('dialog');
    dialog.className = 'kairos-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'kairosSettingsTitle');
    document.body.append(dialog);
    dialog.addEventListener('close', () => { previousFocus?.focus?.(); previousFocus = null; });
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    await refreshProviderData();
    render();
  };
  const open = async source => {
    activeSection = 'general';
    if (!dialog) await buildDialog(); else { await refreshProviderData(); render(); }
    if (dialog.open) return;
    previousFocus = source || document.activeElement;
    dialog.showModal();
    dialog.querySelector('[data-settings-tab].active')?.focus();
  };
  const bind = () => document.querySelectorAll('.kairos-settings-button').forEach(button => {
    if (button.dataset.settingsBound) return;
    button.dataset.settingsBound = '1';
    button.addEventListener('click', () => open(button));
  });

  window.KairosSettingsFeature = Object.freeze({ open, read: () => state, save: persist });
  window.addEventListener('kairos:locale-changed', () => {
    sections = buildSections();
    choices = buildChoices();
    if (dialog?.open) render();
  });
  bind();
  window.KairosI18n?.setLocale?.(state.general.language);
  window.KairosI18n?.setTimeFormat?.(state.general.timeFormat);
  window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
  readDesktopSettings().then(desktopSettings => {
    if (desktopSettings) state = desktopSettings;
    else writeDesktopSettings(state).catch(error => console.warn('Unable to migrate Kairos settings:', error));
    localStorage.removeItem(STORAGE_KEY);
    applyMotionPreference();
    window.KairosI18n?.setLocale?.(state.general.language);
    window.KairosI18n?.setTimeFormat?.(state.general.timeFormat);
    window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
  }).catch(error => console.warn('Unable to load Kairos settings:', error));
  if (document.documentElement instanceof Node) new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
})();
