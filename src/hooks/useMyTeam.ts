import { useCallback } from "react";
import { setPrefs, usePrefs } from "../lib/prefs.ts";
import { setMyTeam as setMine } from "../lib/prefs.mjs";

/** The device-local "My team": "" until one is chosen. Everything that opens on a team (schedule, standings, odds, players) reads it from here. */
export function useMyTeam() {
  const myTeam: string = usePrefs().myTeam;
  const choose = useCallback((id: string) => setPrefs((p) => setMine(p, id) as typeof p), []);
  return { myTeam, setMyTeam: choose };
}
export const PICK_MY_TEAM_EVENT = "iceboard:pick-my-team";
export const openMyTeamPicker = () => window.dispatchEvent(new Event(PICK_MY_TEAM_EVENT));
