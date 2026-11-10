import test from "node:test";
import assert from "node:assert/strict";
import { diffGames, snapshot, relevantEvents, coalesce, createAlertStore, parseState, periodLabel, ALERTS_KEY, SEEN_CAP, TTL_MS } from "../src/lib/alerts.mjs";

const NOW = Date.parse("2026-11-10T01:30:00Z");
const START = "2026-11-10T00:00:00Z";
const g = (o = {}) => ({ id: 2026020100, home: "EDM", away: "CHI", state: "FUT", scheduleState: "OK", start: START, homeScore: null, awayScore: null, end: "REG", period: null, periodType: null, intermission: false, ...o });
const live = (o = {}) => g({ state: "LIVE", period: 1, periodType: "REG", homeScore: 0, awayScore: 0, ...o });
const step = (prevGames, nextGames, now = NOW) => diffGames(snapshot(prevGames, now), nextGames, now);
const ids = (r) => r.events.map((e) => e.id);

function memoryStore() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) };
}

test("the first snapshot is a silent baseline", () => {
  assert.deepEqual(diffGames(null, [live(), g({ id: 2 })], NOW).events, []);
  assert.equal(diffGames(null, [live()], NOW).next.size, 1);
});
test("puck drop produces one start event with a deterministic id", () => {
  const r = step([g()], [live()]);
  assert.deepEqual(ids(r), ["2026020100:start"]);
  assert.equal(r.events[0].kind, "start");
  assert.deepEqual(r.events[0].teams, ["CHI", "EDM"]);
  assert.deepEqual(ids(diffGames(r.next, [live()], NOW)), []);
});
test("a game first seen live or unknown to the previous snapshot is silent", () => {
  assert.deepEqual(ids(step([], [live()])), []);
  assert.deepEqual(ids(step([live({ id: 5 })], [live()])), []);
});
test("period end, period begin, overtime and shootout", () => {
  assert.deepEqual(ids(step([live()], [live({ intermission: true })])), ["2026020100:p1REG:end"]);
  assert.deepEqual(ids(step([live({ intermission: true })], [live({ period: 2 })])), ["2026020100:p2REG:begin"]);
  // a poll that skipped the intermission still reports the end and the new start
  assert.deepEqual(ids(step([live()], [live({ period: 2 })])), ["2026020100:p1REG:end", "2026020100:p2REG:begin"]);
  const ot = step([live({ period: 3, intermission: true })], [live({ period: 4, periodType: "OT" })]);
  assert.deepEqual(ids(ot), ["2026020100:p4OT:begin"]);
  assert.match(ot.events[0].title, /^Overtime begins/);
  const so = step([live({ period: 4, periodType: "OT", intermission: true })], [live({ period: 5, periodType: "SO" })]);
  assert.equal(so.events[0].title, "Shootout begins");
  assert.equal(periodLabel(5, "OT"), "2OT");
  assert.deepEqual(ids(step([live({ period: 3 })], [live({ period: 3, intermission: true })])), ["2026020100:p3REG:end"]);
});
test("final carries the OT or SO tag; the last period end is superseded by the final", () => {
  const f = (end) => step([live({ period: end === "REG" ? 3 : 4, periodType: end === "REG" ? "REG" : end, homeScore: 3, awayScore: 2 })], [g({ state: "OFF", end, homeScore: 4, awayScore: 2 })]);
  assert.deepEqual(ids(f("REG")), ["2026020100:final"]);
  assert.equal(f("REG").events[0].title, "Final: CHI 2, EDM 4");
  assert.equal(f("OT").events[0].title, "Final (OT): CHI 2, EDM 4");
  assert.match(f("SO").events[0].title, /^Final \(SO\)/);
  assert.equal(step([g({ state: "FINAL", end: "REG" })], [g({ state: "FINAL" })]).events.length, 0);
});
test("a final after a missed game only alerts when the game is recent", () => {
  assert.equal(step([g()], [g({ state: "OFF", homeScore: 1, awayScore: 0 })]).events.length, 1);
  const old = g({ start: "2026-10-01T00:00:00Z" });
  assert.equal(step([old], [{ ...old, state: "OFF" }]).events.length, 0);
});
test("postponed, canceled and suspended games alert once", () => {
  for (const s of ["PPD", "CNCL", "SUSP"]) {
    const r = step([g()], [g({ scheduleState: s })]);
    assert.deepEqual(ids(r), [`2026020100:${s}`]);
    assert.equal(r.events[0].kind, "schedule");
    assert.deepEqual(ids(diffGames(r.next, [g({ scheduleState: s })], NOW)), []);
  }
  assert.match(step([g()], [g({ scheduleState: "PPD" })]).events[0].title, /postponed/);
  assert.equal(step([g({ scheduleState: "PPD" })], [live()]).events.length, 0);
});
test("stale-live games never alert", () => {
  const old = "2026-11-09T05:00:00Z";
  assert.equal(step([g({ start: old })], [live({ start: old })]).events.length, 0);
  assert.equal(step([live({ start: old })], [g({ state: "OFF", start: old })]).events.length, 0);
});
test("score decreases never alert and do not hide the next real change", () => {
  const a = live({ homeScore: 2, awayScore: 1 });
  const dip = step([a], [g({ state: "OFF", homeScore: 1, awayScore: 1 })]);
  assert.equal(dip.events.length, 0);
  const again = diffGames(dip.next, [g({ state: "OFF", homeScore: 1, awayScore: 1 })], NOW);
  assert.deepEqual(ids(again), ["2026020100:final"]);
  assert.equal(step([a], [live({ homeScore: 3, awayScore: 1 })]).events.length, 0); // no score events at all
});

