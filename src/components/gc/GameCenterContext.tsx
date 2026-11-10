import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useFeed } from "../../lib/polling";
import { gameStatus } from "../../lib/game-status.mjs";
import { isLive } from "../../lib/game-data.mjs";
import type { Game, GameFeed } from "../../types";

/**
 * The one shared view of a game for every Game Center section (Phase 5 contract, docs/phase5-contracts.md).
 * This is the baseline provider (one feed subscription, shared by every pane). Agent 2 upgrades its internals
 * (adaptive polling, ordering guard, reconciliation, stale flag) WITHOUT changing this shape.
 */
export type GameCenterState = {
  /** The scoreboard row (state, score, clock) the overlay was opened with. */
  game: Game;
  /** The latest play-by-play feed (richer than `game`), or null until the first response. */
  feed: GameFeed | null;
  /** `feed.plays` in order (empty until loaded). */
  plays: NonNullable<GameFeed["plays"]>;
  /** What the UI should say: upcoming, live, intermission, final, postponed, cancelled, suspended (from gameStatus). */
  status: ReturnType<typeof gameStatus>;
  live: boolean;
  /** True when live data is older than expected: never show it as confirmed live. */
  stale: boolean;
  error: string | null;
  updatedAt: string | null;
};

const Ctx = createContext<GameCenterState | null>(null);

export function GameCenterProvider({ game, children }: { game: Game; children: ReactNode }) {
  const live = isLive(game);
  const { data, error } = useFeed<GameFeed>(`/api/game/${game.id}`, live ? 30000 : 3600000);
  const value = useMemo<GameCenterState>(
    () => ({
      game,
      feed: data ?? null,
      plays: data?.plays ?? [],
      status: gameStatus(data ?? game),
      live,
      stale: false,
      error: error ?? null,
      updatedAt: data?.updatedAt ?? null,
    }),
    [game, data, error, live],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGameCenter(): GameCenterState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useGameCenter must be used inside <GameCenterProvider>");
  return v;
}
