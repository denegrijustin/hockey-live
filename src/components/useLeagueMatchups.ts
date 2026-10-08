import { useEffect, useState } from "react";
import type { LeagueMatchupSnapshot } from "../types";

const cache = new Map<number, LeagueMatchupSnapshot>();
const pending = new Map<number, Promise<LeagueMatchupSnapshot>>();

async function request(season: number, force = false) {
  if (!force && cache.has(season)) return cache.get(season)!;
  if (!force && pending.has(season)) return pending.get(season)!;
  const run = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 16000);
    try {
      let response = await fetch(`/api/league-matchups/${season}${force ? "?refresh=1" : ""}`, {
        signal: controller.signal,
      });
      if (!response.ok || !response.headers.get("content-type")?.includes("application/json"))
        response = await fetch(`/data/league-matchups/${season}.json`, { signal: controller.signal });
      if (!response.ok) throw Error("Matchup statistics unavailable");
      const data = await response.json() as LeagueMatchupSnapshot;
      if (!data.teams || data.season !== season) throw Error("Invalid matchup statistics");
      cache.set(season, data);
      return data;
    } finally {
      clearTimeout(timeout);
      pending.delete(season);
    }
  })();
  pending.set(season, run);
  return run;
}

export function useLeagueMatchups(season: number, enabled = true) {
  const [data, setData] = useState<LeagueMatchupSnapshot | null>(() => cache.get(season) ?? null);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    const load = (force = false) => request(season, force)
      .then((next) => {
        if (active) { setData(next); setError(""); }
      })
      .catch(() => {
        if (active) setError("League comparison data is temporarily unavailable.");
      });
    load();
    const refresh = () => load(true);
    window.addEventListener("iceboard:refresh", refresh);
    return () => {
      active = false;
      window.removeEventListener("iceboard:refresh", refresh);
    };
  }, [season, enabled]);
  return { data, error };
}
