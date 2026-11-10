import test, { mock, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createGamePoller, acquireGamePoller, backoffDelay } from "../src/lib/game-poller.mjs";
import { joinLeaderChannel, HB_MS, PEER_TTL_MS } from "../src/lib/tab-leader.mjs";
import { normalizeGameFeed } from "../src/lib/game-data.mjs";
import { rawGame, poll, orders, envelope } from "./fixtures/poll-sequences.mjs";

// Responses are the REAL recorded game (raw-live-game.json) sliced by sortOrder with only envelope state changed (derived, see poll-sequences.mjs).
const raw = rawGame();
const O = orders(raw);
const at = (f) => O[Math.floor((O.length - 1) * f)];
const T0 = Date.parse(raw.startTimeUTC) + 3600_000; // an hour after the recorded game's puck drop, so the 8 h stale-live rule stays quiet
const game = { id: raw.id, state: "LIVE", start: raw.startTimeUTC, away: "FLA", home: "CAR", scheduleState: "OK" };
const body = (r) => normalizeGameFeed(r);
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const advance = async (ms, step = 250) => {
  // Small steps with microtasks flushed in between: a poll that finishes inside a tick can only schedule its next timer afterwards.
  for (let left = ms; left > 0; left -= step) { mock.timers.tick(Math.min(step, left)); await flush(); }
  if (ms === 0) { mock.timers.tick(0); await flush(); }
};

let cleanups = [];
afterEach(() => { cleanups.forEach((f) => f()); cleanups = []; mock.timers.reset(); });
const clock = () => mock.timers.enable({ apis: ["setTimeout", "setInterval", "Date"], now: T0 });
const doc = () => { const d = { hidden: false, l: new Set(), addEventListener: (_t, f) => d.l.add(f), removeEventListener: (_t, f) => d.l.delete(f), set(h) { d.hidden = h; d.l.forEach((f) => f()); } }; return d; };
const noElection = () => ({ joinChannel: (_n, h) => { h.onLeader(true); return { post() {}, close() {}, isLeader: () => true }; } });
/** A fetch whose answers come from a function of the call number (1-based). */
function fetcher(answer) {
  const f = async (url) => { f.calls.push(url); const a = await answer(f.calls.length); return a.status ? { ok: a.status < 400, status: a.status, json: async () => a.body } : { ok: true, status: 200, json: async () => a }; };
  f.calls = [];
  return f;
}
const start = (g, answer, extra = {}) => {
  const d = extra.doc ?? doc();
  const f = fetcher(answer);
  const p = createGamePoller(g, { fetch: f, doc: d, random: () => 1, ...noElection(), ...extra });
  const off = p.subscribe(() => {});
  cleanups.push(off);
  return { p, f, d };
};

test("live game: one request now, then every 15 s on one URL (no ?score=)", async () => {
  clock();
  const { p, f } = start(game, () => body(poll(raw, { state: "live" })));
  await advance(0);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0], `/api/game/${raw.id}`);
  await advance(14_000);
  assert.equal(f.calls.length, 1);
  await advance(1_100);
  assert.equal(f.calls.length, 2);
  await advance(15_000);
  assert.equal(f.calls.length, 3);
  assert.equal(p.getSnapshot().phase.phase, "live");
  assert.equal(p.getSnapshot().stale, false);
});

test("poll sequence scheduled -> pregame -> live -> intermission -> OT -> final/OT: phases, cadence, one recheck, then silence", async () => {
  clock();
  const seq = [
    poll(raw, { upToOrder: 0, state: { ...envelope("scheduled"), startTimeUTC: new Date(T0 + 3 * 3600_000).toISOString() } }),
    poll(raw, { upToOrder: 0, state: { ...envelope("pregame"), startTimeUTC: new Date(T0 + 3 * 3600_000).toISOString() } }),
    poll(raw, { upToOrder: at(0.4), state: "live" }),
    poll(raw, { upToOrder: at(0.7), state: "intermission" }),
    poll(raw, { upToOrder: at(1), state: "ot" }),
    poll(raw, { upToOrder: at(1), state: "final-ot" }),
    poll(raw, { upToOrder: at(1), state: "final-ot" }),
  ];
  const upcoming = { ...game, state: "FUT", start: new Date(T0 + 3 * 3600_000).toISOString() };
  const { p, f } = start(upcoming, (n) => body(seq[Math.min(n, seq.length) - 1]));
  const phases = [];
  p.subscribe(() => phases.push(p.getSnapshot().phase.phase));
  await advance(0);
  assert.equal(p.getSnapshot().phase.phase, "scheduled");
  await advance(60_000); // scheduled far ahead: 60 s
  assert.equal(f.calls.length, 2);
  assert.equal(p.getSnapshot().phase.phase, "pregame");
  await advance(30_000); // pregame: 30 s? start is 3 h away so plan says 60 s
  assert.equal(f.calls.length, 2);
  await advance(30_000);
  assert.equal(f.calls.length, 3);
  assert.equal(p.getSnapshot().phase.phase, "live");
  assert.deepEqual(p.getSnapshot().transition && [p.getSnapshot().transition.from, p.getSnapshot().transition.to], ["pregame", "live"]);
  await advance(15_000);
  assert.equal(f.calls.length, 4);
  assert.equal(p.getSnapshot().phase.phase, "intermission");
  await advance(29_000);
  assert.equal(f.calls.length, 4, "intermission: 30 s");
  await advance(1_100);
  assert.equal(f.calls.length, 5);
  assert.equal(p.getSnapshot().phase.phase, "overtime");
  await advance(15_100);
  assert.equal(f.calls.length, 6);
  assert.equal(p.getSnapshot().phase.phase, "final-ot");
  assert.equal(p.getSnapshot().transition.to, "final-ot");
  await advance(170_000);
  assert.equal(f.calls.length, 6, "recheck is ~3 minutes after the first final fetch");
  await advance(20_000);
  assert.equal(f.calls.length, 7, "one recheck");
  await advance(3_600_000);
  assert.equal(f.calls.length, 7, "then stop");
  assert.ok(phases.length > 3);
});

