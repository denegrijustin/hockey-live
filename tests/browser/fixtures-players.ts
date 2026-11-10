import type { Page } from "@playwright/test";
import { SEASON, mk, mockApis, etDay } from "./fixtures-games";

/** Player fixtures for the Following > Players specs: roster files, injuries, profiles, and a seeded preference record. */
export { SEASON };
export const IDS = { skater: 8470001, traded: 8470002, goalie: 8470003, sparse: 8470004, gone: 8470005 } as const;

const sk = (id: number, name: string, team: string, o: Record<string, unknown> = {}) => ({ id, name, team, position: "C", gp: 12, goals: 5, assists: 7, shots: 40, plusMinus: 3, pim: 2, toi: 19.5, headshot: "", number: 11, ...o });
const gl = (id: number, name: string, team: string, o: Record<string, unknown> = {}) => ({ id, name, team, position: "G", gp: 9, saves: 220, shotsAgainst: 240, savePct: 0.9167, headshot: "", number: 31, ...o });

export const rosters: Record<string, { skaters: unknown[]; goalies: unknown[] }> = {
  EDM: { skaters: [sk(IDS.skater, "Alpha Forward", "EDM")], goalies: [] },
  CGY: { skaters: [sk(IDS.traded, "Trade Target", "CGY", { position: "D" })], goalies: [] },
  NSH: { skaters: [sk(IDS.sparse, "Sparse Stats", "NSH", { goals: null, shots: undefined, toi: null, plusMinus: null })], goalies: [gl(IDS.goalie, "Gus Goalie", "NSH")] },
};
const profileGame = (i: number, goalie: boolean) => goalie
  ? { gameId: 2026029000 + i, gameDate: `2026-11-0${i + 1}`, opponentAbbrev: "STL", homeRoadFlag: "H", decision: i % 2 ? "L" : "W", savePctg: 0.93, goalsAgainst: 2, shotsAgainst: 28 }
  : { gameId: 2026029000 + i, gameDate: `2026-11-0${i + 1}`, opponentAbbrev: "VAN", homeRoadFlag: "R", goals: i % 2, assists: 1, points: (i % 2) + 1, shots: 3 };
const profile = (id: number, name: string, team: string, pos: string) => ({
  id, name, number: 11, headshot: "", position: pos, team, updatedAt: new Date().toISOString(),
  seasons: [{ season: SEASON, gameTypeId: 2, gamesPlayed: 9, gamesStarted: 9, wins: 5, losses: 3, otLosses: 1, goalsAgainst: 20, shotsAgainst: 240, goalsAgainstAvg: 2.31, savePctg: 0.9167, goals: 5, assists: 7, points: 12, shots: 40 }],
  last5Games: Array.from({ length: 5 }, (_, i) => profileGame(i, pos === "G")),
});

/** Mocks everything the Following > Players view and the search need. Returns request counters. */
export async function mockPlayers(page: Page, o: { injuries?: unknown[]; tonight?: string[] } = {}) {
  const counts = { players: {} as Record<string, number>, profiles: {} as Record<string, number> };
  const games = (o.tonight ?? []).length ? [mk.upcoming(9901, o.tonight![0], o.tonight![1], { date: etDay(0) })] : [];
  await mockApis(page, { games, live: games });
  await page.route("**/api/injuries/**", (r) => r.fulfill({ json: { season: SEASON, updatedAt: new Date().toISOString(), sourceUpdated: null, items: o.injuries ?? [], teams: [] } }));
  await page.route("**/api/players/**", (r) => {
    const team = r.request().url().split("/").pop()!;
    counts.players[team] = (counts.players[team] ?? 0) + 1;
    return r.fulfill({ json: { season: SEASON, gameType: 2, updatedAt: new Date().toISOString(), ...(rosters[team] ?? { skaters: [], goalies: [] }) } });
  });
  await page.route(/\/api\/player\/\d{7}$/, (r) => {
    const id = Number(r.request().url().split("/").pop());
    counts.profiles[id] = (counts.profiles[id] ?? 0) + 1;
    const all: Record<number, ReturnType<typeof profile>> = {
      [IDS.skater]: profile(IDS.skater, "Alpha Forward", "EDM", "C"), [IDS.goalie]: profile(IDS.goalie, "Gus Goalie", "NSH", "G"),
      [IDS.traded]: profile(IDS.traded, "Trade Target", "CGY", "D"), [IDS.sparse]: profile(IDS.sparse, "Sparse Stats", "NSH", "C"),
    };
    return all[id] ? r.fulfill({ json: all[id] }) : r.fulfill({ status: 404, body: "{}" });
  });
  return counts;
}

type Seed = { id: number; name: string; team: string; pos: string; number?: number | null };
/** Writes a preference record with these followed players before the page loads (the app reads it through its own store). */
export async function seedFollowed(page: Page, players: Seed[]) {
  await page.addInitScript((list) => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem("iceboard-prefs-v1", JSON.stringify({ version: 1, onboarded: true, players: list.map((p, i) => ({ ...p, number: p.number ?? null, headshot: "", at: i + 1 })) }));
  }, players);
}
