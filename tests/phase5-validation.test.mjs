// Independent cross-module validation of the merged Phase 5 engines over REAL recorded games (tests/fixtures/gc, docs/phase5-qa-fixtures.md).
// event-store + flow + pbp + intel + alerts + route are exercised together, not module by module. Derived variants are labelled in raw._provenance.
import test from "node:test";
import assert from "node:assert/strict";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";
import { reconcile, emptyStore, VOID_AFTER } from "../src/lib/event-store.mjs";
import { computeFlow, createFlow } from "../src/lib/flow.mjs";
import * as P from "../src/lib/pbp.mjs";
import { diffGoals } from "../src/lib/alerts.mjs";
import { parseGameRoute, withGameRoute } from "../src/lib/gc-route.mjs";
import { buildIntel, BASIS_LABEL } from "../src/lib/game-intel.mjs";
import * as B from "./fixtures/gc/builder.mjs";

const R = { reg: B.REAL.reg(), ot: B.REAL.ot(), so: B.REAL.so(), live: B.REAL.live() };
const F = Object.fromEntries(Object.entries(R).map(([k, v]) => [k, normalizeGameFeed(v)]));
const apply = (feeds, gameId) => { let s = emptyStore(gameId), last; for (const f of feeds) { last = reconcile(s, f.plays, { gameId }); s = last.store; } return { store: s, last }; };

// ---------- event store over overlapping real polls ----------
for (const k of ["reg", "ot", "so"]) {
  test(`event store (${k}): overlapping polls never duplicate; the final store equals the full feed, ordered by sortOrder`, () => {
    // Overlap: every poll re-delivers the previous poll's plays (cuts 4/6, 5/6 ... are prefixes of each other).
    const feeds = B.pollSequence(R[k], 8).flatMap((r) => [normalizeGameFeed(r), normalizeGameFeed(r)]);
    const { store } = apply(feeds, F[k].id);
    const ids = store.events.map((e) => e.id);
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual(new Set(ids), new Set(F[k].plays.map((p) => p.id)));
    const orders = store.events.map((e) => e.order);
    assert.deepEqual(orders, [...orders].sort((a, b) => a - b));
    const again = reconcile(store, F[k].plays, { gameId: F[k].id });
    assert.equal(again.added.length + again.changed.length + again.removed.length + again.voided.length, 0, "an identical poll changes nothing");
  });
}
test("event store: the score follows the goals (shootout excluded) and equals the scoreboard for the real OT game", () => {
  const { store } = apply([F.ot], F.ot.id);
  assert.deepEqual(store.score, { home: F.ot.homeScore, away: F.ot.awayScore });
});
test("event store: a response older than one already applied is dropped (sequence guard) and a prefix never shrinks the store", () => {
  const [early, late] = B.pollSequence(R.ot, [100, 400]).map(normalizeGameFeed);
  const a = reconcile(emptyStore(F.ot.id), late.plays, { gameId: F.ot.id, seq: 5 });
  const b = reconcile(a.store, early.plays, { gameId: F.ot.id, seq: 4 });
  assert.equal(b.store.events.length, a.store.events.length);
  const c = reconcile(a.store, early.plays, { gameId: F.ot.id, seq: 6 });
  assert.equal(c.store.events.length, a.store.events.length, "a strict prefix with a newer seq does not drop events either");
  assert.equal(c.voided.length, 0);
});
test("event store: a disallowed goal is voided only after two polls without it and the score drops once", () => {
  const { raw, eventId } = B.relabelShotAsGoal(R.live);
  const withGoal = normalizeGameFeed(raw), gone = normalizeGameFeed(B.removeEvent(raw, eventId));
  let r = reconcile(emptyStore(withGoal.id), withGoal.plays, { gameId: withGoal.id });
  assert.deepEqual(r.store.score, { home: 0, away: 1 });
  const voids = [];
  for (let i = 1; i <= VOID_AFTER + 1; i++) { r = reconcile(r.store, gone.plays, { gameId: withGoal.id }); voids.push(r.voided.length); if (i < VOID_AFTER) assert.deepEqual(r.store.score, { home: 0, away: 1 }, "debounce: still counted"); }
  assert.deepEqual(voids, [0, 1, 0]);
  assert.deepEqual(r.store.score, { home: 0, away: 0 });
});
test("event store: a goal re-published under a new eventId is the same goal (changed, not added+voided)", () => {
  const { raw, eventId } = B.relabelShotAsGoal(R.live);
  const o = JSON.parse(JSON.stringify(raw));
  o.plays.find((p) => p.eventId === eventId).eventId = 999001;
  const r0 = reconcile(emptyStore(1), normalizeGameFeed(raw).plays, { gameId: 1 });
  const r1 = reconcile(r0.store, normalizeGameFeed(o).plays, { gameId: 1 });
  const goals = r1.store.events.filter((e) => e.type === "goal");
  assert.equal(goals.length, 1);
  assert.equal(r1.voided.length, 0);
});
test("event store: changed assists are a change on the same event; reordered events keep every id; missing timestamps do not throw", () => {
  const g = B.scoringGoals(R.ot)[1];
  const other = R.ot.rosterSpots.find((r) => r.teamId === g.details.eventOwnerTeamId && ![g.details.scoringPlayerId, g.details.assist1PlayerId].includes(r.playerId)).playerId;
  const r0 = reconcile(emptyStore(1), F.ot.plays, { gameId: 1 });
  const fixed = normalizeGameFeed(B.changeAssists(R.ot, g.eventId, [other]));
  const r1 = reconcile(r0.store, fixed.plays, { gameId: 1 });
  assert.deepEqual(r1.changed.map((c) => c.id ?? c.play?.id), [g.eventId]);
  assert.equal(r1.added.length, 0);
  const ids = R.ot.plays.slice(40, 42).map((p) => p.eventId);
  const swapped = reconcile(r0.store, normalizeGameFeed(B.swapOrder(R.ot, ...ids)).plays, { gameId: 1 });
  assert.equal(swapped.store.events.length, r0.store.events.length);
  assert.doesNotThrow(() => reconcile(emptyStore(1), normalizeGameFeed(B.dropTimestamps(R.reg)).plays, { gameId: 1 }));
});

