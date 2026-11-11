import { useCallback } from "react";
import { setPrefs, usePrefs } from "../lib/prefs.ts";
import { toggleFavorite } from "../lib/prefs.mjs";

/** The device-local favorite teams (NHL abbreviations). No favorites means the whole league is in view. */
export function useFavorites() {
  const favorites: string[] = usePrefs().favorites;
  const isFavorite = useCallback((id: string) => favorites.includes(id), [favorites]);
  const toggle = useCallback((id: string) => setPrefs((p) => toggleFavorite(p, id) as typeof p), []);
  return { favorites, isFavorite, toggle };
}
