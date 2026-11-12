// The numbers behind the Matchup Intelligence graphics: head-to-head bars, last-five form, special-teams rank tracks, distance to the
// playoff line and a goal timeline. Pure, and every value comes from data the app already holds (the pregame standings table, the league
// special-teams snapshot, the play-by-play); a row whose inputs are missing is left out, never filled in.
import { gapToLine } from "./standings-view.mjs";
import { goalSequence } from "./game-intel.mjs";
import { specialTeamsRank } from "./trends.mjs";

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const MIN_GP = 5;
// The snapshot stores rates as fractions (0.285); show and compare them as percentages.
const pctOf = (v) => (v <= 1 ? v * 100 : v);

/** Head-to-head rows. `share` is the away team's share of the bar (0..1) and already accounts for "lower is better". */
export function headToHead(before, game, snapshot = null) {
  const a = before?.[game?.away], h = before?.[game?.home];
  const rows = [];
  const add = (key, label, av, hv, fmt, { lower = false, digits = 0 } = {}) => {
    if (av == null || hv == null) return;
    const aGood = lower ? hv : av, hGood = lower ? av : hv; // a bigger "good" number takes more of the bar
    const total = aGood + hGood;
    const share = total > 0 ? aGood / total : 0.5;
    const better = Math.abs(av - hv) < 10 ** -(digits + 1) ? "even" : (lower ? av < hv : av > hv) ? "away" : "home";
    rows.push({ key, label, away: { v: av, text: fmt(av) }, home: { v: hv, text: fmt(hv) }, share, better });
  };
  if (a && h && a.gp >= MIN_GP && h.gp >= MIN_GP) {
    add("pts", "Points %", a.pts / (2 * a.gp), h.pts / (2 * h.gp), (v) => `${(v * 100).toFixed(1)}%`, { digits: 3 });
    add("gf", "Goals for / game", num(a.gf) == null ? null : a.gf / a.gp, num(h.gf) == null ? null : h.gf / h.gp, (v) => v.toFixed(2), { digits: 2 });
    add("ga", "Goals against / game", num(a.ga) == null ? null : a.ga / a.gp, num(h.ga) == null ? null : h.ga / h.gp, (v) => v.toFixed(2), { lower: true, digits: 2 });
  }
  const sa = specialTeamsRank(snapshot, game?.away).value, sh = specialTeamsRank(snapshot, game?.home).value;
  if (sa?.pp && sh?.pp) add("pp", "Power play %", pctOf(sa.pp.pct), pctOf(sh.pp.pct), (v) => `${v.toFixed(1)}%`, { digits: 1 });
  if (sa?.pk && sh?.pk) add("pk", "Penalty kill %", pctOf(sa.pk.pct), pctOf(sh.pk.pct), (v) => `${v.toFixed(1)}%`, { digits: 1 });
  return rows;
}

/** The last five results of each team, oldest first: "W" | "OT" | "L" (OT = overtime or shootout loss). */
export function formStrip(before, game, n = 5) {
  const strip = (id) => (before?.[id]?.results ?? []).slice(-n).map((r) => r.outcome);
  const a = strip(game?.away), h = strip(game?.home);
  return a.length >= 3 && h.length >= 3 ? { away: a, home: h } : null;
}

/** Special-teams rank tracks: where each team sits among the league (1 = best) for the power play and the penalty kill. */
export function rankTracks(snapshot, game) {
  const a = specialTeamsRank(snapshot, game?.away).value, h = specialTeamsRank(snapshot, game?.home).value;
  const out = [];
  for (const [key, label] of [["pp", "Power play"], ["pk", "Penalty kill"]]) {
    if (!a?.[key] || !h?.[key]) continue;
    const pool = Math.max(a[key].pool || 0, h[key].pool || 0, a[key].rank, h[key].rank, 2);
    out.push({ key, label, pool, away: { rank: a[key].rank, pct: pctOf(a[key].pct) }, home: { rank: h[key].rank, pct: pctOf(h[key].pct) } });
  }
  return out;
}

/** Distance from the playoff line for each team: points above (+) or below (-) the line and which spot it holds. */
export function lineGaps(before, game, teams) {
  if (!before || game?.type !== 2 || !Array.isArray(teams) || !teams.length) return null;
  const out = [];
  for (const id of [game.away, game.home]) {
    if (!before[id] || before[id].gp < MIN_GP) return null;
    let g = null;
    try { g = gapToLine(before, id, teams); } catch { g = null; }
    if (!g || g.pts == null) return null;
    out.push({ id, pts: g.pts, status: g.status });
  }
  return out;
}

/** Goals on a game-time axis: [{team, side, elapsed (s), label, scorer, away, home}] and the axis length. Shootout goals are left out. */
export function goalTimeline(plays, game) {
  const seq = goalSequence(plays, game);
  if (!seq || !seq.length) return null;
  const marks = seq.filter((s) => s.elapsed != null).map((s) => ({ team: s.team, side: s.team === game.home ? "home" : "away", elapsed: s.elapsed, label: s.at, scorer: s.scorer, away: s.away, home: s.home }));
  if (!marks.length) return null;
  const overtime = marks.some((m) => m.elapsed > 3600);
  const end = overtime ? Math.max(...marks.map((m) => m.elapsed), 3900) : 3600;
  return { marks, end, overtime };
}

/** Two team colours that can be told apart: the second falls back to `fallback` when both are close (RGB distance). */
export function pairColors(a, b, fallback = "#e9c67d") {
  const rgb = (c) => { const n = parseInt(String(c ?? "").replace("#", "").padEnd(6, "0").slice(0, 6), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const d = (x, y) => Math.hypot(...rgb(x).map((v, i) => v - rgb(y)[i]));
  const ca = a || "#7be1c6", cb = b || fallback;
  return d(ca, cb) < 90 ? [ca, fallback] : [ca, cb];
}
