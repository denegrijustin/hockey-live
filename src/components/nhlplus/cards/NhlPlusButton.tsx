import type { Game, Team } from "../../../types";
import { openNhlPlus } from "../../../lib/nhlplus-nav";

/** Opens the NHL+ matchup view for this game. Never part of the card's expand button; `before` runs first (the Game Center closes itself). */
export function NhlPlusButton({ game, away, home, before, className = "" }: { game: Game; away: Team; home: Team; before?: () => void; className?: string }) {
  return (
    <button type="button" className={`nhlp-btn ${className}`.trim()} aria-label={`Open ${away.name} at ${home.name} in NHL+ matchups`} title="Open the NHL+ matchup view"
      onClick={(e) => { e.stopPropagation(); before?.(); openNhlPlus({ view: "matchups", away: away.id, home: home.id, gameId: game.id }); }}>
      NHL+ <span aria-hidden="true">›</span>
    </button>
  );
}
