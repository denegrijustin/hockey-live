import test from "node:test";
import assert from "node:assert/strict";
import { buildIndex, search, normalize } from "../src/lib/search.mjs";

const teams = [
  { id: "BOS", name: "Boston Bruins", city: "Boston", short: "Bruins", division: "Atlantic" },
  { id: "TOR", name: "Toronto Maple Leafs", city: "Toronto", short: "Maple Leafs", division: "Atlantic" },
  { id: "MTL", name: "Montréal Canadiens", city: "Montréal", short: "Canadiens", division: "Atlantic" },
  { id: "BUF", name: "Buffalo Sabres", city: "Buffalo", short: "Sabres", division: "Atlantic" },
];
const games = [
  { id: 1, date: "2026-11-10", state: "FUT", home: "TOR", away: "BOS", homeScore: null, awayScore: null },
  { id: 2, date: "2026-11-09", state: "LIVE", home: "MTL", away: "BUF", homeScore: 1, awayScore: 2 },
  { id: 3, date: "2026-11-01", state: "FINAL", home: "MTL", away: "TOR", homeScore: 1, awayScore: 2 },
];
const views = [{ id: "standings", label: "Standings", hint: "League tables" }, { id: "teams", label: "Teams" }];
const players = [{ id: 8478402, name: "Connor McDavid", team: "EDM", number: 97 }];
const idx = buildIndex({ teams, games, players, views, today: "2026-11-10" });
const ids = (q, o) => search(idx, q, o).flat.map((i) => `${i.kind}:${i.id}`);

test("normalize strips diacritics and case", () => assert.equal(normalize("  Montréal  "), "montreal"));
test("diacritics and case insensitive", () => assert.ok(ids("MONTREAL").includes("team:MTL")));
test("exact abbreviation ranks first", () => assert.equal(ids("bos")[0], "team:BOS"));
test("prefix beats substring", () => assert.equal(ids("bu")[0], "team:BUF"));
test("word prefix matches", () => assert.ok(ids("leafs").includes("team:TOR")));
test("only today's and live games are indexed; the old final is not", () => {
  assert.deepEqual(ids("tor").filter((x) => x.startsWith("game")), ["game:1"]);
});
test("matchup query across two teams", () => assert.deepEqual(ids("bos vs tor").filter((x) => x.startsWith("game")), ["game:1"]));
test("live keyword finds live game", () => assert.deepEqual(ids("live"), ["game:2"]));
test("players come only from what was passed", () => {
  assert.deepEqual(ids("mcdavid"), ["player:8478402"]);
  assert.deepEqual(ids("draisaitl"), []);
  const none = buildIndex({ teams, views });
  assert.equal(search(none, "mcdavid").flat.length, 0);
});
test("views are searchable", () => assert.deepEqual(ids("stand"), ["view:standings"]));
test("groups come in fixed order and results are stable", () => {
  const order = ["team", "game", "player", "view"];
  const g = search(idx, "t").groups.map((x) => order.indexOf(x.kind));
  assert.deepEqual(g, [...g].sort((a, b) => a - b));
  assert.deepEqual(ids("t"), ids("t"));
});
test("limit is per group", () => assert.ok(search(idx, "a", { limit: 1 }).groups.every((g) => g.items.length <= 1)));
test("empty query lists games and pages only", () => {
  const r = ids("");
  assert.ok(r.every((x) => x.startsWith("game") || x.startsWith("view")));
  assert.ok(r.includes("game:1"));
});
test("no match gives no groups", () => assert.equal(search(idx, "zzzz").groups.length, 0));
