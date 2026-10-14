import { useMemo } from "react";
import type { Game } from "../../../types";
import { useMoneyPuck, useGameShots } from "../../../lib/moneypuck-client";
import { cardMode } from "./logic.mjs";

export type CardMode = "pregame" | "live" | "intermission" | "final-available" | "final-pending";

/**
 * Everything a card needs from MoneyPuck, through the shared cache (one fetch per part no matter how many cards ask).
 * `enabled` is the card's visibility, so cards outside the viewport load nothing. The games part is only requested when
 * the game is over (it is what decides "available" vs "pending"); shots only when the game is available and `wantShots`.
 */
export function useGameMoneyPuck(game: Game, { enabled, wantShots = false, wantGames = false }: { enabled: boolean; wantShots?: boolean; wantGames?: boolean }) {
  const over = ["OFF", "FINAL"].includes(game.state);
  const summary = useMoneyPuck(game.season, "summary", { enabled });
  const games = useMoneyPuck(game.season, "games", { enabled: enabled && (over || wantGames) });
  const mode: CardMode = useMemo(() => {
    if (over && games.state !== "ready") return "final-pending"; // not known yet: never claims availability
    return cardMode(game, games.data) as CardMode;
  }, [game.state, game.id, game.intermission, games.data, games.state, over]);
  const available = mode === "final-available";
  const shots = useGameShots(game.season, game.id, enabled && available && wantShots);
  const gameLog = available ? games.data?.games?.[game.id] ?? null : null;
  return { summary, games, shots, mode, gameLog, gamesLoading: over && games.state === "loading" };
}
