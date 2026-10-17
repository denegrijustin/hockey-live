import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { chanceFlow } from "../src/lib/nhlplus.mjs";
import { cardMode, hasGameAnalytics, isShootout, modeNote, timelineLayout, playSeconds, penaltyMarkers, clampThrough, shotLocation, topLines, profileFor, starterLine, lastFive, gameSummary, lineColors, visibleColor, SHOOTOUT_NOTE, PENDING_NOTE } from "../src/components/nhlplus/cards/logic.mjs";

const dir = "public/data/moneypuck/20262027";
const read = (f) => JSON.parse(readFileSync(`${dir}/${f}`, "utf8"));
// Saved shots are a rolling window that the daily refresh prunes, so the tests keep their own copies of the games they use.
const fixture = (id) => JSON.parse(readFileSync(`tests/fixtures/shots/${id}.json`, "utf8"));
const games = read("games.json"), summary = read("summary.json");

test("card mode: pregame, live, intermission, final available / pending", () => {
  const id = Object.keys(games.games)[0];
  assert.equal(cardMode({ id: 1, state: "FUT" }, games), "pregame");
  assert.equal(cardMode({ id: 1, state: "PRE" }, games), "pregame");
  assert.equal(cardMode({ id: 1, state: "LIVE" }, games), "live");
  assert.equal(cardMode({ id: 1, state: "CRIT", intermission: false }, games), "live");
  assert.equal(cardMode({ id: 1, state: "LIVE", intermission: true }, games), "intermission");
  assert.equal(cardMode({ id: Number(id), state: "FINAL" }, games), "final-available");
  assert.equal(cardMode({ id: Number(id), state: "OFF" }, games), "final-available");
  assert.equal(cardMode({ id: 99, state: "FINAL" }, games), "final-pending");
  assert.equal(cardMode({ id: Number(id), state: "FINAL" }, null), "final-pending");
  assert.ok(hasGameAnalytics("final-available") && !hasGameAnalytics("live") && !hasGameAnalytics("final-pending") && !hasGameAnalytics("intermission"));
});

test("notes: pending and live never carry numbers; shootout detected", () => {
  assert.equal(modeNote({}, "final-pending"), PENDING_NOTE);
  assert.match(modeNote({}, "live"), /no live feed/i);
  assert.match(modeNote({}, "intermission"), /nightly/);
  assert.equal(modeNote({}, "final-available"), null);
  assert.equal(modeNote({}, "pregame"), null);
  assert.ok(isShootout({ end: "SO" }) && !isShootout({ end: "OT" }) && !isShootout({ end: "REG" }));
  assert.match(SHOOTOUT_NOTE, /shootout/i);
});

test("timeline: regulation ticks every 10 minutes, boundaries at period ends", () => {
  const l = timelineLayout([], { playoff: false, periods: 3 });
  assert.equal(l.end, 3600);
  assert.deepEqual(l.boundaries, [1200, 2400]);
  assert.deepEqual(l.ticks.map((t) => t.t), [0, 600, 1200, 1800, 2400, 3000, 3600]);
  assert.deepEqual(l.spans.map((s) => s.label), ["P1", "P2", "P3"]);
});

test("timeline: regular-season OT is 5 minutes, playoff OT 20, extra OTs are labelled", () => {
  const ot = timelineLayout([{ p: 4, t: 3700 }], { playoff: false });
  assert.equal(ot.end, 3900);
  assert.deepEqual(ot.boundaries, [1200, 2400, 3600]);
  assert.equal(ot.spans.at(-1).label, "OT");
  assert.deepEqual(ot.ticks.map((t) => t.t).at(-1), 3600);
  const po = timelineLayout([{ p: 4, t: 4000 }], { playoff: true });
  assert.equal(po.end, 4800);
  const po2 = timelineLayout([{ p: 5, t: 5000 }], { playoff: true });
  assert.equal(po2.end, 6000);
  assert.deepEqual(po2.spans.map((s) => s.label).slice(3), ["OT1", "OT2"]);
});

test("real OT game from the saved shots fits its timeline", () => {
  const f = fixture("2026020063");
  const l = timelineLayout(f.shots, { playoff: false, periods: games.games[f.gameId]?.periods ?? 3 });
  assert.equal(l.end, 3900);
  assert.ok(f.shots.every((s) => s.t <= l.end));
});

