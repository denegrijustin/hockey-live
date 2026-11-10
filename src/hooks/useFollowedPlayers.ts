import { useCallback } from "react";
import { usePrefs, setPrefs } from "../lib/prefs";
import { isFollowing, toggleFollow, LIMITS } from "../lib/prefs.mjs";
import { applySnapshots } from "../lib/watchlist-players.mjs";

/** What following a player needs: the NHL id plus the fields the watchlist shows before its data loads. */
export interface FollowRef { id: number | string; name?: string; team?: string; pos?: string; number?: number | null; headshot?: string | null }
export type FollowedPlayer = { id: number; name: string; team: string; pos: string; number: number | null; headshot: string; at: number };

/** The followed players (device-local, in preferences) and the actions on them. */
export function useFollowedPlayers() {
  const prefs = usePrefs();
  const players = prefs.players as FollowedPlayer[];
  const atLimit = players.length >= LIMITS.players;
  const is = useCallback((id: number | string) => isFollowing(prefs, id), [prefs]);
  /** Follows or unfollows. Following past the cap is refused (returns false) rather than silently dropping the new player. */
  const toggle = useCallback((ref: FollowRef): boolean => {
    let ok = true;
    setPrefs((p) => {
      if (!isFollowing(p, ref.id) && p.players.length >= LIMITS.players) { ok = false; return p; }
      return toggleFollow(p, { id: Number(ref.id), name: ref.name ?? "", team: ref.team ?? "", pos: ref.pos ?? "", number: ref.number ?? null, headshot: ref.headshot ?? "", at: Date.now() });
    });
    return ok;
  }, []);
  /** Stores a fresh team/position/number/photo snapshot for followed players (a trade, a new number). No-op when nothing differs. */
  const syncSnapshots = useCallback((updates: { id: number; team: string; pos: string; number: number | null; headshot: string }[]) => {
    if (!updates.length) return;
    setPrefs((p) => {
      const next = applySnapshots(p.players, updates);
      return next === p.players ? p : { ...p, players: next };
    });
  }, []);
  return { players, count: players.length, atLimit, limit: LIMITS.players, isFollowing: is, toggle, syncSnapshots };
}
