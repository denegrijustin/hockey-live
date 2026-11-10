import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";
import { createFlow, computeFlow, decodeSit, dangerMultiplier, playSecond, periodStart, otSeconds, describeFlow, readoutText, pointAt, clockAt, FLOW_WEIGHTS, FLOW_REF, FLOW_WINDOW_SEC } from "../src/lib/flow.mjs";

const raw = JSON.parse(readFileSync(new URL("./fixtures/raw-live-game.json", import.meta.url), "utf8"));
const feed = normalizeGameFeed(raw);
const opts = { home: feed.home, away: feed.away, gameType: feed.type, roster: feed.roster };

// Independent reference: direct summation over every attempt for every sample (no running window).
function brute(plays, o, step = 10) {
  const home = o.home, away = o.away;
  const ev = [];
  for (const p of plays) {
    const t = playSecond(p, o.gameType);
    if (t == null || FLOW_WEIGHTS[p.type] == null) continue;
    const team = (o.roster ?? []).find((r) => r.id === p.pid)?.team ?? p.team;
    if (team !== home && team !== away) continue;
    const mult = p.type === "shot-on-goal" || p.type === "missed-shot" ? dangerMultiplier(p.x, p.y) : 1;
    ev.push({ t, team, w: FLOW_WEIGHTS[p.type] * mult });
  }
  const tEnd = Math.max(...plays.map((p) => playSecond(p, o.gameType)).filter((v) => v != null));
  const at = (t) => {
    let h = 0, a = 0;
    for (const e of ev) { const age = t - e.t; if (age < 0 || age >= FLOW_WINDOW_SEC) continue; (e.team === home ? (h += e.w * (1 - age / FLOW_WINDOW_SEC)) : (a += e.w * (1 - age / FLOW_WINDOW_SEC))); }
    return { t, home: h, away: a, value: Math.max(-1, Math.min(1, (h - a) / FLOW_REF)) };
  };
  const out = [];
  for (let t = 0; t < tEnd; t += step) out.push(at(t));
  if (!out.length || out.at(-1).t < tEnd) out.push(at(tEnd));
  return out;
}
const close = (got, want, label) => {
  assert.equal(got.length, want.length, `${label}: length`);
  got.forEach((g, i) => {
    assert.equal(g.t, want[i].t, `${label}: t@${i}`);
    for (const k of ["home", "away", "value"]) assert.ok(Math.abs(g[k] - want[i][k]) < 1e-5, `${label}: ${k}@${i} ${g[k]} vs ${want[i][k]}`);
  });
};

test("sit decoding: documented digits, empty net, unknown values", () => {
  assert.equal(decodeSit("1551").state, "even");
  const away = decodeSit("1541");
  assert.equal(away.state, "away-pp"); assert.equal(away.strength, "5v4");
  assert.equal(decodeSit("1451").state, "home-pp");
  assert.equal(decodeSit("1431").strength, "4v3");
  assert.equal(decodeSit("1531").strength, "5v3");
  assert.equal(decodeSit("1441").state, "even"); // 4v4
  assert.equal(decodeSit("1331").state, "even"); // 3v3 overtime
  assert.equal(decodeSit("0651").state, "even"); // away net empty: 6 attackers v 5 is not a power play
  assert.equal(decodeSit("0641").state, "away-pp"); // empty net but still a 5v4 advantage
  assert.equal(decodeSit("1010").state, "other"); // penalty-shot style codes never draw a band
  for (const bad of [null, undefined, "", "155", "abcd", "15511", 1551]) assert.equal(decodeSit(bad), null);
});

test("time axis: regular-season OT is 5 minutes, playoff OT is 20, shootout and bad clocks are dropped", () => {
  assert.equal(otSeconds(2), 300); assert.equal(otSeconds(3), 1200);
  assert.equal(periodStart(4, 2), 3600); assert.equal(periodStart(5, 2), 3900); assert.equal(periodStart(5, 3), 4800);
  assert.equal(playSecond({ period: 2, time: "05:30" }), 1200 + 330);
  assert.equal(playSecond({ period: 4, periodType: "OT", time: "04:59" }, 2), 3600 + 299);
  assert.equal(playSecond({ period: 4, periodType: "OT", time: "06:00" }, 2), null);
  assert.equal(playSecond({ period: 4, periodType: "OT", time: "06:00" }, 3), 3600 + 360);
  assert.equal(playSecond({ period: 5, periodType: "SO", time: "00:00" }), null);
  assert.equal(playSecond({ period: 1, time: "x" }), null);
  assert.equal(clockAt(1500), "P2 05:00");
});