test("failures: last data kept, error set, backoff with jitter, stale after 45 s, recovery clears both", async () => {
  clock();
  let down = false;
  const { p, f } = start(game, () => (down ? { status: 503 } : body(poll(raw, { upToOrder: at(0.5), state: "live" }))));
  await advance(0);
  assert.equal(p.getSnapshot().stale, false);
  const goodAt = p.getSnapshot().lastOkAt;
  down = true;
  await advance(15_100);
  assert.equal(f.calls.length, 2);
  assert.match(p.getSnapshot().error, /unavailable/);
  assert.ok(p.getSnapshot().events.length > 0, "keeps the last data");
  assert.equal(p.getSnapshot().stale, false, "not yet 45 s");
  await advance(5_100); // backoff 5 s (random()=1)
  assert.equal(f.calls.length, 3);
  await advance(10_100);
  assert.equal(f.calls.length, 4);
  await advance(20_100);
  assert.equal(f.calls.length, 5, "5, 10, 20 s ...");
  assert.equal(p.getSnapshot().stale, true);
  assert.equal(p.getSnapshot().failures, 4);
  down = false;
  await advance(40_100);
  assert.equal(p.getSnapshot().stale, false);
  assert.equal(p.getSnapshot().error, null);
  assert.equal(p.getSnapshot().failures, 0);
  assert.ok(p.getSnapshot().lastOkAt > goodAt);
});

test("backoffDelay is exponential with jitter and capped at 60 s", () => {
  assert.deepEqual([1, 2, 3, 4, 5, 6, 9].map((n) => backoffDelay(n, () => 1)), [5000, 10000, 20000, 40000, 60000, 60000, 60000]);
  assert.equal(backoffDelay(3, () => 0), 10000);
  const mid = backoffDelay(2, () => 0.5);
  assert.ok(mid > 5000 && mid < 10000);
});

test("retry fetches at once and clears the failure count", async () => {
  clock();
  let down = true;
  const { p, f } = start(game, () => (down ? { status: 500 } : body(poll(raw, { state: "live" }))));
  await advance(0);
  assert.equal(p.getSnapshot().loading, false);
  assert.ok(p.getSnapshot().error);
  down = false;
  p.retry();
  await flush();
  assert.equal(f.calls.length, 2);
  assert.equal(p.getSnapshot().error, null);
  assert.ok(p.getSnapshot().feed);
});

test("unpublished game (404): keeps its normal cadence, no backoff, a clear message", async () => {
  clock();
  const upcoming = { ...game, state: "FUT", start: new Date(T0 + 5 * 3600_000).toISOString() };
  const { p, f } = start(upcoming, () => ({ status: 404, body: { error: "x" } }));
  await advance(0);
  assert.match(p.getSnapshot().error, /not published/);
  assert.equal(p.getSnapshot().stale, false);
  await advance(30_000);
  assert.equal(f.calls.length, 1);
  await advance(30_100);
  assert.equal(f.calls.length, 2);
});

test("hidden tab: no requests while hidden, a single catch-up when shown, never flagged stale while hidden or during the catch-up", async () => {
  clock();
  const { p, f, d } = start(game, () => body(poll(raw, { state: "live" })));
  await advance(0);
  assert.equal(f.calls.length, 1);
  d.set(true);
  await advance(10 * 60_000);
  assert.equal(f.calls.length, 1);
  assert.equal(p.getSnapshot().stale, false);
  d.set(false);
  assert.equal(p.getSnapshot().stale, false, "catching up, not stale");
  await advance(0);
  assert.equal(f.calls.length, 2, "exactly one catch-up");
  await advance(1_000);
  assert.equal(f.calls.length, 2);
  await advance(15_000);
  assert.equal(f.calls.length, 3, "then normal cadence");
});

