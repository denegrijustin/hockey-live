// A win by some teams gets a splash on the game card. Pure: which team (if any) has a finished win that carries one.
import { gameStatus } from "./game-status.mjs";

/** The teams with a win splash: the artwork (in /public) and the colour behind it. */
export const SPLASH = {
  EDM: { image: "/oilers-la-bamba.webp", bg: "#06183a" }, // Play La Bamba
  MIN: { image: "/wild-lets-go-crazy.webp", bg: "#022f12" }, // Let's Go Crazy!
};

/** The team id whose finished win (regulation, overtime or a shootout) carries a splash, else null. */
export function splashWinner(game) {
  if (!game || !gameStatus(game).final) return null;
  const a = game.awayScore, h = game.homeScore;
  if (typeof a !== "number" || typeof h !== "number" || a === h) return null;
  const winner = h > a ? game.home : game.away;
  return SPLASH[winner] ? winner : null;
}

/** Is this a finished Edmonton win? */
export const oilersWon = (game) => splashWinner(game) === "EDM";
