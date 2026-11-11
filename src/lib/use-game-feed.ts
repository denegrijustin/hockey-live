import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { acquireGamePoller } from "./game-poller.mjs";
import { phaseOf } from "./game-state.mjs";
import type { Game, GameFeed } from "../types";

type Play = NonNullable<GameFeed["plays"]>[number];
type Change = { key: string; id: number; play: Play; prev?: Play; reason?: string; from?: number; reinstated?: boolean };

/** What the shared per-game poller (src/lib/game-poller.mjs) exposes. */
export type GameFeedSnapshot = {
  feed: GameFeed | null;
  /** Reconciled events in order (stable objects between polls; a goal is only dropped after two polls without it). */
  plays: Play[];
  events: Play[];
  /** What the last applied poll did: added / changed / removed / voided (seq = request sequence number). */
  changes: { seq: number; added: Change[]; changed: Change[]; removed: Change[]; voided: Change[] } | null;
  /** Store keys (`gameId:eventId`) of goals added by the last applied poll. */
  lastGoalIds: string[];
  /** Score derived from the retained goals ({0,0} with no goals, null if goals carry no score). */
  score: { home: number; away: number } | null;
  phase: ReturnType<typeof phaseOf>;
  /** The phase change the last applied poll produced ({from, to, seq}), null otherwise and on the first response. */
  transition: { from: string; to: string; seq: number } | null;
  stale: boolean;
  error: string | null;
  updatedAt: string | null;
  lastOkAt: number | null;
  failures: number;
  loading: boolean;
  leader: boolean;
};

const IDLE: GameFeedSnapshot = {
  feed: null, plays: [], events: [], changes: null, lastGoalIds: [], score: null, phase: phaseOf({ state: "FUT" }), transition: null,
  stale: false, error: null, updatedAt: null, lastOkAt: null, failures: 0, loading: false, leader: false,
};
const NO_SUB = () => () => {};

/**
 * The one subscription to a game's live feed. Everything that wants `/api/game/:id` (the Game Center provider and every card or section that
 * used to call useFeed on that URL) shares ONE poller per game per tab. Pass null to stay idle.
 */
export function useGameFeed(game: Game | null, { passive = false } = {}): GameFeedSnapshot & { retry: () => void } {
  const id = game?.id ?? null;
  const [poller, setPoller] = useState<ReturnType<typeof acquireGamePoller>["poller"] | null>(null);
  useEffect(() => {
    if (!game) return setPoller(null);
    const handle = acquireGamePoller(game);
    setPoller(handle.poller);
    return () => {
      setPoller(null);
      handle.release();
    };
    // Only the id decides which poller; row changes below only update it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);
  useEffect(() => {
    if (poller && game) poller.setGame(game);
  }, [poller, game]);
  const subscribe = useCallback((cb: () => void) => (poller ? poller.subscribe(cb, { passive }) : NO_SUB()), [poller, passive]);
  const snap = useSyncExternalStore(subscribe, () => (poller ? poller.getSnapshot() : IDLE), () => IDLE) as GameFeedSnapshot;
  const retry = useCallback(() => poller?.retry(), [poller]);
  return { ...snap, retry };
}

/** Drop-in for `useFeed<GameFeed>(\`/api/game/${id}...\`)`: `{data, error}` from the shared poller. null game = idle. */
export function useGameFeedData(game: Game | null) {
  // Passive: small cards read the shared feed without raising its cadence (see game-poller.mjs); a Game Center on the same game does.
  // A stale-live row (live more than 8 h after puck drop: stuck data) is not worth a request from a small card; only an open Game Center recovers it.
  const s = useGameFeed(game && !phaseOf(game).stale ? game : null, { passive: true });
  return { data: s.feed, error: s.error ?? "" };
}
