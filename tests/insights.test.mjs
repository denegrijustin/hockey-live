import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { blankStandings, applyResult } from "../src/lib/model.mjs";
import { matchupInsights, streakOf, restDays, pointsFromLine } from "../src/lib/insights.mjs";

const teams = JSON.parse(readFileSync(new URL("../src/data/teams.json", import.meta.url)));
const PTS = { W: 2, O: 1, L: 0 };
const results = (s) => [...s].map((c) => ({ date: "2026-01-01", pts: PTS[c], gf: 3, ga: 2, outcome: c === "O" ? "OT" : c }));
/** Everyone on 40 points with an alternating, streak-free form; overrides per team: {pts, form}. */
const standings = (over = {}) => {
  const t = blankStandings(teams);
  for (const id of Object.keys(t)) Object.assign(t[id], { gp: 20, pts: 40, rw: 8, results: results("WLWLWL"), ...over[id] });
  for (const id of Object.keys(over)) if (over[id].form) t[id].results = results(over[id].form);
  return t;
};
const game = (home, away, extra = {}) => ({ id: 1, season: 20252026, type: 2, date: "2026-01-10", start: "2026-01-10T20:00:00Z", state: "FUT", home, away, homeScore: null, awayScore: null, end: "REG", ...extra });
const done = (id, date, home, away, hs, as, extra = {}) => ({ id, season: 20252026, type: 2, date, start: `${date}T20:00:00Z`, state: "OFF", home, away, homeScore: hs, awayScore: as, end: "REG", ...extra });
const ids = (list) => list.map((i) => i.id);
const run = (g, before, ctx = {}) => matchupInsights(g, before, before, { teams, allGames: [], ...ctx });
// Far apart in standings, different divisions and conferences: no standings insight fires by accident.
const far = () => standings({ TOR: { pts: 60 }, EDM: { pts: 20 } });
const quiet = (list) => list.filter((i) => i.kind !== "schedule");

test("baseline fixture is quiet apart from the first-meeting line", () => {
  assert.deepEqual(ids(run(game("EDM", "TOR"), far())), ["series"]);
});

test("division rivalry and top-of-division clash", () => {
  const before = standings({ TOR: { pts: 50 }, BOS: { pts: 46 } });
  const found = run(game("BOS", "TOR"), before);
  assert.ok(ids(found).includes("division") || ids(found).includes("top-division"));
  const top = standings({ TOR: { pts: 60 }, BOS: { pts: 58 } });
  const t = run(game("BOS", "TOR"), top).find((i) => i.id === "top-division");
  assert.ok(t && /1st meets 2nd in the Atlantic/.test(t.text));
  // 3rd vs 1st is a rivalry, not a top-two clash.
  const near = standings({ TOR: { pts: 60 }, FLA: { pts: 59 }, BOS: { pts: 58 } });
  const n = run(game("BOS", "TOR"), near);
  assert.ok(!ids(n).includes("top-division"));
  const d = n.find((i) => i.id === "division");
  assert.match(d.text, /Atlantic rivals, 2 points apart/);
  // Different divisions: no rivalry.
  assert.ok(!ids(run(game("EDM", "TOR"), far())).includes("division"));
});

test("playoff line: both within 3, one within 3, and the near miss at 4", () => {
  const both = run(game("EDM", "TOR"), standings({ TOR: { pts: 42 }, EDM: { pts: 38 } }));
  assert.ok(ids(both).includes("line-both"));
  const one = run(game("EDM", "TOR"), standings({ TOR: { pts: 43 }, EDM: { pts: 20 } }));
  assert.ok(ids(one).includes("line-TOR") && !ids(one).includes("line-both"));
  assert.match(one.find((i) => i.id === "line-TOR").text, /3 points above the playoff line/);
  const miss = run(game("EDM", "TOR"), standings({ TOR: { pts: 44 }, EDM: { pts: 20 } }));
  assert.ok(!ids(miss).some((i) => i.startsWith("line")));
  assert.equal(pointsFromLine(standings({ TOR: { pts: 44 } }), "TOR", teams), 4);
});

test("win streaks: >=3 fires, 2 does not, both teams, hot versus slumping", () => {
  assert.ok(ids(run(game("EDM", "TOR"), standings({ TOR: { pts: 60, form: "LWWW" }, EDM: { pts: 20 } }))).includes("win-TOR"));
  assert.ok(!ids(run(game("EDM", "TOR"), standings({ TOR: { pts: 60, form: "LLWW" }, EDM: { pts: 20 } }))).includes("win-TOR"));
  const both = run(game("EDM", "TOR"), standings({ TOR: { pts: 60, form: "WWWW" }, EDM: { pts: 20, form: "LWWW" } }));
  assert.ok(ids(both).includes("streak-both") && !ids(both).includes("win-TOR"));
  const hs = run(game("EDM", "TOR"), standings({ TOR: { pts: 60, form: "LWWW" }, EDM: { pts: 20, form: "WLLL" } }));
  assert.ok(ids(hs).includes("hot-slump") && !ids(hs).includes("lose-EDM"));
});

