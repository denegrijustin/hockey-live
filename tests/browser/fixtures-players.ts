import type { PlayerData, PlayerSeason } from "../../src/types";

/**
 * Edge-case player data, typed against the real shapes:
 *  - roster rows: public/data/players/<season>/<TEAM>.json (PlayerData in src/types.ts)
 *  - profile: the Worker's /api/player/<id> reply (src/worker.js, a reduction of the NHL landing page)
 *  - game log: /api/player/<id>/log/<season>
 * All ids are fictitious 7-digit values in a range no real player uses; names are obviously synthetic, so
 * nothing here can be mistaken for real NHL data. They exist to exercise layout and fallback paths.
 */
export const SEASON = 20262027;
const HEAD = (team: string, id: number) => `https://assets.nhle.com/mugs/nhl/${SEASON}/${team}/${id}.png`;

const skater = (over: Partial<PlayerSeason> = {}): PlayerSeason => ({
  id: 9000001, name: "Test Skater", team: "EDM", position: "C", gp: 16, hits: 12, goals: 6, assists: 9, shots: 40, plusMinus: 3, pim: 4, toi: 1180,
  headshot: HEAD("EDM", 9000001), number: 97, ...over,
});

export const fx = {
  skater: skater(),
  goalie: {
    id: 9000002, name: "Test Goalie", team: "EDM", position: "G", gp: 10, goals: 0, assists: 0, shots: 0, plusMinus: 0, pim: 0, toi: 36000,
    saves: 250, shotsAgainst: 275, goalsAgainst: 25, savePct: 0.909, headshot: HEAD("EDM", 9000002), number: 31,
  } as PlayerSeason,
  /** Played for two clubs: the same id appears on both rosters. */
  traded: [skater({ id: 9000003, name: "Test Traded", team: "EDM", gp: 8, headshot: HEAD("EDM", 9000003) }), skater({ id: 9000003, name: "Test Traded", team: "CHI", gp: 8, headshot: HEAD("CHI", 9000003) })],
  /** Every optional stat absent or null (the feed can lag). */
  missingStats: skater({ id: 9000004, name: "Test Missing", gp: 0, hits: null, goals: undefined as never, assists: undefined as never, shots: undefined as never, plusMinus: undefined as never, pim: undefined as never, toi: undefined as never, number: null }),
  longName: skater({ id: 9000005, name: "Maximilian Bartholomew-Featherstonehaugh-Montgomery III of Very Long Name", headshot: HEAD("EDM", 9000005) }),
  noHeadshot: skater({ id: 9000006, name: "Test NoPhoto", headshot: "" }),
} as const;

/** A team's roster file with the given rows. */
export const rosterFile = (team: string, skaters: PlayerSeason[], goalies: PlayerSeason[] = []): PlayerData => ({
  season: SEASON, gameType: 2, updatedAt: "2026-11-09T12:00:00.000Z", skaters: skaters.map((p) => ({ ...p, team })), goalies: goalies.map((p) => ({ ...p, team })),
});
/** A club with no roster published yet. */
export const noRoster = (): PlayerData => rosterFile("EDM", []);

/** The Worker's /api/player/<id> reply for a fixture player. */
export const profileFor = (p: PlayerSeason, extra: Record<string, unknown> = {}) => ({
  id: p.id, name: p.name, number: p.number ?? undefined, headshot: p.headshot || undefined, position: p.position, team: p.team,
  birthDate: "2000-01-01", height: 73, weight: 195, shoots: "L",
  seasons: [{ season: SEASON, leagueAbbrev: "NHL", gameTypeId: 2, teamName: { default: p.team }, gamesPlayed: p.gp, goals: p.goals, assists: p.assists, points: (p.goals ?? 0) + (p.assists ?? 0) }],
  updatedAt: "2026-11-09T12:00:00.000Z", ...extra,
});
/** Empty game log (the Worker tolerates a missing list). */
export const emptyLog = (id: number) => ({ id, season: SEASON, games: [], updatedAt: "2026-11-09T12:00:00.000Z" });
