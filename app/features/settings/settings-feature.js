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
    general: { language: 'en', timeFormat: 'system' },
    appearance: { theme: 'claude-plus', calendarBackground: { source: 'builtin', id: 'default.jpg', blur: 6, brightness: 95 } },
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
    theme: [['claude-plus', 'Claude +']],
    replyStyle: [['companion', t('settings.replyCompanion', 'Warm companion')], ['concise', t('settings.replyConcise', 'Concise execution')], ['learning', t('settings.replyLearning', 'Focused learning')]],
    webSearchMode: [['ask', t('settings.webSearchAsk', 'Ask every time')], ['off', t('settings.webSearchOff', 'Off')]],
    neteaseQuality: [['standard', t('settings.qualityStandard', 'Standard')], ['higher', t('settings.qualityHigher', 'Higher')], ['exhigh', t('settings.qualityVeryHigh', 'Very high')], ['lossless', t('settings.qualityLossless', 'Lossless')]],
    reminderOffset: [['none', t('time.none', 'No reminder')], ['0', t('time.atStart', 'At start time')], ['10', t('time.minutesBefore', '10 minutes before', { count: 10 })], ['30', t('time.minutesBefore', '30 minutes before', { count: 30 })], ['60', t('time.hourBefore', '1 hour before')], ['1440', t('time.dayBefore', '1 day before')]],
    snoozeMinutes: [['5', t('time.minutes', '5 minutes', { count: 5 })], ['10', t('time.minutes', '10 minutes', { count: 10 })], ['15', t('time.minutes', '15 minutes', { count: 15 })], ['30', t('time.minutes', '30 minutes', { count: 30 })]]
  });
  let choices = buildChoices();
  const normalizeTheme = value => window.KairosThemes?.normalizeTheme?.(value) || 'claude-plus';
  const merge = input => {
    // Discard the retired colour-mode preference from older app-state files.
    // The palette remains a named theme, but it no longer has dark/light state.
    const { colorMode: _retiredColorMode, ...appearance } = input?.appearance || {};
    return {
      general: { ...defaults.general, ...(input?.general || {}) },
      appearance: { ...defaults.appearance, ...appearance, theme: normalizeTheme(appearance.theme), calendarBackground: { ...defaults.appearance.calendarBackground, ...(appearance.calendarBackground || {}) } },
      accessibility: { ...defaults.accessibility, ...(input?.accessibility || {}) },
      ai: { ...defaults.ai, ...(input?.ai || {}) },
      music: { ...defaults.music, ...(input?.music || {}) },
      reminders: { ...defaults.reminders, ...(input?.reminders || {}) }
    };
  };
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
  let selectedProviderId = '';
  let providerDetailOpen = false;
  let providerModelSaveQueue = Promise.resolve();
  let providerModelSaveRevision = 0;
  let providerModelScrollSnapshot;
  let neteaseStatus;
  let calendarBackgrounds = [];
  let statusTimer;

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const toast = (title, type = 'success', description = '') => window.dispatchEvent(new CustomEvent('kairos:toast', { detail: { type, title, description } }));
  const persist = patch => {
    state = merge({ ...state, ...patch, ai: { ...state.ai, ...(patch.ai || {}) } });
    applyMotionPreference();
    window.KairosThemes?.applyTheme?.(state.appearance.theme);
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
  const isModelPickerOpen = picker => picker?.classList.contains('is-open') === true;
  const setModelPickerOpen = (picker, open) => {
    if (!picker) return;
    picker.classList.toggle('is-open', open);
    const trigger = picker.querySelector('[data-model-picker-toggle]');
    const drawer = picker.querySelector('[data-model-picker-drawer]');
    trigger?.setAttribute('aria-expanded', String(open));
    if (drawer) drawer.hidden = !open;
  };
  const readProviderModelScroll = () => ({
    content: dialog?.querySelector('.kairos-settings-content')?.scrollTop || 0,
    models: dialog?.querySelector('.kairos-provider-model-list')?.scrollTop || 0
  });
  const restoreProviderModelScroll = snapshot => {
    if (!snapshot) return;
    const content = dialog?.querySelector('.kairos-settings-content');
    const models = dialog?.querySelector('.kairos-provider-model-list');
    if (content) content.scrollTop = snapshot.content;
    if (models) models.scrollTop = snapshot.models;
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
    if (!cards.some(item => item.source === background.source && item.id === background.id)) cards.unshift({ source: background.source, id: background.id, label: t('settings.defaultBackground', 'Default') });
    const backgroundCard = item => {
      const selected = item.source === background.source && item.id === background.id;
      const label = item.label || t('settings.backgroundUntitled', 'Untitled background');
      const removeButton = item.id === 'default.jpg' ? '' : `<button class="kairos-background-card-delete" type="button" data-calendar-background-delete aria-label="${escapeHtml(t('common.delete', 'Delete'))} ${escapeHtml(label)}" title="${escapeHtml(t('common.delete', 'Delete'))}"><span class="material-symbols-outlined" aria-hidden="true">delete</span></button>`;
      return `<article class="kairos-background-card${selected ? ' is-selected' : ''}" data-calendar-background-card data-calendar-background-source="${item.source}" data-calendar-background-id="${escapeHtml(item.id)}"><button class="kairos-background-card-image" type="button" data-calendar-background-card-select aria-pressed="${selected}" aria-label="${escapeHtml(t('settings.backgroundSelect', 'Select {name}', { name: label }))}" style="--calendar-background-card-image:url(&quot;${calendarBackgroundUrl(item)}&quot;)"><span class="material-symbols-outlined" aria-hidden="true">check</span></button>${removeButton}<button class="kairos-background-card-name" type="button" data-calendar-background-rename aria-label="${escapeHtml(t('settings.renameBackground', 'Rename {name}', { name: label }))}" title="${escapeHtml(t('common.edit', 'Edit'))}">${escapeHtml(label)}</button></article>`;
    };
    return card(t('settings.calendarBackground', 'Calendar background'), `
      <div class="kairos-background-card-grid">${cards.map(backgroundCard).join('')}<button class="kairos-background-import-card" type="button" data-import-calendar-background ${window.kairosDesktop?.calendarBackgrounds?.chooseImport ? '' : 'disabled'}><span class="material-symbols-outlined" aria-hidden="true">add</span><strong>${t('settings.importBackground', 'Import image')}</strong></button></div>
      <div class="kairos-settings-group kairos-calendar-background-settings">${calendarRange({ id: 'kairosCalendarBackgroundBlur', label: t('settings.blur', 'Blur'), value: background.blur, min: 0, max: 32, step: 1, dataAttribute: 'data-calendar-background-blur', outputAttribute: 'data-calendar-background-blur-value', suffix: ' px' })}${calendarRange({ id: 'kairosCalendarBackgroundBrightness', label: t('settings.brightness', 'Brightness'), value: background.brightness, min: 55, max: 140, step: 1, dataAttribute: 'data-calendar-background-brightness', outputAttribute: 'data-calendar-background-brightness-value', suffix: '%' })}</div>
      <div class="kairos-calendar-background-preview" style="--calendar-background-preview-image:url(&quot;${calendarBackgroundUrl(background)}&quot;);--calendar-background-preview-blur:${background.blur}px;--calendar-background-preview-brightness:${background.brightness}%"><span>${t('settings.calendarPreview', 'Calendar preview')}</span></div>
      `);
  };
  const card = (title, body) => `<section class="kairos-ai-card"><header><h3>${title}</h3></header>${body}</section>`;
  const credentialRow = (kind, label, configured, createdAt, keyHint = '', source = 'none', allowClear = true) => `
    <div class="kairos-credential-row" data-credential="${kind}">
      <strong>${label}</strong>
      <span class="kairos-credential-mask ${configured ? '' : 'is-empty'}">${configured ? escapeHtml(keyHint || '********') : t('settings.notConfigured', 'Not configured')}</span>
      <time>${configured && createdAt ? (window.KairosI18n?.formatDate?.(new Date(createdAt), { year:'numeric', month:'short', day:'numeric' }) || new Intl.DateTimeFormat(undefined,{year:'numeric',month:'short',day:'numeric'}).format(new Date(createdAt))) : ''}</time>
      <span class="kairos-credential-actions"><button type="button" data-edit-key="${kind}" aria-label="${t('common.edit', 'Edit')} ${label}" title="${t('common.edit', 'Edit')}"><span class="material-symbols-outlined">edit</span></button>${configured && allowClear ? `<button type="button" data-clear-key="${kind}" aria-label="${t('common.delete', 'Delete')} ${label}" title="${t('common.delete', 'Delete')}"><span class="material-symbols-outlined">delete</span></button>` : ''}</span>
    </div>`;
  const providerMarkup = () => {
    const availableProviders = providerCatalog;
    const savedProvider = providerSettings?.defaultProvider;
    const provider = availableProviders.some(item => item.id === selectedProviderId) ? selectedProviderId : (availableProviders.some(item => item.id === savedProvider) ? savedProvider : availableProviders[0]?.id || '');
    selectedProviderId = provider;
    const entry = providerSettings?.providers?.[provider] || {};
    const catalogEntry = availableProviders.find(item => item.id === provider);
    const models = [...new Set([...(catalogEntry?.catalogModels || []), ...(catalogEntry?.configuredModels || []), entry.model].filter(Boolean))];
    const enabledModels = new Set(Array.isArray(entry.enabledModels) ? entry.enabledModels : []);
    const unavailableModels = new Set(catalogEntry?.unavailableModels || []);
    const defaultModel = enabledModels.has(entry.model) ? entry.model : '';
    const providerRows = availableProviders.map(item => {
      const itemEntry = providerSettings?.providers?.[item.id] || {};
      const configured = itemEntry.configured;
      const itemUnavailableModels = new Set(item.unavailableModels || []);
      const itemEnabledModels = (itemEntry.enabledModels || []).filter(model => !itemUnavailableModels.has(model));
      const count = itemEnabledModels.length;
      const itemDefaultModel = itemEnabledModels.includes(itemEntry.model) ? itemEntry.model : '';
      const status = !configured ? t('settings.notConfigured', 'Not configured') : count ? t('settings.providerReady', 'Ready') : t('settings.providerNoModelsSelected', 'No models selected');
      return `<button class="kairos-provider-list-item${item.id === provider ? ' is-selected' : ''}" type="button" data-provider-profile-id="${escapeHtml(item.id)}" aria-current="${item.id === provider ? 'true' : 'false'}"><span class="kairos-provider-list-heading"><strong>${escapeHtml(item.name)}</strong><i class="${count ? 'is-ready' : ''}" aria-hidden="true"></i></span><small data-provider-list-status>${escapeHtml(status)}</small><span><span data-provider-list-model>${escapeHtml(itemDefaultModel || t('settings.noDefaultModel', 'No default model'))}</span><em data-provider-list-count>${count}</em></span></button>`;
    }).join('');
    const modelRows = models.map(model => {
      const unavailable = unavailableModels.has(model);
      const enabled = enabledModels.has(model) && !unavailable;
      return `<label class="kairos-provider-model-choice${enabled ? ' is-selected' : ''}${unavailable ? ' is-unavailable' : ''}"><input type="checkbox" data-provider-model-toggle value="${escapeHtml(model)}" ${enabled ? 'checked' : ''} ${unavailable || !entry.configured ? 'disabled' : ''} aria-label="${t('settings.toggleModelVisibility', 'Show or hide {model} in chat', { model })}"><span class="material-symbols-outlined" aria-hidden="true">${enabled ? 'check_box' : 'check_box_outline_blank'}</span><strong>${escapeHtml(model)}</strong></label>`;
    }).join('') || `<p class="kairos-provider-empty">${t('settings.providerModelsLoad', 'Refresh from account to load models.')}</p>`;
    const defaultOptions = [...enabledModels].filter(model => !unavailableModels.has(model));
    const visibleCount = defaultOptions.length;
    const modelDrawer = `<section class="kairos-model-picker kairos-provider-models" data-model-picker><button class="kairos-provider-model-trigger" type="button" data-model-picker-toggle aria-expanded="false"><span><strong>${t('settings.models', 'Models')}</strong><small data-visible-model-count>${t('settings.visibleModelCount', '{visible} of {total} shown', { visible: visibleCount, total: models.length })}</small></span><span class="material-symbols-outlined" aria-hidden="true">expand_more</span></button><div class="kairos-model-picker-menu kairos-provider-model-drawer" data-model-picker-drawer hidden><label class="kairos-provider-default-model"><span>${t('settings.providerModel', 'Default model')}</span><select data-provider-default-model ${defaultOptions.length ? '' : 'disabled'}>${defaultOptions.length ? defaultOptions.map(model => `<option value="${escapeHtml(model)}" ${model === defaultModel ? 'selected' : ''}>${escapeHtml(model)}</option>`).join('') : `<option>${t('settings.selectVisibleModelFirst', 'Select a visible model below')}</option>`}</select></label><div class="kairos-provider-model-list">${modelRows}</div></div></section>`;
    if (!catalogEntry) return `<div class="kairos-provider-workspace"><p class="kairos-provider-empty">${t('settings.noProviders', 'No providers configured.')}</p></div>`;
    return `
      <div class="kairos-provider-workspace${providerDetailOpen ? ' is-detail-open' : ''}">
        <aside class="kairos-provider-list"><header><strong>${t('settings.providers', 'Providers')}</strong><button type="button" data-add-provider aria-label="${t('settings.addProvider', 'Add provider')}" title="${t('settings.addProvider', 'Add provider')}"><span class="material-symbols-outlined" aria-hidden="true">add</span></button></header>${providerRows}</aside>
        <section class="kairos-provider-detail"><header class="kairos-provider-detail-header"><button type="button" data-provider-detail-back aria-label="${t('common.back', 'Back')}"><span class="material-symbols-outlined" aria-hidden="true">arrow_back</span></button><span><strong>${escapeHtml(catalogEntry.name)}</strong><small>${catalogEntry.kind === 'custom' ? t('settings.customProvider', 'Custom OpenAI-compatible provider') : t('settings.builtinProvider', 'Built-in provider')}</small></span>${provider === savedProvider ? `<span class="kairos-provider-default-state"><span class="material-symbols-outlined" aria-hidden="true">check</span>${t('settings.defaultProvider', 'Default provider')}</span>` : `<button type="button" data-make-default-provider>${t('settings.makeDefaultProvider', 'Make default')}</button>`}</header>
          ${catalogEntry.baseURL ? `<div class="kairos-provider-endpoint"><span>${t('settings.baseUrl', 'Base URL')}</span><code>${escapeHtml(catalogEntry.baseURL)}</code>${catalogEntry.kind === 'custom' ? `<button type="button" data-edit-provider><span class="material-symbols-outlined" aria-hidden="true">edit</span>${t('common.edit', 'Edit')}</button>` : ''}</div>` : ''}
          ${credentialRow(`provider:${provider}`, t('settings.modelApiKey', 'Model API Key'), entry.configured, entry.createdAt, entry.keyHint, entry.source, catalogEntry.kind !== 'custom')}
          <div class="kairos-key-utility"><button type="button" data-test-provider><span class="material-symbols-outlined">network_check</span>${t('settings.providerTest', 'Test connection')}</button><button type="button" data-refresh-provider-models ${entry.configured ? '' : 'disabled'}><span class="material-symbols-outlined">sync</span>${t('settings.providerModelsRefresh', 'Refresh from account')}</button><output data-test-result aria-live="polite"></output></div>
          ${modelDrawer}
          ${catalogEntry.kind === 'custom' ? `<div class="kairos-provider-delete"><button type="button" data-delete-provider><span class="material-symbols-outlined" aria-hidden="true">delete</span>${t('settings.deleteProvider', 'Delete provider')}</button></div>` : ''}
        </section>
      </div>`;
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
    <section class="kairos-settings-section kairos-settings-panel-view" data-settings-panel="${id}" ${id === activeSection ? '' : 'hidden'}>
      <header class="kairos-settings-section-header"><h3>${title}</h3></header>${body}
    </section>`;
  const agentMarkup = () => sectionView('agent', t('settings.agent', 'Agent'), `
    ${card(t('settings.providerConfiguration', 'AI providers'), `<div data-provider-settings>${providerMarkup()}</div>`)}
    ${card(t('settings.searchConfiguration', 'Search'), `
      ${credentialRow('firecrawl', 'FireCrawl API Key', providerSettings?.firecrawl?.configured, providerSettings?.firecrawl?.createdAt, providerSettings?.firecrawl?.keyHint, providerSettings?.firecrawl?.source)}
      <div class="kairos-settings-group">${select('kairosWebSearchMode', t('settings.webSearch', 'Web search'), state.ai.webSearchMode, choices.webSearchMode, 'ai.webSearchMode')}</div>`)}
    ${card(t('settings.agentBehavior', 'Behavior'), `
      <div class="kairos-settings-group">
        ${select('kairosReplyStyle', t('settings.replyStyle', 'Reply style'), state.ai.replyStyle, choices.replyStyle, 'ai.replyStyle')}
        ${toggle('kairosMemoryEnabled', t('settings.longTermMemory', 'Long-term memory'), state.ai.memoryEnabled, 'ai.memoryEnabled')}
      </div>
      <div class="kairos-danger-row"><span><strong>${t('settings.clearMemory', 'Clear all AI memories?')}</strong></span><button type="button" data-reset-memories>${t('common.clearAll', 'Clear all')}</button></div>`)}
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
        ${select('kairosNeteaseQuality', t('settings.streamingQuality', 'Streaming quality'), state.music.neteaseQuality, choices.neteaseQuality, 'music.neteaseQuality')}
      </div>
      <div class="kairos-netease-tools">
        <button type="button" data-netease-refresh ${window.kairosDesktop?.netease?.getStatus ? '' : 'disabled'}><span class="material-symbols-outlined">refresh</span>${t('settings.neteaseRefresh', 'Refresh account data')}</button>
        <button type="button" data-netease-clear-cache><span class="material-symbols-outlined">ink_eraser</span>${t('settings.clearCache', 'Clear cache')}</button>
      </div>`;
    if (!profile) return sectionView('music', t('settings.music', 'Music'), `${card(brand, `<div class="kairos-netease-account is-signed-out"><span class="material-symbols-outlined" aria-hidden="true">account_circle</span><strong>${t('settings.neteaseNotSignedIn', 'Not signed in')}</strong><button type="button" data-netease-login>${t('settings.neteaseLogin', 'Log in')}</button></div>${controls}`)}`);
    const avatar = String(profile.avatarUrl || '').trim();
    const name = escapeHtml(profile.nickname || 'NetEase Cloud');
    const userId = profile.userId ? `<span>ID ${escapeHtml(profile.userId)}</span>` : '';
    return sectionView('music', t('settings.music', 'Music'), `${card(brand, `<div class="kairos-netease-account"><span class="kairos-netease-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : '<span class="material-symbols-outlined" aria-hidden="true">account_circle</span>'}</span><span class="kairos-netease-account-copy"><strong>${name}</strong>${userId}</span><button type="button" data-netease-logout>${t('settings.neteaseLogout', 'Log out')}</button></div>${controls}`)}`);
  };
  const render = () => {
    const template = document.createElement('template');
    template.innerHTML = `
      <form method="dialog" class="kairos-settings-panel">
        <aside class="kairos-settings-sidebar"><button class="kairos-settings-back" type="button" data-settings-back aria-label="${t('common.close', 'Close')}" title="${t('common.close', 'Close')}"><span class="material-symbols-outlined">arrow_back</span></button><span class="kairos-settings-kicker">${t('settings.preferences', 'Preferences')}</span><h2 id="kairosSettingsTitle">${t('settings.title', 'Settings')}</h2><nav class="kairos-settings-nav" aria-label="${t('settings.title', 'Settings')}">${sections.map(([id, icon, label]) => `<button class="${id === activeSection ? 'active' : ''}" data-settings-tab="${id}" type="button"><span class="material-symbols-outlined">${icon}</span><span>${label}</span></button>`).join('')}</nav></aside>
        <div class="kairos-settings-content">
          ${sectionView('general', t('settings.general', 'General'), `<div class="kairos-settings-group">${select('kairosLanguage', t('settings.language', 'Language'), state.general.language, choices.language, 'general.language')}${select('kairosTimeFormat', t('settings.timeFormat', 'Time format'), state.general.timeFormat, choices.timeFormat, 'general.timeFormat')}</div>`)}
          ${sectionView('appearance', t('settings.appearance', 'Appearance'), `<div class="kairos-settings-group">${select('kairosTheme', t('settings.theme', 'Theme'), state.appearance.theme, choices.theme, 'appearance.theme')}${toggle('kairosReduceMotion', t('settings.reduceMotion', 'Reduce motion'), state.accessibility.reduceMotion, 'accessibility.reduceMotion')}</div>${calendarBackgroundMarkup()}`)}
          ${remindersMarkup()}
          ${agentMarkup()}
          ${musicMarkup()}
          ${dataMarkup()}
          <output class="kairos-settings-save-status" data-save-status aria-live="polite">${t('settings.saved', 'Saved')}</output>
        </div>
      </form>
      <section class="kairos-settings-confirm" data-confirm hidden role="alertdialog" aria-modal="true" aria-labelledby="kairosConfirmTitle"><div><h3 id="kairosConfirmTitle"></h3><p data-confirm-copy></p><footer><button type="button" data-confirm-cancel>${t('common.cancel', 'Cancel')}</button><button type="button" data-confirm-action></button></footer></div></section>`;
    dialog.replaceChildren(template.content);
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
    modal.querySelector('.kairos-provider-editor')?.remove();
    modal.querySelector('.kairos-netease-login')?.remove();
    let inputNode;
    if (input) {
      inputNode = document.createElement('input');
      inputNode.dataset.confirmInput = '';
      inputNode.type = input.type || 'password';
      inputNode.autocomplete = 'off';
      inputNode.placeholder = input.placeholder || t('settings.enterApiKey', 'Enter API key');
      inputNode.value = input.value || '';
      if (input.maxLength) inputNode.maxLength = input.maxLength;
      modal.querySelector('footer').before(inputNode);
    }
    modal.hidden = false;
    (inputNode || accept).focus();
    if (inputNode?.type === 'text') inputNode.select();
    const close = () => { modal.hidden = true; accept.onclick = null; };
    modal.querySelector('[data-confirm-cancel]').onclick = close;
    accept.onclick = async () => { const value = inputNode?.value.trim(); if (input && !value) { inputNode.focus(); return; } accept.disabled = true; try { await onConfirm(value); close(); } catch (error) { toast(t('common.actionNotCompleted', 'Action not completed'), 'error', error?.message || t('legacy.tryAgain', 'Please try again.')); } finally { accept.disabled = false; } };
  };
  const openProviderEditor = (definition = null) => {
    const modal = dialog.querySelector('[data-confirm]');
    const accept = modal.querySelector('[data-confirm-action]');
    modal.querySelector('[data-confirm-input]')?.remove();
    modal.querySelector('.kairos-provider-editor')?.remove();
    modal.querySelector('.kairos-netease-login')?.remove();
    modal.querySelector('#kairosConfirmTitle').textContent = definition ? t('settings.editProvider', 'Edit provider') : t('settings.addProvider', 'Add provider');
    modal.querySelector('[data-confirm-copy]').textContent = t('settings.customProviderDescription', 'Connect an HTTPS OpenAI-compatible endpoint. Kairos discovers models from /models.');
    accept.textContent = definition ? t('common.save', 'Save') : t('settings.addProvider', 'Add provider');
    accept.classList.remove('is-danger');
    const editor = document.createElement('div');
    editor.className = 'kairos-provider-editor';
    editor.innerHTML = `<label><span>${t('settings.providerName', 'Provider name')}</span><input data-provider-editor-name type="text" maxlength="60" autocomplete="off" value="${escapeHtml(definition?.name || '')}" placeholder="${t('settings.providerNameExample', 'e.g. Team gateway')}"></label><label><span>${t('settings.baseUrl', 'Base URL')}</span><input data-provider-editor-url type="url" autocomplete="off" value="${escapeHtml(definition?.baseURL || '')}" placeholder="https://api.example.com/v1"></label><label><span>${definition ? t('settings.newApiKeyOptional', 'New API key (optional)') : t('settings.modelApiKey', 'Model API Key')}</span><input data-provider-editor-key type="password" autocomplete="off" placeholder="${t('settings.enterApiKey', 'Enter API key')}"></label>`;
    modal.querySelector('footer').before(editor);
    const close = () => { modal.hidden = true; accept.onclick = null; };
    modal.querySelector('[data-confirm-cancel]').onclick = close;
    accept.onclick = async () => {
      const name = editor.querySelector('[data-provider-editor-name]').value.trim();
      const baseURL = editor.querySelector('[data-provider-editor-url]').value.trim();
      const apiKey = editor.querySelector('[data-provider-editor-key]').value.trim();
      if (!name || !baseURL || (!definition && !apiKey)) { editor.querySelector(!name ? '[data-provider-editor-name]' : !baseURL ? '[data-provider-editor-url]' : '[data-provider-editor-key]').focus(); return; }
      accept.disabled = true;
      try {
        if (definition) providerSettings = await window.kairosDesktop.updateProvider({ provider: definition.id, name, baseURL, apiKey });
        else {
          const result = await window.kairosDesktop.createProvider({ name, baseURL, apiKey });
          providerSettings = result.settings;
          selectedProviderId = result.provider.id;
        }
        providerCatalog = await window.kairosDesktop.listProviders();
        close(); render(); flashSaved(t('settings.providerSaved', 'Provider saved'));
      } catch (error) { toast(t('common.actionNotCompleted', 'Action not completed'), 'error', error?.message || t('legacy.tryAgain', 'Please try again.')); }
      finally { accept.disabled = false; }
    };
    modal.hidden = false;
    editor.querySelector('[data-provider-editor-name]').focus();
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
    modal.querySelector('.kairos-provider-editor')?.remove();
    modal.querySelector('.kairos-netease-login')?.remove();
    title.textContent = t('settings.neteaseLoginTitle', 'Log in to Netease Music');
    copy.textContent = t('settings.neteaseLoginDescription', 'Scan with your own Netease Music account to continue.');
    refresh.textContent = t('settings.refreshQr', 'Refresh QR');
    refresh.classList.remove('is-danger');
    const login = document.createElement('div');
    login.className = 'kairos-netease-login';
    const image = document.createElement('img');
    image.alt = t('settings.neteaseQrAlt', 'Netease Music login QR code');
    image.hidden = true;
    const status = document.createElement('output');
    status.textContent = t('settings.neteaseQrGenerating', 'Generating QR code...');
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
          flashSaved(t('settings.neteaseLoggedIn', 'Logged in'));
          return;
        }
        if (result?.code === 800) {
          clearInterval(timer);
          status.textContent = t('settings.neteaseQrExpired', 'QR code expired.');
          refresh.disabled = false;
        }
      } catch {
        if (!closed) status.textContent = t('settings.neteaseQrCheckFailed', 'Unable to check login status.');
      }
    };
    const load = async () => {
      clearInterval(timer);
      refresh.disabled = true;
      image.hidden = true;
      status.textContent = t('settings.neteaseQrGenerating', 'Generating QR code...');
      try {
        const result = await api.startLogin();
        if (closed) return;
        if (!result?.ok || !result.key || !result.qrImg) throw new Error(result?.message || t('settings.neteaseQrFailed', 'Unable to generate QR code.'));
        image.src = result.qrImg;
        image.hidden = false;
        status.textContent = t('settings.neteaseQrWaiting', 'Waiting for scan...');
        refresh.disabled = false;
        timer = setInterval(() => poll(result.key), 2400);
        poll(result.key);
      } catch (error) {
        if (!closed) {
          status.textContent = error?.message || t('settings.neteaseQrFailed', 'Unable to generate QR code.');
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
    if (!providerCatalog.some(item => item.id === selectedProviderId)) selectedProviderId = providerSettings?.defaultProvider || providerCatalog[0]?.id || '';
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
  const saveProvider = async (input, { rerender = true } = {}) => {
    const keepModelPickerOpen = isModelPickerOpen(dialog.querySelector('[data-model-picker]'));
    const scrollTop = dialog.querySelector('.kairos-settings-content')?.scrollTop || 0;
    providerSettings = await window.kairosDesktop.saveProviderSettings(input);
    if (!rerender) {
      const catalogEntry = providerCatalog.find(item => item.id === input.provider);
      const savedEntry = providerSettings?.providers?.[input.provider] || {};
      if (catalogEntry) {
        const unavailable = new Set(catalogEntry.unavailableModels || []);
        catalogEntry.configuredModels = [...(savedEntry.enabledModels || [])];
        catalogEntry.enabledModels = catalogEntry.configuredModels.filter(model => !unavailable.has(model));
        catalogEntry.models = [...catalogEntry.enabledModels];
        catalogEntry.defaultModel = catalogEntry.enabledModels.includes(savedEntry.model) ? savedEntry.model : '';
      }
      flashSaved(t('settings.providerModelsSaved', 'Model settings saved'));
      return providerSettings;
    }
    providerCatalog = await window.kairosDesktop.listProviders();
    render();
    requestAnimationFrame(() => {
      if (keepModelPickerOpen) setModelPickerOpen(dialog.querySelector('[data-model-picker]'), true);
      const content = dialog.querySelector('.kairos-settings-content');
      if (content) content.scrollTop = scrollTop;
    });
    flashSaved(t('settings.providerModelsSaved', 'Model settings saved'));
    return providerSettings;
  };
  const syncModelPickerUi = (changedInput, scrollSnapshot = readProviderModelScroll()) => {
    const inputs = [...dialog.querySelectorAll('[data-provider-model-toggle]')];
    const selected = inputs.filter(input => input.checked).map(input => input.value);
    if (changedInput) {
      const icon = changedInput.nextElementSibling;
      const iconName = changedInput.checked ? 'check_box' : 'check_box_outline_blank';
      if (icon && icon.textContent !== iconName) icon.textContent = iconName;
      changedInput.closest('.kairos-provider-model-choice')?.classList.toggle('is-selected', changedInput.checked);
    }
    const count = dialog.querySelector('[data-visible-model-count]');
    if (count) count.textContent = t('settings.visibleModelCount', '{visible} of {total} shown', { visible: selected.length, total: inputs.length });
    const select = dialog.querySelector('[data-provider-default-model]');
    if (select) {
      const current = selected.includes(select.value) ? select.value : selected[0] || '';
      const selectedSet = new Set(selected);
      [...select.options].forEach(option => { if (!selectedSet.has(option.value)) option.remove(); });
      selected.forEach(model => {
        if ([...select.options].some(option => option.value === model)) return;
        const option = document.createElement('option');
        option.value = model;
        option.textContent = model;
        select.append(option);
      });
      if (!selected.length) {
        const option = document.createElement('option');
        option.textContent = t('settings.selectVisibleModelFirst', 'Select a visible model below');
        select.append(option);
      }
      select.disabled = selected.length === 0;
      select.value = current;
    }
    const providerItem = dialog.querySelector(`[data-provider-profile-id="${CSS.escape(selectedProviderId)}"]`);
    if (providerItem) {
      const model = selected.includes(select?.value) ? select.value : selected[0] || '';
      const modelNode = providerItem.querySelector('[data-provider-list-model]');
      const countNode = providerItem.querySelector('[data-provider-list-count]');
      const statusNode = providerItem.querySelector('[data-provider-list-status]');
      const readyNode = providerItem.querySelector('.kairos-provider-list-heading i');
      if (modelNode) modelNode.textContent = model || t('settings.noDefaultModel', 'No default model');
      if (countNode) countNode.textContent = String(selected.length);
      if (statusNode) statusNode.textContent = selected.length ? t('settings.providerReady', 'Ready') : t('settings.providerNoModelsSelected', 'No models selected');
      readyNode?.classList.toggle('is-ready', selected.length > 0);
    }
    restoreProviderModelScroll(scrollSnapshot);
    return selected;
  };
  const saveKey = async (kind, apiKey) => {
    const label = kind === 'firecrawl' ? 'FireCrawl API Key' : t('settings.modelApiKey', 'Model API Key');
    if (kind === 'firecrawl') providerSettings = await window.kairosDesktop.saveFirecrawlSettings({ apiKey });
    else {
      const provider = kind.split(':')[1] || selectedProviderId;
      providerSettings = await window.kairosDesktop.saveProviderSettings({ provider, apiKey });
    }
    providerCatalog = await window.kairosDesktop.listProviders();
    render();
    flashSaved(t('settings.apiKeySaved', '{label} saved', { label }));
  };
  const editKey = kind => confirmAction({ title: t('settings.replaceApiKey', 'Replace API key?'), copy: t('settings.replaceApiKeyDescription', 'The new key replaces the current setting and is stored in local secure storage.'), action: t('settings.saveApiKey', 'Save key'), input: { placeholder: t('settings.enterApiKey', 'Enter API key') }, onConfirm: value => saveKey(kind, value) });
  const clearKey = kind => confirmAction({ title: t('settings.clearApiKey', 'Clear API key'), copy: t('settings.clearApiKeyDescription', 'This service will remain unavailable until a new key is configured.'), action: t('settings.clearApiKey', 'Clear API key'), dangerous: true, onConfirm: async () => {
    if (kind === 'firecrawl') providerSettings = await window.kairosDesktop.saveFirecrawlSettings({ clear: true });
    else {
      const provider = kind.split(':')[1] || selectedProviderId;
      providerSettings = await window.kairosDesktop.saveProviderSettings({ provider, clearKey: true });
    }
    providerCatalog = await window.kairosDesktop.listProviders();
    render();
    flashSaved(t('settings.apiKeyCleared', 'API key cleared'));
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
        const picker = dialog.querySelector('[data-model-picker].is-open');
        if (picker && !picker.contains(event.target)) setModelPickerOpen(picker, false);
      }, true);
      dialog.dataset.modelPickerDismissBound = 'true';
    }
    dialog.querySelector('[data-settings-back]')?.addEventListener('click', () => dialog.close());
    dialog.querySelectorAll('[data-settings-tab]').forEach(tab => tab.addEventListener('click', () => showSection(tab.dataset.settingsTab)));
    dialog.querySelectorAll('[data-setting-path]').forEach(input => input.addEventListener('change', async event => {
      const path = event.target.dataset.settingPath;
      setByPath(path, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    }));
    dialog.querySelector('[data-model-picker-toggle]')?.addEventListener('click', event => {
      const picker = event.currentTarget.closest('[data-model-picker]');
      setModelPickerOpen(picker, !isModelPickerOpen(picker));
    });
    dialog.querySelectorAll('[data-provider-model-toggle]').forEach(input => {
      input.closest('.kairos-provider-model-choice')?.addEventListener('pointerdown', () => {
        providerModelScrollSnapshot = readProviderModelScroll();
      }, { passive: true });
      input.addEventListener('change', async event => {
        const provider = selectedProviderId;
        const changedInput = event.currentTarget;
        const previousChecked = !changedInput.checked;
        const scrollSnapshot = providerModelScrollSnapshot || readProviderModelScroll();
        const checkedModels = syncModelPickerUi(changedInput, scrollSnapshot);
        const entry = providerSettings?.providers?.[provider] || {};
        const model = checkedModels.includes(entry.model) ? entry.model : checkedModels[0] || '';
        const revision = ++providerModelSaveRevision;
        const operation = providerModelSaveQueue.then(() => saveProvider({ provider, model, enabledModels: checkedModels }, { rerender: false }));
        providerModelSaveQueue = operation.catch(() => {});
        try {
          await operation;
        } catch (error) {
          if (revision === providerModelSaveRevision && provider === selectedProviderId && changedInput.isConnected) {
            changedInput.checked = previousChecked;
            syncModelPickerUi(changedInput, scrollSnapshot);
          }
          toast(t('common.actionNotCompleted', 'Action not completed'), 'error', error?.message || t('legacy.tryAgain', 'Please try again.'));
        } finally {
          if (revision === providerModelSaveRevision && provider === selectedProviderId && changedInput.isConnected) {
            restoreProviderModelScroll(scrollSnapshot);
            requestAnimationFrame(() => restoreProviderModelScroll(scrollSnapshot));
            providerModelScrollSnapshot = undefined;
          }
        }
      });
    });
    dialog.querySelector('[data-provider-default-model]')?.addEventListener('change', async event => {
      const provider = selectedProviderId;
      const previousModel = providerSettings?.providers?.[provider]?.model || '';
      const enabledModels = [...dialog.querySelectorAll('[data-provider-model-toggle]:checked')].map(input => input.value);
      try {
        await saveProvider({ provider, model: event.currentTarget.value, enabledModels }, { rerender: false });
        syncModelPickerUi();
      } catch (error) {
        event.currentTarget.value = previousModel;
        toast(t('common.actionNotCompleted', 'Action not completed'), 'error', error?.message || t('legacy.tryAgain', 'Please try again.'));
      }
    });
    dialog.querySelectorAll('[data-provider-profile-id]').forEach(button => button.addEventListener('click', () => { selectedProviderId = button.dataset.providerProfileId; providerDetailOpen = true; render(); }));
    dialog.querySelector('[data-provider-detail-back]')?.addEventListener('click', () => { providerDetailOpen = false; render(); });
    dialog.querySelector('[data-add-provider]')?.addEventListener('click', () => openProviderEditor());
    dialog.querySelector('[data-edit-provider]')?.addEventListener('click', () => openProviderEditor(providerCatalog.find(item => item.id === selectedProviderId)));
    dialog.querySelector('[data-make-default-provider]')?.addEventListener('click', async () => {
      const entry = providerSettings?.providers?.[selectedProviderId] || {};
      const catalog = providerCatalog.find(item => item.id === selectedProviderId);
      if (!entry.configured || !catalog?.enabledModels?.includes(entry.model)) {
        const drawer = dialog.querySelector('[data-model-picker]');
        setModelPickerOpen(drawer, true);
        toast(t('common.actionNotCompleted', 'Action not completed'), 'error', !entry.configured ? t('settings.configureApiKeyBeforeDefault', 'Configure an API key before making this provider the default.') : t('settings.selectDefaultModelBeforeProvider', 'Select a visible default model before making this provider the default.'));
        drawer?.querySelector('[data-model-picker-toggle]')?.focus();
        return;
      }
      await saveProvider({ provider: selectedProviderId, defaultProvider: selectedProviderId, model: entry.model, enabledModels: entry.enabledModels || [] });
    });
    dialog.querySelector('[data-delete-provider]')?.addEventListener('click', () => {
      const definition = providerCatalog.find(item => item.id === selectedProviderId);
      confirmAction({ title: t('settings.deleteProviderTitle', 'Delete {name}?', { name: definition?.name || '' }), copy: t('settings.deleteProviderDescription', 'Existing conversations keep the provider name but become unavailable. This cannot be undone.'), action: t('settings.deleteProvider', 'Delete provider'), dangerous: true, onConfirm: async () => {
        providerSettings = await window.kairosDesktop.deleteProvider(selectedProviderId);
        providerCatalog = await window.kairosDesktop.listProviders();
        selectedProviderId = providerSettings.defaultProvider || providerCatalog[0]?.id || '';
        providerDetailOpen = false;
        render(); flashSaved(t('settings.providerDeleted', 'Provider deleted'));
      }});
    });
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
      input.setAttribute('aria-label', t('settings.backgroundName', 'Background name'));
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
          flashSaved(t('settings.backgroundRenamed', 'Calendar background renamed'));
        } catch (error) {
          render();
          const message = error?.message === 'calendar_background_name_invalid' ? t('settings.backgroundRenameInvalid', 'Use a name without file-system characters such as / or :.') : t('settings.backgroundRenameUnavailable', 'That name is unavailable. Please try another.');
          toast(t('settings.backgroundRenameError', 'Unable to rename calendar background'), 'error', message);
        }
      };
      input.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); finish(true); } if (event.key === 'Escape') { event.preventDefault(); finish(false); } });
      input.addEventListener('blur', () => finish(true));
    }));
    dialog.querySelectorAll('[data-calendar-background-delete]').forEach(button => button.addEventListener('click', () => {
      const card = button.closest('[data-calendar-background-card]');
      const id = card.dataset.calendarBackgroundId;
      const label = card.querySelector('[data-calendar-background-rename]')?.textContent.trim() || t('settings.backgroundUntitled', 'Untitled background');
      confirmAction({ title: t('settings.backgroundDeleteTitle', 'Delete {name}?', { name: label }), copy: t('settings.backgroundDeleteDescription', 'This permanently removes the image from your Kairos background library.'), action: t('common.delete', 'Delete'), dangerous: true, onConfirm: async () => {
        try {
          await window.kairosDesktop?.calendarBackgrounds?.remove?.(id);
        } catch (error) {
          const message = error?.message === 'calendar_background_last_protected' ? t('settings.backgroundLastProtected', 'At least one calendar background must remain.') : t('settings.backgroundDeleteFailed', 'This background cannot be deleted.');
          throw new Error(message);
        }
        const active = calendarBackgroundValue(state.appearance.calendarBackground);
        if (active.id === id) saveCalendarBackground({ source: 'custom', id: 'default.jpg' });
        await refreshCalendarBackgroundData();
        render();
        flashSaved(t('settings.backgroundDeleted', 'Calendar background deleted'));
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
        confirmAction({ title: t('settings.importBackgroundName', 'Name calendar background'), copy: t('settings.importBackgroundDescription', 'Choose a name for this imported image. Kairos will then copy it into your user data.'), action: t('settings.import', 'Import'), input: { type: 'text', value: selection.suggestedName || '', placeholder: t('settings.backgroundNameExample', 'e.g. Evening focus'), maxLength: 80 }, onConfirm: async name => {
          const background = await window.kairosDesktop.calendarBackgrounds.completeImport({ token: selection.token, name });
          saveCalendarBackground({ source: 'custom', id: background.id });
          await refreshCalendarBackgroundData();
          render();
          flashSaved(t('settings.backgroundImported', 'Calendar background imported'));
        }});
      } catch (error) {
        const message = error?.message === 'calendar_background_file_too_large' ? t('settings.importBackgroundTooLarge', 'Image must be 20 MB or smaller.') : t('settings.importBackgroundInvalid', 'Choose a valid JPG, PNG, or WebP image.');
        toast(t('settings.importBackgroundError', 'Unable to import calendar background'), 'error', message);
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
      result.textContent = t('settings.providerTesting', 'Testing connection...');
      try {
        const outcome = await window.kairosDesktop.testProvider(selectedProviderId);
        result.textContent = outcome?.ok === false ? (outcome.message || t('settings.connectionFailed', 'Connection failed. Check your key and network.')) : t('settings.connectionSuccessful', 'Connection successful');
        result.className = outcome?.ok === false ? 'is-error' : 'is-success';
      } catch (error) { result.textContent = error?.message || t('settings.connectionFailed', 'Connection failed. Check your key and network.'); result.className = 'is-error'; }
      finally { event.currentTarget.disabled = false; }
    });
    dialog.querySelector('[data-refresh-provider-models]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        const outcome = await window.kairosDesktop.refreshProviderModels(selectedProviderId);
        providerSettings = outcome?.settings || await window.kairosDesktop.getProviderSettings();
        providerCatalog = await window.kairosDesktop.listProviders();
        render();
        flashSaved(outcome?.models?.length ? t('settings.providerModelsRefreshed', '{count} account models refreshed', { count: outcome.models.length }) : t('settings.noModels', 'No chat-capable models returned by this account'));
      } catch (error) {
        toast(t('common.actionNotCompleted', 'Action not completed'), 'error', error?.message || t('settings.providerModelsRefreshFailed', 'Unable to refresh models. Check your key and account permissions.'));
      } finally {
        if (event.currentTarget.isConnected) event.currentTarget.disabled = false;
      }
    });
    dialog.querySelector('[data-reset-memories]')?.addEventListener('click', () => confirmAction({ title: t('settings.clearMemory', 'Clear all AI memories?'), copy: t('settings.clearMemoryDescription', 'This permanently deletes every long-term memory saved by Kairos.'), action: t('common.clearAll', 'Clear all'), dangerous: true, onConfirm: async () => {
      await window.kairosDesktop.memories.clear();
      flashSaved(t('settings.allMemoriesCleared', 'All AI memories cleared'));
    }}));
    dialog.querySelector('[data-netease-login]')?.addEventListener('click', openNeteaseLogin);
    dialog.querySelector('[data-netease-logout]')?.addEventListener('click', () => confirmAction({ title: t('settings.neteaseLogoutTitle', 'Log out of Netease Music?'), copy: t('settings.neteaseLogoutDescription', 'Your local Netease Music session will be removed from Kairos.'), action: t('settings.neteaseLogout', 'Log out'), dangerous: true, onConfirm: async () => {
      neteaseStatus = await window.kairosDesktop.netease.logout();
      render();
      flashSaved(t('settings.neteaseLoggedOut', 'Logged out'));
    }}));
    dialog.querySelector('[data-netease-refresh]')?.addEventListener('click', async event => {
      event.currentTarget.disabled = true;
      try {
        neteaseStatus = await window.kairosDesktop?.netease?.getStatus?.() || null;
        render();
        flashSaved(t('settings.neteaseAccountRefreshed', 'Netease account refreshed'));
      } catch (error) {
        toast(t('settings.neteaseRefreshFailed', 'Unable to refresh Netease account'), 'error', error?.message || t('legacy.tryAgain', 'Please try again.'));
      } finally {
        event.currentTarget.disabled = false;
      }
    });
    dialog.querySelector('[data-netease-clear-cache]')?.addEventListener('click', () => confirmAction({ title: t('settings.neteaseClearCacheTitle', 'Clear Netease local cache?'), copy: t('settings.neteaseClearCacheDescription', 'This removes saved Netease queue and playback metadata from this device. It does not log out or delete local music.'), action: t('settings.clearCache', 'Clear cache'), dangerous: true, onConfirm: async () => {
      clearNeteaseLocalCache();
      flashSaved(t('settings.neteaseCacheCleared', 'Netease local cache cleared'));
    }}));
    dialog.querySelector('[data-export-app-state]')?.addEventListener('click', async () => {
      const result = await window.kairosDesktop?.appState?.exportCurrent?.();
      if (result?.canceled) return;
      flashSaved(t('settings.appDataExported', 'App data exported'));
    });
    dialog.querySelector('[data-import-app-state]')?.addEventListener('click', () => confirmAction({ title: t('settings.appDataImportTitle', 'Import app data?'), copy: t('settings.appDataImportDescription', 'Choose a Kairos JSON export. The imported data will replace current app-state after you select a file.'), action: t('settings.chooseFile', 'Choose file'), dangerous: true, onConfirm: async () => {
      const result = await window.kairosDesktop?.appState?.importJson?.();
      if (result?.canceled) return;
      flashSaved(t('settings.appDataImported', 'App data imported'));
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
    if (dialog?.open) {
      const content = dialog.querySelector('.kairos-settings-content');
      const scrollTop = content?.scrollTop || 0;
      const modelPickerOpen = isModelPickerOpen(dialog.querySelector('[data-model-picker]'));
      render();
      requestAnimationFrame(() => {
        if (modelPickerOpen) setModelPickerOpen(dialog.querySelector('[data-model-picker]'), true);
        const refreshedContent = dialog.querySelector('.kairos-settings-content');
        if (refreshedContent) refreshedContent.scrollTop = scrollTop;
      });
    }
  });
  bind();
  window.KairosThemes?.applyTheme?.(state.appearance.theme);
  window.KairosI18n?.setLocale?.(state.general.language);
  window.KairosI18n?.setTimeFormat?.(state.general.timeFormat);
  window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
  readDesktopSettings().then(desktopSettings => {
    if (desktopSettings) state = desktopSettings;
    else writeDesktopSettings(state).catch(error => console.warn('Unable to migrate Kairos settings:', error));
    localStorage.removeItem(STORAGE_KEY);
    applyMotionPreference();
    window.KairosThemes?.applyTheme?.(state.appearance.theme);
    window.KairosI18n?.setLocale?.(state.general.language);
    window.KairosI18n?.setTimeFormat?.(state.general.timeFormat);
    window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
  }).catch(error => console.warn('Unable to load Kairos settings:', error));
  if (document.documentElement instanceof Node) new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
})();