test("weights: goal once, blocked shots credited to the shooter, hits/penalties excluded, shootout excluded, no x/y => no multiplier", () => {
  const o = { home: "H", away: "A", gameType: 2 };
  const base = { period: 1, periodType: "REG", team: "H" };
  const plays = [
    { ...base, id: 1, order: 1, type: "goal", time: "01:00", x: 85, y: 0 },
    { ...base, id: 2, order: 2, type: "shot-on-goal", time: "01:00" },
    { ...base, id: 3, order: 3, type: "missed-shot", time: "01:00" },
    { ...base, id: 4, order: 4, type: "blocked-shot", time: "01:00", x: 80, y: 0 },
    { ...base, id: 5, order: 5, type: "hit", time: "01:00" },
    { ...base, id: 6, order: 6, type: "penalty", time: "01:00", duration: 2 },
    { ...base, id: 7, order: 7, type: "goal", time: "00:00", period: 5, periodType: "SO" },
  ];
  const s = computeFlow(plays, o);
  const at60 = s.points.find((p) => p.t === 60) ?? pointAt(s, 60);
  assert.ok(Math.abs(at60.home - (1 + 0.3 + 0.15 + 0.1)) < 1e-6, `got ${at60.home}`);
  assert.equal(at60.away, 0);
  assert.equal(s.totals.home.goals, 1); assert.equal(s.totals.home.att, 4);
  // blocked shot is credited to the event owner (the shooter's team in the feed) unless a roster says otherwise
  const roster = [{ id: 9, team: "A" }];
  const s2 = computeFlow([{ ...base, id: 1, order: 1, type: "blocked-shot", time: "01:00", pid: 9 }], { ...o, roster });
  assert.equal(s2.totals.away.blocked, 1); assert.equal(s2.totals.home.att, 0);
  // linear decay across the window
  const half = pointAt(computeFlow([{ ...base, id: 1, order: 1, type: "goal", time: "00:00" }, { ...base, id: 2, order: 2, type: "faceoff", time: "10:00" }], o), 150);
  assert.ok(Math.abs(half.home - 0.5) < 1e-6);
  assert.equal(pointAt(computeFlow([{ ...base, id: 1, order: 1, type: "goal", time: "00:00" }, { ...base, id: 2, order: 2, type: "faceoff", time: "10:00" }], o), 300).home, 0);
});

test("danger multiplier is 1.0 to 1.6 and only used with a spot", () => {
  assert.equal(dangerMultiplier(null, 3), 1);
  assert.equal(dangerMultiplier(undefined, undefined), 1);
  assert.equal(dangerMultiplier(85, 0), 1.6);
  assert.equal(dangerMultiplier(-85, 3), 1.6);
  assert.equal(dangerMultiplier(0, 0), 1);
  const mid = dangerMultiplier(55, 0);
  assert.ok(mid > 1 && mid < 1.6);
});

test("normalised values stay in [-1, 1] and are never NaN; empty input gives a null series", () => {
  assert.equal(computeFlow([], opts), null);
  assert.equal(computeFlow(undefined, opts), null);
  assert.equal(computeFlow([{ type: "shot-on-goal" }], opts), null);
  assert.equal(describeFlow(null), "No play-by-play yet.");
  const swamp = Array.from({ length: 80 }, (_, i) => ({ id: i, order: i, type: "goal", period: 1, periodType: "REG", time: `00:${String(i % 60).padStart(2, "0")}`, team: "H" }));
  const s = computeFlow(swamp, { home: "H", away: "A" });
  for (const p of s.points) { assert.ok(Number.isFinite(p.value) && Math.abs(p.value) <= 1); assert.ok(Number.isFinite(p.net)); }
  const onlyFaceoffs = computeFlow([{ id: 1, order: 1, type: "faceoff", period: 1, time: "00:10", team: "H" }], { home: "H", away: "A" });
  assert.ok(onlyFaceoffs.points.every((p) => p.value === 0));
});

test("real fixture: full series matches direct summation; markers and bands come from the feed", () => {
  const s = computeFlow(feed.plays, opts);
  close(s.points, brute(feed.plays, opts), "fixture");
  assert.equal(s.periods.length, 3);
  assert.equal(s.duration, 3600);
  assert.equal(s.goals.length, 0); // the recorded game has no goals (documented in the contracts)
  assert.equal(s.penalties.filter((p) => p.minutes === 2).length, 2);
  // CAR penalised at 08:32 (sit 1551 on the play, 1541 on the next): FLA power play back-dated to the penalty, capped by the 2 minutes
  const pp = s.bands.find((b) => b.team === "FLA");
  assert.ok(pp, "FLA power play");
  assert.equal(pp.strength, "5v4"); assert.equal(pp.against, "CAR");
  assert.equal(pp.start, 8 * 60 + 32);
  assert.ok(pp.end - pp.start <= 120 && pp.end > pp.start);
  assert.ok(s.bands.every((b) => b.team !== "CAR" || b.against === "FLA"));
  // blocked shots are credited to the shooting team (FLA shooters: more FLA blocked than CAR)
  assert.ok(s.totals.home.blocked + s.totals.away.blocked === 6);
  // without sit there are no bands, without x/y there is no multiplier
  const noSit = computeFlow(feed.plays.map((p) => ({ ...p, sit: null })), opts);
  assert.equal(noSit.bands.length, 0); assert.equal(noSit.hasSit, false);
  const noXY = computeFlow(feed.plays.map((p) => ({ ...p, x: null, y: null })), opts);
  assert.equal(noXY.dangerAdjusted, 0);
  assert.ok(s.dangerAdjusted > 0);
  const text = describeFlow(s);
  assert.match(text, /shot-attempt pressure in the 1st/);
  assert.match(text, /No goals yet/);
  assert.match(text, /Power plays: FLA 5v4/);
  assert.ok(!/NaN|undefined/.test(text));
  assert.match(readoutText(s, s.latest), /^P\d \d\d:\d\d — /);
});

