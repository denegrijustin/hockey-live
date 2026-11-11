// Deterministic Game Center sequences built from REAL recorded NHL play-by-play (see docs/phase5-qa-fixtures.md).
// Everything works on the RAW NHL envelope (what api-web.nhle.com returns) and the app's normalizeGameFeed turns it into the /api/game shape.
// Provenance labels: real = untouched API data; derived = a real response with a stated mutation; replicated = real plays repeated to size a stress test.
// Pure and synchronous: no clock, no randomness, no network. Safe to import from node tests and Playwright specs alike.
import { readFileSync } from "node:fs";
import { normalizeGameFeed, normalizeScoreboard } from "../../../src/lib/game-data.mjs";

const read = (f) => JSON.parse(readFileSync(new URL(f, import.meta.url), "utf8"));
/** Real recorded responses. live = the repo's raw live fixture (first-period, zero goals); reg/ot/so = finished 2025-26 games. */
export const REAL = {
  live: () => read("../raw-live-game.json"),
  reg: () => read("./real-reg.json"),
  ot: () => read("./real-ot.json"),
  so: () => read("./real-so.json"),
};
export const clone = (o) => JSON.parse(JSON.stringify(o));
const label = (raw, tag) => ({ ...raw, _provenance: [...(raw._provenance ?? []), tag] });
export const provenance = (raw) => raw._provenance ?? ["real"];

const isShootout = (p) => p.periodDescriptor?.periodType === "SO";
/** Real goal plays that count on the scoreboard (shootout "goal" events do not move the score). */
export const scoringGoals = (raw) => raw.plays.filter((p) => p.typeDescKey === "goal" && !isShootout(p));

// ---------- poll slicing ----------
/** Poll N of a recorded game: only plays with sortOrder <= `upTo`; scores and shots in the envelope follow those plays (derived envelope, real plays). */
export function slice(raw, upTo) {
  const out = clone(raw);
  out.plays = out.plays.filter((p) => (p.sortOrder ?? 0) <= upTo);
  const goals = out.plays.filter((p) => p.typeDescKey === "goal" && !isShootout(p)).sort((a, b) => a.sortOrder - b.sortOrder);
  const last = goals.at(-1)?.details;
  out.homeTeam.score = last?.homeScore ?? 0;
  out.awayTeam.score = last?.awayScore ?? 0;
  const shots = (team) => out.plays.filter((p) => ["shot-on-goal", "goal"].includes(p.typeDescKey) && !isShootout(p) && p.details?.eventOwnerTeamId === team.id).length;
  out.homeTeam.sog = shots(out.homeTeam);
  out.awayTeam.sog = shots(out.awayTeam);
  const lastPlay = out.plays.at(-1);
  if (lastPlay) out.periodDescriptor = { ...lastPlay.periodDescriptor };
  return label(out, `sliced<=${upTo}`);
}
/** sortOrder cut points that split a game into `n` roughly equal polls (the last one is the whole game). */
export function cutPoints(raw, n) {
  const orders = raw.plays.map((p) => p.sortOrder ?? 0).sort((a, b) => a - b);
  return Array.from({ length: n }, (_, i) => orders[Math.min(orders.length - 1, Math.ceil(((i + 1) * orders.length) / n) - 1)]);
}
/** A poll sequence: one raw response per cut (or per sortOrder in `cuts`). */
export function pollSequence(raw, cutsOrCount = 4) {
  const cuts = Array.isArray(cutsOrCount) ? cutsOrCount : cutPoints(raw, cutsOrCount);
  return cuts.map((c) => slice(raw, c));
}

// ---------- envelope states (only envelope fields change; plays stay real) ----------
const CLOCK = { running: false, inIntermission: false };
/** states: pre | fut | live | crit (intermission) | ot | so | final | off | ppd | cncl | susp. The mutation is on gameState / gameScheduleState / clock / periodDescriptor only. */
export function withState(raw, state, { clock = "12:34" } = {}) {
  const o = clone(raw);
  const [m, s] = clock.split(":").map(Number);
  const secs = m * 60 + s;
  o.gameScheduleState = "OK";
  switch (state) {
    case "pre": case "fut":
      o.gameState = state.toUpperCase(); o.plays = []; o.homeTeam.score = 0; o.awayTeam.score = 0; delete o.homeTeam.sog; delete o.awayTeam.sog; delete o.clock; break;
    case "live": o.gameState = "LIVE"; o.clock = { ...CLOCK, timeRemaining: clock, secondsRemaining: secs, running: true }; break;
    case "crit": o.gameState = "CRIT"; o.clock = { timeRemaining: "17:34", secondsRemaining: 1054, running: false, inIntermission: true }; break;
    case "ot": o.gameState = "LIVE"; o.periodDescriptor = { number: 4, periodType: "OT", maxRegulationPeriods: 3 }; o.clock = { ...CLOCK, timeRemaining: clock, secondsRemaining: secs, running: true }; break;
    case "so": o.gameState = "LIVE"; o.periodDescriptor = { number: 5, periodType: "SO", maxRegulationPeriods: 3 }; o.clock = { ...CLOCK, timeRemaining: "00:00", secondsRemaining: 0 }; break;
    case "final": o.gameState = "FINAL"; o.clock = { ...CLOCK, timeRemaining: "00:00", secondsRemaining: 0 }; break;
    case "off": o.gameState = "OFF"; o.clock = { ...CLOCK, timeRemaining: "00:00", secondsRemaining: 0 }; break;
    case "ppd": case "cncl": case "susp":
      o.gameState = "FUT"; o.gameScheduleState = state.toUpperCase(); o.plays = []; o.homeTeam.score = 0; o.awayTeam.score = 0; delete o.clock; break;
    default: throw new Error(`unknown state ${state}`);
  }
  return label(o, `state:${state}`);
}

