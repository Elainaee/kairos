(() => {
  if (window.KairosSettingsFeature) return;

  const STORAGE_KEY = 'kairos-settings';
  const defaults = {
    general: { language: 'system', timeFormat: 'system' },
    appearance: { theme: 'system' }
  };
  const options = {
    language: [
      ['system', 'System default'],
      ['en', 'English'],
      ['zh-CN', '\u7b80\u4f53\u4e2d\u6587']
    ],
    timeFormat: [
      ['system', 'System default'],
      ['12h', '12-hour'],
      ['24h', '24-hour']
    ],
    theme: [
      ['system', 'System'],
      ['light', 'Light'],
      ['dark', 'Dark']
    ]
  };
  const sections = [
    ['general', 'tune', 'General'],
    ['appearance', 'palette', 'Appearance'],
    ['assistant', 'smart_toy', 'Assistant'],
    ['music', 'queue_music', 'Music'],
    ['data', 'database', 'Data']
  ];

  const cloneDefaults = () => ({
    general: { ...defaults.general },
    appearance: { ...defaults.appearance }
  });

  const normalize = input => {
    const next = cloneDefaults();
    if (input?.general) next.general = { ...next.general, ...input.general };
    if (input?.appearance) next.appearance = { ...next.appearance, ...input.appearance };
    if (!options.language.some(([value]) => value === next.general.language)) next.general.language = defaults.general.language;
    if (!options.timeFormat.some(([value]) => value === next.general.timeFormat)) next.general.timeFormat = defaults.general.timeFormat;
    if (!options.theme.some(([value]) => value === next.appearance.theme)) next.appearance.theme = defaults.appearance.theme;
    return next;
  };

  const read = () => {
    try {
      return normalize(JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'));
    } catch {
      return cloneDefaults();
    }
  };

  let state = read();
  let dialog;
  let previousFocus;
  let activeSection = 'general';

  const emit = () => {
    window.dispatchEvent(new CustomEvent('kairos:settings-changed', { detail: state }));
  };

  const save = (patch, toast = true) => {
    state = normalize({
      general: { ...state.general, ...(patch.general || {}) },
      appearance: { ...state.appearance, ...(patch.appearance || {}) }
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    emit();
    if (toast) {
      window.dispatchEvent(new CustomEvent('kairos:toast', {
        detail: { type: 'success', title: 'Settings updated' }
      }));
    }
  };

  const selectMarkup = (id, label, value, rows) => `
    <label class="kairos-setting-row" for="${id}">
      <span class="kairos-setting-copy">
        <span class="kairos-setting-label">${label}</span>
      </span>
      <span class="kairos-select-wrap">
        <select id="${id}">
          ${rows.map(([optionValue, optionLabel]) => `<option value="${optionValue}" ${optionValue === value ? 'selected' : ''}>${optionLabel}</option>`).join('')}
        </select>
        <span class="material-symbols-outlined" aria-hidden="true">expand_more</span>
      </span>
    </label>`;

  const emptyPanelMarkup = (id, title, icon, copy) => `
    <section class="kairos-settings-section kairos-settings-panel-view" data-settings-panel="${id}" aria-labelledby="kairos${title}SettingsTitle" hidden>
      <h3 id="kairos${title}SettingsTitle">${title}</h3>
      <div class="kairos-settings-empty">
        <span class="material-symbols-outlined" aria-hidden="true">${icon}</span>
        <p>${copy}</p>
      </div>
    </section>`;

  const showSection = id => {
    activeSection = id;
    const current = sections.find(([sectionId]) => sectionId === id) || sections[0];
    dialog?.querySelectorAll('[data-settings-tab]').forEach(tab => {
      const active = tab.dataset.settingsTab === id;
      tab.classList.toggle('active', active);
      tab.setAttribute('aria-selected', String(active));
    });
    dialog?.querySelectorAll('[data-settings-panel]').forEach(panel => {
      panel.hidden = panel.dataset.settingsPanel !== id;
    });
    const title = dialog?.querySelector('#kairosSettingsActiveTitle');
    if (title) title.textContent = current[2];
  };

  const buildDialog = () => {
    dialog = document.createElement('dialog');
    dialog.className = 'kairos-settings-dialog';
    dialog.setAttribute('aria-labelledby', 'kairosSettingsTitle');
    dialog.innerHTML = `
      <form method="dialog" class="kairos-settings-panel">
        <aside class="kairos-settings-sidebar">
          <span class="kairos-settings-kicker">Preferences</span>
          <h2 id="kairosSettingsTitle">Settings</h2>
          <nav class="kairos-settings-nav" aria-label="Settings sections" role="tablist">
            ${sections.map(([id, icon, label]) => `<button class="${id === activeSection ? 'active' : ''}" data-settings-tab="${id}" role="tab" aria-selected="${id === activeSection}" type="button"><span class="material-symbols-outlined">${icon}</span><span>${label}</span></button>`).join('')}
          </nav>
        </aside>
        <div class="kairos-settings-content">
          <header class="kairos-settings-header">
            <div>
              <span class="kairos-settings-content-kicker">Section</span>
              <strong id="kairosSettingsActiveTitle">General</strong>
            </div>
            <button class="kairos-settings-close" value="cancel" aria-label="Close settings" type="submit">
              <span class="material-symbols-outlined">close</span>
            </button>
          </header>
          <section class="kairos-settings-section kairos-settings-panel-view" data-settings-panel="general" aria-labelledby="kairosGeneralSettingsTitle">
            <h3 id="kairosGeneralSettingsTitle">General</h3>
            <div class="kairos-settings-group">
              ${selectMarkup('kairosSettingLanguage', 'Language', state.general.language, options.language)}
              ${selectMarkup('kairosSettingTimeFormat', 'Time format', state.general.timeFormat, options.timeFormat)}
            </div>
          </section>
          <section class="kairos-settings-section kairos-settings-panel-view" data-settings-panel="appearance" aria-labelledby="kairosAppearanceSettingsTitle" hidden>
            <h3 id="kairosAppearanceSettingsTitle">Appearance</h3>
            <div class="kairos-settings-group">
              ${selectMarkup('kairosSettingTheme', 'Theme mode', state.appearance.theme, options.theme)}
            </div>
            <p class="kairos-settings-note">Dark theme colors will be wired in after the palette is finalized.</p>
          </section>
          ${emptyPanelMarkup('assistant', 'Assistant', 'smart_toy', 'Assistant settings will live here when provider controls are ready.')}
          ${emptyPanelMarkup('music', 'Music', 'queue_music', 'Music preferences will live here when account and quality settings are ready.')}
          ${emptyPanelMarkup('data', 'Data', 'database', 'Data controls will be added after persistence decisions settle.')}
        </div>
      </form>`;
    document.body.append(dialog);

    dialog.addEventListener('close', () => {
      previousFocus?.focus?.();
      previousFocus = null;
    });
    dialog.addEventListener('click', event => {
      if (event.target === dialog) dialog.close();
    });
    dialog.querySelector('#kairosSettingLanguage')?.addEventListener('change', event => {
      save({ general: { language: event.target.value } });
    });
    dialog.querySelector('#kairosSettingTimeFormat')?.addEventListener('change', event => {
      save({ general: { timeFormat: event.target.value } });
    });
    dialog.querySelector('#kairosSettingTheme')?.addEventListener('change', event => {
      save({ appearance: { theme: event.target.value } });
    });
    dialog.querySelectorAll('[data-settings-tab]').forEach(tab => {
      tab.addEventListener('click', () => showSection(tab.dataset.settingsTab));
    });
    showSection(activeSection);
  };

  const open = source => {
    if (!dialog) buildDialog();
    if (dialog.open) return;
    previousFocus = source || document.activeElement;
    dialog.showModal();
    dialog.querySelector('[data-settings-tab].active, select, button')?.focus();
  };

  const bind = () => {
    document.querySelectorAll('.kairos-settings-button').forEach(button => {
      if (button.dataset.settingsBound === '1') return;
      button.dataset.settingsBound = '1';
      button.addEventListener('click', () => open(button));
    });
  };

  window.KairosSettingsFeature = Object.freeze({ open, read: () => state, save });
  bind();
  emit();

  const observer = new MutationObserver(bind);
  observer.observe(document.documentElement, { childList: true, subtree: true });
})();
