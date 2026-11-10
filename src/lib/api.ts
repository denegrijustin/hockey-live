import type { Snapshot, Boxscore, PlayerData } from "../types";
const promises = new Map<string, Promise<unknown>>();
export type DataSource = "live" | "saved";
const sources = new Map<string, DataSource>();
/** Where the last response for an /api/... path came from: the live API, or the saved snapshot shipped with the site. */
export const sourceOf = (api: string): DataSource => sources.get(api) ?? "live";
/** Where the last loaded season snapshot came from. */
export const lastSeasonSource = (season: number) => sourceOf(`/api/season/${season}`);
async function request<T>(
  api: string,
  fallback: string,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const r = await fetch(api, { signal });
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json"))
      throw Error("API unavailable");
    const body = await r.json();
    sources.set(api, "live");
    return body;
  } catch (e) {
    if (signal?.aborted) throw e;
    const r = await fetch(fallback, { signal });
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json"))
      throw Error("Data could not be loaded. Please retry.");
    const body = await r.json();
    sources.set(api, "saved");
    return body;
  }
}
export const loadSeason = (season: number, signal?: AbortSignal) =>
  request<Snapshot>(
    `/api/season/${season}`,
    `/data/seasons/${season}.json`,
    signal,
  );
export function loadBox(id: number): Promise<Boxscore> {
  const key = `box-${id}`;
  if (!promises.has(key))
    promises.set(
      key,
      request<Boxscore>(`/api/boxscore/${id}`, `/data/games/${id}.json`).catch(
        (e) => {
          promises.delete(key);
          throw e;
        },
      ),
    );
  return promises.get(key) as Promise<Boxscore>;
}
export const loadPlayers = (
  season: number,
  team: string,
  signal?: AbortSignal,
) =>
  request<PlayerData>(
    `/api/players/${season}/${team}`,
    `/data/players/${season}/${team}.json`,
    signal,
  );

/** One game row as the NHL lists it (landing `last5Games` and the game log share these names). Skaters and goalies carry different fields; any may be missing. */
export type PlayerGame = {
  gameId?: number; gameDate: string; teamAbbrev?: string; opponentAbbrev?: string; homeRoadFlag?: "H" | "R";
  goals?: number; assists?: number; points?: number; plusMinus?: number; shots?: number; toi?: string; pim?: number; powerPlayPoints?: number;
  decision?: string; gamesStarted?: number; shotsAgainst?: number; goalsAgainst?: number; savePctg?: number; shutouts?: number;
};
/** A season line from the NHL `seasonTotals` (regular season rows have gameTypeId 2). Skater and goalie fields differ; every one is optional. */
export type PlayerSeasonRow = {
  season: number; gameTypeId?: number; leagueAbbrev?: string; teamName?: { default?: string }; teamCommonName?: { default?: string };
  gamesPlayed?: number; goals?: number; assists?: number; points?: number; plusMinus?: number; shots?: number; pim?: number; avgToi?: string; shootingPctg?: number;
  powerPlayPoints?: number; gameWinningGoals?: number;
  gamesStarted?: number; wins?: number; losses?: number; otLosses?: number; shutouts?: number; goalsAgainst?: number; goalsAgainstAvg?: number; savePctg?: number; shotsAgainst?: number; timeOnIce?: string;
};
/** The `/api/player/:id` response. The last keys are Phase 3 additions and may be absent. */
export type PlayerProfileData = {
  id: number; name: string; number?: number | null; headshot?: string; position?: string; team?: string; birthDate?: string; height?: number; weight?: number; shoots?: string;
  seasons: PlayerSeasonRow[]; updatedAt: string;
  last5Games?: PlayerGame[];
  featuredStats?: { season?: number; regularSeason?: { subSeason?: Partial<PlayerSeasonRow>; career?: Partial<PlayerSeasonRow> } };
  careerTotals?: { regularSeason?: Partial<PlayerSeasonRow> };
  isActive?: boolean; birthCity?: { default?: string }; birthCountry?: string;
};
async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) throw Error(r.status === 404 ? "Player not found" : "Player details unavailable");
  return r.json();
}
/** A player's NHL landing profile (bio, season totals, last five games). Not cached here: the dialog loads it once per open. */
export const loadPlayer = (id: number | string, signal?: AbortSignal) => getJson<PlayerProfileData>(`/api/player/${id}`, signal);
/** A player's regular-season game log for a season (8 digits). `games` is empty when the NHL has none. */
export const loadPlayerLog = (id: number | string, season: number, signal?: AbortSignal) => getJson<{ id: number; season: number; games: PlayerGame[]; updatedAt: string }>(`/api/player/${id}/log/${season}`, signal);
