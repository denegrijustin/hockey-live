import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useGameFeed, type GameFeedSnapshot } from "../../lib/use-game-feed";
import { gameStatus } from "../../lib/game-status.mjs";
import type { Game, GameFeed } from "../../types";

/**
 * The one shared view of a game for every Game Center section (Phase 5 contract, docs/phase5-contracts.md, docs/phase5-live-data.md).
 * One subscription for the whole Game Center, shared with every card that reads the same game (src/lib/use-game-feed.ts): adaptive
 * polling by phase, hidden-tab pause, backoff, a response-ordering guard, a cross-tab leader, event reconciliation and the stale flag
 * all live in src/lib/game-poller.mjs. This shape only ever grows.
 */
export type GameCenterState = {
  /** The scoreboard row (state, score, clock) the overlay was opened with. */
  game: Game;
  /** The latest play-by-play feed (richer than `game`), or null until the first response. Its plays/goals/shots are the reconciled ones. */
  feed: GameFeed | null;
  /** The reconciled events in order, keyed by `play.id` (the NHL eventId). Same array object while nothing changed. */
  plays: NonNullable<GameFeed["plays"]>;
  /** Alias of `plays`, named for the event store. */
  events: GameFeedSnapshot["events"];
  /** What the UI should say: upcoming, live, intermission, final, postponed, cancelled, suspended (from gameStatus). */
  status: ReturnType<typeof gameStatus>;
  /** Normalized phase (src/lib/game-state.mjs): scheduled | pregame | live | intermission | overtime | shootout | final | final-ot | final-so | postponed | suspended | cancelled, with clock. */
  phase: GameFeedSnapshot["phase"];
  live: boolean;
  /** True when live data is older than expected (2x the poll interval, at least 45 s) or the feed says live far too long: never show it as confirmed live. */
  stale: boolean;
  error: string | null;
  updatedAt: string | null;
  /** What the last applied poll added, changed, removed or voided (disallowed goals), with its sequence number; null before the first response. */
  changes: GameFeedSnapshot["changes"];
  /** Store keys (`gameId:eventId`) of the goals the last poll added. */
  lastGoalIds: string[];
  /** The phase change the last poll produced ({from, to, seq}); null on the first response and when nothing changed. */
  transition: GameFeedSnapshot["transition"];
  /** Score derived from the retained goals (lowered when a goal is voided). */
  score: GameFeedSnapshot["score"];
  /** Fetch now (the "Retry" button). */
  retry: () => void;
  /** True until the first response or error. */
  loading: boolean;
};

const Ctx = createContext<GameCenterState | null>(null);

export function GameCenterProvider({ game, children }: { game: Game; children: ReactNode }) {
  const s = useGameFeed(game);
  const { retry } = s;
  const value = useMemo<GameCenterState>(() => {
    // The feed is the freshest word on the game once it has arrived; the row it was opened with covers the first moments.
    const status = gameStatus(s.feed ?? game);
    return {
      game,
      feed: s.feed,
      plays: s.plays,
      events: s.events,
      status,
      phase: s.phase,
      live: s.phase.live,
      stale: s.stale,
      error: s.error,
      updatedAt: s.updatedAt,
      changes: s.changes,
      lastGoalIds: s.lastGoalIds,
      transition: s.transition,
      score: s.score,
      retry,
      loading: s.loading,
    };
    // `s` is rebuilt every render; its fields are stable until the poller emits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game, s.feed, s.plays, s.phase, s.stale, s.error, s.updatedAt, s.changes, s.transition, s.score, s.loading, retry]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGameCenter(): GameCenterState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGameCenter must be used inside <GameCenterProvider>");
  return v;
}