test("losing streak: 3 fires (overtime losses count), 2 does not", () => {
  const f = run(game("EDM", "TOR"), standings({ TOR: { pts: 60 }, EDM: { pts: 20, form: "WLOL" } }));
  assert.equal(f.find((i) => i.id === "lose-EDM").text, "Oilers are trying to end a 3-game losing streak");
  assert.ok(!ids(run(game("EDM", "TOR"), standings({ TOR: { pts: 60 }, EDM: { pts: 20, form: "WWLL" } }))).includes("lose-EDM"));
  assert.deepEqual(streakOf(results("WLOL")), { kind: "L", n: 3 });
  assert.deepEqual(streakOf(results("LLW")), { kind: "W", n: 1 });
  assert.deepEqual(streakOf([]), { kind: null, n: 0 });
});

test("last five: 8 of 10 points fires, 7 does not", () => {
  const five = (form) => run(game("EDM", "TOR"), standings({ TOR: { pts: 60, form }, EDM: { pts: 20 } })).some((i) => i.id === "last5-TOR");
  assert.equal(five("LWWWWL"), true); // last 5: W W W W L = 8
  assert.equal(five("LWWWLL"), false); // last 5: W W W L L = 6
  assert.equal(five("LWWWOL"), false); // last 5: W W W O L = 7
  assert.equal(five("WWWW"), false); // fewer than five results
});

test("back-to-back needs the previous game in the schedule", () => {
  const g = game("EDM", "TOR");
  const prev = done(9, "2026-01-09", "TOR", "CHI", 3, 1, { start: "2026-01-09T23:00:00Z" });
  const f = run(g, far(), { allGames: [prev] });
  assert.ok(ids(f).includes("b2b-TOR"));
  assert.equal(restDays([prev], g, "TOR"), 0);
  assert.equal(restDays([], g, "TOR"), null);
  const rested = done(8, "2026-01-07", "TOR", "CHI", 3, 1, { start: "2026-01-07T23:00:00Z" });
  assert.ok(!ids(run(g, far(), { allGames: [rested] })).includes("b2b-TOR"));
  assert.equal(restDays([rested], g, "TOR"), 2);
  const bothPrev = done(10, "2026-01-09", "EDM", "SEA", 1, 0, { start: "2026-01-09T23:00:00Z" });
  assert.ok(ids(run(g, far(), { allGames: [prev, bothPrev] })).includes("b2b-both"));
});

test("season series: leader, tie, first meeting", () => {
  const g = game("EDM", "TOR");
  const f = (all) => run(g, far(), { allGames: all }).find((i) => i.id === "series");
  assert.equal(f([]).text, "First meeting of the season");
  assert.equal(f([done(2, "2026-01-02", "TOR", "EDM", 4, 1)]).text, "Maple Leafs lead the season series 1–0");
  assert.match(f([done(2, "2026-01-02", "TOR", "EDM", 4, 1), done(3, "2026-01-04", "EDM", "TOR", 4, 1)]).text, /Season series tied 1–1/);
});

test("playoff odds only inside 20-80 and only with a simulation", () => {
  const g = game("EDM", "TOR");
  const sim = (a, b) => ({ TOR: { chance: a }, EDM: { chance: b } });
  const f = run(g, far(), { sim: sim(45, 99) });
  assert.deepEqual(ids(f).filter((i) => i.startsWith("odds")), ["odds-TOR"]);
  assert.ok(!ids(run(g, far(), { sim: sim(19, 81) })).some((i) => i.startsWith("odds")));
  assert.ok(ids(run(g, far(), { sim: sim(20, 80) })).includes("odds-EDM"));
  assert.ok(!ids(run(g, far())).some((i) => i.startsWith("odds")));
  // The raw simulation result shape works too.
  assert.ok(ids(run(g, far(), { sim: { teams: { TOR: { pPlayoffs: 50 } } } })).includes("odds-TOR"));
});

