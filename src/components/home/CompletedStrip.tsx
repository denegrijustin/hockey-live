import type { Game, Team } from "../../types";
import { GameCardView } from "../GameCardView";
import { HomeSection } from "./HomeSection";

/** The day's finished games as compact cards in a grid: both scores, F / F/OT / F/SO and an UPSET tag. A card opens the Game Center. */
export function CompletedStrip({ games, teamOf, ranksFor, upsetOf, onOpen }: {
  games: Game[];
  teamOf: (id: string) => Team;
  ranksFor: ((id: number) => Record<string, any> | null | undefined) | null;
  /** The winner's pregame chance when it was an upset, else null/undefined. */
  upsetOf: (g: Game) => number | null | undefined;
  onOpen: (g: Game) => void;
}) {
  return (
    <HomeSection id="completed" label="Completed" count={games.length} className="completed sb-done">
      <div data-testid="sb-done">
        <ul>
          {games.map((g) => {
            const upset = upsetOf(g);
            return (
              <li key={g.id} data-game-id={g.id} data-upset={upset != null ? "1" : "0"}>
                <GameCardView variant="compact" game={g} away={teamOf(g.away)} home={teamOf(g.home)} ranks={ranksFor?.(g.id)} rating={{ upsetWon: upset ?? null }} onOpen={onOpen} />
              </li>
            );
          })}
        </ul>
      </div>
    </HomeSection>
  );
}
