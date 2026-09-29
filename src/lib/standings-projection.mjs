/** Points-pace forecast: shrink current points percentage toward 20 prior games. */
export function projectedStandings(teams, table, games, baseline = {}) {
  return Object.fromEntries(teams.map(team => {
    const current=table[team.id];
    const schedule=games.filter(g=>g.type===2 && (g.home===team.id || g.away===team.id));
    const remaining=schedule.filter(g=>!['OFF','FINAL'].includes(g.state)).length;
    const prior=baseline?.[team.id];
    const priorPct=prior?.gp ? prior.pts/(2*prior.gp) : .55;
    const rate=(current.pts+40*priorPct)/(2*(current.gp+20));
    return [team.id,{...current, projected:current.pts+remaining*2*rate,remaining}];
  }));
}
