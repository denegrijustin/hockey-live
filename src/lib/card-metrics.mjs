import { elapsedMinutes } from "./projection.mjs";
import { buildRecap } from "./game-recap.mjs";

const toMin = (period, time) => { const [m, s] = String(time ?? "0:00").split(":").map(Number); return (period - 1) * 20 + m + (s || 0) / 60; };

/**
 * Who has the play right now: the shot attempts of the last ten minutes of regulation (goals and shots on goal from the play-by-play), home against away.
 * `balance` runs from -1 (away has it all) to 1 (home); `leader` is the side that is ahead by at least two attempts, else null. Null when the game is not live
 * or there is no play-by-play yet.
 */
export function momentum(game, feed, window = 10) {
  if (!feed || !["LIVE", "CRIT"].includes(feed.state) || !Array.isArray(feed.shots) || !feed.shots.length) return null;
  const now = elapsedMinutes(feed);
  if (now == null) return null;
  const recent = feed.shots.filter((s) => s.period <= 3 && s.periodType !== "SO").filter((s) => { const t = toMin(s.period, s.time); return t <= now + 0.01 && t >= now - window; });
  const home = recent.filter((s) => s.team === game.home).length, away = recent.filter((s) => s.team === game.away).length;
  const total = home + away;
  const balance = total ? (home - away) / total : 0;
  const diff = home - away;
  return { home, away, balance, leader: diff >= 2 ? "home" : diff <= -2 ? "away" : null };
}

/** The share of the win each side deserved from the chances it created (0..1 for the away side), or null until the play-by-play has a few attempts. */
export function deserve(feed) {
  if (!feed || !Array.isArray(feed.plays)) return null;
  const r = buildRecap({ game: feed, mp: null });
  if (!r || r.list.length < 3) return null;
  return { away: r.deserved.away, home: r.deserved.home };
}

/** The line the model draws under a pregame or live card: the favourite at the puck line and the total, rounded to the half goal. */
export function modelLine(projection) {
  if (!projection?.means) return null;
  const total = projection.means.home + projection.means.away;
  return { favourite: projection.homeWin >= 0.5 ? "home" : "away", total: Math.round(total * 2) / 2 };
}
