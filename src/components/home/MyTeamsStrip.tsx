import { useMemo, useState, type ReactNode } from "react";
import type { Game, Team } from "../../types";
import { isLive } from "../../lib/game-data.mjs";
import { localTime } from "../../lib/game-status.mjs";
import { sideOf, teamGames } from "../../lib/team-schedule.mjs";
import { dayDiff } from "../../lib/dates.mjs";
import { GameCardView } from "../GameCardView";
import { TeamLogo } from "../TeamLogo";
import { HomeSection } from "./HomeSection";
import "./home-personal.css";

const PHONE_CAP = 3;

/** "today 7:00 PM", "tomorrow 7:00 PM" or "Thu, Nov 12 7:00 PM", in the viewer's clock. */
function whenOf(start: string, daysAway: number | null) {
  const t = localTime(start);
  if (daysAway === 0) return `today ${t}`;
  if (daysAway === 1) return `tomorrow ${t}`;
  return `${new Date(start).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} ${t}`;
}

interface Props {
  favorites: string[];
  teams: Team[];
  table: any;
  games: Game[];
  /** The selected day's games, favorite-team games included. */
  dayGames: Game[];
  today: string;
  teamOf: (id: string) => Team;
  ranksFor: ((id: number) => Record<string, any> | null | undefined) | null;
  /** The full card used for a live game, so a live favorite behaves exactly like one in the Live section. */
  renderLive: (g: Game) => ReactNode;
  onOpen: (g: Game) => void;
  phone: boolean;
  density: string;
}

/**
 * My Teams: one card per favorite team with its record, streak, last five, standing, and its game on the selected day (live first),
 * else when it plays next. A game between two favorites is shown once, under the first.
 */
export default function MyTeamsStrip({ favorites, teams, table, games, dayGames, today, teamOf, ranksFor, renderLive, onOpen, phone, density }: Props) {
  const [all, setAll] = useState(false);
  const cards = useMemo(() => {
    const placed = new Set<number>();
    const out = favorites.filter((id) => teams.some((t) => t.id === id)).map((id, order) => {
      const mine = dayGames.filter((g) => g.home === id || g.away === id).sort((a, b) => Number(isLive(b)) - Number(isLive(a)));
      const game = mine.find((g) => !placed.has(g.id)) ?? null;
      const shownAbove = !game && mine[0] ? mine[0] : null;
      if (game) placed.add(game.id);
      const n = teamGames(games, id).map((g: Game) => sideOf(g, id)).find((i: any) => i.status === "upcoming") ?? null;
      return { id, order, game, shownAbove, next: n && { ...n, daysAway: n.date ? dayDiff(today, n.date) : null } };
    });
    // Live first, then a game that day, then the order the favorites were added.
    return out.sort((a, b) => Number(!!b.game && isLive(b.game)) - Number(!!a.game && isLive(a.game)) || Number(!!b.game) - Number(!!a.game) || a.order - b.order);
  }, [favorites, teams, table, games, dayGames, today]);
  if (!cards.length) return null;
  const capped = phone && !all && cards.length > PHONE_CAP;
  const shown = capped ? cards.slice(0, PHONE_CAP) : cards;

  return (
    <HomeSection id="myteams" label="My teams" count={cards.length} className={`mt-section density-${density}`}>
      <ul className="mt-list">
        {shown.map(({ id, game, shownAbove, next }) => {
          return (
            <li key={id} className="mt-card" data-team={id}>
              <span className="sr-only">{teamOf(id).name} ({id})</span>
              {game ? (
                isLive(game) ? <div className="mt-game mt-live">{renderLive(game)}</div> : (
                  <div className="mt-game">
                    <GameCardView variant="compact" game={game} away={teamOf(game.away)} home={teamOf(game.home)} ranks={ranksFor?.(game.id)} onOpen={onOpen} />
                  </div>
                )
              ) : shownAbove ? (
                <p className="mt-next"><TeamLogo id={id} size={20} /> Plays {teamOf(shownAbove.home === id ? shownAbove.away : shownAbove.home).short} (the game is shown above)</p>
              ) : next ? (
                <p className="mt-next"><TeamLogo id={id} size={20} /> Next: {next.home ? "vs" : "at"} {teamOf(next.opp).short} <span>{whenOf(next.start, next.daysAway)}</span></p>
              ) : <p className="mt-next"><TeamLogo id={id} size={20} /> No upcoming game on the schedule</p>}
            </li>
          );
        })}
      </ul>
      {phone && cards.length > PHONE_CAP && (
        <button type="button" className="sb-browse mt-all" aria-expanded={all} onClick={() => setAll(!all)}>{all ? "Show fewer" : `See all ${cards.length} teams`}</button>
      )}
    </HomeSection>
  );
}
