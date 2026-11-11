import { useRef } from "react";
import type { Game, GameFeed, Team } from "../../../types";
import type { CardNhlPlusState } from "./CardNhlPlus";
import { PregameExpanded } from "./PregameExpanded";
import { ChanceFlowChart } from "./ChanceFlowChart";
import { isPlayoff, isShootout, SHOOTOUT_NOTE } from "./logic.mjs";

/** Expanded card: aligned season comparisons, then the chance-flow chart for completed games in the download. */
export function CardExpanded({ game, away, home, nhl, feed }: { game: Game; away: Team; home: Team; nhl: CardNhlPlusState; feed: GameFeed | null }) {
  const { mp } = nhl;
  const shots = mp.shots.data?.shots;
  // the card's feed hook drops its data while the top of the card is off screen; keep the last penalties we saw
  const kept = useRef<GameFeed | null>(null);
  if (feed) kept.current = feed;
  const plays = (feed ?? kept.current)?.plays;
  return (
    <div className="nhlp-card-expanded">
      <PregameExpanded game={game} away={away} home={home} summary={mp.summary} games={mp.games} />
      {mp.mode === "final-available" && shots && (
        <>
          <ChanceFlowChart shots={shots} away={away} home={home} playoff={isPlayoff(game)} periods={mp.gameLog?.periods ?? 3} plays={plays} playsState={plays ? "ready" : "loading"} compact />
          {isShootout(game) && <p className="nhlp-note">{SHOOTOUT_NOTE}</p>}
        </>
      )}
    </div>
  );
}
