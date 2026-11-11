// Power rankings: how good each team is, split into where its results come from. Derived here from MoneyPuck's season team totals
// (summary.teams[team][situation]: gp, xGF, xGA, GF, GA); nothing is invented and nothing is MoneyPuck's own "power" model.
//
// Every number is goals per game above zero (no league-average step is needed because each is a difference):
//   scoring chances = (xGF - xGA) / gp   the quality of shots a team creates minus allows (expected goals)
//   goaltending     = (xGA - GA)  / gp   goals saved beyond what the shots were expected to allow
//   finishing       = (GF - xGF)  / gp   goals scored beyond what the shots were expected to score
//   power score     = chances + goaltending + finishing = (GF - GA) / gp, the actual goal differential per game
// So the three parts always add up to the power score. A team far above its chances is riding goaltending or finishing luck;
// the chances column is the steadier read of how good it is. xG% is xGF / (xGF + xGA).
// Limits: a short season is noisy; goals include empty-net goals as MoneyPuck counts them; the situation (all or 5-on-5) comes from MoneyPuck's own split.

const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** @param {Record<string, Record<string, any>>} teams summary.teams  @param {string} sit "all" | "5on5" */
export function powerRankings(teams, sit = "all") {
  const rows = [];
  for (const [team, sits] of Object.entries(teams ?? {})) {
    const s = sits?.[sit];
    const gp = num(s?.gp), xGF = num(s?.xGF), xGA = num(s?.xGA), GF = num(s?.GF), GA = num(s?.GA);
    if (!gp || gp <= 0 || xGF == null || xGA == null || GF == null || GA == null) continue;
    const chances = (xGF - xGA) / gp, goaltending = (xGA - GA) / gp, finishing = (GF - xGF) / gp;
    rows.push({ team, gp, power: chances + goaltending + finishing, chances, goaltending, finishing, xGPct: xGF + xGA > 0 ? xGF / (xGF + xGA) : null, xGF, xGA, GF, GA });
  }
  const rank = (key) => {
    const sorted = [...rows].sort((a, b) => b[key] - a[key]);
    const out = {};
    for (const r of rows) out[r.team] = 1 + sorted.filter((x) => x[key] > r[key]).length;
    return out;
  };
  const powerRank = rank("power"), chanceRank = rank("chances");
  const maxAbs = {};
  for (const k of ["power", "chances", "goaltending", "finishing"]) maxAbs[k] = Math.max(0.0001, ...rows.map((r) => Math.abs(r[k])));
  return {
    rows: rows.map((r) => ({ ...r, rank: powerRank[r.team], chanceRank: chanceRank[r.team] })).sort((a, b) => a.rank - b.rank || a.team.localeCompare(b.team)),
    maxAbs,
  };
}

/** "Riding" tag when results and chances disagree by a lot: results better than chances by at least `gap` goals per game, or worse. */
export function luckNote(row, gap = 0.4) {
  const d = row.power - row.chances;
  return d >= gap ? "results ahead of chances" : d <= -gap ? "results behind chances" : null;
}
