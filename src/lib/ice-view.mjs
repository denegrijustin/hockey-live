import { iceTilt } from "./pulse.mjs";

/** The net sits 11 feet in from the end boards: x = ±89 on the NHL's 200 x 85 foot rink. */
export const NET_X = 89;
/** A shot from within this many feet of the net is counted as a high-danger chance. */
export const HIGH_DANGER_FT = 24;

/** Whether a shot from (x, y), in the feed's rink coordinates, was a high-danger chance. Either end counts; the net is the nearer one. */
export function isHighDanger(x, y) {
  if (x == null || y == null) return false;
  return Math.hypot(NET_X - Math.abs(x), y) <= HIGH_DANGER_FT;
}

const KIND = { goal: "goal", "shot-on-goal": "sog", "missed-shot": "miss" };
/**
 * Every shot attempt with a recorded spot, drawn on one rink the same way for the whole game, in the order the scoreboard lists the teams: the AWAY team's shots at the left net and the HOME team's at the right,
 * whichever end they actually attacked (the teams switch ends between periods, so the feed's x runs both ways). Blocked shots have no useful spot and are left out.
 */
export function iceShots(game) {
  const source = Array.isArray(game.plays) && game.plays.length ? game.plays : (game.shots ?? []);
  const out = [];
  for (const p of source) {
    const kind = KIND[p.type];
    if (!kind || p.periodType === "SO" || p.x == null || p.y == null || !p.team) continue;
    const home = p.team === game.home;
    if (!home && p.team !== game.away) continue;
    const x = (home ? 1 : -1) * Math.abs(p.x);
    out.push({ id: p.id, team: p.team, home, kind, x, y: p.y, hd: isHighDanger(p.x, p.y), player: p.player ?? null, period: p.period, time: p.time });
  }
  return out;
}

/** What the ice view says about a game: shots on goal, high-danger chances, attempts and the last ten minutes' pressure. */
export function iceSummary(game) {
  const shots = iceShots(game);
  const count = (home, f) => shots.filter((s) => s.home === home && f(s)).length;
  const attemptsAll = Array.isArray(game.plays) ? game.plays.filter((p) => ["goal", "shot-on-goal", "missed-shot", "blocked-shot"].includes(p.type) && p.periodType !== "SO") : [];
  const tilt = iceTilt(game);
  return {
    shots,
    sog: { home: game.homeShots ?? count(true, (s) => s.kind !== "miss"), away: game.awayShots ?? count(false, (s) => s.kind !== "miss") },
    hd: { home: count(true, (s) => s.hd && s.kind !== "miss"), away: count(false, (s) => s.hd && s.kind !== "miss") },
    attempts: attemptsAll.length ? { home: attemptsAll.filter((p) => p.team === game.home).length, away: attemptsAll.filter((p) => p.team === game.away).length } : null,
    tilt: tilt && tilt.homeShare != null ? { homeShare: tilt.homeShare, minutes: tilt.minutes } : null,
    goals: shots.filter((s) => s.kind === "goal"),
  };
}
