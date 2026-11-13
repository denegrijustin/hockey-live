import { elapsedMinutes, projectGame } from "./projection.mjs";

const toMin = (period, time) => { const [m, s] = String(time ?? "0:00").split(":").map(Number); return (period - 1) * 20 + m + s / 60; };
const mmss = (min) => { const s = Math.round(min * 60); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * The home team's win chance through regulation so far, replayed minute by minute from the play-by-play with the same live model as the card's headline:
 * the score, the clock and the shots that had happened by then (power plays are not replayed). Returns [{ t, home }] with t in minutes elapsed and home in 0..1;
 * empty when the game is not live or there is no play-by-play. Uncalibrated, like the model it uses.
 */
export function winHistory(game, table, baseline, feed, step = 1) {
  const live = feed && ["LIVE", "CRIT"].includes(feed.state);
  const now = live ? elapsedMinutes(feed) : null;
  if (now == null || !Array.isArray(feed.plays)) return [];
  const goals = feed.plays.filter((p) => p.type === "goal" && p.periodType !== "SO" && p.period <= 3).map((p) => ({ team: p.team, t: toMin(p.period, p.time) }));
  const shots = (feed.shots ?? []).filter((s) => s.period <= 3 && s.periodType !== "SO");
  const out = [];
  for (let t = 0; t < now; t += step) {
    const period = Math.min(3, Math.floor(t / 20) + 1);
    const sofar = shots.filter((s) => toMin(s.period, s.time) <= t);
    const pseudo = {
      ...feed, state: "LIVE", period, periodType: "REG", intermission: false, clock: mmss(20 - (t - (period - 1) * 20)),
      homeScore: goals.filter((g) => g.t <= t && g.team === game.home).length, awayScore: goals.filter((g) => g.t <= t && g.team === game.away).length,
      homeShots: sofar.filter((s) => s.team === game.home).length, awayShots: sofar.filter((s) => s.team === game.away).length, shots: sofar, situation: null,
    };
    const p = projectGame(pseudo, table, baseline, pseudo);
    if (p) out.push({ t, home: p.homeWin });
  }
  return out;
}
