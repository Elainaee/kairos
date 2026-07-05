const GAME_ALIASES = {
  valorant: ["valorant", "vct", "无畏契约", "瓦", "瓦里"]
};

const TRUSTED_HOST_HINTS = [
  "vlr.gg",
  "valorantesports.com",
  "liquipedia.net",
  "thespike.gg"
];

const TEAM_PROFILE_URLS = {
  valorant: {
    EDG: "https://www.vlr.gg/team/1120/edward-gaming"
  }
};

const PREFERRED_LEAGUE_URLS = {
  valorant: [
    {
      name: "VALORANT Esports official leagues",
      url: "https://valorantesports.com/zh-TW/leagues/champions,game_changers_championship,vct_masters",
      host: "valorantesports.com",
      source: "direct",
      trusted: true,
      query: "direct-official-leagues"
    }
  ]
};

function decodeHtml(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'");
}

function stripTags(value = "") {
  return decodeHtml(String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function toTime24(value = "") {
  const match = String(value).trim().match(/^(\d{1,2}):(\d{2})\s*(am|pm)?$/i);
  if (!match) return "";
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = match[3]?.toLowerCase();
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function datePartsInShanghai(value) {
  const date = new Date(value);
  if (Number.isNaN(+date)) return { date: "", time: "" };
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

function daysBetween(a, b) {
  if (!a || !b) return 0;
  const left = new Date(`${a}T00:00:00Z`);
  const right = new Date(`${b}T00:00:00Z`);
  if (Number.isNaN(+left) || Number.isNaN(+right)) return Infinity;
  return Math.abs((+left - +right) / 86400000);
}

function compactKey(value = "") {
  return String(value).toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, "");
}

function matchIdentity(item) {
  return `${compactKey(item.team)}|${compactKey(item.opponent || item.title)}`;
}

function normalizeGame(input = "") {
  const value = String(input).trim().toLowerCase();
  for (const [game, aliases] of Object.entries(GAME_ALIASES)) {
    if (aliases.some(alias => value === alias.toLowerCase() || value.includes(alias.toLowerCase()))) return game;
  }
  return value || "unknown";
}

function buildSearchQuery({ game, team, range }) {
  const gameQuery = game === "valorant" ? "Valorant VCT" : game;
  const rangeQuery = range === "upcoming" ? "upcoming matches schedule" : range === "past" ? "recent results matches" : "recent upcoming matches schedule";
  return `${team} ${gameQuery} ${rangeQuery}`;
}

function buildSearchQueries(input) {
  const base = buildSearchQuery(input);
  if (input.game !== "valorant") return [base];
  return [
    `site:vlr.gg ${input.team} Valorant matches`,
    `site:valorantesports.com ${input.team} VCT schedule`,
    `site:liquipedia.net/valorant ${input.team} matches`,
    base
  ];
}

function parseDuckDuckGoResults(html) {
  const rows = [];
  const pattern = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    let url = decodeHtml(match[1]);
    const title = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    try {
      const parsed = new URL(url);
      if (parsed.hostname.includes("duckduckgo.com") && parsed.searchParams.get("uddg")) url = parsed.searchParams.get("uddg");
      const finalUrl = new URL(url);
      if (!["http:", "https:"].includes(finalUrl.protocol)) continue;
      rows.push({
        name: title || finalUrl.hostname,
        url: finalUrl.href,
        host: finalUrl.hostname.replace(/^www\./, ""),
        source: "duckduckgo"
      });
    } catch {
      // Ignore malformed search results.
    }
  }
  return rows;
}

function parseBingResults(html) {
  const rows = [];
  const pattern = /<li class="b_algo"[\s\S]*?<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/li>/gi;
  let match;
  while ((match = pattern.exec(html))) {
    const url = decodeHtml(match[1]);
    const title = decodeHtml(match[2].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
    try {
      const finalUrl = new URL(url);
      if (!["http:", "https:"].includes(finalUrl.protocol)) continue;
      rows.push({
        name: title || finalUrl.hostname,
        url: finalUrl.href,
        host: finalUrl.hostname.replace(/^www\./, ""),
        source: "bing"
      });
    } catch {
      // Ignore malformed search results.
    }
  }
  return rows;
}

function rankSources(rows) {
  return rows
    .map((row, index) => ({
      ...row,
      rank: index,
      trusted: TRUSTED_HOST_HINTS.some(host => row.host.endsWith(host))
    }))
    .sort((a, b) => Number(b.trusted) - Number(a.trusted) || a.rank - b.rank);
}

async function searchDuckDuckGo(query, limit) {
  const url = new URL("https://duckduckgo.com/html/");
  url.searchParams.set("q", query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "Kairos/1.0 esports-source-search"
      }
    });
    if (!response.ok) throw new Error(`search_failed_${response.status}`);
    return rankSources(parseDuckDuckGoResults(await response.text())).slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

async function searchBing(query, limit) {
  const url = new URL("https://www.bing.com/search");
  url.searchParams.set("q", query);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "Kairos/1.0 esports-source-search"
      }
    });
    if (!response.ok) throw new Error(`search_failed_${response.status}`);
    return rankSources(parseBingResults(await response.text())).slice(0, limit);
  } finally {
    clearTimeout(timer);
  }
}

