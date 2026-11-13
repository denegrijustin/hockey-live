import { normalizeGame, value } from "./normalize.mjs";
import { phaseName, phaseOf, isLivePhase, STALE_LIVE_MS } from "./game-state.mjs";
// The helpers below are thin views of game-state.mjs phaseOf(), the one place that decides where a game stands.
export { STALE_LIVE_MS };
export const isLive = (g) => isLivePhase(phaseName(g));
/** Live and not stale: the only kind of game that should keep fast refresh modes on. */
export const isFreshLive = (g, now = Date.now()) => isLivePhase(phaseName(g)) && !phaseOf(g, { now }).stale;
const isFinished = (g) => g.state === "OFF" || g.state === "FINAL";
/** A game that is not live or finished and whose schedule state says it is postponed, canceled or suspended. */
export const isCalledOff = (g) => {
  const p = phaseName(g);
  return p === "postponed" || p === "cancelled" || p === "suspended";
};
/** Still to be played as scheduled: not live, not finished, not postponed/canceled/suspended. Same rule as gameStatus().upcoming. */
export const isUpcoming = (g) => !isFinished(g) && !isLive(g) && !isCalledOff(g);
/** Deterministic game order: puck drop, then id (identical start times are common). */
export const byStartThenId = (a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")) || a.id - b.id;
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
      // Additive (Phase 5): the NHL's own clock state. Not in LIVE_FIELDS on purpose: they change every poll and must not defeat mergeScores' referential stability.
      clockRunning: g.clock?.running ?? null,
      clockSeconds: g.clock?.secondsRemaining ?? null,
      homeShots: g.homeTeam.sog ?? null,
      awayShots: g.awayTeam.sog ?? null,
    })),
  };
}
/**
 * The NHL's team totals (score/now, boxscore, landing) can trail its own goal list by minutes, most visibly at an intermission: a goal sits in the
 * scoring summary with its running score (1-2) while the team field still says 0. The goal list is the more current of the two, so this returns the
 * running score of the latest goal in a landing page's scoring summary, or null when there is none.
 * @returns {{ away: number, home: number } | null}
 */
export function scoreFromLanding(j) {
  let best = null;
  for (const period of j?.summary?.scoring ?? []) {
    for (const goal of period?.goals ?? []) {
      const away = Number(goal?.awayScore), home = Number(goal?.homeScore);
      if (!Number.isFinite(away) || !Number.isFinite(home)) continue;
      if (!best || away + home > best.away + best.home) best = { away, home };
    }
  }
  return best;
}
/**
 * Raises each live game's score to its goal list when the team totals lag. Only ever raises a side (a score does not go down), and a failed or empty
 * landing page leaves the game as the scoreboard had it.
 * @param {{ games: any[] }} scoreboard @param {(id: number) => Promise<any>} fetchLanding
 */
export async function reconcileLiveScores(scoreboard, fetchLanding) {
  const live = (scoreboard?.games ?? []).filter((g) => (g.state === "LIVE" || g.state === "CRIT") && (g.period ?? 0) >= 1).slice(0, 24);
  const found = new Map();
  await Promise.allSettled(live.map(async (g) => {
    const score = scoreFromLanding(await fetchLanding(g.id));
    if (score) found.set(g.id, score);
  }));
  if (!found.size) return scoreboard;
  return {
    ...scoreboard,
    games: scoreboard.games.map((g) => {
      const f = found.get(g.id);
      if (!f) return g;
      const away = Math.max(g.awayScore ?? 0, f.away), home = Math.max(g.homeScore ?? 0, f.home);
      return away === g.awayScore && home === g.homeScore ? g : { ...g, awayScore: away, homeScore: home };
    }),
  };
}
const LIVE_FIELDS = [
  "state",
  "scheduleState",
  "start",
  "date",
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
  const roster = (j.rosterSpots ?? []).map((p) => ({
    id: p.playerId,
    name: `${value(p.firstName)} ${value(p.lastName)}`,
    team: team(p.teamId),
    number: p.sweaterNumber ?? null,
    pos: p.positionCode ?? null,
    headshot: p.headshot ?? null,
  }));
  const who = (id) => (id != null && names[id] ? { id, name: names[id] } : null);
  const plays = (j.plays ?? []).map((p) => {
    const d = p.details ?? {};
    const primary = d.scoringPlayerId ?? d.shootingPlayerId ?? d.committedByPlayerId;
    const play = {
      id: p.eventId,
      period: p.periodDescriptor.number,
      periodType: p.periodDescriptor.periodType,
      time: p.timeInPeriod,
      type: p.typeDescKey,
      order: p.sortOrder ?? 0,
      penalty: d.descKey ?? null,
      duration: d.duration ?? null,
      team: team(d.eventOwnerTeamId),
      x: d.xCoord ?? null,
      y: d.yCoord ?? null,
      player: names[primary] ?? null,
      // Additive detail (Phase 5): everything below is optional and never replaces a field above.
      pid: primary ?? null,
      left: p.timeRemaining ?? null,
      sit: p.situationCode ?? null,
      zone: d.zoneCode ?? null,
      shotType: d.shotType ?? null,
      reason: d.reason ?? null,
      secondary: who(d.hitteePlayerId ?? d.blockingPlayerId ?? d.losingPlayerId ?? d.servedByPlayerId ?? d.drawnByPlayerId),
      other: who(d.hittingPlayerId ?? d.playerId ?? d.winningPlayerId),
    };
    if (p.typeDescKey === "goal") {
      play.assists = [d.assist1PlayerId, d.assist2PlayerId].map(who).filter(Boolean);
      play.goalie = who(d.goalieInNetId);
      play.score = d.homeScore != null && d.awayScore != null ? { home: d.homeScore, away: d.awayScore } : null;
    }
    return play;
  });
  return {
    ...normalizeScoreboard({ games: [j] }).games[0],
    updatedAt: new Date().toISOString(),
    plays: plays.sort((a, b) => a.order - b.order),
    roster,
    clockRunning: j.clock?.running ?? null,
    clockSeconds: j.clock?.secondsRemaining ?? null,
    otInUse: j.otInUse ?? null,
    shootoutInUse: j.shootoutInUse ?? null,
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
