import test from "node:test";
import assert from "node:assert/strict";
import { deflateRawSync } from "node:zlib";
import { download, refreshMoneyPuck } from "../src/lib/moneypuck-refresh.mjs";
import { sourceUrls } from "../src/lib/moneypuck.mjs";

const TEAMS = ["EDM", "CAR", "BOS", "TOR", "NYR", "NYI", "CHI", "MIN", "DAL", "COL", "VGK", "SEA", "VAN", "CGY", "WPG", "STL", "NSH", "DET", "BUF", "MTL", "OTT", "FLA", "TBL", "WSH", "PIT", "PHI", "NJD", "CBJ", "ANA", "LAK", "SJS", "UTA"];
const SITS = ["all", "5on5", "5on4", "4on5", "other"];
const csv = (rows) => { const keys = Object.keys(rows[0]); return [keys.join(","), ...rows.map((r) => keys.map((k) => r[k]).join(","))].join("\n"); };
const teamsCsv = (season = 2026) => csv(TEAMS.flatMap((team) => SITS.map((situation) => ({ team, season, name: team, situation, games_played: 5, iceTime: 3600, xGoalsFor: 1, xGoalsAgainst: 1, goalsFor: 1, goalsAgainst: 1, shotsOnGoalFor: 10, shotsOnGoalAgainst: 10, shotAttemptsFor: 20, shotAttemptsAgainst: 20 }))));
const goaliesCsv = () => csv(SITS.map((situation) => ({ playerId: 1, season: 2026, name: "G One", team: "EDM", position: "G", situation, games_played: 3, icetime: 600, xGoals: 2, goals: 1, ongoal: 20 })));
const skatersCsv = () => csv(Array.from({ length: 210 }, (_, i) => ({ playerId: 8000000 + i, season: 2026, name: `P${i}`, team: TEAMS[i % 32], position: "C", situation: "all", games_played: 5, icetime: 900, I_F_goals: 1, I_F_xGoals: 1, OnIce_F_xGoals: 1, OnIce_A_xGoals: 1 })));
const linesCsv = () => csv([{ lineId: "84788548480803", season: 2026, name: "A-B", team: "EDM", position: "pairing", situation: "5on5", games_played: 3, icetime: 300, xGoalsFor: 1, xGoalsAgainst: 1, goalsFor: 0, goalsAgainst: 0 }]);
const shotsCsv = () => csv([{ game_id: 20001, season: 2026, isPlayoffGame: 0, homeTeamCode: "CAR", awayTeamCode: "EDM", isHomeTeam: "0.0", teamCode: "EDM", period: 1, time: 100, event: "SHOT", xGoal: 0.1, goal: 0, shotWasOnGoal: "1.0", homeSkatersOnIce: 5, awaySkatersOnIce: 5, goalieIdForShot: 5, goalieNameForShot: "X", shooterPlayerId: 9, shooterName: "Y", shotType: "WRIST", xCordAdjusted: 60, yCordAdjusted: 1, shotOnEmptyNet: 0 }]);
function zip(text) {
  const name = Buffer.from("s.csv"), data = deflateRawSync(Buffer.from(text));
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(8, 8); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(text.length, 22); local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(8, 10); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(text.length, 24); central.writeUInt16LE(name.length, 28);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(1, 8); eocd.writeUInt16LE(1, 10);
  const body = Buffer.concat([local, name, data]);
  eocd.writeUInt32LE(central.length + name.length, 12); eocd.writeUInt32LE(body.length, 16);
  return Buffer.concat([body, central, name, eocd]);
}
const u = sourceUrls(2026);
function fakeSource(overrides = {}) {
  const calls = [];
  const stamps = { summary: "2026-10-13 06:31:35.5-04:00", shots: "2026-10-13 03:40:14.7-04:00", ...overrides.stamps };
  const bodies = { [u.teams]: teamsCsv(), [u.goalies]: goaliesCsv(), [u.skaters]: skatersCsv(), [u.lines]: linesCsv(), ...overrides.bodies };
  const fetchFn = async (url) => {
    calls.push(url);
    if (overrides.fail?.[url]) { const s = overrides.fail[url]; return new Response("x", { status: s }); }
    if (url === u.summaryUpdated) return new Response(stamps.summary);
    if (url === u.shotsUpdated) return new Response(stamps.shots);
    if (url === u.shots) return new Response(zip(overrides.shots ?? shotsCsv()));
    return new Response(bodies[url] ?? "", { status: bodies[url] ? 200 : 404 });
  };
  return { fetchFn, calls, stamps, bodies };
}
function memoryStore() { const m = new Map(); return { m, get: async (k) => m.get(k) ?? null, put: async (k, v) => { m.set(k, structuredClone(v)); } }; }
const run = (o) => refreshMoneyPuck({ year: 2026, teamIds: TEAMS, now: () => new Date("2026-10-13T12:00:00Z"), ...o });

