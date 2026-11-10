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
const num = (v) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
/** "1/3" -> {goals:1, opportunities:3, pct:33.3}; anything else -> null. */
const ratio = (v) => {
  const m = /^(\d+)\s*\/\s*(\d+)$/.exec(String(v ?? ""));
  return m ? { goals: Number(m[1]), opportunities: Number(m[2]), pct: Number(m[2]) ? Math.round((1000 * Number(m[1])) / Number(m[2])) / 10 : null } : null;
};
const TEAM_KEYS = { sog: "sog", faceoffPct: "faceoffWinningPctg", pim: "pim", hits: "hits", blocks: "blockedShots", giveaways: "giveaways", takeaways: "takeaways" };
/**
 * Team totals and period tables, additive and nullable. The boxscore endpoint only carries team `sog`; the other team
 * categories and shots by period live in `/gamecenter/:id/right-rail` (`rail`: its teamGameStats, shotsByPeriod, linescore).
 * Without `rail`, pim/hits/blocks/giveaways/takeaways are summed from the player lines ("derived"), power play, faceoffs
 * and shots by period stay null. `teamSource[field]` says "official" or "derived" per field.
 */
function teamsOf(b, rail, players) {
  const blank = () => ({ sog: null, faceoffPct: null, faceoffWins: null, powerPlay: null, pim: null, hits: null, blocks: null, giveaways: null, takeaways: null });
  const teams = { home: blank(), away: blank() };
  const teamSource = {};
  const cats = Object.fromEntries((rail?.teamGameStats ?? []).map((c) => [c.category, c]));
  const abbr = { home: b.homeTeam?.abbrev, away: b.awayTeam?.abbrev };
  for (const side of ["home", "away"]) {
    const t = teams[side];
    t.sog = num(b[`${side}Team`]?.sog);
    if (t.sog != null) teamSource.sog = "official";
    for (const [key, cat] of Object.entries(TEAM_KEYS)) {
      const c = cats[cat];
      if (!c) continue;
      const v = num(c[`${side}Value`]);
      if (v == null) continue;
      t[key] = key === "faceoffPct" ? Math.round(v * 1000) / 10 : v;
      teamSource[key] = "official";
    }
    t.faceoffWins = cats.faceoffWins?.[`${side}Value`] ?? null;
    t.powerPlay = ratio(cats.powerPlay?.[`${side}Value`]);
    if (t.powerPlay) teamSource.powerPlay = "official";
    const mine = players.filter((p) => p.team === abbr[side]);
    for (const [key, field] of [["pim", "pim"], ["hits", "hits"], ["blocks", "blocks"], ["giveaways", "giveaways"], ["takeaways", "takeaways"]]) {
      if (t[key] == null && mine.some((p) => p[field] != null)) {
        t[key] = mine.reduce((a, p) => a + (p[field] ?? 0), 0);
        teamSource[key] = "derived";
      }
    }
  }
  const goals = rail?.linescore?.byPeriod ?? [], shots = rail?.shotsByPeriod ?? [];
  const nums = [...new Set([...goals, ...shots].map((r) => r.periodDescriptor?.number).filter((n) => n != null))].sort((x, y) => x - y);
  const periods = nums.length
    ? nums.map((n) => {
        const g = goals.find((r) => r.periodDescriptor?.number === n), s = shots.find((r) => r.periodDescriptor?.number === n);
        return {
          number: n,
          type: (g ?? s).periodDescriptor.periodType ?? "REG",
          goals: g ? { home: num(g.home), away: num(g.away) } : null,
          shots: s ? { home: num(s.home), away: num(s.away) } : null,
        };
      })
    : null;
  return { teams, teamSource, periods };
}
export function normalizeBoxscore(b, rail = null) {
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
          hits: p.hits ?? null,
          blocks: p.blockedShots ?? null,
          takeaways: p.takeaways ?? null,
          giveaways: p.giveaways ?? null,
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
    ...teamsOf(b, rail, players),
  };
}
export function normalizePlayers(j, team) {
  const skaters = (j.skaters ?? []).map((p) => ({
    id: p.playerId,
    name: `${value(p.firstName)} ${value(p.lastName)}`,
    team,
    position: p.positionCode,
    gp: p.gamesPlayed,
    hits: p.hits ?? null,
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