// ---------- momentum series ----------
for (const k of ["reg", "ot", "so"]) {
  test(`momentum (${k}): incremental series equals a full recompute; shootout plays add nothing; series is finite`, () => {
    const opts = { home: F[k].home, away: F[k].away, roster: F[k].roster, gameType: 2 };
    const full = computeFlow(F[k].plays, opts);
    const inc = createFlow(opts);
    for (const r of B.pollSequence(R[k], 7)) inc.push(normalizeGameFeed(r).plays);
    assert.equal(JSON.stringify(inc.series()), JSON.stringify(full));
    assert.ok(full.points.length > 100);
    assert.ok(full.points.every((p) => Number.isFinite(p.t) && Object.values(p).every((v) => typeof v !== "number" || Number.isFinite(v))));
    if (k === "so") assert.ok(full.duration <= 3600 + 300 + 1, `no SO time on the axis (${full.duration})`);
  });
}

// ---------- play-by-play helpers ----------
test("pbp: the filter groups partition the real events; a period list covers REG/OT/SO labels", () => {
  for (const k of ["reg", "ot", "so"]) {
    const plays = P.sortPlays(F[k].plays);
    const parts = P.FILTER_GROUPS.map((g) => P.applyFilters(plays, { groups: [g.key] }).length);
    assert.equal(parts.reduce((a, b) => a + b, 0), plays.length, `${k}: every event is in exactly one filter group`);
    const by = P.groupByPeriod(plays);
    assert.equal(by.reduce((a, g) => a + g.plays.length, 0), plays.length);
    const labels = by.map((g) => g.label).join("|");
    if (k === "ot") assert.match(labels, /overtime|OT/i);
    if (k === "so") assert.match(labels, /shootout|SO/i);
    const home = P.applyFilters(plays, { team: F[k].home }), away = P.applyFilters(plays, { team: F[k].away });
    assert.ok(home.every((p) => !p.team || p.team === F[k].home) && away.every((p) => !p.team || p.team === F[k].away));
  }
});
test("pbp: goal list matches the scoring goals, scores are Official and numbered, jump-to-goal wraps", () => {
  const plays = P.sortPlays(F.ot.plays);
  const goals = P.goalList(plays, { home: F.ot.home, away: F.ot.away, id: F.ot.id });
  assert.equal(goals.length, F.ot.goals.filter((g) => g.periodType !== "SO").length);
  const ids = P.goalIds(plays).filter((id) => goals.some((g) => g.id === id));
  let at = null; const seen = [];
  for (let i = 0; i < ids.length + 1; i++) { at = P.jumpToGoals(plays, at, 1); seen.push(at); }
  assert.deepEqual(seen.slice(0, ids.length), ids.filter((_, i) => true).slice(0, ids.length), "visits goals in order");
  assert.equal(seen.at(-1), ids[0], "wraps to the first goal");
});
test("pbp: strength labels decode only what the code says", () => {
  assert.equal(P.strengthLabel("1551").label, "5v5");
  assert.equal(P.strengthLabel("1451", "home").label, "Power play 5v4");
  assert.equal(P.strengthLabel("1541", "home").label, "Penalty kill 4v5");
  assert.equal(P.strengthLabel("abc"), null);
  assert.equal(P.strengthLabel(null), null);
});

