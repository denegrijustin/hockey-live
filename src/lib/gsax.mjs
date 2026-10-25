// Goals saved above expected, for a whole team: the goals the model expected it to allow minus the goals it did allow, all situations. Positive means the
// goaltending (and the defence in front of it) beat the shot quality it faced. A season total, so it grows with games played. Pure.

const isNum = (v) => typeof v === "number" && Number.isFinite(v);

/** Every team's total, ranked 1 (most goals saved) to the last. Ties share a rank. @returns {{ team: string, gsax: number, xGA: number, GA: number, gp: number | null, perGame: number | null, rank: number }[]} */
export function gsaxBoard(summary) {
  const rows = [];
  for (const [team, sits] of Object.entries(summary?.teams ?? {})) {
    const a = sits?.all;
    if (!a || !isNum(a.xGA) || !isNum(a.GA)) continue;
    const gsax = a.xGA - a.GA;
    rows.push({ team, gsax, xGA: a.xGA, GA: a.GA, gp: isNum(a.gp) ? a.gp : null, perGame: isNum(a.gp) && a.gp > 0 ? gsax / a.gp : null, rank: 0 });
  }
  for (const r of rows) r.rank = 1 + rows.filter((x) => x.gsax > r.gsax).length;
  return rows.sort((a, b) => a.rank - b.rank || a.team.localeCompare(b.team));
}

/** A team's GSAx in each of its finished regular-season games, in the order they were played, from MoneyPuck's per-game part. null where a game is missing. */
export function gsaxByGame(gamesPart, games, team) {
  return games
    .filter((g) => g.type === 2 && ["OFF", "FINAL"].includes(g.state) && (g.home === team || g.away === team))
    .sort((a, b) => a.start.localeCompare(b.start) || a.id - b.id)
    .map((g) => {
      const s = gamesPart?.games?.[String(g.id)]?.teams?.[team]?.all;
      return { date: g.date, value: s && isNum(s.xGA) && isNum(s.GA) ? s.xGA - s.GA : null };
    });
}

/** Rolling mean over the last `window` games that have a value. `window` 1 is game by game. */
export function rollingMean(points, window) {
  return points.map((p, i) => {
    const vals = points.slice(Math.max(0, i - window + 1), i + 1).map((x) => x.value).filter(isNum);
    return { date: p.date, value: vals.length ? vals.reduce((s, v) => s + v, 0) / vals.length : 0 };
  });
}

import { goalieMetrics } from "./nhlplus.mjs";

/** Goalies with enough ice time to mean something, each with goals against, expected goals against, goals saved above expected and the per-60 rate. Ranked by GSAx. */
export function goalieBoard(summary, { minToi = 3600 } = {}) {
  const rows = [];
  for (const g of summary?.goalies ?? []) {
    const m = goalieMetrics(g.sit?.all);
    if (!m || !isNum(m.gsax) || !isNum(m.toi) || m.toi < minToi) continue;
    rows.push({ id: g.id, name: g.name, team: g.team, gp: m.gp, toi: m.toi, GA: /** @type {number} */ (m.GA), xGA: /** @type {number} */ (m.xGA), gsax: /** @type {number} */ (m.gsax), per60: m.gsaxPer60 });
  }
  return rows.sort((a, b) => b.gsax - a.gsax || a.name.localeCompare(b.name));
}
