import "../shared/shared.css";
import "./nhlplus-cards.css";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Game, GameFeed, Team } from "../../../types";
import { useGameMoneyPuck } from "./useGameMoneyPuck";
import { PregameStrip } from "./PregameStrip";
import { PregameExpanded } from "./PregameExpanded";
import { InGameProfile } from "./InGameProfile";
import { ChanceFlowChart } from "./ChanceFlowChart";
import { isPlayoff, isShootout, SHOOTOUT_NOTE } from "./logic.mjs";

/** Latches true once the card has been near the viewport, so nothing is requested for cards nobody has scrolled to. */
export function useSeen(ref: RefObject<HTMLElement | null>) {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, seen]);
  return seen;
}

export type CardNhlPlusState = ReturnType<typeof useCardNhlPlus>;
export function useCardNhlPlus(game: Game, cardRef: RefObject<HTMLElement | null>, expanded: boolean) {
  const seen = useSeen(cardRef);
  const mp = useGameMoneyPuck(game, { enabled: seen, wantShots: true, wantGames: expanded });
  return { seen, mp };
}

/** Compact card: the current-game block (finished games), then the season profile strip. */
export function CardStrip({ game, away, home, nhl, expanded = false }: { game: Game; away: Team; home: Team; nhl: CardNhlPlusState; expanded?: boolean }) {
  if (!nhl.seen) return null;
  const { mp } = nhl;
  return (
    <div className="nhlp-card" data-testid="nhlp-card" data-mode={mp.mode}>
      <InGameProfile game={game} away={away} home={home} mode={mp.mode} gameLog={mp.gameLog} shots={mp.shots.data?.shots ?? null}
        updated={mp.games.updated} stale={mp.games.stale} savedCopy={mp.games.savedCopy} state={mp.gamesLoading ? "loading" : mp.games.state} />
      {!expanded && <PregameStrip game={game} away={away} home={home} summary={mp.summary} />}
    </div>
  );
}

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
