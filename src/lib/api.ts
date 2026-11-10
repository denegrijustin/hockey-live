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
