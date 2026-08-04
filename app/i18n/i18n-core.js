(() => {
  if (window.KairosI18n) return;

  const DEFAULT_LOCALE = 'en';
  const SUPPORTED_LOCALES = new Set(['en', 'zh-CN']);
  const messages = {
    en: {
      'nav.primary': 'Primary navigation', 'nav.calendar': 'Calendar', 'nav.habits': 'Habits', 'nav.schedule': 'Schedule', 'nav.music': 'Music',
      'common.createNew': 'Create New', 'common.settings': 'Settings', 'common.reminders': 'Reminders', 'common.close': 'Close', 'common.cancel': 'Cancel', 'common.save': 'Save', 'common.delete': 'Delete', 'common.details': 'Details', 'common.complete': 'Complete',
      'settings.preferences': 'Preferences', 'settings.title': 'Settings', 'settings.general': 'General', 'settings.appearance': 'Appearance', 'settings.reminders': 'Reminders', 'settings.agent': 'Agent', 'settings.music': 'Music', 'settings.data': 'Data',
      'settings.language': 'Language', 'settings.timeFormat': 'Time format', 'settings.systemDefault': 'System default', 'settings.english': 'English', 'settings.simplifiedChinese': 'Simplified Chinese', 'settings.12hour': '12-hour', 'settings.24hour': '24-hour',
      'settings.themeMode': 'Theme mode', 'settings.light': 'Light', 'settings.dark': 'Dark', 'settings.reduceMotion': 'Reduce motion', 'settings.defaultRules': 'Default Rules', 'settings.deadlineDefault': 'Deadline default', 'settings.eventDefault': 'Event default', 'settings.matchDefault': 'Match default', 'settings.snoozeDuration': 'Snooze duration', 'settings.windowsNotifications': 'Windows notifications', 'settings.windowsNotificationsHint': 'When off, in-app reminders and the desktop pet stay available.',
      'settings.appData': 'App Data', 'settings.exportAppData': 'Export app data', 'settings.importJson': 'Import JSON', 'settings.export': 'export', 'settings.import': 'import', 'settings.saved': 'Saved',
      'reminders.panel': 'Reminders panel', 'reminders.none': 'No reminders', 'reminders.noneHint': 'Upcoming reminders will appear here.', 'reminders.scheduled': 'Scheduled', 'reminders.dismiss': 'Dismiss reminder', 'reminders.snooze': '10 minutes',
      'time.none': 'No reminder', 'time.atStart': 'At start time', 'time.minutes': '{count} minutes', 'time.minutesBefore': '{count} minutes before', 'time.hourBefore': '1 hour before', 'time.dayBefore': '1 day before',
      'app.title.calendar': 'Clarity Calendar | Intentional Dashboard', 'app.title.music': 'Clarity Calendar | Music', 'app.title.schedule': 'Clarity Calendar | Schedule'
    },
    'zh-CN': {
      'nav.primary': '主导航', 'nav.calendar': '日历', 'nav.habits': '习惯', 'nav.schedule': '日程', 'nav.music': '音乐',
      'common.createNew': '新建', 'common.settings': '设置', 'common.reminders': '提醒', 'common.close': '关闭', 'common.cancel': '取消', 'common.save': '保存', 'common.delete': '删除', 'common.details': '详情', 'common.complete': '完成',
      'settings.preferences': '偏好设置', 'settings.title': '设置', 'settings.general': '通用', 'settings.appearance': '外观', 'settings.reminders': '提醒', 'settings.agent': '智能助手', 'settings.music': '音乐', 'settings.data': '数据',
      'settings.language': '语言', 'settings.timeFormat': '时间格式', 'settings.systemDefault': '跟随系统', 'settings.english': 'English', 'settings.simplifiedChinese': '简体中文', 'settings.12hour': '12 小时制', 'settings.24hour': '24 小时制',
      'settings.themeMode': '主题模式', 'settings.light': '浅色', 'settings.dark': '深色', 'settings.reduceMotion': '减少动态效果', 'settings.defaultRules': '默认规则', 'settings.deadlineDefault': '截止日期默认提醒', 'settings.eventDefault': '日程默认提醒', 'settings.matchDefault': '比赛默认提醒', 'settings.snoozeDuration': '稍后提醒时长', 'settings.windowsNotifications': 'Windows 通知', 'settings.windowsNotificationsHint': '关闭后，应用内提醒与桌面宠物仍会正常运行。',
      'settings.appData': '应用数据', 'settings.exportAppData': '导出应用数据', 'settings.importJson': '导入 JSON', 'settings.export': '导出', 'settings.import': '导入', 'settings.saved': '已保存',
      'reminders.panel': '提醒面板', 'reminders.none': '暂无提醒', 'reminders.noneHint': '即将到来的提醒会显示在这里。', 'reminders.scheduled': '计划于', 'reminders.dismiss': '关闭提醒', 'reminders.snooze': '10 分钟后',
      'time.none': '不提醒', 'time.atStart': '开始时', 'time.minutes': '{count} 分钟', 'time.minutesBefore': '提前 {count} 分钟', 'time.hourBefore': '提前 1 小时', 'time.dayBefore': '提前 1 天',
      'app.title.calendar': 'Kairos | 专注日历', 'app.title.music': 'Kairos | 音乐', 'app.title.schedule': 'Kairos | 日程'
    }
  };

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
  let preference = 'system';
  let locale = resolveLocale(preference);
  let timeFormat = 'system';

  const applyDocumentLocale = () => {
    if (!document.documentElement) return;
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
    document.documentElement.dataset.kairosLocale = locale;
  };
  const interpolate = (template, params) => template.replace(/\{(\w+)\}/g, (_match, key) => String(params?.[key] ?? `{${key}}`));
  const t = (key, params) => interpolate(messages[locale]?.[key] || messages[DEFAULT_LOCALE]?.[key] || key, params);
  const translateDom = (root = document) => {
    const scope = root?.querySelectorAll ? root : document;
    scope.querySelectorAll?.('[data-i18n]').forEach(node => { node.textContent = t(node.dataset.i18n); });
    scope.querySelectorAll?.('[data-i18n-placeholder]').forEach(node => { node.placeholder = t(node.dataset.i18nPlaceholder); });
    scope.querySelectorAll?.('[data-i18n-title]').forEach(node => { node.title = t(node.dataset.i18nTitle); });
    scope.querySelectorAll?.('[data-i18n-aria-label]').forEach(node => { node.setAttribute('aria-label', t(node.dataset.i18nAriaLabel)); });
  };
  const setLocale = nextPreference => {
    preference = nextPreference === 'system' ? 'system' : normalizeLocale(nextPreference) || 'system';
    const previous = locale;
    locale = resolveLocale(preference);
    applyDocumentLocale();
    translateDom();
    if (previous !== locale) window.dispatchEvent(new CustomEvent('kairos:locale-changed', { detail: { locale, preference } }));
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
    const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return String(value || '');
    const date = new Date(2000, 0, 1, Number(match[1]), Number(match[2]));
    return formatDate(date, { hour: 'numeric', minute: '2-digit', ...options });
  };
  const formatNumber = (value, options = {}) => new Intl.NumberFormat(locale, options).format(value);

  window.KairosI18n = Object.freeze({ t, setLocale, resolveLocale, normalizeLocale, getLocale: () => locale, getPreference: () => preference, setTimeFormat, getTimeFormat: () => timeFormat, formatDate, formatTime, formatNumber, translateDom, supportedLocales: () => [...SUPPORTED_LOCALES] });
  applyDocumentLocale();
  translateDom();
})();
