export const value = (x) => (typeof x === "string" ? x : (x?.default ?? ""));
export function normalizeGame(g) {
  return {
    id: g.id,
    season: g.season,
    type: g.gameType,
    date: g.gameDate,
    start: g.startTimeUTC,
    state: g.gameState,
    scheduleState: g.gameScheduleState,
    venue: value(g.venue),
    home: g.homeTeam.abbrev,
    away: g.awayTeam.abbrev,
    homeScore: g.homeTeam.score ?? null,
    awayScore: g.awayTeam.score ?? null,
    end: g.gameOutcome?.lastPeriodType ?? "REG",
    broadcasts: (g.tvBroadcasts ?? []).map(
      (b) => `${b.network} (${b.countryCode})`,
    ),
    round: g.playoffRound ?? null,
  };
}
export function normalizeBoxscore(b) {
  const players = [];
  for (const side of ["homeTeam", "awayTeam"]) {
    const team = b[side]?.abbrev;
    const stats = b.playerByGameStats?.[side] ?? {};
    for (const group of ["forwards", "defense", "goalies"])
      for (const p of stats[group] ?? []) {
        players.push({
          id: p.playerId,
          number: p.sweaterNumber ?? null,
          headshot: `https://assets.nhle.com/mugs/nhl/${b.season}/${team}/${p.playerId}.png`,
          name: value(p.name),
          team,
          position: p.position,
          goals: p.goals ?? null,
          assists: p.assists ?? null,
          shots: p.sog ?? null,
          plusMinus: p.plusMinus ?? null,
          pim: p.pim ?? null,
          toi: p.toi ?? "00:00",
          saves: p.saves ?? null,
          shotsAgainst: p.shotsAgainst ?? null,
          goalsAgainst: p.goalsAgainst ?? null,
        });
      }
  }
  return {
    id: b.id,
    state: b.gameState,
    updatedAt: new Date().toISOString(),
    homeShots: b.homeTeam?.sog ?? null,
    awayShots: b.awayTeam?.sog ?? null,
    players,
  };
}
export function normalizePlayers(j, team) {
  const skaters = (j.skaters ?? []).map((p) => ({
    id: p.playerId,
    name: `${value(p.firstName)} ${value(p.lastName)}`,
    team,
    position: p.positionCode,
    gp: p.gamesPlayed,
    goals: p.goals,
    assists: p.assists,
    shots: p.shots,
    plusMinus: p.plusMinus,
    pim: p.penaltyMinutes,
    toi: p.avgTimeOnIcePerGame,
    headshot: p.headshot,
  }));
  const goalies = (j.goalies ?? []).map((p) => ({
    id: p.playerId,
    name: `${value(p.firstName)} ${value(p.lastName)}`,
    team,
    position: "G",
    gp: p.gamesPlayed,
    saves: p.saves ?? null,
    shotsAgainst: p.shotsAgainst ?? null,
    goalsAgainst: p.goalsAgainst ?? null,
    savePct: p.savePercentage ?? p.savePctg ?? null,
    headshot: p.headshot,
  }));
  return {
    season: Number(j.season),
    gameType: j.gameType,
    updatedAt: new Date().toISOString(),
    skaters,
    goalies,
  };
}