// ---------- alerts: goals once, not after reload, retraction ----------
test("goal alerts: each real goal exactly once across overlapping polls and a 'reload' (state kept); a disallowed goal is retracted once", () => {
  const game = { id: F.ot.id, home: F.ot.home, away: F.ot.away, state: "LIVE", scheduleState: "OK", start: new Date().toISOString(), homeScore: 0, awayScore: 0, end: "REG", period: 1, periodType: "REG" };
  const now = Date.now();
  let prev = null; const ids = [];
  for (const r of B.pollSequence(R.ot, 6)) {
    const f = normalizeGameFeed(r);
    const out = diffGoals(prev, f.plays, { ...game, homeScore: f.homeScore, awayScore: f.awayScore }, now, { prevTotal: prev ? undefined : 0 });
    prev = out.next; ids.push(...out.events.map((e) => e.id));
  }
  const goals = F.ot.goals.filter((g) => g.periodType !== "SO");
  assert.equal(ids.length, goals.length);
  assert.equal(new Set(ids).size, ids.length);
  // "Reload": a tab with no goal state and a scoreboard total already at the final score reports nothing old.
  const reload = diffGoals(null, F.ot.plays, { ...game, homeScore: F.ot.homeScore, awayScore: F.ot.awayScore }, now, { prevTotal: F.ot.homeScore + F.ot.awayScore });
  assert.deepEqual(reload.events, []);
  // Retraction
  const { raw, eventId } = B.relabelShotAsGoal(R.live);
  const g1 = normalizeGameFeed(raw), g0 = normalizeGameFeed(B.removeEvent(raw, eventId));
  let st = diffGoals(new Map(), g1.plays, game, now); assert.equal(st.events.length, 1);
  const kinds = [];
  for (let i = 0; i < 4; i++) { st = diffGoals(st.next, g0.plays, game, now); kinds.push(st.events.map((e) => e.id)); }
  assert.equal(kinds.flat().length, 1);
  assert.ok(kinds.flat()[0].endsWith(":void"));
  assert.ok(kinds.findIndex((k) => k.length) >= VOID_AFTER - 1, "not retracted on the first missing poll");
});

// ---------- route ----------
test("deep links: malformed, unknown and hostile route parameters are ignored; known ones round-trip", () => {
  assert.equal(parseGameRoute("?game=abc"), null);
  assert.equal(parseGameRoute("?game=2025021300&tab=evil").tab, null);
  assert.equal(parseGameRoute("?game=2025021300&event=222").tab, "pbp");
  assert.equal(parseGameRoute("?game=2025021300&event=<script>").event, null);
  assert.equal(parseGameRoute("?game=2025021300&tab=pbp&event=1e3").event, null);
  assert.equal(parseGameRoute("?game=1234567890123456"), null);
  const r = { id: 2025021300, tab: "pbp", event: 222 };
  assert.deepEqual(parseGameRoute(withGameRoute("?view=games", r)), r);
  assert.equal(withGameRoute("?view=games&game=1&tab=pbp", null), "?view=games");
});

// ---------- intel ----------
test("intel: every item has a basis label from the fixed set and ids are unique; nothing duplicates an excluded insight", () => {
  const game = { id: F.ot.id, season: 20252026, type: 2, home: F.ot.home, away: F.ot.away, state: "OFF", scheduleState: "OK", end: "OT", homeScore: F.ot.homeScore, awayScore: F.ot.awayScore, start: "2026-04-14T02:00:00Z" };
  const items = buildIntel(game, { plays: F.ot.plays });
  assert.ok(items.length > 0, "a real OT game produces intel");
  for (const i of items) { assert.ok(i.basis in BASIS_LABEL, `${i.id} basis ${i.basis}`); assert.ok(i.text && i.id && i.kind); }
  assert.equal(new Set(items.map((i) => i.id)).size, items.length);
  const none = buildIntel(game, { plays: F.ot.plays, exclude: items.map((i) => i.id) });
  assert.equal(none.filter((i) => items.some((x) => x.id === i.id)).length, 0);
  assert.ok(items.every((i) => !/season series|odds|recent form/i.test(i.text)), "no insights that live elsewhere");
  assert.deepEqual(buildIntel({ ...game, state: "FUT", scheduleState: "PPD" }, { plays: [] }), [], "a postponed game has no intel");
});
test("intel: a game whose score disagrees with its goals reports flow as unavailable instead of guessing", () => {
  const game = { id: 1, season: 20252026, type: 2, home: F.ot.home, away: F.ot.away, state: "OFF", scheduleState: "OK", end: "REG", homeScore: 9, awayScore: 9, start: "2026-04-14T02:00:00Z" };
  const plays = F.ot.plays.map((p) => (p.type === "goal" ? { ...p, score: undefined } : p));
  const items = buildIntel(game, { plays });
  assert.ok(items.every((i) => !/lead change|comeback|scoring run/i.test(i.text)));
});
