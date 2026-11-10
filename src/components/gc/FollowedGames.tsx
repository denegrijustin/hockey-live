import { useMemo } from "react";
import type { Game } from "../../types";
import { useSavedGames } from "../../hooks/useSavedGames";
import { gameStatus } from "../../lib/game-status.mjs";
import { isLive, isUpcoming } from "../../lib/game-data.mjs";
import { openGame } from "../../lib/open-game";
import { useFeed } from "../../lib/polling";
import { usePrefs } from "../../lib/prefs.ts";
import { Icon } from "../icons";
import "../../saved-games.css";
import "./followed-games.css";

/**
 * Followed games switcher (Phase 5, Agent 7): one compact, scrollable row inside the Game Center listing the day's games the person follows
 * (saved games, "followed games" and saved games are the same thing, plus games involving a favorite team) with score and status, so a
 * second game is one tap away. Choosing one calls openGame(id), the single entry point the Game Center already listens to.
 * Hidden when fewer than two followed games exist that day.
 *
 * Props (for Agent 1, who places it): `games` = the day's scoreboard rows (the same `Game[]` Scoreboard already holds; any day, live or not);
 * `currentId` = the open game (defaults to none, so pass useGameCenter().game.id). Without `games` it reads the shared /api/live feed (same
 * cache as the app's own poll, no extra request), which only covers today's games.
 */
export default function FollowedGames({ games, currentId }: { games?: Game[]; currentId?: number }) {
  const prefs = usePrefs();
  const live = useFeed<{ games?: Game[] }>(games ? null : "/api/live", 30000);
  const list = games ?? live.data?.games ?? [];
  const followed = useMemo(() => {
    const fav = new Set(prefs.favorites);
    const saved = new Set(prefs.games.map((g) => g.id));
    return list
      .filter((g) => saved.has(g.id) || fav.has(g.home) || fav.has(g.away))
      .sort((a, b) => String(a.start ?? "").localeCompare(String(b.start ?? "")) || a.id - b.id);
  }, [list, prefs.favorites, prefs.games]);
  if (followed.length < 2) return null;
  return (
    <nav className="gc-followed" aria-label="Followed games" data-testid="gc-followed">
      <ul>
        {followed.map((g) => {
          const st = gameStatus(g);
          const has = g.awayScore != null && g.homeScore != null && !st.upcoming;
          const current = g.id === currentId;
          return (
            <li key={g.id}>
              <button type="button" className="gc-followed-item" data-testid="gc-followed-item" data-game-id={g.id} data-live={isLive(g) || undefined} aria-current={current ? "true" : undefined} aria-label={`${current ? "Current game: " : "Switch to "}${st.aria}`} onClick={() => { if (!current) openGame(g.id); }}>
                <span className="gc-followed-teams">{g.away}{has ? ` ${g.awayScore}` : ""}<span aria-hidden="true"> at </span>{g.home}{has ? ` ${g.homeScore}` : ""}</span>
                <span className="gc-followed-status">{st.label}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * "Follow game" toggle for the Game Center header actions row (Agent 1 places it). Same semantics as SaveGameButton (a followed game is a
 * saved game, kept on this device, and alerts follow it): the accessible name is "Follow game ..." / "Unfollow game ...".
 * Offered for live and upcoming games; a finished game can only be unfollowed.
 */
export function GameFollowBadge({ game, awayName, homeName }: { game: Game; awayName?: string; homeName?: string }) {
  const { has, toggle } = useSavedGames();
  const on = has(game.id);
  if (!on && !isLive(game) && !isUpcoming(game)) return null;
  const label = `${awayName ?? game.away} at ${homeName ?? game.home}`;
  return (
    <button type="button" className={`save-game labeled${on ? " on" : ""}`} data-testid="gc-follow-game" aria-pressed={on} aria-label={`${on ? "Unfollow game" : "Follow game"} ${label}`} title={on ? "Followed on this device; alerts follow it when on" : "Follow this game (kept on this device)"} onClick={() => toggle(game)}>
      <Icon name="bookmark" size={18} />
      <span aria-hidden="true">{on ? "Following" : "Follow"}</span>
    </button>
  );
}
