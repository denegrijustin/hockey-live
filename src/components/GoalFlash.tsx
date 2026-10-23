import { useEffect, useRef, useState } from "react";
import type { Game, GameFeed, Team } from "../types";
import { isLive } from "../lib/game-data.mjs";
import { TeamLogo } from "./TeamLogo";

/** How long the goal celebration stays up. */
export const GOAL_FLASH_MS = 5000;

/** Which side just scored: the live score of a game in play went up since the last reading. Not on first sight of a game. */
export function useGoalFlash(game: Game) {
  const prev = useRef({ a: game.awayScore, h: game.homeScore });
  const [flash, setFlash] = useState<{ side: "away" | "home"; key: number } | null>(null);
  useEffect(() => {
    const p = prev.current;
    const a = game.awayScore, h = game.homeScore;
    prev.current = { a, h };
    if (!isLive(game)) return;
    const da = a != null && p.a != null ? a - p.a : 0;
    const dh = h != null && p.h != null ? h - p.h : 0;
    if (da <= 0 && dh <= 0) return;
    setFlash({ side: dh >= da ? "home" : "away", key: Date.now() });
    const t = setTimeout(() => setFlash(null), GOAL_FLASH_MS);
    return () => clearTimeout(t);
  }, [game.awayScore, game.homeScore]); // eslint-disable-line react-hooks/exhaustive-deps
  return flash;
}

/**
 * A goal on a small card: the goal light flashes, a puck goes into the net, "GOAL!" pops up with the team, the scorer (once the feed has him)
 * and the new score. It stays for five seconds. Without motion it is the same banner, still.
 */
export function GoalFlash({ flash, game, away, home, feed }: { flash: { side: "away" | "home"; key: number } | null; game: Game; away: Team; home: Team; feed: GameFeed | null }) {
  if (!flash) return null;
  const team = flash.side === "home" ? home : away;
  const goals = feed?.goals ?? [];
  const goal = [...goals].reverse().find((g) => g.team === team.id);
  const color = team.cardColor ?? team.color;
  return (
    <div className="goal-flash" key={flash.key} role="status" aria-live="polite" data-side={flash.side} data-testid="goal-flash" style={{ "--gf": color } as React.CSSProperties}>
      <div className="gf-stage">
        {/* the puck goes into the net... */}
        <svg className="gf-net" viewBox="0 0 120 52" aria-hidden="true">
          <path className="gf-mesh" d="M70 14h40v34H70zM70 22h40M70 30h40M70 38h40M78 14v34M86 14v34M94 14v34M102 14v34" />
          <path className="gf-post" d="M70 48V14h40v34" />
          <g className="gf-puck"><ellipse cx="0" cy="31" rx="5" ry="2.6" /><path d="M-30 31h-8M-24 28h-10M-24 34h-10" /></g>
        </svg>
        {/* ...and the net gives way to the red goal light, its beams circling, with GOAL going round it from the back to the front */}
        <div className="gf-lamp-wrap" aria-hidden="true">
          <div className="gf-orbit">
            {[0, 1, 2].map((i) => <span key={i} className="gf-word" style={{ "--i": i } as React.CSSProperties}>GOAL</span>)}
          </div>
          <div className="gf-beams" />
          <svg className="gf-lamp" viewBox="0 0 46 46">
            <rect className="gf-base" x="9" y="31" width="28" height="9" rx="2" />
            <path className="gf-dome-glass" d="M11 31a12 15 0 0 1 24 0z" />
            <ellipse cx="18" cy="21" rx="3" ry="5" fill="rgb(255 255 255 / 45%)" />
          </svg>
        </div>
      </div>
      <div className="gf-text">
        <b className="sr-only">GOAL!</b>
        <span className="gf-team"><TeamLogo id={team.id} size={22} /> {team.city} {team.short}{goal?.player ? ` · ${goal.player}` : ""}</span>
        <em className="gf-score">{away.id} {game.awayScore ?? 0} – {game.homeScore ?? 0} {home.id}</em>
      </div>
    </div>
  );
}
