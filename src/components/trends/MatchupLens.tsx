import { useMemo } from "react";
import type { Game, Team } from "../../types";
import { useLeagueMatchups } from "../useLeagueMatchups";
import { MIN_SAMPLE, matchupLens } from "../../lib/trends.mjs";
import "../../trends.css";

/** Game Center "matchup lens": plain-language facts about the two teams, each with the numbers and sample behind it. */
export function MatchupLens({ away, home, table, games, season }: { away: Team; home: Team; table: any; games: Game[]; season: number }) {
  const { data } = useLeagueMatchups(season);
  const lens = useMemo(() => matchupLens(away.id, home.id, table, games, { homeId: home.id, matchups: data, names: { [away.id]: away.short, [home.id]: home.short } }), [away, home, table, games, data]);
  if (!lens.value) return <p className="tr-muted" role="status">The matchup lens appears once both teams have played {MIN_SAMPLE} games.</p>;
  return (
    <section className="tr-lens" aria-label="Matchup lens">
      <ul>
        {lens.value.bullets.map((b: any) => (
          <li key={b.id} data-lens={b.id}>
            <span>{b.text}</span>
            <small>{b.sample}</small>
          </li>
        ))}
      </ul>
      <p className="tr-note">Derived from completed games and season statistics. Descriptive, not a prediction.</p>
    </section>
  );
}
