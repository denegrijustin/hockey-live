// What is worth watching: a forecast watchability score for every game, how hot a live game is right now, which live games are close and late, and where an
// upset is brewing. Pure, so the board, the watch-now strip and the cards share one definition.
import { projectGame } from "./projection.mjs";

const isLiveState = (g) => g.state === "LIVE" || g.state === "CRIT";
const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

/** The home team's win chance before the puck drops (the same model, with the score and clock taken out). Null when it cannot be projected. */
export function pregameHomeWin(game, before, baseline) {
  const p = projectGame({ ...game, state: "FUT", homeScore: null, awayScore: null, period: null, periodType: null, clock: null }, before, baseline);
  return p ? p.homeWin : null;
}

/**
 * Forecast watchability, 0-100: how much the game matters (the importance score) and how even it looks (a coin-flip game is worth more than a mismatch).
 * With no win chance it is the importance score alone.
 */
export function watchability(importance, homeWin) {
  const stakes = Number.isFinite(importance) ? importance : 50;
  if (homeWin == null) return Math.round(clamp(stakes, 0, 100));
  const even = 1 - Math.abs(2 * homeWin - 1); // 1 at 50/50, 0 at a lock
  return Math.round(clamp(0.65 * stakes + 0.35 * even * 100, 0, 100));
}

/** The period a live game is in: 1, 2, 3, or 4 for overtime (shootout counts as overtime). */
export const periodOf = (g) => (g.periodType === "OT" || g.periodType === "SO" ? Math.max(4, g.period ?? 4) : (g.period ?? 1));

/** A one-goal (or tied) game in the 3rd period or overtime. */
export function closeAndLate(g) {
  if (!isLiveState(g) || g.homeScore == null || g.awayScore == null) return { late: false, close: false, both: false, label: "" };
  const period = periodOf(g), margin = Math.abs(g.homeScore - g.awayScore);
  const late = period >= 3, close = margin <= 1;
  const label = late && close ? (period >= 4 ? "One-goal game · overtime" : margin === 0 ? "Tied · 3rd period" : "One-goal game · 3rd period") : "";
  return { late, close, both: late && close, label };
}

/**
 * How worth watching a game is right now: its forecast plus a bonus for a close score and one for how late it is. A game that is not live is just its
 * forecast. Capped at 100 so it reads like the card's own number.
 */
export function liveHeat(score, g) {
  if (!isLiveState(g) || g.homeScore == null || g.awayScore == null) return score;
  const margin = Math.abs(g.homeScore - g.awayScore), period = periodOf(g);
  const close = margin === 0 ? 12 : margin === 1 ? 9 : margin === 2 ? 4 : 0;
  const late = period >= 4 ? 12 : period === 3 ? 6 : period === 2 ? 2 : 0;
  return Math.min(100, score + close + (margin <= 2 ? late : late * 0.4));
}

/** The underdog (a 40% or lower chance before the game) is leading by one or two goals in the 3rd period, or the game is tied in overtime. Returns the underdog's side, or null. */
export function upsetBrewing(g, pregameHome) {
  if (!isLiveState(g) || pregameHome == null || g.homeScore == null || g.awayScore == null || periodOf(g) < 3) return null;
  const dog = pregameHome <= 0.4 ? "home" : pregameHome >= 0.6 ? "away" : null;
  if (!dog) return null;
  const lead = dog === "home" ? g.homeScore - g.awayScore : g.awayScore - g.homeScore;
  return (lead >= 1 && lead <= 2) || (lead === 0 && periodOf(g) >= 4) ? dog : null;
}

/** Start time rounded down to the hour: the puck-drop slot a game belongs to. */
export const slotOf = (start) => {
  const d = new Date(start);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
};
