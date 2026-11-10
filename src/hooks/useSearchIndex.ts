import { useMemo } from "react";
import type { Game, Team } from "../types";
import { buildIndex } from "../lib/search.mjs";
import { VIEW_LIST } from "../components/MainNav";
import { useEtToday } from "./useEtToday";

/** A player that is already loaded somewhere in the app (never invented here). */
export interface SearchPlayer { id: number | string; name: string; team?: string; headshot?: string | null; number?: number | null }

/** The search index, built from data the app already holds: teams, the season's games (only today's and live ones are searchable), loaded players and the views. */
export function useSearchIndex({ teams, games, players }: { teams: Team[]; games: Game[]; players?: SearchPlayer[] }) {
  const today = useEtToday();
  return useMemo(() => buildIndex({ teams, games, players, views: VIEW_LIST, today }), [teams, games, players, today]);
}
