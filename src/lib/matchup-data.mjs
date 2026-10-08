export const matchupMetricDefinitions = {
  goalsForPerGame: { label: "Goals scored / game", unit: "goals/game", higher: true, group: "offense" },
  goalsAgainstPerGame: { label: "Goals allowed / game", unit: "goals/game", higher: false, group: "defense" },
  shotsForPerGame: { label: "Shots for / game", unit: "shots/game", higher: true, group: "offense" },
  shotsAgainstPerGame: { label: "Shots against / game", unit: "shots/game", higher: false, group: "defense" },
  powerPlayPct: { label: "Power play", unit: "%", higher: true, group: "offense" },
  penaltyKillPct: { label: "Penalty kill", unit: "%", higher: true, group: "defense" },
  shootingPct: { label: "Shooting", unit: "%", higher: true, group: "offense" },
  savePct: { label: "Save", unit: "%", higher: true, group: "defense" },
};

const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : null;

export function sharedRank(value, values, higher = true) {
  if (value == null) return { rank: null, tied: false, pool: values.length, best: false, worst: false };
  const eligible = values.filter((v) => v != null);
  const better = eligible.filter((v) => higher ? v > value : v < value).length;
  const equal = eligible.filter((v) => v === value).length;
  const worse = eligible.filter((v) => higher ? v < value : v > value).length;
  return {
    rank: better + 1,
    tied: equal > 1,
    pool: eligible.length,
    best: better === 0,
    worst: worse === 0,
  };
}

export function rankBadge(metric) {
  if (!metric || metric.rank == null || !metric.pool) return null;
  if (metric.best) return { tone: "good", label: metric.tied ? "Tied Best" : "Best in League" };
  if (metric.rank <= 5) return { tone: "good", label: "Top 5" };
  if (metric.rank <= 10) return { tone: "good", label: "Top 10" };
  if (metric.worst) return { tone: "bad", label: metric.tied ? "Tied Worst" : "Worst" };
  const fromBottom = metric.pool - metric.rank + 1;
  if (fromBottom <= 5) return { tone: "bad", label: "Bottom 5" };
  if (fromBottom <= 10) return { tone: "bad", label: "Bottom 10" };
  return null;
}

export function normalizeLeagueMatchups(teamRows, goalieRows, idToAbbrev, season, now = new Date().toISOString()) {
  const base = teamRows
    .map((row) => {
      const team = idToAbbrev[String(row.teamId)] ?? idToAbbrev[row.teamId];
      if (!team) return null;
      const shotsFor = finite(row.shotsForPerGame), shotsAgainst = finite(row.shotsAgainstPerGame);
      const goalsFor = finite(row.goalsForPerGame), goalsAgainst = finite(row.goalsAgainstPerGame);
      return {
        team,
        gamesPlayed: finite(row.gamesPlayed) ?? 0,
        values: {
          goalsForPerGame: goalsFor,
          goalsAgainstPerGame: goalsAgainst,
          shotsForPerGame: shotsFor,
          shotsAgainstPerGame: shotsAgainst,
          powerPlayPct: finite(row.powerPlayPct),
          penaltyKillPct: finite(row.penaltyKillPct),
          shootingPct: goalsFor != null && shotsFor ? goalsFor / shotsFor : null,
          savePct: goalsAgainst != null && shotsAgainst ? 1 - goalsAgainst / shotsAgainst : null,
        },
      };
    })
    .filter(Boolean);
  const teams = {};
  for (const row of base) {
    const metrics = {};
    for (const [key, definition] of Object.entries(matchupMetricDefinitions)) {
      const value = row.values[key];
      const ranking = sharedRank(value, base.map((candidate) => candidate.values[key]), definition.higher);
      metrics[key] = { ...definition, value, ...ranking };
    }
    const goalies = goalieRows
      .filter((goalie) => String(goalie.teamAbbrevs ?? "").split(",").includes(row.team))
      .map((goalie) => ({
        id: Number(goalie.playerId),
        name: goalie.goalieFullName ?? "Unknown goalie",
        team: row.team,
        gamesPlayed: finite(goalie.gamesPlayed) ?? 0,
        gamesStarted: finite(goalie.gamesStarted) ?? 0,
        wins: finite(goalie.wins) ?? 0,
        losses: finite(goalie.losses) ?? 0,
        savePct: finite(goalie.savePct),
        gaa: finite(goalie.goalsAgainstAverage),
        headshot: `https://assets.nhle.com/mugs/nhl/${season}/${row.team}/${goalie.playerId}.png`,
      }))
      .sort((a, b) => b.gamesStarted - a.gamesStarted || b.gamesPlayed - a.gamesPlayed);
    teams[row.team] = { team: row.team, gamesPlayed: row.gamesPlayed, metrics, goalies };
  }
  return {
    season,
    updatedAt: now,
    source: "NHL team summary and goalie summary reports",
    poolSize: base.length,
    teams,
  };
}

export function crossoverRows(offense, defense) {
  return [
    ["goalsForPerGame", "goalsAgainstPerGame"],
    ["shotsForPerGame", "shotsAgainstPerGame"],
    ["powerPlayPct", "penaltyKillPct"],
    ["shootingPct", "savePct"],
  ].map(([offenseKey, defenseKey]) => ({
    key: `${offenseKey}-${defenseKey}`,
    offense: offense?.metrics?.[offenseKey] ?? null,
    defense: defense?.metrics?.[defenseKey] ?? null,
  }));
}
