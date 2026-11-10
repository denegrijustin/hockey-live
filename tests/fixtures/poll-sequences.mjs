/**
 * Poll-sequence builders for Phase 5 tests (node tests and Playwright specs share them; tests/browser/gc-fixtures.ts re-exports them).
 *
 * Provenance: every sequence starts from a REAL recorded NHL response, tests/fixtures/raw-live-game.json (api-web play-by-play of a real
 * game, 114 real events, first period + intermission). A "poll N" is that response SLICED by sortOrder (what the feed looked like earlier
 * in the game, because the NHL feed is append-only) with only ENVELOPE fields changed for state (gameState, periodDescriptor, clock).
 * Everything that is not a straight slice is a DERIVED transformation, and is labelled:
 *   - deriveGoal(): the recorded game has no goals. A goal is built with the field layout of a REAL goal event
 *     (tests/fixtures/real-goal-events.json, trimmed from NHL game 2025020500) using players from the recorded game's own roster. The
 *     play carries `_derived` so it can never be mistaken for recorded data.
 *   - dropPlay(): models a disallowed goal / feed correction by removing an event from a later poll. Derived.
 *   - rekeyPlay(): models the same goal reappearing under a new eventId. Derived.
 * None of this is app data: it is only ever served to tests.
 */
import { readFileSync } from "node:fs";

const read = (name) => JSON.parse(readFileSync(new URL(`./${name}`, import.meta.url), "utf8"));
/** A fresh deep copy of the recorded raw game (never share the object between polls). */
export const rawGame = () => read("raw-live-game.json");
/** The trimmed REAL goal events (provenance inside the file). */
export const realGoals = () => read("real-goal-events.json");

const clone = (x) => JSON.parse(JSON.stringify(x));

/** Highest sortOrder in the raw game. */
export const lastOrder = (raw) => Math.max(...raw.plays.map((p) => p.sortOrder));

/**
 * Envelope patches per state (the only fields a state change touches). kind: scheduled | pregame | live | intermission | ot | so |
 * final | final-ot | final-so | postponed | suspended | cancelled.
 */
export function envelope(kind, { period = 1, secondsRemaining = 1200, running = true } = {}) {
  const mmss = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
  const clock = (inIntermission = false) => ({ timeRemaining: mmss(secondsRemaining), secondsRemaining, running: inIntermission ? false : running, inIntermission });
  const per = (number, periodType = "REG") => ({ number, periodType, maxRegulationPeriods: 3 });
  switch (kind) {
    case "scheduled": return { gameState: "FUT", gameScheduleState: "OK", periodDescriptor: per(1), clock: { timeRemaining: "20:00", secondsRemaining: 1200, running: false, inIntermission: false } };
    case "pregame": return { gameState: "PRE", gameScheduleState: "OK", periodDescriptor: per(1), clock: { timeRemaining: "20:00", secondsRemaining: 1200, running: false, inIntermission: false } };
    case "live": return { gameState: "LIVE", gameScheduleState: "OK", periodDescriptor: per(period), clock: clock() };
    case "intermission": return { gameState: "LIVE", gameScheduleState: "OK", periodDescriptor: per(period), clock: clock(true) };
    case "ot": return { gameState: "LIVE", gameScheduleState: "OK", otInUse: true, periodDescriptor: per(4, "OT"), clock: clock() };
    case "so": return { gameState: "LIVE", gameScheduleState: "OK", otInUse: true, shootoutInUse: true, periodDescriptor: per(5, "SO"), clock: { timeRemaining: "00:00", secondsRemaining: 0, running: false, inIntermission: false } };
    case "final": return { gameState: "OFF", gameScheduleState: "OK", periodDescriptor: per(3), clock: { timeRemaining: "00:00", secondsRemaining: 0, running: false, inIntermission: false } };
    case "final-ot": return { gameState: "OFF", gameScheduleState: "OK", otInUse: true, periodDescriptor: per(4, "OT"), clock: { timeRemaining: "02:04", secondsRemaining: 124, running: false, inIntermission: false } };
    case "final-so": return { gameState: "OFF", gameScheduleState: "OK", otInUse: true, shootoutInUse: true, periodDescriptor: per(5, "SO"), clock: { timeRemaining: "00:00", secondsRemaining: 0, running: false, inIntermission: false } };
    case "postponed": return { gameState: "FUT", gameScheduleState: "PPD" };
    case "suspended": return { gameState: "FUT", gameScheduleState: "SUSP" };
    case "cancelled": return { gameState: "FUT", gameScheduleState: "CNCL" };
    default: throw new Error(`unknown envelope kind ${kind}`);
  }
}

