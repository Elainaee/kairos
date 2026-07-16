(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.KairosCalendarCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

  const pad = value => String(value).padStart(2, '0');
  const isDateKey = value => DATE_RE.test(String(value || ''));

  function dateKey(date = new Date()) {
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  function fromDateKey(key) {
    if (!isDateKey(key)) return new Date(NaN);
    const [year, month, day] = String(key).split('-').map(Number);
    return new Date(year, month - 1, day);
  }

  function shiftDateKey(key, days) {
    const date = fromDateKey(key);
    date.setDate(date.getDate() + Number(days || 0));
    return dateKey(date);
  }

  function weekday(key) {
    return fromDateKey(key).getDay();
  }

  function monthGrid(year, monthIndex, options = {}) {
    const weeks = Math.max(1, Number(options.weeks || 6));
    const firstDayOfWeek = Number(options.firstDayOfWeek || 0);
    const first = new Date(Number(year), Number(monthIndex), 1);
    const offset = (first.getDay() - firstDayOfWeek + 7) % 7;
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);
    const today = options.todayKey || dateKey();
    return Array.from({ length: weeks * 7 }, (_, index) => {
      const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + index);
      const key = dateKey(date);
      return {
        key,
        year: date.getFullYear(),
        monthIndex: date.getMonth(),
        day: date.getDate(),
        weekday: date.getDay(),
        inMonth: date.getMonth() === Number(monthIndex),
        isToday: key === today
      };
    });
  }

  function legacyWeekdays(item = {}) {
    const recurrence = item.recurrence;
    if (recurrence?.frequency === 'weekly' && Array.isArray(recurrence.weekdays) && recurrence.weekdays.length) {
      return new Set(recurrence.weekdays.map(Number).filter(value => value >= 0 && value <= 6));
    }
    const text = `${item.cadence || ''} ${item.notes || ''}`;
    const map = {
      '日': 0, '天': 0, Sun: 0, Sunday: 0,
      '一': 1, Mon: 1, Monday: 1,
      '二': 2, Tue: 2, Tuesday: 2,
      '三': 3, Wed: 3, Wednesday: 3,
      '四': 4, Thu: 4, Thursday: 4,
      '五': 5, Fri: 5, Friday: 5,
      '六': 6, Sat: 6, Saturday: 6
    };
    const values = [];
    for (const match of text.matchAll(/(?:每|周|星期)\s*([日天一二三四五六])/g)) {
      const value = map[match[1]];
      if (value !== undefined) values.push(value);
    }
    for (const match of text.matchAll(/\b(Sun(?:day)?|Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?)\b/gi)) {
      const token = match[1][0].toUpperCase() + match[1].slice(1).toLowerCase();
      const shortToken = token.slice(0, 3);
      const value = map[token] ?? map[shortToken];
      if (value !== undefined) values.push(value);
    }
    return values.length ? new Set(values) : null;
  }

  function scheduleEndDate(item = {}) {
    const naturalEnd = item.end_date || item.date;
    return item.recurrence?.until && item.recurrence.until < naturalEnd ? item.recurrence.until : naturalEnd;
  }

  function coversDate(item = {}, key) {
    if (!isDateKey(item.date) || !isDateKey(key)) return false;
    const end = scheduleEndDate(item);
    if (!isDateKey(end) || item.date > key || end < key) return false;
    const weekdays = legacyWeekdays(item);
    return !weekdays || weekdays.has(weekday(key));
  }

  function timeForDate(item = {}, key) {
    const end = item.end_date || item.date;
    if (item.all_day) return 'All day';
    if (item.date < key && key < end) return 'All day';
    if (key === end && end !== item.date) return item.end_time ? `Until ${item.end_time}` : 'All day';
    return item.start_time || 'TBD';
  }

  function sortTimeForDate(item = {}, key) {
    const label = timeForDate(item, key);
    return label === 'All day' || label.startsWith('Until ') ? '00:00' : item.start_time || '99:99';
  }

  function minutesForTime(value) {
    const match = String(value || '').match(/^(\d{2}):(\d{2})$/);
    if (!match) return null;
    const hours = Number(match[1]);
    const minutes = Number(match[2]);
    return hours < 24 && minutes < 60 ? hours * 60 + minutes : null;
  }

  function timeForMinutes(value) {
    const minutes = Math.max(0, Math.min(1439, Math.floor(Number(value) || 0)));
    return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
  }

  function shiftTimeRange(startTime, endTime, deltaMinutes = 15) {
    const start = minutesForTime(startTime);
    const end = minutesForTime(endTime);
    if (start === null || end === null) return null;

    const duration = Math.max(15, end - start || 60);
    if (duration > 1439) return null;
    const nextStart = Math.max(0, Math.min(1439 - duration, start + Number(deltaMinutes || 0)));
    return {
      start_time: timeForMinutes(nextStart),
      end_time: timeForMinutes(nextStart + duration)
    };
  }

  function schedulesForDate(schedules = [], key, statusFn) {
    return schedules
      .filter(item => coversDate(item, key))
      .sort((a, b) => {
        if (typeof statusFn === 'function') {
          const doneDelta = (statusFn(a) === 'done') - (statusFn(b) === 'done');
          if (doneDelta) return doneDelta;
        }
        return sortTimeForDate(a, key).localeCompare(sortTimeForDate(b, key));
      });
  }

  return {
    dateKey,
    fromDateKey,
    shiftDateKey,
    weekday,
    monthGrid,
    legacyWeekdays,
    scheduleEndDate,
    coversDate,
    timeForDate,
    sortTimeForDate,
    minutesForTime,
    timeForMinutes,
    shiftTimeRange,
    schedulesForDate,
    isDateKey
  };
});
