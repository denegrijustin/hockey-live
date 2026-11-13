import type { Game, GameFeed, Team } from "../types";
import { CardExpanded } from "./nhlplus/cards/CardExpanded";
import type { CardNhlPlusState } from "./nhlplus/cards/CardNhlPlus";
import { CompactGameProjection } from "./CompactProjection";
import { GoalieComparison } from "./TeamComparison";
import { GameInjuries } from "./GameInjuries";

/**
 * The expanded half of a game card, laid out as a board of panels (season profile, projection, goalies, injuries) that sit side by side when the card has the room,
 * so most of it is in view at once. A lazy chunk: nothing here is needed until a card is opened.
 */
export default function GameCardExpanded({ game, away, home, nhl, feed, before, baseline, summary }: {
  game: Game; away: Team; home: Team; nhl: CardNhlPlusState; feed: GameFeed | null; before: any; baseline: any; summary: string;
}) {
  return (
    <div className="cx-board">
      <div className="cx-panel cx-prof"><CardExpanded game={game} away={away} home={home} nhl={nhl} feed={feed} /></div>
      <div className="cx-panel cx-proj">
        <div className="why-watch"><span>WHY IT MATTERS</span><p>{summary}</p></div>
        <CompactGameProjection game={game} before={before} baseline={baseline} />
      </div>
      <div className="cx-panel cx-goal"><GoalieComparison game={game} away={away} home={home} lean /></div>
      <div className="cx-panel cx-inj"><GameInjuries away={away} home={home} season={game.season} /></div>
    </div>
  );
}