test("a good refresh publishes every part, per-game shots, a dated snapshot and the status last", async () => {
  const store = memoryStore(), src = fakeSource();
  const r = await run({ store, fetchFn: src.fetchFn });
  assert.equal(r.ok, true); assert.equal(r.changed, true);
  const keys = [...store.m.keys()];
  for (const k of ["mp1:2026:summary", "mp1:2026:skaters", "mp1:2026:lines", "mp1:2026:games", "mp1:2026:shots:2026020001", "mp1:2026:history:2026-10-13", "mp1:2026:status"]) assert.ok(keys.includes(k), k);
  assert.equal(keys.at(-1), "mp1:2026:status", "status is written last");
  const summary = store.m.get("mp1:2026:summary");
  assert.equal(summary.source, "MoneyPuck.com");
  assert.equal(summary.seasonId, 20262027);
  assert.equal(summary.sourceUpdated.summary, "2026-10-13T10:31:35.000Z"); // 06:31 Eastern
  assert.equal(summary.sourceUpdated.shots, "2026-10-13T07:40:14.000Z");
  assert.equal(Object.keys(summary.teams).length, 32);
  assert.equal(store.m.get("mp1:2026:status").counts.games, 1);
});

test("an unchanged source is not downloaded again", async () => {
  const store = memoryStore(), src = fakeSource();
  await run({ store, fetchFn: src.fetchFn });
  const before = src.calls.length;
  const r = await run({ store, fetchFn: src.fetchFn });
  assert.equal(r.ok, true); assert.equal(r.changed, false);
  assert.equal(src.calls.length - before, 2, "only the two update-time files are read");
  assert.equal(store.m.get("mp1:2026:status").lastCheckedAt, "2026-10-13T12:00:00.000Z");
  // force downloads anyway
  const forced = await run({ store, fetchFn: src.fetchFn, force: true });
  assert.equal(forced.changed, true);
});

