import { useEffect, useRef, useState } from "react";
import type { Game, GameFeed, Team } from "../types";
import { isLive } from "../lib/game-data.mjs";

/** How long the goal celebration stays up. */
export const GOAL_FLASH_MS = 7000;

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
 * and the new score. It stays for seven seconds. Without motion it is the same banner, still.
 */
export function GoalFlash({ flash, game, away, home, feed }: { flash: { side: "away" | "home"; key: number } | null; game: Game; away: Team; home: Team; feed: GameFeed | null }) {
  if (!flash) return null;
  const team = flash.side === "home" ? home : away;
  const goals = feed?.goals ?? [];
  const goal = [...goals].reverse().find((g) => g.team === team.id);
  const color = team.cardColor ?? team.color;
  return (
    <div className="goal-flash" key={flash.key} role="status" aria-live="polite" data-side={flash.side} data-testid="goal-flash" style={{ "--gf": color } as React.CSSProperties}>
      <svg className="gf-net" viewBox="0 0 120 52" aria-hidden="true">
        <g className="gf-lamp"><circle cx="60" cy="7" r="6" /></g>
        <path className="gf-mesh" d="M70 14h40v34H70zM70 22h40M70 30h40M70 38h40M78 14v34M86 14v34M94 14v34M102 14v34" />
        <path className="gf-post" d="M70 48V14h40v34" />
        <g className="gf-puck"><ellipse cx="0" cy="31" rx="5" ry="2.6" /><path d="M-30 31h-8M-24 28h-10M-24 34h-10" /></g>
      </svg>
      <div className="gf-text">
        <b className="gf-goal">GOAL!</b>
        <span className="gf-team"><img src={`/logos/${team.id}.svg`} alt="" width="22" height="22" /> {team.city} {team.short}{goal?.player ? ` · ${goal.player}` : ""}</span>
        <em className="gf-score">{away.id} {game.awayScore ?? 0} – {game.homeScore ?? 0} {home.id}</em>
      </div>
    </div>
  );
}
