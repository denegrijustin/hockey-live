import test from "node:test";
import assert from "node:assert/strict";
import { reconcile, emptyStore, hashPlay, eventKey, compareEvents, VOID_AFTER } from "../src/lib/event-store.mjs";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";
import { rawGame, realGoals, poll, deriveGoal, withPlays, dropPlay, rekeyPlay, orders } from "./fixtures/poll-sequences.mjs";

// Sequences are slices of the REAL recorded game (raw-live-game.json) pushed through the real normalizer. Goals are DERIVED
// (see tests/fixtures/poll-sequences.mjs): the recorded game has none; their shape follows tests/fixtures/real-goal-events.json.
const raw = rawGame();
const feed = (r) => normalizeGameFeed(r);
const plays = (r) => feed(r).plays;
const O = orders(raw);
const at = (frac) => O[Math.floor((O.length - 1) * frac)];
const GOAL1 = 9001, GOAL2 = 9002;
const g1 = deriveGoal(raw, { eventId: GOAL1, afterOrder: at(0.5), team: "home", scores: { home: 1, away: 0 } });
const g2 = deriveGoal(raw, { eventId: GOAL2, afterOrder: at(0.8), team: "away", scores: { home: 1, away: 1 } });
const withGoals = withPlays(raw, g1, g2);
const ids = (evs) => evs.map((e) => e.id);

test("the recorded game really has no goals and the derived goals are labelled", () => {
  assert.equal(raw.plays.filter((p) => p.typeDescKey === "goal").length, 0);
  assert.match(g1._derived, /not recorded data/);
});

test("growing polls (overlapping slices of the real game): nothing is duplicated, order is by sortOrder, counts add up", () => {
  let store = null;
  let total = 0;
  let seq = 0;
  for (const cut of [at(0.3), at(0.6), at(0.6), at(1)]) {
    const r = reconcile(store, plays(poll(raw, { upToOrder: cut })), { seq: ++seq, gameId: raw.id });
    total += r.added.length;
    assert.equal(r.changed.length, 0);
    assert.equal(r.removed.length, 0);
    store = r.store;
    assert.equal(new Set(ids(r.events)).size, r.events.length);
    assert.deepEqual(r.events.map((e) => e.order), r.events.map((e) => e.order).sort((a, b) => a - b));
  }
  assert.equal(total, raw.plays.length);
  assert.equal(store.events.length, raw.plays.length);
  assert.equal(r0(store).key, eventKey(raw.id, store.events[0].id));
});
function r0(store) { const first = store.events[0]; return { key: eventKey(store.gameId, first.id) }; }

test("a repeat poll changes nothing and keeps the same array and event objects (React can skip)", () => {
  const a = reconcile(null, plays(raw), { seq: 1 });
  const b = reconcile(a.store, plays(raw), { seq: 2 });
  assert.deepEqual([b.added, b.changed, b.removed, b.voided], [[], [], [], []]);
  assert.equal(b.events, a.events);
  assert.equal(b.store.events[5], a.store.events[5]);
});

test("added items carry the store key and the play", () => {
  const r = reconcile(null, plays(withGoals), { seq: 1, gameId: raw.id });
  const goal = r.added.find((x) => x.id === GOAL1);
  assert.equal(goal.key, `${raw.id}:${GOAL1}`);
  assert.equal(goal.play.type, "goal");
  assert.deepEqual(goal.play.score, { home: 1, away: 0 });
  assert.equal(goal.play.assists.length, 2);
  assert.ok(goal.play.goalie.name);
  assert.deepEqual(r.score, { home: 1, away: 1 });
});

test("changed: a late assist correction, a scorer fix or a strength change is detected by content hash", () => {
  const first = reconcile(null, plays(withGoals), { seq: 1 });
  // DERIVED correction: the NHL later credits a different second assist.
  const fixed = structuredClone(withGoals);
  const play = fixed.plays.find((p) => p.eventId === GOAL1);
  const other = raw.rosterSpots.find((r) => r.teamId === raw.homeTeam.id && r.playerId !== play.details.assist2PlayerId && r.playerId !== play.details.assist1PlayerId && r.playerId !== play.details.scoringPlayerId && r.positionCode !== "G");
  play.details.assist2PlayerId = other.playerId;
  const r = reconcile(first.store, plays(fixed), { seq: 2 });
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0].id, GOAL1);
  assert.notEqual(r.changed[0].prev.assists[1].id, r.changed[0].play.assists[1].id);
  assert.deepEqual([r.added, r.removed, r.voided], [[], [], []]);
  assert.equal(hashPlay(r.changed[0].prev) === hashPlay(r.changed[0].play), false);
  // scorer fix
  const scorer = structuredClone(fixed);
  scorer.plays.find((p) => p.eventId === GOAL1).details.scoringPlayerId = other.playerId;
  assert.equal(reconcile(r.store, plays(scorer), { seq: 3 }).changed.length, 1);
  // strength (situation code) change
  const sit = structuredClone(scorer);
  sit.plays.find((p) => p.eventId === GOAL1).situationCode = "1441";
  assert.equal(reconcile(reconcile(r.store, plays(scorer), { seq: 3 }).store, plays(sit), { seq: 4 }).changed.length, 1);
});

