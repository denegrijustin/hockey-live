import test from "node:test";
import assert from "node:assert/strict";
import { diffGoals, goalFingerprint, scoreFallback, goalFetchPlan, relevantEvents, createAlertStore, parseState, diffGames, snapshot, SEEN_CAP, ITEM_CAP, GOAL_ITEM_CAP } from "../src/lib/alerts.mjs";
import { defaultPrefs, sanitize, parsePrefs } from "../src/lib/prefs.mjs";

const NOW = Date.parse("2026-11-10T01:30:00Z");
const START = "2026-11-10T00:00:00Z";
const game = (o = {}) => ({ id: 2026020100, home: "EDM", away: "CHI", state: "LIVE", scheduleState: "OK", start: START, homeScore: 1, awayScore: 0, end: "REG", period: 1, periodType: "REG", intermission: false, ...o });
const goal = (id, o = {}) => ({ id, order: id, type: "goal", period: 1, periodType: "REG", time: "05:00", team: "EDM", player: "Connor McDavid", pid: 8478402, score: { home: 1, away: 0 }, assists: [], ...o });
const shot = (id) => ({ id, order: id, type: "shot-on-goal", period: 1, periodType: "REG", time: "01:00", team: "CHI", player: "X", pid: 1 });
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => void m.set(k, String(v)), removeItem: (k) => void m.delete(k) }; };

test("goals: derived from play eventIds with deterministic ids, scorer, period, time and score after", () => {
  const r = diffGoals(new Map(), [shot(1), goal(7)], game(), NOW);
  assert.equal(r.events.length, 1);
  const e = r.events[0];
  assert.equal(e.id, "2026020100:goal:7");
  assert.equal(e.kind, "goal");
  assert.equal(e.eventId, 7);
  assert.equal(e.title, "Goal EDM: Connor McDavid");
  assert.match(e.body, /CHI 0, EDM 1\. 1st 05:00\./);
  assert.deepEqual(e.link, { gameId: 2026020100, eventId: 7, tab: "pbp" });
  assert.deepEqual(diffGoals(r.next, [shot(1), goal(7)], game(), NOW).events, []); // seen goal: nothing again
});
test("goals: first state with no scoreboard total is a silent baseline; with one, only goals past it are new", () => {
  assert.deepEqual(diffGoals(null, [goal(7)], game(), NOW).events, []);
  const r = diffGoals(null, [goal(7), goal(9, { team: "CHI", score: { home: 1, away: 1 } })], game({ awayScore: 1 }), NOW, { prevTotal: 1 });
  assert.deepEqual(r.events.map((e) => e.id), ["2026020100:goal:9"]);
  assert.equal(r.next.size, 2);
});
test("goals: shootout goals and non-goals never alert; empty feed changes nothing", () => {
  assert.deepEqual(diffGoals(new Map(), [goal(8, { periodType: "SO", period: 5 })], game(), NOW).events, []);
  const s = diffGoals(new Map(), [goal(7)], game(), NOW).next;
  const glitch = diffGoals(s, [], game(), NOW);
  assert.deepEqual(glitch.events, []);
  assert.equal(glitch.next, s);
  assert.deepEqual(diffGoals(s, [goal(7)], game(), NOW, { stale: true }).events, []);
});
test("goals: a quiet count swallows goals already announced by the score fallback", () => {
  const r = diffGoals(new Map(), [goal(7)], game(), NOW, { quiet: 1 });
  assert.deepEqual(r.events, []);
  assert.equal(r.next.size, 1);
});
test("retraction: a goal missing for two consecutive fetches is disallowed once, with a void id", () => {
  const s0 = diffGoals(new Map(), [goal(7)], game(), NOW).next;
  const one = diffGoals(s0, [shot(1)], game({ homeScore: 0 }), NOW);
  assert.deepEqual(one.events, []);
  assert.equal(one.pending, true);
  const two = diffGoals(one.next, [shot(1), shot(2)], game({ homeScore: 0 }), NOW);
  assert.equal(two.events.length, 1);
  assert.equal(two.events[0].id, "2026020100:goal:7:void");
  assert.equal(two.events[0].retracts, "2026020100:goal:7");
  assert.equal(two.events[0].title, "Goal disallowed");
  assert.equal(two.next.has(7), false);
  assert.deepEqual(diffGoals(two.next, [shot(1)], game(), NOW).events, []); // said once
});
test("retraction: a goal that comes back before the debounce is not retracted; a re-published goal (same fingerprint) is the same goal", () => {
  const s0 = diffGoals(new Map(), [goal(7)], game(), NOW).next;
  const gone = diffGoals(s0, [shot(1)], game(), NOW);
  const back = diffGoals(gone.next, [goal(7)], game(), NOW);
  assert.deepEqual(back.events, []);
  assert.equal(back.next.get(7).miss, 0);
  const re = diffGoals(gone.next, [goal(12)], game(), NOW); // new eventId, same period:time:team:pid
  assert.equal(goalFingerprint(goal(12)), goalFingerprint(goal(7)));
  assert.deepEqual(re.events, []);
  assert.deepEqual([...re.next.keys()], [12]);
  assert.deepEqual(diffGoals(re.next, [goal(12)], game(), NOW).events, []);
});
test("scoreFallback: scorer-less line only when the total went up; deterministic id", () => {
  const prev = snapshot([game({ homeScore: 0, awayScore: 0 })], NOW).get(2026020100);
  const e = scoreFallback(prev, game(), NOW);
  assert.equal(e.id, "2026020100:goalscore:0-1");
  assert.equal(e.kind, "goal");
  assert.equal(e.delta, 1);
  assert.doesNotMatch(e.body, /undefined|null/);
  assert.equal(scoreFallback(prev, game({ homeScore: 0 }), NOW), null);
  assert.equal(scoreFallback(null, game(), NOW), null);
});

