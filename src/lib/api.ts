import type { Snapshot, Boxscore, PlayerData } from "../types";
const promises = new Map<string, Promise<unknown>>();
async function request<T>(
  api: string,
  fallback: string,
  signal?: AbortSignal,
): Promise<T> {
  try {
    const r = await fetch(api, { signal });
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json"))
      throw Error("API unavailable");
    return await r.json();
  } catch (e) {
    if (signal?.aborted) throw e;
    const r = await fetch(fallback, { signal });
    if (!r.ok || !r.headers.get("content-type")?.includes("application/json"))
      throw Error("Data could not be loaded. Please retry.");
    return r.json();
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