/**
 * One poll: the recorded game with plays up to `upToOrder` (inclusive sortOrder) and the envelope fields of `state` (an envelope()
 * patch or a kind name). Scores in the envelope are overridden by `score` {home, away}.
 */
export function poll(raw, { upToOrder = Infinity, state = null, score = null, plays = null } = {}) {
  const out = clone(raw);
  out.plays = (plays ?? out.plays).filter((p) => p.sortOrder <= upToOrder);
  if (state) Object.assign(out, typeof state === "string" ? envelope(state) : state);
  if (score) { out.homeTeam.score = score.home; out.awayTeam.score = score.away; }
  return out;
}

/**
 * DERIVED goal in raw NHL shape, placed after the event at `afterOrder` (takes that event's period and clock) with a free sortOrder
 * just above it. Scorer, two assists and the opposing goalie come from the recorded roster. `scores` is the score after the goal.
 */
export function deriveGoal(raw, { eventId, afterOrder, team = "home", scores }) {
  const template = realGoals().plays[0];
  const side = team === "home" ? raw.homeTeam : raw.awayTeam;
  const other = team === "home" ? raw.awayTeam : raw.homeTeam;
  const skaters = raw.rosterSpots.filter((r) => r.teamId === side.id && r.positionCode !== "G");
  const goalie = raw.rosterSpots.find((r) => r.teamId === other.id && r.positionCode === "G");
  const near = [...raw.plays].filter((p) => p.sortOrder <= afterOrder).sort((a, b) => b.sortOrder - a.sortOrder)[0];
  const orders = new Set(raw.plays.map((p) => p.sortOrder));
  let order = afterOrder + 1;
  while (orders.has(order)) order++;
  const details = { ...template.details, scoringPlayerId: skaters[0].playerId, assist1PlayerId: skaters[1].playerId, assist2PlayerId: skaters[2].playerId, eventOwnerTeamId: side.id, goalieInNetId: goalie.playerId, homeScore: scores.home, awayScore: scores.away };
  for (const k of ["highlightClip", "highlightClipFr", "discreteClip", "discreteClipFr", "highlightClipSharingUrl", "highlightClipSharingUrlFr"]) delete details[k];
  return {
    eventId,
    periodDescriptor: clone(near.periodDescriptor),
    timeInPeriod: near.timeInPeriod,
    timeRemaining: near.timeRemaining,
    situationCode: near.situationCode,
    homeTeamDefendingSide: near.homeTeamDefendingSide,
    typeCode: 505,
    typeDescKey: "goal",
    sortOrder: order,
    details,
    _derived: "goal derived from the field layout of tests/fixtures/real-goal-events.json with recorded-roster players; not recorded data",
  };
}

/** A copy of the game with `plays` added (re-sorted by sortOrder like the feed). DERIVED when the plays are. */
export function withPlays(raw, ...plays) {
  const out = clone(raw);
  out.plays = [...out.plays, ...clone(plays)].sort((a, b) => a.sortOrder - b.sortOrder);
  return out;
}

/** DERIVED: the game without one event (a disallowed goal removed by the NHL). */
export function dropPlay(raw, eventId) {
  const out = clone(raw);
  out.plays = out.plays.filter((p) => p.eventId !== eventId);
  return out;
}

/** DERIVED: the same event under a new eventId (the feed re-issued it). */
export function rekeyPlay(raw, eventId, newId) {
  const out = clone(raw);
  for (const p of out.plays) if (p.eventId === eventId) p.eventId = newId;
  return out;
}

/** The recorded game's sortOrder values at which the plays can be sliced (every real event boundary). */
export const orders = (raw) => raw.plays.map((p) => p.sortOrder).sort((a, b) => a - b);