function history() {
  // derived: the recorded fixture replicated into a 456-play playoff-length history (four copies, periods 1-4, ids unique)
  const out = [];
  for (let k = 0; k < 4; k++) for (const p of feed.plays) out.push({ ...p, id: p.id + k * 1000, order: p.order + k * 100000, period: k + 1, periodType: k === 3 ? "OT" : "REG" });
  return out;
}

test("incremental append equals full recompute over the fixture and a replicated 400+ play history", () => {
  for (const [plays, o] of [[feed.plays, opts], [history(), { ...opts, gameType: 3 }]]) {
    const full = computeFlow(plays, o);
    close(full.points, brute(plays, o), "full vs brute");
    for (const chunk of [1, 3, 17, 50]) {
      const f = createFlow(o);
      for (let i = 0; i < plays.length; i += chunk) {
        const slice = plays.slice(i, i + chunk);
        f.push(slice);
        const upTo = plays.slice(0, i + chunk);
        const part = f.series();
        if (part) close(part.points, brute(upTo, o), `chunk ${chunk} prefix ${i + chunk}`);
      }
      const inc = f.series();
      close(inc.points, full.points, `chunk ${chunk} final`);
      assert.deepEqual(inc.bands, full.bands); assert.deepEqual(inc.goals, full.goals); assert.deepEqual(inc.totals, full.totals);
      f.push(plays); // overlapping repeat polls never duplicate
      close(f.series().points, full.points, `chunk ${chunk} repeat`);
    }
  }
  assert.ok(history().length >= 400);
});

test("out-of-order and corrected plays rebuild to the same answer", () => {
  const plays = feed.plays;
  const shuffled = [...plays.slice(40), ...plays.slice(0, 40)];
  const f = createFlow(opts).push(shuffled);
  close(f.series().points, computeFlow(plays, opts).points, "late arrival");
  const g = createFlow(opts).push(plays);
  g.series();
  const changed = plays.map((p) => (p.type === "shot-on-goal" && p.id === plays.find((q) => q.type === "shot-on-goal").id ? { ...p, type: "missed-shot" } : p));
  g.push(changed);
  close(g.series().points, computeFlow(changed, opts).points, "corrected play");
});

test("goal markers carry score after; overtime window follows game type; text alternative", () => {
  const plays = [
    { id: 1, order: 1, type: "shot-on-goal", period: 1, periodType: "REG", time: "03:00", team: "H", x: 80, y: 0, sit: "1551" },
    { id: 2, order: 2, type: "goal", period: 1, periodType: "REG", time: "03:12", team: "H", player: "A Player", score: { home: 1, away: 0 }, sit: "1551" },
    { id: 3, order: 3, type: "shot-on-goal", period: 2, periodType: "REG", time: "01:00", team: "A", x: -80, y: 0, sit: "1551" },
    { id: 4, order: 4, type: "goal", period: 4, periodType: "OT", time: "01:30", team: "A", score: { home: 1, away: 1 }, sit: "1331" },
  ];
  const reg = computeFlow(plays, { home: "H", away: "A", gameType: 2 });
  assert.equal(reg.periods.at(-1).end, 3900); assert.equal(reg.duration, 3900);
  assert.deepEqual(reg.goals.map((g) => [g.team, g.t, g.score]), [["H", 192, { home: 1, away: 0 }], ["A", 3690, { home: 1, away: 1 }]]);
  const po = computeFlow(plays, { home: "H", away: "A", gameType: 3 });
  assert.equal(po.duration, 4800);
  const text = describeFlow(reg);
  assert.match(text, /H led the shot-attempt pressure in the 1st; A in the 2nd/);
  assert.match(text, /Goals: 1st 3:12 H \(A 0, H 1\), OT 1:30 A \(A 1, H 1\)/);
  assert.ok(reg.points.every((p) => Number.isFinite(p.value)));
});

test("pressure is a pure function of the data: same plays, same series", () => {
  assert.deepEqual(computeFlow(feed.plays, opts), computeFlow([...feed.plays].reverse(), opts));
});