const prefs = (alerts = {}, o = {}) => ({ favorites: ["EDM"], players: [], games: [], ...o, alerts: { ...defaultPrefs().alerts, enabled: true, ...alerts } });
test("goalFetchPlan: only fresh live followed games whose total or period changed; never while off", () => {
  const prev = snapshot([game({ homeScore: 0 })], NOW);
  const plan = (games, p = prefs(), pend = new Set()) => goalFetchPlan(prev, games, p, pend, NOW).length;
  assert.equal(plan([game()]), 1);
  assert.equal(goalFetchPlan(prev, [game()], prefs(), new Set(), NOW)[0].prevTotal, 0);
  assert.equal(plan([game({ homeScore: 0, period: 2 })]), 1);
  assert.equal(plan([game({ homeScore: 0 })]), 0); // nothing changed
  assert.equal(plan([game({ homeScore: 0 })], prefs(), new Set([2026020100])), 1); // debounce re-check
  assert.equal(plan([game()], prefs({ enabled: false })), 0);
  assert.equal(plan([game()], prefs({ goal: false })), 0);
  assert.equal(plan([game()], prefs({}, { favorites: [] })), 0); // not followed
  assert.equal(plan([game()], prefs({}, { favorites: [], games: [{ id: 2026020100 }] })), 1);
  assert.equal(plan([game()], prefs({ scope: { teams: false, players: true, saved: true } })), 0);
  assert.equal(plan([game()], prefs({}, { favorites: [], players: [{ id: 8478402, team: "EDM" }] })), 0); // players' teams: puck drop only
  assert.equal(goalFetchPlan(null, [game()], prefs(), new Set(), NOW).length, 0);
  const old = "2026-11-09T05:00:00Z"; // stale live
  assert.equal(goalFetchPlan(snapshot([game({ homeScore: 0, start: old })], NOW), [game({ start: old })], prefs(), new Set(), NOW).length, 0);
});
test("relevantEvents honours the goal and ot categories and scope", () => {
  const e = { id: "1:goal:7", kind: "goal", gameId: 1, teams: ["CHI", "EDM"], title: "t", body: "b", at: 1 };
  assert.equal(relevantEvents([e], prefs()).length, 1);
  assert.equal(relevantEvents([e], prefs({ goal: false })).length, 0);
  assert.equal(relevantEvents([e], prefs({}, { favorites: [] })).length, 0);
  assert.equal(relevantEvents([{ ...e, kind: "ot" }], prefs({ ot: false })).length, 0);
  assert.equal(relevantEvents([{ ...e, kind: "ot" }], prefs()).length, 1);
  assert.equal(relevantEvents([e], prefs({}, { favorites: [], players: [{ id: 8478402, team: "EDM" }] })).length, 0);
});
test("overtime beginning is its own kind (ot); other period starts stay period", () => {
  const live = (o) => game({ homeScore: 2, awayScore: 2, ...o });
  const ot = diffGames(snapshot([live({ period: 3, intermission: true })], NOW), [live({ period: 4, periodType: "OT" })], NOW).events;
  assert.deepEqual(ot.map((x) => [x.id, x.kind]), [["2026020100:p4OT:begin", "ot"]]);
  const p2 = diffGames(snapshot([live({ period: 1, intermission: true })], NOW), [live({ period: 2 })], NOW).events;
  assert.equal(p2[0].kind, "period");
});

