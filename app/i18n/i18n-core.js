(() => {
  if (window.KairosI18n) return;

  const DEFAULT_LOCALE = 'en';
  const SUPPORTED_LOCALES = new Set(['en', 'zh-CN']);
  const rawMessages = window.KairosI18nMessages || {};
  const flatten = (value, prefix = '', target = {}) => {
    for (const [key, child] of Object.entries(value || {})) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      if (child && typeof child === 'object' && !Array.isArray(child)) flatten(child, fullKey, target);
      else target[fullKey] = child;
    }
    return target;
  };
  const messages = Object.fromEntries([...SUPPORTED_LOCALES].map(locale => [locale, flatten(rawMessages[locale])]));
  const missingKeys = new Set();

  const normalizeLocale = value => {
    const candidate = String(value || '').replace('_', '-').trim();
    if (/^zh(?:-|$)/i.test(candidate)) return 'zh-CN';
    if (/^en(?:-|$)/i.test(candidate)) return 'en';
    return '';
  };
  const systemLocale = () => {
    const languages = Array.isArray(navigator.languages) && navigator.languages.length ? navigator.languages : [navigator.language];
    return languages.map(normalizeLocale).find(Boolean) || DEFAULT_LOCALE;
  };
  const resolveLocale = preference => preference === 'system' || !preference ? systemLocale() : normalizeLocale(preference) || DEFAULT_LOCALE;
  const isDevelopment = () => !window.KairosRuntime?.isProduction && !window.__KAIROS_PRODUCTION__;
  let preference = 'en';
  let locale = resolveLocale(preference);
  let timeFormat = 'system';

  const applyDocumentLocale = () => {
    if (!document.documentElement) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
    document.documentElement.dataset.kairosLocale = locale;
  };
  const interpolate = (template, params) => String(template).replace(/\{(\w+)\}/g, (_match, key) => String(params?.[key] ?? `{${key}}`));
  const lookup = (catalog, key) => catalog?.[key];
  const t = (key, params, fallback) => {
    const localized = lookup(messages[locale], key);
    const english = lookup(messages[DEFAULT_LOCALE], key);
    const template = localized ?? english ?? fallback;
    if (template == null) {
      if (isDevelopment() && !missingKeys.has(key)) {
        missingKeys.add(key);
        console.warn(`[KairosI18n] Missing translation key: ${key}`);
      }
      return key;
    }
    return interpolate(template, params);
  };
  const plural = (key, count, params = {}, fallback) => {
    const category = new Intl.PluralRules(locale).select(Number(count));
    const selectedKey = category === 'one' ? key : `${key}_${category}`;
    return t(selectedKey, { ...params, count }, t(key, { ...params, count }, fallback));
  };
  const readParams = node => {
    try { return node.dataset.i18nParams ? JSON.parse(node.dataset.i18nParams) : undefined; }
    catch { return undefined; }
  };
  const eachTranslationNode = (root, selector, callback) => {
    const scope = root?.querySelectorAll ? root : document;
    if (scope?.matches?.(selector)) callback(scope);
    scope?.querySelectorAll?.(selector).forEach(callback);
  };
  const translateDom = (root = document) => {
    eachTranslationNode(root, '[data-i18n]', node => { node.textContent = t(node.dataset.i18n, readParams(node)); });
    eachTranslationNode(root, '[data-i18n-placeholder]', node => { node.placeholder = t(node.dataset.i18nPlaceholder, readParams(node)); });
    eachTranslationNode(root, '[data-i18n-title]', node => { node.title = t(node.dataset.i18nTitle, readParams(node)); });
    eachTranslationNode(root, '[data-i18n-aria-label]', node => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel, readParams(node))); });
    eachTranslationNode(root, '[data-i18n-alt]', node => { node.setAttribute('alt', t(node.dataset.i18nAlt, readParams(node))); });
    eachTranslationNode(root, '[data-i18n-value]', node => { node.value = t(node.dataset.i18nValue, readParams(node)); });
  };
  const setLocale = nextPreference => {
    const previousLocale = locale;
    const previousPreference = preference;
    preference = nextPreference === 'system' ? 'system' : normalizeLocale(nextPreference) || 'system';
    locale = resolveLocale(preference);
    applyDocumentLocale();
    translateDom();
    if (previousLocale !== locale || previousPreference !== preference) {
      window.dispatchEvent(new CustomEvent('kairos:locale-changed', { detail: { locale, preference } }));
    }
    return locale;
  };
  const normalizeTimeFormat = value => ['system', '12h', '24h'].includes(value) ? value : 'system';
  const timeFormatOptions = options => {
    const includesTime = ['hour', 'minute', 'second', 'timeStyle'].some(key => key in options);
    if (!includesTime || 'hour12' in options || timeFormat === 'system') return options;
    return { ...options, hour12: timeFormat === '12h' };
  };
  const setTimeFormat = value => {
    const next = normalizeTimeFormat(value);
    if (timeFormat === next) return timeFormat;
    timeFormat = next;
    window.dispatchEvent(new CustomEvent('kairos:time-format-changed', { detail: { timeFormat } }));
    return timeFormat;
  };
  const formatDate = (value, options = {}) => new Intl.DateTimeFormat(locale, timeFormatOptions(options)).format(value);
  const formatTime = (value, options = {}) => {
    const raw = String(value ?? '');
    const match = raw.match(/^(\d{1,2}):(\d{2})$/);
    const date = match
      ? new Date(2000, 0, 1, Number(match[1]), Number(match[2]))
      : value instanceof Date
        ? value
        : new Date(value);
    if (Number.isNaN(date.getTime())) return raw;
    return formatDate(date, { hour: 'numeric', minute: '2-digit', ...options });
  };
  const formatDateRange = (start, end, options = {}) => {
    const formatter = new Intl.DateTimeFormat(locale, timeFormatOptions(options));
    if (!end || Number(new Date(start)) === Number(new Date(end))) return formatter.format(new Date(start));
    return typeof formatter.formatRange === 'function'
      ? formatter.formatRange(new Date(start), new Date(end))
      : `${formatter.format(new Date(start))} – ${formatter.format(new Date(end))}`;
  };
  const formatRelativeTime = (value, unit = 'day', options = {}) => new Intl.RelativeTimeFormat(locale, { numeric: 'auto', ...options }).format(value, unit);
  const formatNumber = (value, options = {}) => new Intl.NumberFormat(locale, options).format(value);

  window.KairosI18n = Object.freeze({
    t, plural, setLocale, resolveLocale, normalizeLocale, getLocale: () => locale, getPreference: () => preference,
    setTimeFormat, getTimeFormat: () => timeFormat, formatDate, formatTime, formatDateRange, formatRelativeTime,
    formatNumber, translateDom, supportedLocales: () => [...SUPPORTED_LOCALES]
  });
  window.addEventListener('message', event => {
    const syncedPreference = event.data?.preference || event.data?.locale;
    if (event.data?.type === 'kairos:locale-sync' && syncedPreference) setLocale(syncedPreference);
  });
  applyDocumentLocale();
  translateDom();
  // Most legacy pages load this runtime in <head>, before their translated DOM
  // exists. Re-scan once the document is complete so the initial locale does
  // not depend on a later iframe locale-sync message.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => translateDom(), { once: true });
  }
})();
