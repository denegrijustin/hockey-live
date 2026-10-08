import { useEffect, useState } from "react";
import { espnGameUrl, espnScheduleUrl } from "../lib/espn-links.mjs";
type DayMap = Record<string, string>;
const days = new Map<string, { at: number; promise: Promise<DayMap> }>();
function loadDay(date: string): Promise<DayMap> {
  const key = date.replace(/-/g, "");
  const hit = days.get(key);
  if (hit && Date.now() - hit.at < 300000) return hit.promise;
  const promise = fetch(`/api/espn/${key}`)
    .then((r) => (r.ok ? r.json() : { games: {} }))
    .then((j) => (j && typeof j.games === "object" && j.games ? (j.games as DayMap) : {}))
    .catch(() => ({}) as DayMap);
  days.set(key, { at: Date.now(), promise });
  return promise;
}
/** Link to the game on ESPN (opens the ESPN app via universal link); falls back to that day's ESPN schedule. */
export function useEspnLink(
  game: { date: string; away: string; home: string },
  enabled: boolean,
) {
  const [id, setId] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadDay(game.date).then((m) => {
      if (active) setId(m[`${game.away}-${game.home}`] ?? null);
    });
    return () => {
      active = false;
    };
  }, [enabled, game.date, game.away, game.home]);
  return id ? espnGameUrl(id) : espnScheduleUrl(game.date);
}