const goalEv = (n, o = {}) => ({ id: `1:goal:${n}`, kind: "goal", gameId: 1, teams: ["CHI", "EDM"], eventId: n, title: `Goal ${n}`, body: "b", at: 1, link: { gameId: 1, eventId: n, tab: "pbp" }, ...o });
const startEv = (i) => ({ id: `${i}:start`, kind: "start", gameId: i, teams: ["A", "B"], title: "s", body: "", at: 1 });
test("store: a goal alert dedupes across reload, and a void marks the original retracted (once)", () => {
  const storage = mem();
  const a = createAlertStore(storage, { tab: "a", clock: () => NOW });
  assert.equal(a.claim([goalEv(7)]).length, 1);
  const b = createAlertStore(storage, { tab: "b", clock: () => NOW });
  assert.equal(b.claim([goalEv(7)]).length, 0);
  const v = goalEv(7, { id: "1:goal:7:void", retracts: "1:goal:7", title: "Goal disallowed" });
  assert.equal(b.claim([v]).length, 1);
  assert.equal(b.claim([v]).length, 0);
  const items = a.items();
  assert.equal(items.find((i) => i.id === "1:goal:7").retracted, true);
  assert.equal(items.find((i) => i.id === "1:goal:7:void").retracts, "1:goal:7");
  // a void for a goal that was never alerted here (baseline) shows nothing
  assert.equal(a.claim([goalEv(99, { id: "1:goal:99:void", retracts: "1:goal:99" })]).length, 0);
});
test("store: goals are exempt from the tick summary and from the 60-item cap; a pile in one game collapses per game", () => {
  const a = createAlertStore(mem(), { tab: "a", clock: () => NOW });
  const out = a.claim([goalEv(1), goalEv(2), goalEv(3), startEv(10), startEv(11), startEv(12), startEv(13)]);
  assert.equal(out.filter((i) => i.kind === "goal").length, 3); // not folded into "N updates"
  assert.ok(out.some((i) => i.kind === "summary"));
  const b = createAlertStore(mem(), { tab: "b", clock: () => NOW });
  const pile = b.claim([1, 2, 3, 4, 5].map((n) => goalEv(n)));
  assert.equal(pile.length, 1);
  assert.match(pile[0].title, /5 goals/);
  assert.equal(pile[0].eventId, 5);
  const c = createAlertStore(mem(), { tab: "c", clock: () => NOW });
  for (let i = 0; i < 90; i++) c.claim([goalEv(i + 1000, { id: `${i}:goal:1`, gameId: i })]);
  for (let i = 0; i < 70; i++) c.claim([startEv(i + 500)]);
  const items = c.items();
  assert.equal(items.filter((i) => i.kind === "goal").length, 90); // goals survive 70 other items
  assert.ok(items.filter((i) => i.kind !== "goal").length <= ITEM_CAP);
  assert.ok(GOAL_ITEM_CAP > ITEM_CAP);
});
test("store: a final prunes that game's goal ids; the seen-set stays under its cap with many goals", () => {
  const a = createAlertStore(mem(), { tab: "a", clock: () => NOW });
  for (let n = 1; n <= 8; n++) a.claim([goalEv(n)]);
  a.claim([{ id: "1:final", kind: "final", gameId: 1, teams: ["CHI", "EDM"], title: "Final", body: "", at: 1 }]);
  assert.deepEqual(Object.keys(a.state().seen), ["1:final"]);
  for (let g = 0; g < 200; g++) for (let n = 1; n <= 8; n++) a.claim([goalEv(n, { id: `${g + 10}:goal:${n}`, gameId: g + 10 })]);
  assert.ok(Object.keys(a.state().seen).length <= SEEN_CAP);
});
test("parseState keeps the new goal fields and whitelists them", () => {
  const raw = JSON.stringify({ v: 1, seen: {}, items: [
    { id: "1:goal:7", kind: "goal", gameId: 1, teams: ["CHI", "EDM"], title: "t", body: "b", at: NOW, eventId: 7, retracted: true, retracts: "x".repeat(200), link: { gameId: 1, eventId: 7, tab: "pbp", evil: 1 }, extra: "no" },
    { id: "2", kind: "goal", gameId: 2, title: "t", at: NOW, eventId: "7", retracted: "yes", link: { gameId: "x", tab: "pbp" } },
    { id: "3", kind: "goal", gameId: 3, title: "t", at: NOW, link: { gameId: 3, eventId: 4, tab: "hack" } },
  ] });
  const [a, b, c] = parseState(raw, NOW).items.sort((x, y) => x.id.localeCompare(y.id));
  assert.equal(a.eventId, 7);
  assert.equal(a.retracted, true);
  assert.equal(a.retracts.length, 80);
  assert.deepEqual(a.link, { gameId: 1, eventId: 7, tab: "pbp" });
  assert.equal(a.extra, undefined);
  assert.equal(b.eventId, null);
  assert.equal(b.retracted, false);
  assert.equal(b.link, null);
  assert.equal(c.link.tab, "overview");
  assert.equal(parseState(JSON.stringify({ seen: {}, items: [{ id: "1:start", kind: "start", title: "t", at: NOW }] }), NOW).items[0].link, null); // pre-Phase-5 item
});
test("prefs migration: goal and ot default on, are filled into old records, and only real booleans stick", () => {
  assert.equal(defaultPrefs().alerts.goal, true);
  assert.equal(defaultPrefs().alerts.ot, true);
  const old = { version: 1, favorites: ["EDM"], alerts: { enabled: true, start: true, period: false, final: false, schedule: true, scope: { teams: true, players: true, saved: true } } };
  const p = parsePrefs(JSON.stringify(old), { teamIds: ["EDM"] });
  assert.equal(p.version, 1);
  assert.equal(p.alerts.goal, true);
  assert.equal(p.alerts.ot, true);
  assert.equal(p.alerts.final, false); // the person's choices are kept
  assert.equal(p.alerts.enabled, true);
  const q = sanitize({ alerts: { goal: false, ot: "no" } }, []);
  assert.equal(q.alerts.goal, false);
  assert.equal(q.alerts.ot, true);
  assert.equal(q.alerts.enabled, false);
});
