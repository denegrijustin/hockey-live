// Lets anything in the app (a game card, the Game Center, a link) open a specific NHL+ view, and lets the NHL+ tab read it.
import { useSyncExternalStore } from "react";
import type { Sit } from "./moneypuck-types";

export type NhlPlusView = "teams" | "matchups" | "goalies" | "players" | "trends" | "matrix" | "data";
export type NhlPlusTarget = {
  view: NhlPlusView;
  away?: string;        // matchup: first team (id)
  home?: string;        // matchup: second team (id)
  gameId?: number;      // the game the matchup was opened from
  team?: string;        // trends / players: highlighted team
  sit?: Sit;
  nonce: number;        // changes on every open so the same target can be opened twice
};
export const NHLPLUS_EVENT = "iceboard:nhlplus";

let current: NhlPlusTarget | null = null;
const listeners = new Set<() => void>();
let nonce = 0;

/** Opens the NHL+ tab on a view. App listens for NHLPLUS_EVENT, switches to the tab, and NhlPlus reads the target. */
export function openNhlPlus(target: Omit<NhlPlusTarget, "nonce">) {
  current = { ...target, nonce: ++nonce };
  listeners.forEach((l) => l());
  window.dispatchEvent(new CustomEvent(NHLPLUS_EVENT, { detail: current }));
}
export const getNhlPlusTarget = () => current;
export function useNhlPlusTarget() {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getNhlPlusTarget, getNhlPlusTarget);
}