test("chance flow ends at the sum of xG; partial fill stops at `through`", () => {
  const f = fixture("2026020050");
  const full = chanceFlow(f.shots, f.home, f.away, {});
  const sum = (team) => f.shots.filter((s) => s.team === team).reduce((t, s) => t + s.xg, 0);
  assert.ok(Math.abs(full.at(-1).home - sum(f.home)) < 1e-9);
  assert.ok(Math.abs(full.at(-1).away - sum(f.away)) < 1e-9);
  const half = chanceFlow(f.shots, f.home, f.away, { through: 1800 });
  assert.ok(half.at(-1).t <= 1800);
  assert.ok(half.length < full.length);
  const expectHome = f.shots.filter((s) => s.team === f.home && s.t <= 1800).reduce((t, s) => t + s.xg, 0);
  assert.ok(Math.abs(half.at(-1).home - expectHome) < 1e-9);
  assert.equal(chanceFlow(f.shots, f.home, f.away, { through: 0 }).length >= 1, true);
  assert.equal(clampThrough(undefined, 3600), 3600);
  assert.equal(clampThrough(99999, 3600), 3600);
  assert.equal(clampThrough(-5, 3600), 0);
  assert.equal(clampThrough(1800, 3600), 1800);
});

test("penalties from the NHL feed: elapsed seconds across periods, shootout and bad times dropped", () => {
  assert.equal(playSeconds({ period: 2, time: "05:30", periodType: "REG" }), 1200 + 330);
  assert.equal(playSeconds({ period: 4, time: "01:00", periodType: "OT" }, false), 3660);
  assert.equal(playSeconds({ period: 5, time: "01:00", periodType: "OT" }, true), 3600 + 1200 + 60);
  assert.equal(playSeconds({ period: 5, time: "01:00", periodType: "SO" }), null);
  assert.equal(playSeconds({ period: 1, time: "x" }), null);
  const m = penaltyMarkers([
    { type: "goal", period: 1, time: "01:00", team: "A" },
    { type: "penalty", period: 3, time: "10:00", team: "B", player: "P", penalty: "Tripping", duration: 2 },
    { type: "penalty", period: 1, time: "02:00", team: "A", player: null, penalty: null, duration: null },
  ]);
  assert.deepEqual(m.map((x) => [x.t, x.team]), [[120, "A"], [3000, "B"]]);
  assert.equal(m[0].text, "Penalty");
});

test("shot location", () => {
  assert.deepEqual(shotLocation({ x: 89, y: 0 }), { distance: 0, offset: 0 });
  assert.deepEqual(shotLocation({ x: 69, y: -15 }), { distance: 25, offset: 15 });
  assert.equal(shotLocation({ x: null, y: 3 }), null);
});

test("profile and starter join use real saved data and keep gaps as null", () => {
  const p = profileFor(summary, "TOR", "MTL");
  assert.ok(p.away.xGPct > 0 && p.away.xGPct < 1);
  assert.equal(profileFor(summary, "XXX", "MTL").away.xGPct, null);
  const g = summary.goalies.find((x) => x.sit.all?.xGA != null);
  const line = starterLine(summary, { id: g.id, name: g.name, status: "projected" });
  assert.equal(line.inRows, true);
  assert.ok(Math.abs(line.gsax - (g.sit.all.xGA - g.sit.all.GA)) < 1e-9);
  assert.equal(starterLine(summary, { id: 1, name: "X", status: "projected" }).gsax, null);
  assert.equal(starterLine(summary, { id: 1, name: "X", status: "projected" }).inRows, false);
  assert.equal(starterLine(summary, { id: null, status: "unknown" }).status, "unknown");
  assert.equal(starterLine(summary, undefined).gsax, null);
});

test("last five and game summary", () => {
  const l5 = lastFive(games, "TOR");
  assert.ok(l5.n > 0 && l5.n <= 5);
  assert.equal(lastFive(games, "XXX").xGPct, null);
  const log = Object.values(games.games)[0];
  const s = gameSummary(log, log.away, log.home);
  assert.equal(s.home.goals, log.goals.home);
  assert.equal(gameSummary(null, "A", "B"), null);
});

test("top lines respect the minimum ice time and resolve names", () => {
  const lines = read("lines.json"), skaters = read("skaters.json");
  const t = lines.lines[0].team;
  const r = topLines(lines, skaters, t, { minToi: 600, limit: 3 });
  assert.ok(r.lines.length <= 3 && r.pairings.length <= 3);
  for (const l of [...r.lines, ...r.pairings]) assert.ok(l.metrics.toi >= 600);
  const sorted = r.lines.map((l) => l.metrics.toi);
  assert.deepEqual(sorted, [...sorted].sort((a, b) => b - a));
  assert.equal(topLines(lines, skaters, t, { minToi: 1e9 }).lines.length, 0);
});

test("colours stay visible and distinct", () => {
  assert.notEqual(visibleColor("#001030"), "#001030");
  assert.equal(visibleColor("#ffffff"), "#ffffff");
  const c = lineColors("#c8102e", "#c8102f");
  assert.notEqual(c.away, c.home);
});
