(() => {
  if (window.KairosSettingsFeature) return;

  const STORAGE_KEY = 'kairos-settings';
  const defaults = {
    general: { language: 'system', timeFormat: 'system' },
    appearance: { theme: 'system' },
    ai: { replyStyle: 'companion', memoryEnabled: true, webSearchMode: 'ask' }
  };
  const sections = [
    ['general', 'tune', 'General'],
    ['appearance', 'palette', 'Appearance'],
    ['agent', 'smart_toy', 'Agent'],
    ['music', 'queue_music', 'Music'],
    ['data', 'database', 'Data']
  ];
  const choices = {
    language: [['system', 'System default'], ['en', 'English'], ['zh-CN', 'Simplified Chinese']],
    timeFormat: [['system', 'System default'], ['12h', '12-hour'], ['24h', '24-hour']],
    theme: [['system', 'System default'], ['light', 'Light'], ['dark', 'Dark']],
    replyStyle: [['companion', 'Warm companion'], ['concise', 'Concise execution'], ['learning', 'Focused learning']],
    webSearchMode: [['ask', 'Ask every time'], ['off', 'Off']]
  };
  const merge = input => ({
    general: { ...defaults.general, ...(input?.general || {}) },
    appearance: { ...defaults.appearance, ...(input?.appearance || {}) },
    ai: { ...defaults.ai, ...(input?.ai || {}) }
  });
  const read = () => { try { return merge(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}')); } catch { return merge({}); } };

  let state = read();
  let dialog;
  let activeSection = 'general';
  let previousFocus;
  let providerCatalog = [];
  let providerSettings;
  let neteaseStatus;
  let statusTimer;
  const agentProviderIds = new Set(['openai', 'doubao']);

  const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const toast = (title, type = 'success', description = '') => window.dispatchEvent(new CustomEvent('kairos:toast', { detail: { type, title, description } }));
  const persist = patch => {
    state = merge({ ...state, ...patch, ai: { ...state.ai, ...(patch.ai || {}) } });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
    flashSaved();
  };
  const flashSaved = (message = 'Saved') => {
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
    const models = catalogEntry?.models || [entry.model || ''];
    return `
      <div class="kairos-settings-group">
        ${select('kairosAgentProvider', 'Default provider', provider, availableProviders.map(item => [item.id, item.name]), 'provider')}
        ${select('kairosAgentModel', 'Default model', entry.model || models[0] || '', models.map(model => [model, model]), 'model')}
      </div>
      ${credentialRow('provider', 'Model API Key', entry.configured, entry.createdAt, entry.keyHint, entry.source)}
      <div class="kairos-key-utility"><button type="button" data-test-provider><span class="material-symbols-outlined">network_check</span>Test connection</button><output data-test-result aria-live="polite"></output></div>`;
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
  const musicMarkup = () => {
    const profile = neteaseStatus?.loggedIn ? neteaseStatus.profile || {} : null;
    const brand = '<span class="kairos-netease-brand"><img src="assets/netease-format.ico" alt="" aria-hidden="true">Netease Music</span>';
    if (!profile) return sectionView('music', 'Music', `${card(brand, `<div class="kairos-netease-account is-signed-out"><span class="material-symbols-outlined" aria-hidden="true">account_circle</span><strong>Not signed in</strong><button type="button" data-netease-login>Log in</button></div>`)}`);
    const avatar = String(profile.avatarUrl || '').trim();
    const name = escapeHtml(profile.nickname || 'NetEase Cloud');
    const userId = profile.userId ? `<span>ID ${escapeHtml(profile.userId)}</span>` : '';
    return sectionView('music', 'Music', `${card(brand, `<div class="kairos-netease-account"><span class="kairos-netease-avatar">${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : '<span class="material-symbols-outlined" aria-hidden="true">account_circle</span>'}</span><span class="kairos-netease-account-copy"><strong>${name}</strong>${userId}</span><button type="button" data-netease-logout>Log out</button></div>`)}`);
  };
  const render = () => {
    dialog.innerHTML = `
      <form method="dialog" class="kairos-settings-panel">
        <aside class="kairos-settings-sidebar"><button class="kairos-settings-back" type="button" data-settings-back aria-label="Back" title="Back"><span class="material-symbols-outlined">arrow_back</span></button><span class="kairos-settings-kicker">Preferences</span><h2 id="kairosSettingsTitle">Setting</h2><nav class="kairos-settings-nav" aria-label="Settings categories">${sections.map(([id, icon, label]) => `<button class="${id === activeSection ? 'active' : ''}" data-settings-tab="${id}" type="button"><span class="material-symbols-outlined">${icon}</span><span>${label}</span></button>`).join('')}</nav></aside>
        <div class="kairos-settings-content">
          ${sectionView('general', 'General', `<div class="kairos-settings-group">${select('kairosLanguage', 'Language', state.general.language, choices.language, 'general.language')}${select('kairosTimeFormat', 'Time format', state.general.timeFormat, choices.timeFormat, 'general.timeFormat')}</div>`)}
          ${sectionView('appearance', 'Appearance', `<div class="kairos-settings-group">${select('kairosTheme', 'Theme mode', state.appearance.theme, choices.theme, 'appearance.theme')}</div>`)}
          ${agentMarkup()}
          ${musicMarkup()}
          ${sectionView('data', 'Data', `<div class="kairos-settings-empty"><span class="material-symbols-outlined">database</span><p>Coming soon</p></div>`)}
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
      inputNode.type = 'password';
      inputNode.autocomplete = 'off';
      inputNode.placeholder = input.placeholder || 'Enter API key';
      modal.querySelector('footer').before(inputNode);
    }
    modal.hidden = false;
    (inputNode || accept).focus();
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
    copy.textContent = 'Scan the QR code with the Netease Music app.';
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
    [providerCatalog, providerSettings, neteaseStatus] = await Promise.all([
      window.kairosDesktop.listProviders(),
      window.kairosDesktop.getProviderSettings(),
      window.kairosDesktop.netease?.getStatus ? window.kairosDesktop.netease.getStatus().catch(() => null) : Promise.resolve(null)
    ]);
  };
  const saveProvider = async input => {
    providerSettings = await window.kairosDesktop.saveProviderSettings(input);
    render();
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
  const bindDialog = () => {
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
      if (path === 'model') {
        const provider = providerSettings?.defaultProvider || providerCatalog[0]?.id;
        await saveProvider({ provider, defaultProvider: provider, model: event.target.value, credentialMode: providerSettings?.providers?.[provider]?.credentialMode || 'session' });
        return;
      }
      setByPath(path, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
    }));
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
  bind();
  window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
  new MutationObserver(bind).observe(document.documentElement, { childList: true, subtree: true });
})();
