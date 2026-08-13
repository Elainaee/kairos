(() => {
  if (window.KairosThemes) return;

  const DEFAULT_THEME = 'claude-plus';
  const themes = Object.freeze([
    Object.freeze({
      id: DEFAULT_THEME,
      name: 'Claude +',
      description: 'Warm, editorial neutrals with a terracotta primary colour.'
    })
  ]);
  const ids = new Set(themes.map(theme => theme.id));
  const themeCoreUrl = document.currentScript?.src || new URL('theme-core.js', window.location.href).href;
  const normalizeTheme = value => ids.has(String(value || '')) ? String(value) : DEFAULT_THEME;
  const applyTheme = value => {
    const theme = normalizeTheme(value);
    const root = document.documentElement;
    let stylesheet = document.querySelector('link[data-kairos-theme-stylesheet]');
    if (!stylesheet) {
      stylesheet = document.createElement('link');
      stylesheet.rel = 'stylesheet';
      stylesheet.dataset.kairosThemeStylesheet = 'true';
      document.head.append(stylesheet);
    }
    const stylesheetUrl = new URL(`${theme}.css`, themeCoreUrl).href;
    // Reassigning an identical href makes Chromium reload the stylesheet.  In
    // an embedded document that can briefly expose the unthemed page while it
    // is repainted, so only change it when the selected theme actually moves.
    if (stylesheet.href !== stylesheetUrl) stylesheet.href = stylesheetUrl;
    const previous = root.dataset.kairosTheme;
    root.dataset.kairosTheme = theme;
    themes.forEach(item => root.classList.toggle(`kairos-theme-${item.id}`, item.id === theme));
    if (previous !== theme) window.dispatchEvent(new CustomEvent('kairos:theme-changed', { detail: { theme } }));
    return theme;
  };
  window.KairosThemes = Object.freeze({
    defaultTheme: DEFAULT_THEME,
    list: () => themes.map(theme => ({ ...theme })),
    normalizeTheme,
    applyTheme,
    getTheme: () => normalizeTheme(document.documentElement.dataset.kairosTheme)
  });
  applyTheme();
})();
