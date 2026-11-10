import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildPulse } from "../src/lib/home-pulse.mjs";
const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
const blank = () => Object.fromEntries(teams.map((t) => [t.id, { gp: 0, w: 0, l: 0, ot: 0, pts: 0, rw: 0, gf: 0, ga: 0 }]));
let n = 1;
// A finished regular-season game; the day number keeps games in the order given.
const game = (day, home, away, hs, as, end = "REG") => ({ id: n++, type: 2, state: "FINAL", home, away, homeScore: hs, awayScore: as, end, date: `2026-11-${String(day).padStart(2, "0")}`, start: `2026-11-${String(day).padStart(2, "0")}T23:00:00Z` });

test("empty without a table or teams", () => {
  assert.deepEqual(buildPulse(null, teams, []), []);
  assert.deepEqual(buildPulse({}, [], []), []);
});
test("winning and losing streaks of four or more are reported with their basis", () => {
  const games = [1, 2, 3, 4].map((d) => game(d, "TOR", "BOS", 3, 1));
  const rows = buildPulse(blank(), teams, games);
  const s = rows.find((r) => r.kind === "streak" && r.teams[0] === "TOR");
  assert.match(s.text, /TOR has won 4 in a row/);
  assert.ok(s.basis);
  assert.match(rows.find((r) => r.kind === "streak" && r.teams[0] === "BOS").text, /BOS has lost 4 in a row/);
});
test("three in a row is not worth a line", () => {
  const rows = buildPulse(blank(), teams, [1, 2, 3].map((d) => game(d, "TOR", "BOS", 3, 1)));
  assert.equal(rows.filter((r) => r.kind === "streak").length, 0);
});
test("an overtime loss ends a regulation-loss streak (it is its own outcome)", () => {
  const games = [1, 2, 3].map((d) => game(d, "TOR", "BOS", 3, 1)).concat(game(4, "TOR", "BOS", 3, 2, "OT"));
  const rows = buildPulse(blank(), teams, games);
  assert.ok(!rows.some((r) => r.teams[0] === "BOS" && /lost 4 in a row$/.test(r.text)));
});
test("last 10 against the season points percentage", () => {
  const table = blank();
  table.TOR = { ...table.TOR, gp: 20, pts: 20 }; // .500 season
  const games = [];
  for (let d = 1; d <= 10; d++) games.push(d === 4 || d === 8 ? game(d, "TOR", "BOS", 1, 3) : game(d, "TOR", "BOS", 3, 1));
  const f = buildPulse(table, teams, games).find((r) => r.kind === "form");
  assert.equal(f.teams[0], "TOR");
  assert.match(f.text, /8-2-0 in its last 10 \(\.800 points pct\) against \.500/);
});
test("no form row with fewer than ten games", () => {
  const table = blank();
  table.TOR = { ...table.TOR, gp: 9, pts: 9 };
  assert.equal(buildPulse(table, teams, [1, 2, 3].map((d) => game(d, "TOR", "BOS", 3, 1))).filter((r) => r.kind === "form").length, 0);
});
test("playoff-chance leaders come from the simulation and skip settled teams", () => {
  const sim = { TOR: { chance: 100 }, BOS: { chance: 93.4 }, NYR: { chance: 88 }, EDM: { chance: 40 } };
  const r = buildPulse(blank(), teams, [], sim).find((x) => x.kind === "odds");
  assert.deepEqual(r.teams, ["BOS", "NYR"]);
  assert.match(r.text, /BOS 93%, NYR 88%/);
  assert.equal(buildPulse(blank(), teams, [], null).some((x) => x.kind === "odds"), false);
});
test("bubble row states the points margin to the last wild card", () => {
  const table = {};
  teams.forEach((t, i) => { table[t.id] = { gp: 20, pts: 30 - (i % 16), rw: 5, gf: 60, ga: 60, w: 9, l: 9, ot: 2 }; });
  const r = buildPulse(table, teams, []).find((x) => x.kind === "bubble");
  assert.ok(r);
  assert.match(r.text, /\d+ points? (behind|ahead of)|level on points/);
  assert.match(r.basis, /not official/);
});
test("at most four rows, each with text and basis, and no standings-movement claims", () => {
  const table = {};
  teams.forEach((t, i) => { table[t.id] = { gp: 20, pts: 30 - (i % 16), rw: 5, gf: 60, ga: 60, w: 9, l: 9, ot: 2 }; });
  table.TOR = { ...table.TOR, gp: 20, pts: 20 };
  const games = [];
  for (let d = 1; d <= 10; d++) games.push(game(d, "TOR", "BOS", 3, 1));
  const rows = buildPulse(table, teams, games, { TOR: { chance: 80 }, BOS: { chance: 70 } });
  assert.ok(rows.length >= 3 && rows.length <= 4);
  for (const r of rows) { assert.ok(r.text && r.basis && r.key); assert.doesNotMatch(r.text, /climb|jump|rose|fell|moved up|moved down/i); }
});
