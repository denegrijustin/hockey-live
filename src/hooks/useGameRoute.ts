import { useCallback, useEffect, useState } from "react";
import { parseGameRoute, withGameRoute } from "../lib/gc-route.mjs";
import type { GcTab } from "../components/gc/GameCenterUi";

export type GameRoute = { id: number; tab: GcTab | null; event: number | null };
const read = (): GameRoute | null => {
  try { return parseGameRoute(location.search) as GameRoute | null; } catch { return null; }
};
const urlWith = (route: GameRoute | null) => `${location.pathname}${withGameRoute(location.search, route)}${location.hash}`;

/**
 * The open Game Center as the address says it (`?game=ID&tab=…&event=…`).
 * `open` pushes a history entry (Back closes the Game Center); moving to another tab or game while it is open only replaces the entry.
 * `close` goes Back when this app pushed the entry, else removes the parameters in place (a deep link has nothing to go back to).
 */
export function useGameRoute() {
  const [route, setRoute] = useState<GameRoute | null>(read);
  useEffect(() => {
    const pop = () => setRoute(read());
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  const open = useCallback((id: number, opts: { tab?: GcTab | null; event?: number | null } = {}) => {
    const next: GameRoute = { id, tab: opts.tab ?? (opts.event != null ? "pbp" : null), event: opts.event ?? null };
    try {
      if (read()) history.replaceState(history.state, "", urlWith(next));
      else {
        history.replaceState({ ...history.state, scroll: window.scrollY }, "");
        history.pushState({ ...history.state, gc: 1, scroll: 0 }, "", urlWith(next));
      }
    } catch {}
    setRoute(next);
  }, []);
  const setTab = useCallback((tab: GcTab, event: number | null = null) => {
    const current = read();
    if (!current) return;
    const next = { ...current, tab, event };
    try { history.replaceState(history.state, "", urlWith(next)); } catch {}
    setRoute(next);
  }, []);
  /** `replace` removes the parameters in place without going Back (used when another navigation follows straight away). */
  const close = useCallback((opts?: { replace?: boolean }) => {
    try {
      if (!read()) { setRoute(null); return; }
      if (history.state?.gc && !opts?.replace) history.back();
      else history.replaceState({ ...history.state, gc: undefined }, "", urlWith(null));
    } catch {}
    setRoute(null);
  }, []);
  return { route, open, setTab, close };
}