// ---------- derived transformations (each clearly a mutation of a real response) ----------
/** DERIVED: relabel a real shot-on-goal as a goal (scorer = shooter, score after = previous total + 1 for the owner). Returns {raw, eventId}. */
export function relabelShotAsGoal(raw, eventId) {
  const o = clone(raw);
  const p = o.plays.find((x) => x.eventId === eventId) ?? o.plays.find((x) => x.typeDescKey === "shot-on-goal");
  const prev = o.plays.filter((x) => x.typeDescKey === "goal" && x.sortOrder < p.sortOrder && !isShootout(x)).sort((a, b) => a.sortOrder - b.sortOrder).at(-1)?.details;
  let home = prev?.homeScore ?? 0, away = prev?.awayScore ?? 0;
  if (p.details.eventOwnerTeamId === o.homeTeam.id) home++; else away++;
  p.typeDescKey = "goal"; p.typeCode = 505;
  p.details = { ...p.details, scoringPlayerId: p.details.shootingPlayerId, homeScore: home, awayScore: away, goalieInNetId: p.details.goalieInNetId ?? null };
  return { raw: label(o, `derived:relabel-goal:${p.eventId}`), eventId: p.eventId };
}
/** DERIVED: remove an event entirely (a disallowed goal vanishes from the feed). Scores of later goals are not touched (the NHL feed also keeps them until the next poll). */
export function removeEvent(raw, eventId) {
  const o = clone(raw);
  o.plays = o.plays.filter((p) => p.eventId !== eventId);
  return label(o, `derived:remove:${eventId}`);
}
/** DERIVED: swap the sortOrder of two events (a reordered feed). */
export function swapOrder(raw, a, b) {
  const o = clone(raw);
  const pa = o.plays.find((p) => p.eventId === a), pb = o.plays.find((p) => p.eventId === b);
  [pa.sortOrder, pb.sortOrder] = [pb.sortOrder, pa.sortOrder];
  return label(o, `derived:swap:${a}<->${b}`);
}
/** DERIVED: change a goal's assists (an official-scorer correction). `assists` = array of up to two player ids. */
export function changeAssists(raw, eventId, assists) {
  const o = clone(raw);
  const p = o.plays.find((x) => x.eventId === eventId);
  p.details.assist1PlayerId = assists[0]; p.details.assist2PlayerId = assists[1];
  if (assists[0] === undefined) delete p.details.assist1PlayerId;
  if (assists[1] === undefined) delete p.details.assist2PlayerId;
  return label(o, `derived:assists:${eventId}`);
}
/** DERIVED: drop timeInPeriod / timeRemaining / sortOrder from every play (malformed feed). */
export function dropTimestamps(raw) {
  const o = clone(raw);
  for (const p of o.plays) { delete p.timeInPeriod; delete p.timeRemaining; delete p.sortOrder; }
  return label(o, "derived:no-timestamps");
}
/** REPLICATED: `n` plays by repeating the real plays with fresh unique eventIds and increasing sortOrder (a stress size, not a game). */
export function replicate(raw, n = 400) {
  const o = clone(raw);
  const base = raw.plays;
  const maxId = Math.max(...base.map((p) => p.eventId)), maxOrder = Math.max(...base.map((p) => p.sortOrder ?? 0));
  o.plays = Array.from({ length: n }, (_, i) => {
    const p = clone(base[i % base.length]);
    const lap = Math.floor(i / base.length);
    p.eventId = base[i % base.length].eventId + lap * (maxId + 1);
    p.sortOrder = (base[i % base.length].sortOrder ?? 0) + lap * (maxOrder + 1);
    return p;
  });
  return label(o, `replicated:${n}`);
}

// ---------- app shapes ----------
/** What /api/game/:id returns for a raw response. */
export const feedOf = (raw) => normalizeGameFeed(raw);
/** The scoreboard row (/api/live game) for a raw response; `end` follows the recorded outcome. `over` overrides fields (e.g. date/start to make the game "today"). */
export function gameOf(raw, over = {}) {
  const g = normalizeScoreboard({ currentDate: raw.gameDate, games: [raw] }).games[0];
  return { ...g, end: raw.gameOutcome?.lastPeriodType ?? g.end, ...over };
}
/** /api/live body for one game. */
export const liveBodyOf = (raw, over = {}) => ({ updatedAt: new Date().toISOString(), date: over.date ?? raw.gameDate, games: [gameOf(raw, over)] });