async function searchSourceCandidates(queries, limit) {
  const seen = new Set();
  const output = [];
  const errors = [];
  for (const query of queries) {
    try {
      let rows = await searchDuckDuckGo(query, limit);
      if (!rows.length) rows = await searchBing(query, limit);
      for (const row of rows) {
        const key = row.url.replace(/[#?].*$/, "");
        if (seen.has(key)) continue;
        seen.add(key);
        output.push({ ...row, query });
        if (output.length >= limit) return output;
      }
    } catch (error) {
      errors.push(`${query}: ${error.message}`);
    }
  }
  if (!output.length && errors.length) throw new Error(errors.join("; "));
  return output;
}

function directProfileSources({ game, team }) {
  const sources = [];
  const url = TEAM_PROFILE_URLS[game]?.[String(team || "").toUpperCase()];
  if (url) sources.push({
    name: `${team} Valorant team profile - VLR.gg`,
    url,
    host: "vlr.gg",
    source: "direct",
    rank: -1,
    trusted: true,
    query: "direct-team-profile"
  });
  for (const source of PREFERRED_LEAGUE_URLS[game] || []) sources.push({ rank: -1, ...source });
  return sources;
}

async function fetchText(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "user-agent": "Kairos/1.0 esports-match-parser"
      }
    });
    if (!response.ok) throw new Error(`fetch_failed_${response.status}`);
    return response.text();
  } finally {
    clearTimeout(timer);
  }
}

export function parseVlrTeamProfile(html, { team, game, range, limit }) {
  const items = [];
  const sectionStart = range === "past" ? html.indexOf("Recent Results") : html.indexOf("Upcoming matches");
  if (sectionStart < 0) return items;
  const nextSection = range === "past"
    ? html.indexOf("Upcoming matches", sectionStart + 1)
    : html.indexOf("Recent Results", sectionStart + 1);
  const section = html.slice(sectionStart, nextSection > sectionStart ? nextSection : sectionStart + 80000);
  const cardPattern = /<a href="([^"]+)" class="wf-card fc-flex m-item">([\s\S]*?)<\/a>/gi;
  let match;
  while ((match = cardPattern.exec(section)) && items.length < limit) {
    const href = match[1].startsWith("http") ? match[1] : `https://www.vlr.gg${match[1]}`;
    const card = match[2];
    const event = stripTags(card.match(/<div[^>]*font-weight:\s*700[^>]*>([\s\S]*?)<\/div>/i)?.[1] || "");
    const teams = [...card.matchAll(/<span class="m-item-team-name">\s*([\s\S]*?)\s*<\/span>\s*<span class="m-item-team-tag">\s*([\s\S]*?)\s*<\/span>/gi)]
      .map(row => ({ name: stripTags(row[1]), tag: stripTags(row[2]) }))
      .filter(row => row.name || row.tag);
    const dateMatch = card.match(/<div class="m-item-date">\s*<div>\s*([\d/]+)\s*<\/div>\s*([^<\n]+)?/i);
    const date = dateMatch?.[1]?.trim()?.replace(/\//g, "-") || "";
    const start_time = toTime24(dateMatch?.[2] || "");
    const self = teams.find(row => row.tag.toUpperCase() === String(team).toUpperCase() || row.name.toLowerCase().includes("edward gaming")) || teams[0];
    const opponent = teams.find(row => row !== self) || teams[1];
    if (!date || !self || !opponent) continue;
    const title = `${self.tag || self.name} vs ${opponent.tag || opponent.name}`;
    items.push({
      title,
      date,
      end_date: date,
      start_time,
      end_time: "",
      all_day: !start_time,
      type: "match",
      priority: "medium",
      status: "todo",
      reminder: start_time ? "30" : "none",
      team: self.tag || self.name,
      opponent: opponent.name || opponent.tag,
      game,
      event,
      source: "vlr",
      sourceUrl: href,
      confidence: "high",
      notes: `来源：VLR.gg${event ? ` · ${event}` : ""}；时间按 Asia/Shanghai 显示`
    });
  }
  return items;
}

