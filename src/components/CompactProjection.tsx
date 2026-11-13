import { useMemo, useRef } from "react";
import type { Game, Team } from "../types";
import { useGameFeedData } from "../lib/use-game-feed";
import { projectGame, elapsedMinutes } from "../lib/projection.mjs";
import { winHistory } from "../lib/win-history.mjs";
import { isLive } from "../lib/game-data.mjs";
import { useVisible } from "./GameData";
import { WinChart } from "./WinChart";

/** The expanded card's projection: the win-chance chart (see WinChart), with the history replayed from the play-by-play once the game is on. */
export function CompactGameProjection({ game, before, baseline, home, away }: { game: Game; before: any; baseline: any; home: Team; away: Team }) {
  const { ref, visible } = useVisible();
  const played = ["LIVE", "CRIT", "OFF", "FINAL"].includes(game.state);
  const { data } = useGameFeedData(visible && played ? game : null);
  const p = projectGame(game, before, baseline, data);
  const fresh = useMemo(() => (data ? winHistory(game, before, baseline, data) : []), [game, before, baseline, data]);
  // the card's feed drops its data while the card is off screen: keep the last line we drew rather than blanking it
  const kept = useRef<typeof fresh>([]);
  if (fresh.length) kept.current = fresh;
  const history = fresh.length ? fresh : kept.current;
  if (!p) return <div ref={ref} className="compact-projection" />;
  const now = p.live ? elapsedMinutes(data && isLive(data) ? data : game) ?? 0 : 0;
  const label = p.live ? "Model win chance now (score, time, shots)" : "Pregame win chance (model)";
  return <div ref={ref} className="compact-projection"><WinChart home={home} away={away} pHome={p.homeWin} live={p.live} history={history} now={now} score={p.score} label={label} /></div>;
}
