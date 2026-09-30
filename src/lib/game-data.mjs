import { normalizeGame, value } from "./normalize.mjs";
export const isLive = (g) => ["LIVE", "CRIT"].includes(g.state);
export function normalizeScoreboard(j) {
  return {
    updatedAt: new Date().toISOString(),
    date: j.currentDate,
    games: (j.games ?? []).map((g) => ({
      ...normalizeGame(g),
      period: g.periodDescriptor?.number ?? null,
      periodType: g.periodDescriptor?.periodType ?? null,
      clock: g.clock?.timeRemaining ?? null,
      intermission: g.clock?.inIntermission ?? false,
      homeShots: g.homeTeam.sog ?? null,
      awayShots: g.awayTeam.sog ?? null,
    })),
  };
}
const LIVE_FIELDS = [
  "state",
  "homeScore",
  "awayScore",
  "period",
  "periodType",
  "clock",
  "intermission",
  "homeShots",
  "awayShots",
];
// Keeps the same game (and, if nothing changed league-wide, the same array)
// reference when a poll tick brings no new information. Downstream
// standings/importance recomputation is expensive over a full season, so
// referential stability here is what lets React (and useMemo) skip it on
// every no-op tick instead of re-deriving the league table every 30s.
export function mergeScores(games, scoreboard) {
  const updates = new Map((scoreboard?.games ?? []).map((g) => [g.id, g]));
  if (!updates.size) return games;
  let changed = false;
  const next = games.map((g) => {
    const u = updates.get(g.id);
    if (!u || LIVE_FIELDS.every((k) => g[k] === u[k])) return g;
    changed = true;
    return { ...g, ...u };
  });
  return changed ? next : games;
}
export function normalizeGameFeed(j) {
  const team = (id) =>
    id === j.homeTeam.id
      ? j.homeTeam.abbrev
      : id === j.awayTeam.id
        ? j.awayTeam.abbrev
        : null;
  const names = Object.fromEntries(
    (j.rosterSpots ?? []).map((p) => [
      p.playerId,
      `${value(p.firstName)} ${value(p.lastName)}`,
    ]),
  );
  const plays = (j.plays ?? []).map((p) => ({
    id: p.eventId,
    period: p.periodDescriptor.number,
    periodType: p.periodDescriptor.periodType,
    time: p.timeInPeriod,
    type: p.typeDescKey,
    order: p.sortOrder ?? 0,
    penalty: p.details?.descKey ?? null,
    duration: p.details?.duration ?? null,
    team: team(p.details?.eventOwnerTeamId),
    x: p.details?.xCoord ?? null,
    y: p.details?.yCoord ?? null,
    player:
      names[p.details?.scoringPlayerId ?? p.details?.shootingPlayerId ?? p.details?.committedByPlayerId] ?? null,
  }));
  return {
    ...normalizeScoreboard({ games: [j] }).games[0],
    updatedAt: new Date().toISOString(),
    plays: plays.sort((a, b) => a.order - b.order),
    situation: j.situation ? {
      home: j.situation.homeTeam?.strength ?? null,
      away: j.situation.awayTeam?.strength ?? null,
      homePowerPlay: j.situation.homeTeam?.situationDescriptions?.includes("PP") ?? false,
      awayPowerPlay: j.situation.awayTeam?.situationDescriptions?.includes("PP") ?? false,
      seconds: j.situation.secondsRemaining ?? null,
    } : null,
    injuryStatus: "unavailable",
    shots: plays.filter(
      (p) => ["goal", "shot-on-goal"].includes(p.type) && p.periodType !== "SO",
    ),
    goals: plays.filter((p) => p.type === "goal"),
    stats: ["hit", "blocked-shot", "giveaway", "takeaway", "faceoff"].map(
      (type) => ({
        label: type,
        home: plays.filter(
          (p) => p.type === type && p.team === j.homeTeam.abbrev,
        ).length,
        away: plays.filter(
          (p) => p.type === type && p.team === j.awayTeam.abbrev,
        ).length,
      }),
    ),
  };
}
export function normalizeEdge(j, team, season, requestedSeason) {
  if (!j.team || !j.skatingSpeed || !j.zoneTimeDetails)
    throw Error("EDGE statistics not published");
  return {
    team,
    season,
    requestedSeason,
    updatedAt: new Date().toISOString(),
    gamesPlayed: j.team.gamesPlayed,
    metrics: [
      {
        key: "speed",
        label: "Top skating speed",
        unit: "mph",
        value: j.skatingSpeed.speedMax?.imperial,
        average: j.skatingSpeed.speedMax?.leagueAvg?.imperial,
        rank: j.skatingSpeed.speedMax?.rank,
      },
      {
        key: "bursts",
        label: "20+ mph bursts",
        unit: "bursts",
        value: j.skatingSpeed.burstsOver20?.value,
        average: j.skatingSpeed.burstsOver20?.leagueAvg?.value,
        rank: j.skatingSpeed.burstsOver20?.rank,
      },
      {
        key: "shot",
        label: "Hardest shot",
        unit: "mph",
        value: j.shotSpeed?.topShotSpeed?.imperial,
        average: j.shotSpeed?.topShotSpeed?.leagueAvg?.imperial,
        rank: j.shotSpeed?.topShotSpeed?.rank,
      },
      {
        key: "distance",
        label: "Distance skated",
        unit: "mi",
        value: j.distanceSkated?.total?.imperial,
        average: j.distanceSkated?.total?.leagueAvg?.imperial,
        rank: j.distanceSkated?.total?.rank,
      },
    ]
      .filter((m) => Number.isFinite(m.value))
      .map((m) => ({ ...m, average: m.average ?? null, rank: m.rank ?? null })),
    zones: [
      {
        label: "Offensive",
        value: j.zoneTimeDetails.offensiveZonePctg,
        average: j.zoneTimeDetails.offensiveZoneLeagueAvg,
      },
      {
        label: "Neutral",
        value: j.zoneTimeDetails.neutralZonePctg,
        average: j.zoneTimeDetails.neutralZoneLeagueAvg,
      },
      {
        label: "Defensive",
        value: j.zoneTimeDetails.defensiveZonePctg,
        average: j.zoneTimeDetails.defensiveZoneLeagueAvg,
      },
    ],
    locations: (j.sogSummary ?? [])
      .filter((x) => x.locationCode !== "all")
      .map((x) => ({
        label:
          x.locationCode === "high"
            ? "High danger"
            : x.locationCode === "mid"
              ? "Midrange"
              : "Long range",
        shots: x.shots,
        goals: x.goals,
        average: x.shotsLeagueAvg,
      })),
  };
}
