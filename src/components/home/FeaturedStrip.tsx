import type { ReactNode } from "react";
import type { Game, Team } from "../../types";
import { GameCardView } from "../GameCardView";
import { HomeSection } from "./HomeSection";

/** "In 12 min" / "Puck drop now" when the game starts within the hour, else nothing (the card then shows the local start time). */
export function whenLabel(g: Game, now: number) {
  const ms = Date.parse(g.start) - now;
  if (!(ms <= 3_600_000)) return undefined;
  const m = Math.round(ms / 60_000);
  return m < 2 ? "Puck drop now" : `In ${m} min`;
}

/** The best upcoming games of the selected day, as tiles. Each says why (the one-line insight) when there is a true reason. */
export function FeaturedStrip({ games, teamOf, now, ranksFor, insightFor, onOpen }: {
  games: Game[];
  teamOf: (id: string) => Team;
  now: number;
  ranksFor: ((id: number) => Record<string, any> | null | undefined) | null;
  insightFor: (g: Game) => ReactNode;
  onOpen: (g: Game) => void;
}) {
  if (!games.length) return null;
  return (
    <HomeSection id="featured" label="Worth watching" className="featured">
      <ul className="home-tiles">
        {games.map((g) => (
          <li key={g.id}>
            <GameCardView variant="tile" game={g} away={teamOf(g.away)} home={teamOf(g.home)} ranks={ranksFor?.(g.id)} whenLabel={whenLabel(g, now)} insight={insightFor(g)} onOpen={onOpen} />
          </li>
        ))}
      </ul>
    </HomeSection>
  );
}