function extractJsonObjects(text, marker) {
  const output = [];
  let pos = 0;
  while ((pos = text.indexOf(marker, pos)) >= 0) {
    let start = pos;
    while (start >= 0 && text[start] !== "{") start--;
    if (start < 0) { pos += marker.length; continue; }
    let depth = 0, inString = false, escaped = false;
    for (let i = start; i < text.length; i++) {
      const char = text[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === "\\") escaped = true;
        else if (char === "\"") inString = false;
        continue;
      }
      if (char === "\"") { inString = true; continue; }
      if (char === "{") depth++;
      if (char === "}") {
        depth--;
        if (depth === 0) {
          output.push(text.slice(start, i + 1));
          pos = i + 1;
          break;
        }
      }
    }
    pos += marker.length;
  }
  return output;
}

export function parseValorantEsportsEvents(html, { team, game, range, limit }) {
  const teamCode = String(team || "").toUpperCase();
  const rows = [];
  for (const raw of extractJsonObjects(html, '"__typename":"EventMatch"')) {
    let event;
    try { event = JSON.parse(raw); } catch { continue; }
    if (event.type !== "match" || !Array.isArray(event.matchTeams)) continue;
    if (range === "upcoming" && event.state === "completed") continue;
    if (range === "past" && event.state !== "completed") continue;
    const self = event.matchTeams.find(row => String(row.code || "").toUpperCase() === teamCode);
    if (!self) continue;
    const opponent = event.matchTeams.find(row => row !== self);
    if (!opponent) continue;
    const when = datePartsInShanghai(event.startTime);
    if (!when.date) continue;
    rows.push({
      title: `${self.code || self.name} vs ${opponent.code || opponent.name}`,
      date: when.date,
      end_date: when.date,
      start_time: when.time,
      end_time: "",
      all_day: !when.time,
      type: "match",
      priority: "medium",
      status: "todo",
      reminder: when.time ? "30" : "none",
      team: self.code || self.name,
      opponent: opponent.name || opponent.code,
      game,
      event: event.tournament?.name || event.league?.name || "",
      source: "valorantesports",
      sourceUrl: "https://valorantesports.com/zh-TW/leagues/champions,game_changers_championship,vct_masters",
      confidence: "high",
      notes: `来源：VALORANT Esports${event.tournament?.name ? ` · ${event.tournament.name}` : ""}；时间按 Asia/Shanghai 显示`
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

function mergeConflict(existing, incoming, field, label) {
  if (!existing[field] || !incoming[field] || existing[field] === incoming[field]) return;
  existing.conflicts ||= [];
  const same = existing.conflicts.some(conflict => conflict.field === field && conflict.values?.includes(incoming[field]));
  if (same) return;
  existing.conflicts.push({
    field,
    label,
    values: [...new Set([existing[field], incoming[field]])],
    sources: [
      { source: existing.source, url: existing.sourceUrl, value: existing[field] },
      { source: incoming.source, url: incoming.sourceUrl, value: incoming[field] }
    ]
  });
  existing.confidence = existing.confidence === "low" ? "low" : "medium";
}

export function mergeMatches(...groups) {
  const seen = new Map();
  const output = [];
  for (const item of groups.flat()) {
    const exactKey = `${item.date}|${item.start_time}|${matchIdentity(item)}`;
    const fuzzyKey = matchIdentity(item);
    const fuzzyMatch = output.find(existing => matchIdentity(existing) === fuzzyKey && daysBetween(existing.date, item.date) <= 1);
    const key = seen.has(exactKey) || fuzzyMatch ? (fuzzyMatch ? `fuzzy:${output.indexOf(fuzzyMatch)}` : exactKey) : exactKey;
    if (fuzzyMatch && !seen.has(key)) seen.set(key, fuzzyMatch);
    if (seen.has(key)) {
      const existing = seen.get(key);
      const refs = existing.sourceRefs || [{ source: existing.source, url: existing.sourceUrl }];
      refs.push({ source: item.source, url: item.sourceUrl });
      existing.sourceRefs = refs.filter((ref, index, all) => ref.url && all.findIndex(row => row.url === ref.url) === index);
      mergeConflict(existing, item, "date", "日期");
      mergeConflict(existing, item, "start_time", "开始时间");
      mergeConflict(existing, item, "opponent", "对手");
      mergeConflict(existing, item, "event", "赛事");
      if (!existing.notes.includes("VALORANT Esports") && item.source === "valorantesports") existing.notes += "；官方来源：VALORANT Esports";
      if (!existing.notes.includes("VLR.gg") && item.source === "vlr") existing.notes += "；来源：VLR.gg";
      continue;
    }
    item.sourceRefs = [{ source: item.source, url: item.sourceUrl }];
    seen.set(key, item);
    output.push(item);
  }
  return output;
}

async function queryDirectMatches({ game, team, range, limit }) {
  const profileUrl = TEAM_PROFILE_URLS[game]?.[String(team || "").toUpperCase()];
  const officialUrl = PREFERRED_LEAGUE_URLS[game]?.find(row => row.host === "valorantesports.com")?.url;
  const [vlrHtml, officialHtml] = await Promise.all([
    profileUrl ? fetchText(profileUrl).catch(() => "") : "",
    officialUrl ? fetchText(officialUrl).catch(() => "") : ""
  ]);
  const officialRange = range === "recent" ? "past" : range;
  const official = officialHtml ? parseValorantEsportsEvents(officialHtml, { game, team, range: officialRange, limit }) : [];
  if (!vlrHtml) return official.slice(0, limit);
  if (range === "recent") {
    const upcoming = parseVlrTeamProfile(vlrHtml, { game, team, range: "upcoming", limit: Math.ceil(limit / 2) });
    const past = parseVlrTeamProfile(vlrHtml, { game, team, range: "past", limit: Math.floor(limit / 2) });
    return mergeMatches(upcoming, past, official).slice(0, limit);
  }
  return mergeMatches(parseVlrTeamProfile(vlrHtml, { game, team, range, limit }), official).slice(0, limit);
}

export async function searchEsportsMatches(input = {}) {
  const game = normalizeGame(input.game || input.query || "");
  const team = String(input.team || "").trim() || "EDG";
  const range = input.range || "recent";
  const limit = Math.min(Number(input.limit) || 10, 20);
  const query = buildSearchQuery({ game, team, range });
  const queries = buildSearchQueries({ game, team, range });
  const accessedAt = new Date().toISOString();

  try {
    const direct = directProfileSources({ game, team });
    const items = await queryDirectMatches({ game, team, range, limit }).catch(() => []);
    const hasDirectTeamSource = direct.some(source => source.query === "direct-team-profile");
    const searched = hasDirectTeamSource ? [] : await searchSourceCandidates(queries, Math.min(limit, 8)).catch(() => []);
    const seen = new Set();
    const sources = [...direct, ...searched].filter(source => {
      const key = source.url.replace(/[#?].*$/, "");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, Math.min(limit, 8)).map(source => ({ ...source, accessedAt }));
    if (sources.length) {
      return {
        status: items.length ? "ok" : "source_candidates",
        items,
        sources,
        warnings: [],
        normalized: { game, team, range, limit, query, queries }
      };
    }
  } catch (error) {
    return {
      status: "needs_source",
      items: [],
      sources: [],
      warnings: [`自动搜索暂时不可用：${error.message}。请上传${team}${game === "valorant" ? "无畏契约" : ""}赛程截图、粘贴网页内容或粘贴比赛列表。`],
      normalized: { game, team, range, limit, query, queries }
    };
  }

  return {
    status: "needs_source",
    items: [],
    sources: [],
    warnings: [`没有找到可靠的公开赛程来源。请上传${team}${game === "valorant" ? "无畏契约" : ""}赛程截图、粘贴网页内容或粘贴比赛列表。`],
    normalized: { game, team, range, limit, query, queries }
  };
}
