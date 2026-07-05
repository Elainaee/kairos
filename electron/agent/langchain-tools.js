import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function createKairosLangChainTools({ searchEsportsMatches }) {
  return [
    tool(
      async ({ game, team, range, limit = 10 }) => {
        const result = await searchEsportsMatches({ game, team, range, limit });
        return JSON.stringify(result);
      },
      {
        name: "search_esports_matches",
        description: "查询电竞比赛赛程。用于 EDG、VCT、无畏契约、Valorant 等赛事赛程请求。返回结构化候选、来源和告警。",
        schema: z.object({
          game: z.string().describe("游戏名，例如 valorant"),
          team: z.string().describe("战队简称，例如 EDG"),
          range: z.enum(["recent", "upcoming", "past"]).describe("查询范围：recent 最近，upcoming 接下来，past 已结束"),
          limit: z.number().int().min(1).max(20).optional().describe("最多返回数量")
        })
      }
    )
  ];
}
