import { useEffect, useRef } from "react";
import { getPrefs, usePrefs } from "../lib/prefs.ts";
import { loadRuntime } from "../components/alerts/alertFeed";
import type { Game } from "../types";

/**
 * Feeds the poll results App already has (the live scoreboard games, no extra polling) to the alert engine.
 * Nothing is loaded or compared while alerts are off (the default); switching them on starts a fresh silent baseline,
 * so enabling never produces a burst of old events.
 */
export function useGameAlerts(games: Game[] | undefined) {
  const enabled = usePrefs().alerts.enabled;
  const prev = useRef<Map<number, unknown> | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  useEffect(() => { if (!enabled) prev.current = null; }, [enabled]);
  useEffect(() => {
    if (!enabled) return;
    queue.current = queue.current.then(async () => {
      try {
        const rt = await loadRuntime();
        if (!getPrefs().alerts.enabled) return;
        if (games) prev.current = rt.tick(prev.current, games, getPrefs());
        else rt.refresh();
      } catch {}
    });
  }, [games, enabled]);
}
