import type { Game, GameFeed, Team } from "../types";
import { CardExpanded } from "./nhlplus/cards/CardExpanded";
import type { CardNhlPlusState } from "./nhlplus/cards/CardNhlPlus";
import { CompactGameProjection } from "./CompactProjection";
import { GoalieComparison } from "./TeamComparison";
import { GameInjuries } from "./GameInjuries";

/** The expanded half of a game card. A lazy chunk: nothing here is needed until a card is opened. */
export default function GameCardExpanded({ game, away, home, nhl, feed, before, baseline, summary, onCollapse }: {
  game: Game; away: Team; home: Team; nhl: CardNhlPlusState; feed: GameFeed | null; before: any; baseline: any; summary: string; onCollapse: () => void;
}) {
  return (
    <>
      <CardExpanded game={game} away={away} home={home} nhl={nhl} feed={feed} />
      <div className="why-watch"><span>WHY IT MATTERS</span><p>{summary}</p></div>
      <CompactGameProjection game={game} before={before} baseline={baseline} />
      <GoalieComparison game={game} away={away} home={home} compact />
      <GameInjuries away={away} home={home} season={game.season} />
      <button type="button" className="card-collapse" onClick={onCollapse}>Collapse game card</button>
    </>
  );
}
