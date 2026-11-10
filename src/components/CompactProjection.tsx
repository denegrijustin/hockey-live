import type { Game, GameFeed } from "../types";
import { useFeed } from "../lib/polling";
import { Projection } from "./Projection";
import { isLive } from "../lib/game-data.mjs";
import { useVisible } from "./GameData";

export function CompactGameProjection({ game, before, baseline }: { game: Game; before: any; baseline: any }) {
  const { ref, visible } = useVisible();
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data, error } = useFeed<GameFeed>(
    visible && played ? `/api/game/${game.id}?score=${game.awayScore ?? "x"}-${game.homeScore ?? "x"}` : null,
    isLive(game) ? 30000 : 3600000,
  );
  return <div ref={ref} className="compact-projection"><Projection game={game} before={before} baseline={baseline} feed={data} error={error} /></div>;
}

