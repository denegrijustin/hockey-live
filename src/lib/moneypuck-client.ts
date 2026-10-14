// Loads the MoneyPuck snapshot parts for the NHL+ tab, the game cards and the Game Center through one shared cache, so a
// part is fetched once no matter how many components ask for it. Reads /api/moneypuck/... (Worker, KV) and falls back to
// the saved copy under /data/moneypuck/.
import { useCallback, useEffect, useState } from "react";
import { isStale } from "./nhlplus.mjs";
import type { GamesPart, LinesPart, MpMeta, MpStatus, ShotsPart, SkatersPart, SummaryPart } from "./moneypuck-types";

export type PartName = "summary" | "skaters" | "lines" | "games";
type PartMap = { summary: SummaryPart; skaters: SkatersPart; lines: LinesPart; games: GamesPart };
export type LoadState = "idle" | "loading" | "ready" | "unavailable";
export type Loaded<T> = { data: T; savedCopy: boolean };

const cache = new Map<string, Loaded<unknown>>();
const pending = new Map<string, Promise<Loaded<unknown>>>();
const EVENT = "iceboard:moneypuck";

async function getJson(url: string, signal: AbortSignal) {
  const r = await fetch(url, { signal });
  if (!r.ok || !r.headers.get("content-type")?.includes("application/json")) throw Error(`HTTP ${r.status}`);
  return { json: await r.json(), source: r.headers.get("x-snapshot-source") };
}

/** One part (or one game's shots), from the API first and the saved copy second. Validated against the season asked for. */
export function loadPiece<T extends MpMeta>(seasonId: number, path: string, force = false): Promise<Loaded<T>> {
  const key = `${seasonId}/${path}`;
  if (!force && cache.has(key)) return Promise.resolve(cache.get(key) as Loaded<T>);
  if (!force && pending.has(key)) return pending.get(key) as Promise<Loaded<T>>;
  const run = (async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20000);
    try {
      let result: { json: any; source: string | null };
      let savedCopy = false;
      try {
        result = await getJson(`/api/moneypuck/${seasonId}/${path}`, controller.signal);
        savedCopy = result.source === "saved";
      } catch {
        result = await getJson(`/data/moneypuck/${seasonId}/${path}.json`, controller.signal);
        savedCopy = true;
      }
      const data = result.json as T;
      if (data.source !== "MoneyPuck.com" || data.seasonId !== seasonId) throw Error("Unexpected MoneyPuck snapshot");
      const loaded = { data, savedCopy };
      cache.set(key, loaded);
      return loaded;
    } finally {
      clearTimeout(timer);
      pending.delete(key);
    }
  })();
  pending.set(key, run);
  return run;
}

/** Forget what is cached (after a successful refresh) and tell every mounted component to load again. */
export function invalidateMoneyPuck() {
  cache.clear();
  window.dispatchEvent(new Event(EVENT));
}

function usePiece<T extends MpMeta>(seasonId: number, path: string | null) {
  const key = path ? `${seasonId}/${path}` : null;
  const [loaded, setLoaded] = useState<Loaded<T> | null>(() => (key ? (cache.get(key) as Loaded<T> | undefined) ?? null : null));
  const [state, setState] = useState<LoadState>(() => (!key ? "idle" : cache.has(key) ? "ready" : "loading"));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path || !key) { setState("idle"); return; }
    let active = true;
    const cached = cache.get(key) as Loaded<T> | undefined;
    if (cached) { setLoaded(cached); setState("ready"); } else { setLoaded(null); setState("loading"); }
    if (!cached) {
      loadPiece<T>(seasonId, path).then((next) => { if (active) { setLoaded(next); setState("ready"); } }).catch(() => { if (active) setState("unavailable"); });
    }
    const again = () => loadPiece<T>(seasonId, path, true).then((next) => { if (active) { setLoaded(next); setState("ready"); } }).catch(() => { /* keep what is on screen */ });
    window.addEventListener(EVENT, again);
    return () => { active = false; window.removeEventListener(EVENT, again); };
  }, [seasonId, path, key, attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { loaded, state, retry };
}

export type MpResult<T extends MpMeta> = {
  data: T | null;
  state: LoadState;
  /** The Worker could not be reached (or has nothing newer), so this is the copy saved with the site. */
  savedCopy: boolean;
  /** MoneyPuck's own stamp for this data (ISO), or null. */
  updated: string | null;
  /** Older than 36 hours while this is the live season: shown as stale, never as live. */
  stale: boolean;
  retry: () => void;
};

/** A season-level part. `watchAge` should be true for the current season (older seasons are not "stale"). */
export function useMoneyPuck<K extends PartName>(seasonId: number, part: K, { enabled = true, watchAge = true } = {}): MpResult<PartMap[K]> {
  const { loaded, state, retry } = usePiece<PartMap[K]>(seasonId, enabled ? part : null);
  const data = loaded?.data ?? null;
  const updated = data ? (part === "games" ? data.sourceUpdated.shots : data.sourceUpdated.summary) : null;
  return { data, state, savedCopy: loaded?.savedCopy ?? false, updated, stale: !!data && watchAge && isStale(updated), retry };
}

/** The shots of one completed game, for the chance-flow chart and shot map. Only recent games are kept. */
export function useGameShots(seasonId: number, gameId: number, enabled: boolean): MpResult<ShotsPart> {
  const { loaded, state, retry } = usePiece<ShotsPart>(seasonId, enabled ? `shots/${gameId}` : null);
  const data = loaded?.data ?? null;
  return { data, state, savedCopy: loaded?.savedCopy ?? false, updated: data?.sourceUpdated.shots ?? null, stale: false, retry };
}

/** Manual refresh: asks the Worker to check MoneyPuck now (bounded and deduplicated there), then reloads what is shown. */
export function useMoneyPuckRefresh(seasonId: number) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<MpStatus["refresh"] | null>(null);
  const [error, setError] = useState("");
  const refresh = useCallback(async () => {
    if (running) return;
    setRunning(true); setError(""); setResult(null);
    try {
      const r = await fetch(`/api/moneypuck/${seasonId}/status?refresh=1`, { cache: "no-store", signal: AbortSignal.timeout(60000) });
      if (!r.ok) throw Error("Refresh is not available from this server");
      const status = (await r.json()) as MpStatus & { error?: string | null };
      setResult(status.refresh ?? null);
      if (status.refresh === "failed") setError(status.error ?? "MoneyPuck could not be reached");
      if (status.refresh === "updated") invalidateMoneyPuck();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Refresh failed");
      setResult("failed");
    } finally {
      setRunning(false);
    }
  }, [seasonId, running]);
  return { refresh, running, result, error };
}

/** The refresh status record (last check, last error, counts, dated snapshots). */
export function useMoneyPuckStatus(seasonId: number) {
  const { loaded } = usePiece<MpMeta & MpStatus>(seasonId, "status");
  return loaded?.data ?? null;
}
