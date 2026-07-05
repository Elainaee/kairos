import test from "node:test";
import assert from "node:assert/strict";
import { analyzeScheduleIntent } from "./ai-intent.js";

test("ambiguous EDG match request asks for game before searching", () => {
  const intent = analyzeScheduleIntent("看一下 EDG 最近比赛");
  assert.equal(intent.action, "clarify_game");
  assert.equal(intent.teamCode, "EDG");
});

test("valorant EDG recent request goes directly to esports search", () => {
  const intent = analyzeScheduleIntent("我想看最近瓦里 EDG 所有的比赛");
  assert.equal(intent.action, "search_esports");
  assert.equal(intent.game, "valorant");
  assert.equal(intent.teamCode, "EDG");
  assert.equal(intent.range, "recent");
});

test("valorant team request without range asks for range", () => {
  const intent = analyzeScheduleIntent("EDG 瓦比赛");
  assert.equal(intent.action, "clarify_range");
});

test("VCT is not treated as a team code", () => {
  const intent = analyzeScheduleIntent("VCT 赛程");
  assert.equal(intent.action, "none");
  assert.equal(intent.teamCode, "EDG");
});

test("URL and attachment sources take priority over clarification", () => {
  assert.equal(analyzeScheduleIntent("EDG 最近比赛 https://example.com/schedule").action, "fetch_url");
  assert.equal(analyzeScheduleIntent("帮我整理 EDG 比赛", ["a1"]).action, "extract_attachments");
});
