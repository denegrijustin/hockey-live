import { useEffect, useMemo, useState } from "react";
import { loadSeason } from "../lib/api";
import { isLive, mergeScores } from "../lib/game-data.mjs";
import { useFeed, useVisibleInterval } from "../lib/polling";
import type { Scoreboard, Snapshot } from "../types";

type Manifest = { current: number; seasons: number[] };

/**
 * The season index, the selected season's games (with live scores merged in), the previous season used as a
 * baseline, and the loading and error state around them.
 */
export function useSeason() {
  const [manifest, setManifest] = useState<Manifest | null>(null),
    [season, setSeason] = useState(0),
    [storedData, setData] = useState<Snapshot | null>(null),
    [baseline, setBaseline] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);

  useEffect(() => {
    fetch("/data/manifest.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((m) => {
        setManifest(m);
        setSeason(m.current);
      })
      .catch(() => {
        setError("Could not load the season index. Reload to retry.");
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!season) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    loadSeason(season, controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted) setError("The NHL snapshot could not be loaded. Please retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [season, retry]);

  useEffect(() => {
    if (!manifest) return;
    const controller = new AbortController();
    loadSeason(manifest.seasons[1], controller.signal)
      .then(setBaseline)
      .catch(() => {});
    return () => controller.abort();
  }, [manifest]);

  const isCurrent = !!season && season === manifest?.current;
  const { data: scoreboard, error: liveError } = useFeed<Scoreboard>(isCurrent ? "/api/live" : null);

  // The live feed already carries in-progress scores every 30s; this catches what it doesn't: newly finished games
  // rolling into the schedule and standings drift from games elsewhere. Every five minutes, never in a hidden tab.
  useVisibleInterval(
    () => {
      loadSeason(season)
        .then(setData)
        .catch(() => {});
    },
    300000,
    isCurrent,
  );

  const data = useMemo<Snapshot | null>(() => {
    if (!storedData) return null;
    const games = mergeScores(storedData.games, scoreboard);
    // Same array back means nothing actually changed for this tick: keep the same Snapshot reference so the season
    // analysis isn't redone for nothing.
    return games === storedData.games ? storedData : { ...storedData, games };
  }, [storedData, scoreboard]);

  return {
    manifest,
    season,
    setSeason,
    data,
    baseline,
    scoreboard,
    liveError,
    hasLive: scoreboard?.games.some(isLive) ?? false,
    error,
    loading,
    retry: () => setRetry((x) => x + 1),
  };
}
