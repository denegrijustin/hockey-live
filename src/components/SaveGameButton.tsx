import type { Game } from "../types";
import { useSavedGames } from "../hooks/useSavedGames";
import { isLive, isUpcoming } from "../lib/game-data.mjs";
import { Icon } from "./icons";
import "../saved-games.css";

/** Save / remove a game (kept on this device). Names are the teams' full names so the accessible name reads "Save game Chicago Blackhawks at Edmonton Oilers". */
export function SaveGameButton({ game, awayName, homeName, labeled }: { game: Game; awayName: string; homeName: string; labeled?: boolean }) {
  const { has, toggle } = useSavedGames();
  const on = has(game.id);
  if (!on && !isLive(game) && !isUpcoming(game)) return null; // finished and called-off games are not offered (a saved one can still be removed)
  return (
    <button
      type="button"
      className={`save-game${on ? " on" : ""}${labeled ? " labeled" : ""}`}
      aria-pressed={on}
      aria-label={`${on ? "Remove saved game" : "Save game"} ${awayName} at ${homeName}`}
      title={on ? "Saved on this device" : "Save this game (kept on this device)"}
      onClick={(e) => { e.stopPropagation(); toggle(game); }}
    >
      <Icon name="bookmark" size={18} />
      {labeled && <span aria-hidden="true">{on ? "Saved" : "Save game"}</span>}
    </button>
  );
}