const prefs = (o = {}) => ({ favorites: ["EDM"], players: [], games: [], alerts: { enabled: true, start: true, period: false, final: true, schedule: true, scope: { teams: true, players: true, saved: true } }, ...o });
const startEv = (o = {}) => ({ id: "1:start", kind: "start", gameId: 1, teams: ["CHI", "EDM"], title: "t", body: "b", at: 1, ...o });
test("nothing passes while alerts are off (the default)", () => {
  assert.deepEqual(relevantEvents([startEv()], prefs({ alerts: { ...prefs().alerts, enabled: false } })), []);
  assert.deepEqual(relevantEvents([startEv()], { favorites: ["EDM"] }), []);
});
test("favorites, saved games and category toggles", () => {
  assert.equal(relevantEvents([startEv()], prefs())[0].why, "team");
  assert.deepEqual(relevantEvents([startEv()], prefs({ favorites: [] })), []);
  assert.equal(relevantEvents([startEv()], prefs({ favorites: [], games: [{ id: 1 }] }))[0].why, "saved");
  const off = (k) => prefs({ alerts: { ...prefs().alerts, [k]: false } });
  assert.deepEqual(relevantEvents([startEv()], off("start")), []);
  assert.equal(relevantEvents([startEv({ kind: "period" })], prefs()).length, 0); // period is off by default
  assert.equal(relevantEvents([startEv({ kind: "final" })], off("final")).length, 0);
  assert.equal(relevantEvents([startEv({ kind: "schedule" })], off("schedule")).length, 0);
  const noTeams = prefs({ alerts: { ...prefs().alerts, scope: { teams: false, players: true, saved: true } } });
  assert.deepEqual(relevantEvents([startEv()], noTeams), []);
});
test("followed players' teams only yield a 'plays tonight' start", () => {
  const p = prefs({ favorites: [], players: [{ id: 8478402, name: "Connor McDavid", team: "EDM" }] });
  const r = relevantEvents([startEv()], p);
  assert.equal(r.length, 1);
  assert.equal(r[0].why, "player");
  assert.match(r[0].title, /Connor McDavid plays tonight/);
  assert.deepEqual(r[0].players, [{ id: 8478402, name: "Connor McDavid" }]);
  assert.deepEqual(relevantEvents([startEv({ kind: "final" })], p), []);
  assert.deepEqual(relevantEvents([startEv()], { ...p, alerts: { ...p.alerts, scope: { teams: true, players: false, saved: true } } }), []);
});

const evs = (n) => Array.from({ length: n }, (_, i) => startEv({ id: `${i}:start`, gameId: i, title: `T${i}` }));
test("many events in one tick coalesce into one summary", () => {
  assert.equal(coalesce(evs(3), NOW), null);
  const s = coalesce(evs(5), NOW);
  assert.equal(s.title, "5 updates");
  assert.match(s.body, /and 2 more/);
});

test("store: dedupes by seen id, survives a reload, and coalesces", () => {
  const storage = memoryStore();
  let t = NOW;
  const a = createAlertStore(storage, { tab: "a", clock: () => t });
  assert.equal(a.claim([startEv()]).length, 1);
  assert.equal(a.claim([startEv()]).length, 0);
  const b = createAlertStore(storage, { tab: "b", clock: () => t }); // reload / second tab
  assert.equal(b.claim([startEv()]).length, 0);
  assert.equal(b.unread(), 1);
  b.markAllRead();
  assert.equal(a.unread(), 0);
  const many = a.claim(evs(6));
  assert.equal(many.length, 1);
  assert.equal(many[0].kind, "summary");
  assert.equal(a.claim(evs(6)).length, 0); // the individual ids were recorded
  a.clearAll();
  assert.equal(a.items().length, 0);
  assert.equal(a.claim([startEv()]).length, 0); // cleared alerts do not come back
  t += TTL_MS + 1000;
  assert.equal(a.claim([startEv()]).length, 1); // TTL expired
});
test("store: only one of two tabs adds an event while the lock is held", () => {
  const storage = memoryStore();
  const a = createAlertStore(storage, { tab: "a", clock: () => NOW });
  storage.setItem("iceboard-alerts-lock", `b:${NOW}:x`);
  assert.deepEqual(a.claim([startEv()]), []); // tab b is mid-write; it records the id
  storage.removeItem("iceboard-alerts-lock");
  assert.equal(a.claim([startEv()]).length, 1);
  assert.equal(storage.getItem("iceboard-alerts-lock"), null);
});
test("store: seen-set is capped, items capped, corrupt data resets, storage failures fall back to memory", () => {
  const storage = memoryStore();
  const a = createAlertStore(storage, { tab: "a", clock: () => NOW });
  for (let i = 0; i < 20; i++) a.claim(evs(20).map((e) => ({ ...e, id: `${i}:${e.id}` })).slice(0, 20));
  const s = JSON.parse(storage.getItem(ALERTS_KEY));
  assert.ok(Object.keys(s.seen).length <= SEEN_CAP);
  assert.ok(s.items.length <= 60);
  assert.deepEqual(parseState("{not json").items, []);
  assert.deepEqual(parseState('{"seen":5,"items":[{"x":1},"y"]}', NOW).items, []);
  const broken = { getItem() { throw new Error("blocked"); }, setItem() { throw new Error("blocked"); }, removeItem() { throw new Error("blocked"); } };
  const m = createAlertStore(broken, { tab: "m", clock: () => NOW });
  assert.equal(m.claim([startEv()]).length, 1);
  assert.equal(m.claim([startEv()]).length, 0);
  assert.equal(m.unread(), 1);
});
