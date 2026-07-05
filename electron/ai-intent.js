export function analyzeScheduleIntent(text = "", attachmentIds = []) {
  const value = String(text || "");
  const wantsSchedule = /日程|安排|课表|时间表|导入|整理|截止|赛程|比赛|对阵/.test(value);
  const teamCodes = (value.match(/\b([A-Z]{2,6})\b/g) || []).filter(code => !["VCT", "URL"].includes(code.toUpperCase()));
  const teamCode = teamCodes[0] || "EDG";
  const hasTeam = teamCodes.length > 0;
  const hasGame = /(瓦里|瓦|无畏契约|Valorant|VCT)/i.test(value);
  const hasRange = /(最近|接下来|之后|未来|已结束|过去|所有|全部)/.test(value);
  const hasExplicitDate = /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}|(\d{1,2})月(\d{1,2})日|今天|明天|后天|周[一二三四五六日天]|星期[一二三四五六日天]/.test(value);
  const sourceUrl = value.match(/https?:\/\/[^\s，。；、）)]+/i)?.[0] || "";
  const hasAttachments = Boolean(attachmentIds?.length);
  const esportsIntent = hasGame && hasTeam && /(赛程|比赛|对阵|最近|接下来|所有|全部)/.test(value);
  const range = /接下来|之后|未来/.test(value) ? "upcoming" : /已结束|过去/.test(value) ? "past" : "recent";

  if (!wantsSchedule) return { action: "none", wantsSchedule, teamCode, hasAttachments };
  if (hasAttachments) return { action: "extract_attachments", wantsSchedule, teamCode, hasAttachments };
  if (sourceUrl) return { action: "fetch_url", wantsSchedule, teamCode, sourceUrl };
  if (hasExplicitDate) return { action: "extract_text", wantsSchedule, teamCode };
  if (hasTeam && !hasGame && /(赛程|比赛|对阵|最近|接下来|所有|全部)/.test(value)) return { action: "clarify_game", wantsSchedule, teamCode };
  if (hasTeam && hasGame && !hasRange && /(赛程|比赛|对阵)/.test(value)) return { action: "clarify_range", wantsSchedule, teamCode };
  if (esportsIntent) return { action: "search_esports", wantsSchedule, teamCode, game: "valorant", range };
  return { action: "none", wantsSchedule, teamCode, hasAttachments };
}
