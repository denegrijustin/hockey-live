// The Oilers' wins get a splash on the game card. Pure: whether a game is a finished Edmonton win.
import { gameStatus } from "./game-status.mjs";

export const SPLASH_TEAM = "EDM";

/** Is this a finished game that Edmonton won (in regulation, overtime or a shootout)? */
export function oilersWon(game) {
  if (!game || (game.home !== SPLASH_TEAM && game.away !== SPLASH_TEAM)) return false;
  if (!gameStatus(game).final) return false;
  const a = game.awayScore, h = game.homeScore;
  if (typeof a !== "number" || typeof h !== "number" || a === h) return false;
  return (game.home === SPLASH_TEAM) === (h > a);
}