test("showing a tab whose data is still fresh does not fetch", async () => {
  clock();
  const { f, d } = start(game, () => body(poll(raw, { state: "live" })));
  await advance(0);
  d.set(true);
  await advance(3_000);
  d.set(false);
  await advance(0);
  assert.equal(f.calls.length, 1);
});

test("several subscribers (panes, cards) share one poller and one request stream", async () => {
  clock();
  const f = fetcher(() => body(poll(raw, { state: "live" })));
  const realFetch = globalThis.fetch;
  globalThis.fetch = f;
  cleanups.push(() => { globalThis.fetch = realFetch; });
  const g = { ...game, id: 2026029999 };
  const solo = { joinChannel: (_n, h) => { h.onLeader(true); return { post() {}, close() {}, isLeader: () => true }; } };
  const a = acquireGamePoller(g, solo), b = acquireGamePoller({ ...g }, solo), c = acquireGamePoller(g, solo);
  assert.equal(a.poller, b.poller);
  const offs = [a, b, c].map((x) => x.poller.subscribe(() => {}));
  await advance(0);
  await advance(30_000);
  assert.equal(f.calls.length, 3, "1 initial + 2 ticks for three panes (BroadcastChannel absent or alone: this tab leads)");
  offs.forEach((o) => o());
  [a, b, c].forEach((x) => x.release());
  await advance(60_000);
  assert.equal(f.calls.length, 3, "last unsubscribe stops polling");
});

test("response ordering guard: a broadcast older than one already applied is dropped", async () => {
  clock();
  let handlers;
  const posts = [];
  const f = fetcher(() => body(poll(raw, { upToOrder: at(0.8), state: "live" })));
  const p = createGamePoller(game, { fetch: f, doc: doc(), joinChannel: (_n, h) => { handlers = h; return { post: (m) => posts.push(m), close() {}, isLeader: () => false }; } });
  cleanups.push(p.subscribe(() => {}));
  handlers.onLeader(false);
  const newer = body(poll(raw, { upToOrder: at(0.8), state: "live" }));
  const older = body(poll(raw, { upToOrder: at(0.4), state: "live" }));
  handlers.onMessage({ t: "feed", seq: 200, feed: newer });
  const n = p.getSnapshot().events.length;
  handlers.onMessage({ t: "feed", seq: 100, feed: older });
  assert.equal(p.getSnapshot().events.length, n);
  assert.equal(f.calls.length, 0, "a follower never fetches");
  assert.deepEqual(posts[0], { t: "need" });
});

test("follower becomes leader and fetches only when its data is older than the interval", async () => {
  clock();
  let handlers;
  const f = fetcher(() => body(poll(raw, { state: "live" })));
  const p = createGamePoller(game, { fetch: f, doc: doc(), joinChannel: (_n, h) => { handlers = h; return { post() {}, close() {}, isLeader: () => false }; } });
  cleanups.push(p.subscribe(() => {}));
  handlers.onMessage({ t: "feed", seq: T0, feed: body(poll(raw, { state: "live" })) });
  await advance(5_000);
  handlers.onLeader(true);
  await advance(0);
  assert.equal(f.calls.length, 0, "data is 5 s old: wait");
  await advance(10_100);
  assert.equal(f.calls.length, 1);
});

test("reconciliation reaches the snapshot: a vanished goal stays one poll, then is voided with the score lowered", async () => {
  clock();
  const { deriveGoal, withPlays } = await import("./fixtures/poll-sequences.mjs");
  const goal = deriveGoal(raw, { eventId: 9001, afterOrder: at(0.5), team: "home", scores: { home: 1, away: 0 } });
  const withGoal = withPlays(raw, goal);
  const answers = [withGoal, raw, raw, raw].map((r) => body(poll(r, { state: "live", score: { home: 1, away: 0 } })));
  const { p } = start(game, (n) => answers[Math.min(n, answers.length) - 1]);
  await advance(0);
  assert.equal(p.getSnapshot().lastGoalIds.length, 1);
  assert.equal(p.getSnapshot().score.home, 1);
  await advance(15_100);
  assert.equal(p.getSnapshot().changes.voided.length, 0);
  assert.equal(p.getSnapshot().feed.goals.length, 1, "feed.goals is patched with the retained goal");
  await advance(15_000);
  assert.equal(p.getSnapshot().changes.voided.length, 1);
  assert.equal(p.getSnapshot().feed.goals.length, 0);
  assert.deepEqual(p.getSnapshot().score, { home: 0, away: 0 });
});