test("model estimate: underdog and coin flip, labelled as the model's", () => {
  const g = game("EDM", "TOR");
  const dog = run(g, far(), { pregameHome: 0.4 }).find((i) => i.id === "model-dog");
  assert.match(dog.text, /^Model's pregame estimate gives Oilers 40%/);
  assert.ok(!ids(run(g, far(), { pregameHome: 0.41 })).includes("model-dog"));
  assert.match(run(g, far(), { pregameHome: 0.62 }).find((i) => i.id === "model-dog").text, /Maple Leafs 38%/);
  const even = run(g, far(), { pregameHome: 0.55 }).find((i) => i.id === "model-even");
  assert.match(even.text, /near a coin flip \(45–55\)/);
  assert.ok(!ids(run(g, far(), { pregameHome: 0.56 })).includes("model-even"));
});

test("live: close and late, overtime, shootout, upset brewing", () => {
  const live = (extra) => game("EDM", "TOR", { state: "LIVE", homeScore: 2, awayScore: 1, period: 3, periodType: "REG", ...extra });
  assert.equal(run(live(), far())[0].id, "live-close-late");
  assert.ok(!ids(run(live({ awayScore: 0 }), far())).includes("live-close-late"));
  assert.ok(!ids(run(live({ period: 2 }), far())).includes("live-close-late"));
  assert.ok(ids(run(live({ period: 4, periodType: "OT", awayScore: 0 }), far())).includes("live-ot"));
  assert.ok(ids(run(live({ period: 5, periodType: "SO" }), far())).includes("live-so"));
  const upset = run(live({ homeScore: 2, awayScore: 0 }), far(), { pregameHome: 0.3 });
  assert.match(upset.find((i) => i.id === "live-upset").text, /Oilers lead 2–0 after a 30% pregame estimate/);
  assert.ok(!ids(run(live({ homeScore: 2, awayScore: 0 }), far(), { pregameHome: 0.5 })).includes("live-upset"));
});

test("final: upset won and overtime/shootout", () => {
  const fin = (extra) => game("EDM", "TOR", { state: "FINAL", homeScore: 3, awayScore: 2, ...extra });
  assert.match(run(fin(), far(), { pregameHome: 0.35 }).find((i) => i.id === "final-upset").text, /Oilers won with a 35% pregame estimate/);
  assert.ok(!ids(run(fin(), far(), { pregameHome: 0.45 })).includes("final-upset"));
  assert.ok(!ids(run(fin(), far(), { pregameHome: 0.35 })).includes("final-ot"));
  assert.equal(run(fin({ end: "OT" }), far()).find((i) => i.id === "final-ot").text, "Decided in overtime");
  assert.equal(run(fin({ end: "SO" }), far()).find((i) => i.id === "final-ot").text, "Decided in a shootout");
});

test("playoffs: only the series score; no standings claims", () => {
  const g = game("EDM", "TOR", { type: 3 });
  const prior = [done(2, "2026-01-02", "TOR", "EDM", 4, 1, { type: 3 }), done(3, "2026-01-04", "EDM", "TOR", 1, 3, { type: 3 })];
  const f = run(g, standings({ TOR: { pts: 41 }, EDM: { pts: 40 } }), { allGames: prior });
  assert.deepEqual(ids(f), ["series"]);
  assert.equal(f[0].text, "Maple Leafs lead the series 2–0");
  assert.deepEqual(run(g, far(), { allGames: [] }), []);
});

test("gp under 10, preseason and missing data return nothing", () => {
  const young = standings({ TOR: { gp: 9, pts: 60, form: "WWWW" }, EDM: { pts: 20 } });
  assert.deepEqual(run(game("EDM", "TOR"), young), []);
  assert.deepEqual(run(game("EDM", "TOR", { type: 1 }), far()), []);
  assert.deepEqual(run(game("EDM", "TOR", { type: 1, state: "LIVE", homeScore: 1, awayScore: 1, period: 3 }), far()), []);
  assert.deepEqual(matchupInsights(game("EDM", "TOR"), null, null, { teams }), []);
  assert.deepEqual(matchupInsights(null, far(), null, { teams }), []);
  assert.deepEqual(matchupInsights(game("EDM", "TOR"), far(), null, undefined), []);
  assert.deepEqual(run(game("EDM", "TOR"), {}), []);
});

test("sorted by priority, deterministic, and built from real applyResult standings", () => {
  const before = standings({ TOR: { pts: 60, form: "LWWWW" }, BOS: { pts: 58, form: "LWWWW" } });
  const ctx = { teams, allGames: [], sim: { TOR: { chance: 50 }, BOS: { chance: 50 } }, pregameHome: 0.5 };
  const a = matchupInsights(game("BOS", "TOR"), before, before, ctx);
  const b = matchupInsights(game("BOS", "TOR"), before, before, ctx);
  assert.deepEqual(a, b);
  assert.ok(a.length >= 4);
  for (let i = 1; i < a.length; i++) assert.ok(a[i - 1].priority >= a[i].priority);
  assert.equal(a[0].id, "top-division");
  for (const i of a) {
    assert.ok(i.text && i.detail && i.link.view && ["stakes", "form", "schedule", "odds", "live"].includes(i.kind));
  }
  // Real standings built from results: 10 games each, TOR wins four in a row.
  const real = blankStandings(teams);
  const seq = [[1, "TOR", "CHI"], [0, "CHI", "TOR"]];
  for (let n = 0; n < 12; n++) applyResult(real, done(100 + n, `2026-01-${String(n + 1).padStart(2, "0")}`, ...(seq[n % 2][1] === "TOR" ? ["TOR", "CHI", 3, 1] : ["CHI", "TOR", 1, 3])));
  for (let n = 0; n < 12; n++) applyResult(real, done(200 + n, `2026-01-${String(n + 1).padStart(2, "0")}`, "SEA", "EDM", n % 2 ? 2 : 1, n % 2 ? 1 : 2));
  assert.equal(real.TOR.gp, 12);
  assert.equal(streakOf(real.TOR.results).n, 12);
  assert.ok(ids(run(game("EDM", "TOR"), real)).includes("win-TOR"));
});
