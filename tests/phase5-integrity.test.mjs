// Phase 5 data-integrity checks over REAL recorded play-by-play (tests/fixtures/gc, docs/phase5-qa-fixtures.md) through normalizeGameFeed.
// Derived/replicated variants come from tests/fixtures/gc/builder.mjs and are labelled in raw._provenance.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";
import * as B from "./fixtures/gc/builder.mjs";

const REAL = { live: B.REAL.live(), reg: B.REAL.reg(), ot: B.REAL.ot(), so: B.REAL.so() };
const finished = ["reg", "ot", "so"];
const cases = Object.entries(REAL);

test("real samples have the expected shape (guards the fixtures themselves)", () => {
  assert.equal(REAL.reg.periodDescriptor.periodType, "REG");
  assert.equal(REAL.ot.periodDescriptor.periodType, "OT");
  assert.equal(REAL.so.periodDescriptor.periodType, "SO");
  for (const k of finished) assert.ok(B.provenance(REAL[k]).includes("real") && REAL[k].plays.length > 250, k);
  assert.ok(B.scoringGoals(REAL.ot).length >= 7, "the OT game has real goals with assists");
});

for (const [name, raw] of cases) {
  test(`${name}: plays are ordered by sortOrder, ids are unique and stable`, () => {
    const f = normalizeGameFeed(raw);
    const orders = f.plays.map((p) => p.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    const ids = f.plays.map((p) => p.id);
    assert.equal(new Set(ids).size, ids.length, "duplicate event ids");
    assert.ok(ids.every(Number.isInteger));
    // Stable: normalizing twice (a re-poll of the same response) yields identical ids in identical order.
    assert.deepEqual(normalizeGameFeed(raw).plays.map((p) => p.id), ids);
    // eventId is NOT chronological in real data; order must come from sortOrder (this documents it).
    if (name !== "live") assert.notDeepEqual(ids, [...ids].sort((a, b) => a - b), "real eventIds are expected to differ from sortOrder");
  });
  test(`${name}: period labels, clock parsing and null-safety`, () => {
    const f = normalizeGameFeed(raw);
    for (const p of f.plays) {
      assert.ok(Number.isInteger(p.period) && p.period >= 1, `period ${p.period}`);
      assert.ok(["REG", "OT", "SO"].includes(p.periodType), p.periodType);
      assert.match(p.time, /^\d{2}:\d{2}$/);
      const [m, s] = p.time.split(":").map(Number);
      assert.ok(s < 60 && m <= 20, `time ${p.time}`);
      if (p.left != null) assert.match(p.left, /^\d{2}:\d{2}$/);
      if (p.periodType === "REG") assert.ok(p.period <= 3);
      if (p.periodType === "OT") assert.ok(p.period >= 4);
      assert.ok(p.sit == null || /^\d{4}$/.test(p.sit), `situation ${p.sit}`);
      for (const k of ["team", "x", "y", "player", "pid", "zone", "shotType", "reason", "secondary", "other", "penalty", "duration"]) assert.ok(k in p, `${k} present (null when absent)`);
    }
    if (finished.includes(name)) assert.equal(f.clockRunning, false);
  });
  test(`${name}: elapsed + remaining add up to the period length on every play that has both`, () => {
    for (const p of normalizeGameFeed(raw).plays) {
      if (p.left == null || p.periodType === "SO") continue;
      const sec = (t) => t.split(":").reduce((a, v) => a * 60 + Number(v), 0);
      const len = p.periodType === "OT" && raw.gameType === 2 ? 300 : p.periodType === "OT" ? 1200 : 1200;
      assert.equal(sec(p.time) + sec(p.left), len, `${p.type} ${p.time}+${p.left} in ${p.periodType}${p.period}`);
    }
  });
}

for (const k of finished) {
  test(`${k}: goals agree with the final score (shootout goals are not counted in the score)`, () => {
    const raw = REAL[k];
    const f = normalizeGameFeed(raw);
    const counted = f.goals.filter((g) => g.periodType !== "SO");
    const home = counted.filter((g) => g.team === f.home).length, away = counted.filter((g) => g.team === f.away).length;
    if (k === "so") {
      // The recorded shootout game ends level in regulation + OT; the SO winner gets +1 on the scoreboard that the play list does not carry.
      assert.equal(Math.abs(home - away), 0, "level before the shootout");
      assert.equal(Math.max(f.homeScore, f.awayScore) - Math.min(f.homeScore, f.awayScore), 1);
    } else {
      assert.equal(home, f.homeScore);
      assert.equal(away, f.awayScore);
    }
    // score-after on each goal is monotonic and matches the running count
    let h = 0, a = 0;
    for (const g of counted) {
      if (g.team === f.home) h++; else a++;
      assert.deepEqual(g.score, { home: h, away: a }, `score after goal ${g.id}`);
    }
  });
  test(`${k}: goals carry scorer, goalie and assists as {id,name} resolved from the roster`, () => {
    const f = normalizeGameFeed(REAL[k]);
    const ids = new Set(f.roster.map((r) => r.id));
    for (const g of f.goals.filter((x) => x.periodType !== "SO")) {
      assert.ok(g.pid && ids.has(g.pid) && g.player, "scorer");
      assert.ok(Array.isArray(g.assists) && g.assists.length <= 2);
      for (const a of g.assists) assert.ok(ids.has(a.id) && a.name);
      assert.notEqual(g.assists[0]?.id, g.pid, "scorer is not his own assist");
    }
  });
}
test("the OT game: its last scoring goal is in OT and ends the game", () => {
  const f = normalizeGameFeed(REAL.ot);
  const last = f.goals.filter((g) => g.periodType !== "SO").at(-1);
  assert.equal(last.periodType, "OT");
  assert.equal(f.end, "OT");
  assert.equal(f.state, "OFF");
});
test("the SO game: shootout plays are labelled SO and excluded from shots", () => {
  const f = normalizeGameFeed(REAL.so);
  assert.equal(f.end, "SO");
  assert.ok(f.plays.some((p) => p.periodType === "SO"));
  assert.ok(f.shots.every((p) => p.periodType !== "SO"));
});

// ---------- states (envelope-only mutations) ----------
test("envelope states map to the app's scoreboard fields without touching plays", () => {
  const base = REAL.reg;
  const row = (s, o) => normalizeGameFeed(B.withState(base, s, o));
  assert.equal(row("live").state, "LIVE"); assert.equal(row("live", { clock: "05:00" }).clock, "05:00");
  assert.equal(row("crit").state, "CRIT"); assert.equal(row("crit").intermission, true);
  assert.equal(row("ot").periodType, "OT"); assert.equal(row("so").periodType, "SO");
  assert.equal(row("final").state, "FINAL"); assert.equal(row("off").state, "OFF");
  for (const s of ["ppd", "cncl", "susp"]) { const f = row(s); assert.equal(f.scheduleState, s.toUpperCase()); assert.equal(f.plays.length, 0); }
  for (const s of ["pre", "fut"]) { const f = row(s); assert.equal(f.state, s.toUpperCase()); assert.equal(f.plays.length, 0); assert.equal(f.homeShots, null); }
  assert.equal(row("live").plays.length, base.plays.length);
});

// ---------- poll slicing ----------
test("poll slices are prefixes of each other: ids only ever grow and scores follow the plays", () => {
  const seq = B.pollSequence(REAL.ot, 6).map((r) => normalizeGameFeed(r));
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1].plays.map((p) => p.id), next = seq[i].plays.map((p) => p.id);
    assert.ok(next.length >= prev.length);
    assert.ok(prev.every((id) => next.includes(id)), "a later poll keeps every earlier event");
    assert.ok(seq[i].homeScore + seq[i].awayScore >= seq[i - 1].homeScore + seq[i - 1].awayScore);
  }
  const last = seq.at(-1);
  assert.equal(last.homeScore, normalizeGameFeed(REAL.ot).homeScore);
  assert.equal(last.plays.length, REAL.ot.plays.length);
  // sliced goals: the score in the envelope equals the goals sliced in
  for (const f of seq) assert.equal(f.homeScore + f.awayScore, f.goals.length);
});

