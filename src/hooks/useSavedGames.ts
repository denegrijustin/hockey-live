import { useCallback } from "react";
import { setPrefs, usePrefs } from "../lib/prefs.ts";
import { isSaved, toggleSaved } from "../lib/prefs.mjs";
import type { Game } from "../types";

export type SavedGame = { id: number; season: number; home: string; away: string; date: string; at: number };

/** Saved games (device-local, in the preference store). Keyed by the NHL game id, with the teams and date kept so a game that
 *  later leaves the schedule can still be named. */
export function useSavedGames() {
  const prefs = usePrefs();
  const saved = prefs.games as SavedGame[];
  const has = useCallback((id: number | string) => isSaved(prefs, id), [prefs]);
  const toggle = useCallback((g: Pick<Game, "id" | "season" | "home" | "away" | "date">) => {
    setPrefs((p) => toggleSaved(p, { id: g.id, season: g.season, home: g.home, away: g.away, date: g.date, at: Date.now() }) as typeof p);
  }, []);
  const removeMany = useCallback((ids: number[]) => {
    setPrefs((p) => ({ ...p, games: (p.games as SavedGame[]).filter((x) => !ids.includes(x.id)) as never[] }));
  }, []);
  return { saved, has, toggle, remove: (id: number) => removeMany([id]), removeMany };
}