test("a failed refresh keeps the last good snapshot and records why", async () => {
  const store = memoryStore();
  await run({ store, fetchFn: fakeSource().fetchFn });
  const good = JSON.stringify(store.m.get("mp1:2026:summary"));
  const next = fakeSource({ stamps: { summary: "2026-10-14 06:31:35-04:00" }, fail: { [u.skaters]: 503 } });
  const r = await run({ store, fetchFn: next.fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.error, /503/);
  assert.equal(JSON.stringify(store.m.get("mp1:2026:summary")), good, "the published snapshot is untouched");
  const status = store.m.get("mp1:2026:status");
  assert.equal(status.ok, true, "the last good snapshot is still the one in use");
  assert.match(status.lastError, /503/);
  assert.ok(status.lastFailedAt);
  assert.equal(status.sourceUpdated.summary, "2026-10-13T10:31:35.000Z");
  assert.equal(next.calls.filter((c) => c === u.skaters).length, 3, "bounded: three attempts, then give up");
});

test("a file that fails validation publishes nothing", async () => {
  const store = memoryStore();
  const src = fakeSource({ bodies: { [u.teams]: teamsCsv(2025) } }); // last season's rows in this season's file
  const r = await run({ store, fetchFn: src.fetchFn });
  assert.equal(r.ok, false);
  assert.match(r.error, /season 2025/);
  assert.deepEqual([...store.m.keys()], ["mp1:2026:status"], "only the failure note is written");
  assert.equal(store.m.get("mp1:2026:status").ok, false);
});

test("a source error (404 for a file) is not retried", async () => {
  const src = fakeSource({ fail: { [u.lines]: 404 } });
  const r = await run({ store: memoryStore(), fetchFn: src.fetchFn });
  assert.equal(r.ok, false);
  assert.equal(src.calls.filter((c) => c === u.lines).length, 1);
});

test("overlapping refreshes: the second one is skipped and downloads nothing", async () => {
  let held = false;
  const lock = { acquire: async () => (held ? false : (held = true)), release: async () => { held = false; } };
  const store = memoryStore(), src = fakeSource();
  const slowFetch = async (url) => { await new Promise((r) => setTimeout(r, 15)); return src.fetchFn(url); };
  const [a, b] = await Promise.all([run({ store, lock, fetchFn: slowFetch }), run({ store, lock, fetchFn: slowFetch })]);
  assert.equal([a, b].filter((x) => x.skipped).length, 1);
  assert.equal([a, b].filter((x) => x.changed).length, 1);
  assert.equal(held, false, "the lock is always released");
  const failing = await run({ store: memoryStore(), lock, fetchFn: async () => { throw new TypeError("offline"); }, force: true });
  assert.equal(failing.ok, false);
  assert.equal(held, false, "the lock is released after a failure too");
});

test("requests time out and retry a bounded number of times", async () => {
  let calls = 0;
  const keepAlive = setInterval(() => {}, 20); // AbortSignal.timeout's timer alone does not keep Node running
  const hang = (url, { signal }) => { calls++; return new Promise((_, reject) => signal.addEventListener("abort", () => reject(signal.reason))); };
  await assert.rejects(() => download("https://x.test/a.csv", { fetchFn: hang, attempts: 2, timeoutMs: 20, backoffMs: 1 }));
  clearInterval(keepAlive);
  assert.equal(calls, 2);
  let ok = 0;
  const flaky = async () => (++ok < 3 ? new Response("no", { status: 429 }) : new Response("fine"));
  assert.equal(await download("https://x.test/b.csv", { fetchFn: flaky, attempts: 3, backoffMs: 1 }), "fine");
});

test("only the newest games keep their shot files", async () => {
  const rows = Array.from({ length: 5 }, (_, i) => ({ ...parseOne(), game_id: 20001 + i }));
  function parseOne() { return { season: 2026, isPlayoffGame: 0, homeTeamCode: "CAR", awayTeamCode: "EDM", isHomeTeam: "0.0", teamCode: "EDM", period: 1, time: 100, event: "SHOT", xGoal: 0.1, goal: 0, shotWasOnGoal: "1.0", homeSkatersOnIce: 5, awaySkatersOnIce: 5, goalieIdForShot: 5, goalieNameForShot: "X", shooterPlayerId: 9, shooterName: "Y", shotType: "WRIST", xCordAdjusted: 60, yCordAdjusted: 1, shotOnEmptyNet: 0 }; }
  const store = memoryStore();
  const r = await run({ store, fetchFn: fakeSource({ shots: csv(rows) }).fetchFn, keepShotGames: 2 });
  assert.deepEqual(r.status.shotGames, [2026020004, 2026020005]);
  assert.equal(store.m.get("mp1:2026:games").through, 2026020005);
  assert.equal(Object.keys(store.m.get("mp1:2026:games").games).length, 5);
});