test("a disallowed goal is voided only after two consecutive polls without it, and the score is lowered consistently", () => {
  assert.equal(VOID_AFTER, 2);
  const next = (r) => poll(r, { upToOrder: Infinity });
  const full = reconcile(null, plays(withGoals), { seq: 1 });
  assert.deepEqual(full.score, { home: 1, away: 1 });
  // DERIVED: the NHL removes goal 1 (and the later goal's running score is therefore corrected to 0-1 in the same response).
  const dropped = dropPlay(withGoals, GOAL1);
  dropped.plays.find((p) => p.eventId === GOAL2).details.homeScore = 0;
  const p1 = reconcile(full.store, plays(next(dropped)), { seq: 2 });
  assert.equal(p1.voided.length, 0, "first poll without it: debounced");
  assert.ok(ids(p1.events).includes(GOAL1), "still shown during the debounce");
  const p2 = reconcile(p1.store, plays(next(dropped)), { seq: 3 });
  assert.deepEqual(ids(p2.voided), [GOAL1]);
  assert.deepEqual(ids(p2.removed), [GOAL1]);
  assert.ok(!ids(p2.events).includes(GOAL1));
  assert.deepEqual(p2.score, { home: 0, away: 1 });
  const p3 = reconcile(p2.store, plays(next(dropped)), { seq: 4 });
  assert.equal(p3.voided.length, 0, "voided once only");
});

test("a one-poll blip does not void; the counter resets when the goal comes back", () => {
  const full = reconcile(null, plays(withGoals), { seq: 1 });
  const blip = reconcile(full.store, plays(dropPlay(withGoals, GOAL1)), { seq: 2 });
  assert.equal(blip.voided.length, 0);
  const back = reconcile(blip.store, plays(withGoals), { seq: 3 });
  assert.deepEqual([back.added, back.changed, back.voided, back.removed], [[], [], [], []]);
  const blipAgain = reconcile(back.store, plays(dropPlay(withGoals, GOAL1)), { seq: 4 });
  assert.equal(blipAgain.voided.length, 0, "not two in a row");
});

test("fingerprint re-match: the same goal under a new eventId is changed (rekeyed), not removed and added", () => {
  const full = reconcile(null, plays(withGoals), { seq: 1 });
  const r = reconcile(full.store, plays(rekeyPlay(withGoals, GOAL1, 9101)), { seq: 2 });
  assert.deepEqual([r.added, r.removed, r.voided], [[], [], []]);
  assert.equal(r.changed.length, 1);
  assert.equal(r.changed[0].reason, "rekeyed");
  assert.equal(r.changed[0].from, GOAL1);
  assert.equal(r.changed[0].id, 9101);
  assert.equal(r.events.filter((e) => e.type === "goal").length, 2);
  assert.deepEqual(r.score, { home: 1, away: 1 });
  // still no void on the following poll
  assert.equal(reconcile(r.store, plays(rekeyPlay(withGoals, GOAL1, 9101)), { seq: 3 }).voided.length, 0);
});

test("a goal that was voided and comes back under a new id is added as reinstated, not a brand new goal", () => {
  let s = reconcile(null, plays(withGoals), { seq: 1 }).store;
  const gone = dropPlay(withGoals, GOAL1);
  s = reconcile(s, plays(gone), { seq: 2 }).store;
  const v = reconcile(s, plays(gone), { seq: 3 });
  assert.equal(v.voided.length, 1);
  const back = reconcile(v.store, plays(rekeyPlay(withGoals, GOAL1, 9201)), { seq: 4 });
  assert.equal(back.added.length, 1);
  assert.equal(back.added[0].reinstated, true);
  assert.equal(back.added[0].from, GOAL1);
});

test("out-of-order responses are dropped (sequence guard)", () => {
  const a = reconcile(null, plays(poll(raw, { upToOrder: at(0.7) })), { seq: 5 });
  const stale = reconcile(a.store, plays(poll(raw, { upToOrder: at(0.4) })), { seq: 4 });
  assert.equal(stale.dropped, "out-of-order");
  assert.equal(stale.store, a.store);
  assert.deepEqual([stale.added, stale.removed], [[], []]);
  const same = reconcile(a.store, plays(poll(raw, { upToOrder: at(0.7) })), { seq: 5 });
  assert.equal(same.dropped, null);
  const newer = reconcile(a.store, plays(raw), { seq: 6 });
  assert.ok(newer.added.length > 0);
});

