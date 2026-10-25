// A resumé for every team: who they beat, who beat them, how hard the schedule has been, and how good the offense and defense are.
// Opponents are ranked by points percentage (the league rank used across the app), as of now. Pure, so the page and the tests share it.
import { teamRanks } from "./ranks.mjs";

const done = (g) => g.type === 2 && ["OFF", "FINAL"].includes(g.state) && g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore;
const pct = (r) => (r && r.gp > 0 ? r.pts / (2 * r.gp) : 0);
/** 1 = best. Ties share the better rank. `better` says which direction is good. */
function rankBy(ids, value, better) {
  const out = {};
  for (const id of ids) out[id] = 1 + ids.filter((k) => (better === "high" ? value[k] > value[id] : value[k] < value[id])).length;
  return out;
}

/**
 * @param {{ teams: any[], table: Record<string, any>, games: any[], winsShown?: number, lossesShown?: number, badFrom?: number }} o
 * badFrom: a loss to a team ranked this low or worse (default 23rd of 32: the bottom ten) is a bad loss.
 */
export function buildResumes({ teams, table, games, winsShown = 3, lossesShown = 6, badFrom = 23 }) {
  const ranks = teamRanks(table, teams);
  if (!ranks) return [];
  const ids = teams.filter((t) => ranks[t.id]).map((t) => t.id);
  const played = games.filter(done);
  const sosSum = Object.fromEntries(ids.map((id) => [id, { s: 0, n: 0 }]));
  const wins = Object.fromEntries(ids.map((id) => [id, []])), losses = Object.fromEntries(ids.map((id) => [id, []]));
  for (const g of played) {
    if (!ranks[g.home] || !ranks[g.away]) continue;
    const homeWon = g.homeScore > g.awayScore;
    for (const [me, opp, mine, theirs] of [[g.home, g.away, g.homeScore, g.awayScore], [g.away, g.home, g.awayScore, g.homeScore]]) {
      sosSum[me].s += pct(table[opp]); sosSum[me].n += 1;
      const won = (me === g.home) === homeWon;
      (won ? wins : losses)[me].push({ id: g.id, date: g.date, opp, oppRank: ranks[opp].league, home: me === g.home, gf: mine, ga: theirs, end: g.end && g.end !== "REG" ? g.end : "" });
    }
  }
  const sosVal = Object.fromEntries(ids.map((id) => [id, sosSum[id].n ? sosSum[id].s / sosSum[id].n : 0]));
  const offVal = Object.fromEntries(ids.map((id) => [id, table[id].gp ? table[id].gf / table[id].gp : 0]));
  const defVal = Object.fromEntries(ids.map((id) => [id, table[id].gp ? table[id].ga / table[id].gp : 0]));
  const sos = rankBy(ids, sosVal, "high"), off = rankBy(ids, offVal, "high"), def = rankBy(ids, defVal, "low");
  const margin = (x) => x.gf - x.ga;
  return ids
    .map((id) => {
      const t = table[id];
      const bestWins = [...wins[id]].sort((a, b) => a.oppRank - b.oppRank || margin(b) - margin(a) || b.date.localeCompare(a.date)).slice(0, winsShown);
      const allLosses = [...losses[id]].sort((a, b) => b.date.localeCompare(a.date)).map((l) => ({ ...l, bad: l.oppRank >= badFrom }));
      return {
        team: id, rank: ranks[id].league, gp: t.gp, record: `${t.w}–${t.l}–${t.ot}`, pts: t.pts,
        bestWins,
        losses: allLosses.slice(0, lossesShown), moreLosses: Math.max(0, allLosses.length - lossesShown), lossCount: allLosses.length, badLosses: allLosses.filter((l) => l.bad).length,
        sos: { rank: sos[id], value: sosVal[id] }, off: { rank: off[id], value: offVal[id] }, def: { rank: def[id], value: defVal[id] },
      };
    })
    .sort((a, b) => a.rank - b.rank || a.team.localeCompare(b.team));
}
