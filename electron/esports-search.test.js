import test from "node:test";
import assert from "node:assert/strict";
import { mergeMatches, parseValorantEsportsEvents, parseVlrTeamProfile } from "./esports-search.js";

const vlrSnippet = `
<h2>Upcoming matches</h2>
<div>
  <a href="/701039/edward-gaming-vs-tyloo-vct-2026-china-stage-2-w2" class="wf-card fc-flex m-item">
    <div class="m-item-event text-of"><div style="font-weight: 700;">VCT 26: CN Stage 2</div>Group Stage &sdot; W2</div>
    <div class="m-item-team text-of"><span class="m-item-team-name">EDward Gaming</span><span class="m-item-team-tag">EDG</span></div>
    <div class="m-item-team text-of mod-right"><span class="m-item-team-name">TYLOO</span><span class="m-item-team-tag">TYL</span></div>
    <div class="m-item-date"><div>2026/07/15</div>8:00 pm</div>
  </a>
</div>
<h2>Recent Results</h2>
<div>
  <a href="/670470/edward-gaming-vs-paper-rex-valorant-masters-london-2026-ubf" class="wf-card fc-flex m-item">
    <div class="m-item-event text-of"><div style="font-weight: 700;">Masters London 2026</div>Playoffs</div>
    <div class="m-item-team text-of"><span class="m-item-team-name">EDward Gaming</span><span class="m-item-team-tag">EDG</span></div>
    <div class="m-item-team text-of mod-right"><span class="m-item-team-name">Paper Rex</span><span class="m-item-team-tag">PRX</span></div>
    <div class="m-item-date"><div>2026/06/19</div>9:00 pm</div>
  </a>
</div>`;

test("VLR team profile upcoming matches parse into schedule candidates", () => {
  const rows = parseVlrTeamProfile(vlrSnippet, { team: "EDG", game: "valorant", range: "upcoming", limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "EDG vs TYL");
  assert.equal(rows[0].date, "2026-07-15");
  assert.equal(rows[0].start_time, "20:00");
  assert.equal(rows[0].type, "match");
  assert.equal(rows[0].source, "vlr");
  assert.equal(rows[0].confidence, "high");
});

test("VLR team profile recent results parse into schedule candidates", () => {
  const rows = parseVlrTeamProfile(vlrSnippet, { team: "EDG", game: "valorant", range: "past", limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "EDG vs PRX");
  assert.equal(rows[0].date, "2026-06-19");
  assert.equal(rows[0].start_time, "21:00");
  assert.equal(rows[0].event, "Masters London 2026");
});

test("official Valorant Esports event JSON parses into schedule candidates", () => {
  const html = `{"__typename":"EventMatch","id":"m1","blockName":"Playoffs","startTime":"2026-06-19T13:00:00Z","state":"completed","type":"match","league":{"__typename":"League","name":"VALORANT大師賽"},"tournament":{"__typename":"Tournament","name":"倫敦大師賽"},"matchTeams":[{"__typename":"MatchTeam","name":"Paper Rex","code":"PRX","result":{"gameWins":2,"outcome":"win"}},{"__typename":"MatchTeam","name":"EDWARD Gaming","code":"EDG","result":{"gameWins":1,"outcome":"loss"}}]}`;
  const rows = parseValorantEsportsEvents(html, { team: "EDG", game: "valorant", range: "past", limit: 5 });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].title, "EDG vs PRX");
  assert.equal(rows[0].date, "2026-06-19");
  assert.equal(rows[0].start_time, "21:00");
  assert.equal(rows[0].source, "valorantesports");
  assert.equal(rows[0].event, "倫敦大師賽");
});

test("merged match candidates keep source conflicts for manual confirmation", () => {
  const rows = mergeMatches([
    { title:"EDG vs PRX",date:"2026-06-19",start_time:"21:00",team:"EDG",opponent:"PRX",event:"Masters London",source:"vlr",sourceUrl:"https://www.vlr.gg/1",confidence:"high",notes:"来源：VLR.gg" },
    { title:"EDG vs PRX",date:"2026-06-19",start_time:"20:00",team:"EDG",opponent:"PRX",event:"Masters London",source:"valorantesports",sourceUrl:"https://valorantesports.com/1",confidence:"high",notes:"来源：VALORANT Esports" }
  ]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].confidence, "medium");
  assert.equal(rows[0].sourceRefs.length, 2);
  assert.equal(rows[0].conflicts[0].field, "start_time");
  assert.deepEqual(rows[0].conflicts[0].values, ["21:00", "20:00"]);
});

test("live EDG query keeps trusted VLR source available", { skip: process.env.KAIROS_LIVE_TESTS !== "1" }, async () => {
  const { searchEsportsMatches } = await import("./esports-search.js");
  const result = await searchEsportsMatches({ team: "EDG", game: "valorant", range: "upcoming", limit: 3 });
  assert.ok(["ok", "source_candidates"].includes(result.status));
  assert.ok(result.sources.some(source => source.host === "vlr.gg" && source.trusted));
  assert.ok(result.sources.some(source => source.host === "valorantesports.com" && source.trusted));
  if (result.status === "ok") {
    assert.ok(result.items.length >= 1);
    assert.equal(result.items[0].type, "match");
  }
});
