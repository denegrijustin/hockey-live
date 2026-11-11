import type { Game, GameFeed } from "../types";
import { useGameFeedData } from "../lib/use-game-feed";
import { Projection } from "./Projection";
import { isLive } from "../lib/game-data.mjs";
import { useVisible } from "./GameData";

export function CompactGameProjection({ game, before, baseline }: { game: Game; before: any; baseline: any }) {
  const { ref, visible } = useVisible();
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data, error } = useGameFeedData(visible && played ? game : null);
  return <div ref={ref} className="compact-projection"><Projection game={game} before={before} baseline={baseline} feed={data} error={error} /></div>;
}

