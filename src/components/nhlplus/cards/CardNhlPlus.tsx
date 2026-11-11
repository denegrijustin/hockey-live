import "../shared/shared.css";
import "./nhlplus-cards.css";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Game, GameFeed, Team } from "../../../types";
import { useGameMoneyPuck } from "./useGameMoneyPuck";
import { PregameStrip } from "./PregameStrip";
import { InGameProfile } from "./InGameProfile";

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
