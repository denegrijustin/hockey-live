import { useSyncExternalStore } from "react";
import teamsJson from "../data/teams.json";
import { setLogoMode } from "./logos";
import { LEGACY_TEAMS_KEY, PREFS_KEY, defaultPrefs, parsePrefs, sanitize, serialize } from "./prefs.mjs";

type Defaults = ReturnType<typeof defaultPrefs>;
export type FollowedPlayer = { id: number; name: string; team: string; pos: string; number: number | null; headshot: string; at: number };
export type SavedGame = { id: number; season: number; home: string; away: string; date: string; at: number };
export type Prefs = Omit<Defaults, "favorites" | "players" | "games"> & { favorites: string[]; players: FollowedPlayer[]; games: SavedGame[] };
const teamIds = (teamsJson as { id: string }[]).map((t) => t.id);

/** Device-local preference store. Reads once, keeps an in-memory copy (so a blocked or full storage never breaks the session),
 *  persists on every change, and follows other tabs through the `storage` event. */
let storageOk = true;
let cache: Prefs | null = null;
const listeners = new Set<() => void>();

const read = (key: string): string | null => { try { return localStorage.getItem(key); } catch { storageOk = false; return null; } };
function load(): Prefs {
  const p = parsePrefs(read(PREFS_KEY), { teamIds, legacy: read(LEGACY_TEAMS_KEY) });
  return p as Prefs;
}
export const getPrefs = (): Prefs => {
  if (!cache) { cache = load(); setLogoMode(cache.display.logos as "retro" | "current"); }
  return cache;
};
/** False when the browser blocked storage: preferences still work for this session but are not saved. */
export const prefsPersisted = () => { getPrefs(); return storageOk; };

export function setPrefs(next: Prefs | ((p: Prefs) => Prefs)) {
  const value = sanitize(typeof next === "function" ? next(getPrefs()) : next, teamIds) as Prefs;
  cache = value;
  setLogoMode(value.display.logos as "retro" | "current");
  try { localStorage.setItem(PREFS_KEY, serialize(value)); storageOk = true; } catch { storageOk = false; }
  listeners.forEach((l) => l());
}
/** Reset only Iceboard's preference record (and the legacy team list); nothing else in storage is touched. */
export function resetPrefs() {
  try { localStorage.removeItem(PREFS_KEY); localStorage.removeItem(LEGACY_TEAMS_KEY); } catch {}
  cache = defaultPrefs() as Prefs;
  setLogoMode("retro");
  listeners.forEach((l) => l());
}
export function subscribePrefs(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key !== PREFS_KEY && e.key !== null) return;
    cache = load();
    listeners.forEach((l) => l());
  });
}
export const usePrefs = (): Prefs => useSyncExternalStore(subscribePrefs, getPrefs, () => defaultPrefs() as Prefs);