// ---------- derived transformations ----------
test("derived: a shot relabelled as a goal gets a scorer and score-after; removing it again restores the shot-free feed (disallowed)", () => {
  const { raw, eventId } = B.relabelShotAsGoal(REAL.live);
  assert.ok(B.provenance(raw).some((t) => t.startsWith("derived:relabel-goal")));
  const f = normalizeGameFeed(raw);
  const g = f.goals.find((x) => x.id === eventId);
  assert.ok(g && g.player && g.score && g.score.home + g.score.away === 1);
  const gone = normalizeGameFeed(B.removeEvent(raw, eventId));
  assert.equal(gone.goals.length, 0);
  assert.equal(gone.plays.length, REAL.live.plays.length - 1);
});
test("derived: swapping sortOrder reorders without duplicating or losing events; a correction changes assists only", () => {
  const ids = REAL.reg.plays.slice(10, 12).map((p) => p.eventId);
  const f0 = normalizeGameFeed(REAL.reg), f1 = normalizeGameFeed(B.swapOrder(REAL.reg, ids[0], ids[1]));
  assert.equal(f1.plays.length, f0.plays.length);
  assert.deepEqual([...f1.plays.map((p) => p.id)].sort(), [...f0.plays.map((p) => p.id)].sort());
  const goal = B.scoringGoals(REAL.ot)[1];
  const other = REAL.ot.rosterSpots.find((r) => r.teamId === goal.details.eventOwnerTeamId && r.playerId !== goal.details.scoringPlayerId && r.playerId !== goal.details.assist1PlayerId).playerId;
  const fixed = normalizeGameFeed(B.changeAssists(REAL.ot, goal.eventId, [other]));
  const before = normalizeGameFeed(REAL.ot).goals.find((g) => g.id === goal.eventId);
  const after = fixed.goals.find((g) => g.id === goal.eventId);
  assert.deepEqual(after.assists.map((a) => a.id), [other]);
  assert.equal(after.player, before.player);
  assert.deepEqual(after.score, before.score);
});
test("derived: a feed with no timestamps or sortOrder does not throw and keeps every event", () => {
  const f = normalizeGameFeed(B.dropTimestamps(REAL.reg));
  assert.equal(f.plays.length, REAL.reg.plays.length);
  assert.ok(f.plays.every((p) => p.order === 0 && p.time == null && p.left == null));
});
test("replicated: a 400-play history has unique ids, ordered plays and normalizes quickly", () => {
  const raw = B.replicate(REAL.ot, 400);
  assert.ok(B.provenance(raw).includes("replicated:400"));
  const t = performance.now();
  const f = normalizeGameFeed(raw);
  const ms = performance.now() - t;
  assert.equal(f.plays.length, 400);
  assert.equal(new Set(f.plays.map((p) => p.id)).size, 400);
  const o = f.plays.map((p) => p.order);
  assert.deepEqual(o, [...o].sort((a, b) => a - b));
  assert.ok(ms < 250, `normalize took ${ms.toFixed(1)} ms`);
});