// ---- tab leader ----
class FakeBC {
  static all = new Map();
  constructor(name) { this.name = name; this.onmessage = null; (FakeBC.all.get(name) ?? FakeBC.all.set(name, new Set()).get(name)).add(this); }
  postMessage(data) { for (const c of FakeBC.all.get(this.name)) if (c !== this && c.onmessage) { const m = structuredClone(data); queueMicrotask(() => c.onmessage({ data: m })); } }
  close() { FakeBC.all.get(this.name).delete(this); }
}
const tab = (name, extra = {}) => {
  const d = doc();
  const events = [];
  const ch = joinLeaderChannel(name, { onLeader: (v) => events.push(v), onMessage: (m) => events.push(m) }, { createChannel: (n) => new FakeBC(n), doc: d, ...extra });
  cleanups.push(() => ch.close());
  return { ch, d, events };
};

test("tab leader: of three visible tabs exactly one leads; the others follow and receive its broadcasts", async () => {
  clock();
  FakeBC.all.clear();
  const a = tab("g1");
  await advance(10);
  const b = tab("g1");
  await advance(10);
  const c = tab("g1");
  await advance(400);
  const leaders = [a, b, c].filter((t) => t.ch.isLeader());
  assert.equal(leaders.length, 1);
  assert.equal(leaders[0], a, "the oldest visible tab leads");
  a.ch.post({ t: "feed", n: 1 });
  await flush();
  assert.deepEqual(b.events.at(-1), { t: "feed", n: 1 });
  assert.deepEqual(c.events.at(-1), { t: "feed", n: 1 });
});

test("tab leader: hidden tabs never lead; showing a tab hands leadership over at once; closing the leader promotes another", async () => {
  clock();
  FakeBC.all.clear();
  const a = tab("g2");
  await advance(5);
  const b = tab("g2");
  await advance(500);
  assert.equal(a.ch.isLeader(), true);
  a.d.set(true); // a hidden: b (visible) takes over
  await advance(0);
  assert.equal(a.ch.isLeader(), false);
  assert.equal(b.ch.isLeader(), true);
  b.d.set(true); // everyone hidden: nobody polls
  await advance(0);
  assert.equal(b.ch.isLeader(), false);
  a.d.set(false);
  await advance(0);
  assert.equal(a.ch.isLeader(), true);
  a.ch.close();
  await advance(10);
  b.d.set(false);
  await advance(10);
  assert.equal(b.ch.isLeader(), true);
});

test("tab leader: a leader that goes silent is replaced after the peer TTL", async () => {
  clock();
  FakeBC.all.clear();
  const a = tab("g3");
  await advance(5);
  const b = tab("g3");
  await advance(500);
  assert.equal(a.ch.isLeader(), true);
  // a stops talking without a goodbye (frozen tab)
  FakeBC.all.get("g3").forEach((c) => { if (c !== [...FakeBC.all.get("g3")].find((x) => x.name === "g3" && x.onmessage && x === [...FakeBC.all.get("g3")][1])) c.postMessage = () => {}; });
  [...FakeBC.all.get("g3")][0].postMessage = () => {};
  await advance(PEER_TTL_MS + HB_MS + 100);
  assert.equal(b.ch.isLeader(), true);
});

test("tab leader falls back to independent polling when BroadcastChannel is missing or throws", async () => {
  clock();
  for (const createChannel of [() => null, () => { throw Error("blocked"); }]) {
    const seen = [];
    const ch = joinLeaderChannel("x", { onLeader: (v) => seen.push(v) }, { createChannel, doc: doc() });
    assert.equal(ch.isLeader(), true);
    assert.deepEqual(seen, [true]);
    ch.post({});
    ch.close();
  }
});

test("two Game Center tabs, one request stream: the follower never fetches, and gets the leader's data", async () => {
  clock();
  FakeBC.all.clear();
  const f1 = fetcher(() => body(poll(raw, { state: "live" }))), f2 = fetcher(() => body(poll(raw, { state: "live" })));
  const mk = (f) => createGamePoller(game, { fetch: f, doc: doc(), random: () => 1, joinChannel: (n, h) => joinLeaderChannel(n, h, { createChannel: (x) => new FakeBC(x), doc: doc() }) });
  const p1 = mk(f1);
  cleanups.push(p1.subscribe(() => {}));
  await advance(10, 5);
  const p2 = mk(f2);
  cleanups.push(p2.subscribe(() => {}));
  await advance(30_000, 50); // fine steps: the broadcast replies must land inside the follower's settle window, as they do in a browser
  assert.equal(f2.calls.length, 0, "the follower never fetches");
  assert.ok(f1.calls.length >= 2 && f2.calls.length === 0);
  assert.ok(p2.getSnapshot().feed, "follower has data through the broadcast");
});
