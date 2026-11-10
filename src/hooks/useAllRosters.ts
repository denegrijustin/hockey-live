import { useEffect, useState } from "react";
import { loadPlayers } from "../lib/api";
import type { PlayerData } from "../types";

/** Roster files (the per-team season player lists) are shared by every screen: one request per team and season, kept for a few minutes. */
const TTL = 300_000;
const POOL = 3;
const cache = new Map<string, { at: number; promise: Promise<PlayerData> }>();

/** One team's roster file, from the shared cache. `fresh` skips a copy older than the cache lifetime (Retry always refetches a failed one). */
export function loadRoster(season: number, team: string): Promise<PlayerData> {
  const key = `${season}/${team}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = loadPlayers(season, team).catch((e) => { if (cache.get(key)?.promise === promise) cache.delete(key); throw e; });
  cache.set(key, { at: Date.now(), promise });
  return promise;
}

/** Loads the rosters of `teams` three at a time. Rejects if any fails. Results come back in the order of `teams`. */
export async function loadRosters(season: number, teams: string[], isCancelled: () => boolean = () => false): Promise<PlayerData[]> {
  const out: PlayerData[] = new Array(teams.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(POOL, teams.length) }, async () => {
    while (next < teams.length && !isCancelled()) {
      const i = next++;
      out[i] = await loadRoster(season, teams[i]);
    }
  }));
  return out;
}

export type Rosters = { data: PlayerData[]; loading: boolean; error: boolean; retry: () => void };

/**
 * The rosters of `teams` for `season`, shared across the app. `enabled` false loads nothing (a screen that does not need them yet).
 * `refreshKey` changes force a refetch of copies older than the cache lifetime.
 */
export function useAllRosters(season: number | null, teams: string[], enabled = true, refreshKey = 0): Rosters {
  const [state, setState] = useState<{ data: PlayerData[]; loading: boolean; error: boolean }>({ data: [], loading: enabled && !!season && teams.length > 0, error: false });
  const [attempt, setAttempt] = useState(0);
  const key = teams.join(",");
  useEffect(() => {
    if (!enabled || !season || !teams.length) { setState({ data: [], loading: false, error: false }); return; }
    let dead = false;
    setState((s) => ({ data: s.data, loading: true, error: false }));
    loadRosters(season, teams, () => dead)
      .then((data) => { if (!dead) setState({ data, loading: false, error: false }); })
      .catch(() => { if (!dead) setState({ data: [], loading: false, error: true }); });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, season, key, attempt, refreshKey]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

/** The current season id (8 digits) from the site manifest; null until it loads. One request for the whole app. */
let seasonPromise: Promise<number | null> | null = null;
export function useCurrentSeason(): number | null {
  const [season, setSeason] = useState<number | null>(null);
  useEffect(() => {
    let dead = false;
    seasonPromise ??= fetch("/data/manifest.json").then((r) => (r.ok ? r.json() : null)).then((m) => (m && Number.isFinite(m.current) ? (m.current as number) : null)).catch(() => null);
    seasonPromise.then((s) => { if (!dead) setSeason(s); if (s === null) seasonPromise = null; });
    return () => { dead = true; };
  }, []);
  return season;
}