test("prefix rule: a lagging response (strict prefix of the store) never shrinks it, goals included, however many times it arrives", () => {
  const full = reconcile(null, plays(withGoals), { seq: 1 });
  const lagOrder = g2.sortOrder - 1; // a copy that has not yet got the later goal
  let s = full.store;
  for (let i = 0; i < 4; i++) {
    const r = reconcile(s, plays(poll(withGoals, { upToOrder: lagOrder })), { seq: 2 + i });
    assert.deepEqual([r.removed, r.voided, r.added, r.changed], [[], [], [], []], `lag poll ${i}`);
    assert.equal(r.events.length, full.events.length);
    s = r.store;
  }
  assert.ok(ids(s.events).includes(GOAL2));
});

test("an empty or garbage response never erases the store", () => {
  const full = reconcile(null, plays(withGoals), { seq: 1 });
  for (const bad of [[], null, undefined, [null, {}, { id: null }]]) {
    const r = reconcile(full.store, bad, { seq: 2 });
    assert.equal(r.events.length, full.events.length);
    assert.equal(r.voided.length, 0);
  }
  assert.equal(reconcile(null, []).events.length, 0);
  assert.deepEqual(reconcile(null, null).score, { home: 0, away: 0 });
});

test("a non-goal event inside the response's range that vanishes is removed after two polls (not voided)", () => {
  const full = reconcile(null, plays(raw), { seq: 1 });
  const victim = raw.plays[40].eventId;
  const trimmed = dropPlay(raw, victim);
  const a = reconcile(full.store, plays(trimmed), { seq: 2 });
  assert.equal(a.removed.length, 0);
  const b = reconcile(a.store, plays(trimmed), { seq: 3 });
  assert.deepEqual(ids(b.removed), [victim]);
  assert.equal(b.voided.length, 0);
  assert.equal(b.events.length, raw.plays.length - 1);
});

test("events with missing period, order or time sort last in their position and never throw", () => {
  const sloppy = [
    { id: 3, type: "hit", period: 1, order: 30, time: "01:00" },
    { id: 1, type: "hit", period: 1, order: null, time: null },
    { id: 2, type: "hit", period: 1 },
    { id: 4, type: "hit", period: null, order: 5 },
    { id: 5, type: "hit", period: 2, order: 40, time: "00:10" },
    { id: 6, type: "goal", period: 2, order: 41, team: "NYR", pid: 1 },
  ];
  const r = reconcile(null, sloppy, { seq: 1 });
  assert.deepEqual(ids(r.events), [3, 1, 2, 5, 6, 4]);
  assert.deepEqual(r.score, null, "a goal with no score field: unknown, not invented");
  assert.equal(compareEvents({}, {}), 0);
});

test("score ignores shootout goals and uses the last goal's score after it", () => {
  const evs = [
    { id: 1, type: "goal", period: 3, order: 1, score: { home: 2, away: 2 } },
    { id: 2, type: "goal", period: 5, periodType: "SO", order: 2, score: { home: 3, away: 2 } },
  ];
  assert.deepEqual(reconcile(null, evs).score, { home: 2, away: 2 });
});

test("the REAL goal events (trimmed NHL game 2025020500) reconcile to the real final score and survive the replay", () => {
  const real = feed(realGoals());
  const r = reconcile(null, real.plays, { seq: 1, gameId: real.id });
  assert.equal(r.added.length, 3);
  assert.deepEqual(r.score, { home: 5, away: 4 });
  assert.deepEqual(r.events.map((e) => e.id), [261, 281, 1104]);
  const again = reconcile(r.store, real.plays, { seq: 2, gameId: real.id });
  assert.equal(again.events, r.events);
});

test("a full replay of a goal sequence is idempotent across 50 random orderings of overlapping polls with increasing seq", () => {
  const cuts = [at(0.2), at(0.5), at(0.55), at(0.9), at(1)].map((c) => poll(withGoals, { upToOrder: c }));
  let store = null;
  let seq = 0;
  let rng = 7;
  const rand = () => (rng = (rng * 48271) % 2147483647) / 2147483647;
  for (let i = 0; i < 50; i++) store = reconcile(store, plays(cuts[Math.floor(rand() * cuts.length)]), { seq: ++seq }).store;
  store = reconcile(store, plays(withGoals), { seq: ++seq }).store;
  assert.equal(store.events.length, withGoals.plays.length);
  assert.deepEqual(store.score, { home: 1, away: 1 });
});

test("normalizeGameFeed reads the REAL goal shape: scorer, two assists, goalie, score after, OT period (verified against NHL game 2025020500)", () => {
  const goals = feed(realGoals()).goals;
  const ot = goals.find((g) => g.id === 1104);
  assert.equal(ot.player, "J.T. Miller");
  assert.deepEqual(ot.assists.map((a) => a.name), ["Mika Zibanejad", "Vincent Trocheck"]);
  assert.equal(ot.goalie.name, "Jacob Fowler");
  assert.deepEqual(ot.score, { home: 5, away: 4 });
  assert.equal(ot.periodType, "OT");
  assert.equal(ot.team, "NYR");
  assert.equal(ot.sit, "1341");
});

test("emptyStore", () => {
  assert.deepEqual(emptyStore(7), { gameId: 7, seq: null, entries: {}, events: [], score: { home: 0, away: 0 }, tombstones: {} });
});
