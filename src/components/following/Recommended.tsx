import { useMemo } from "react";
import type { Game, Team } from "../../types";
import { usePrefs } from "../../lib/prefs.ts";
import { hasContext, rankGames } from "../../lib/relevance.mjs";
import { teamRanks } from "../../lib/ranks.mjs";
import { openGame } from "../../lib/open-game";
import { GameCardView } from "../GameCardView";
import "../../saved-games.css";

/**
 * "Recommended for you": the live and upcoming games that matter most to this viewer (favorites, followed players' teams, saved games),
 * each with the facts that put it here. It only appears when there is such context; everyone else keeps the league-wide lists.
 */
export default function Recommended({ games, teams, analysis, baseline, baselineTable, sim, limit = 3 }: {
  games: Game[]; teams: Team[]; analysis: any; baseline?: any; baselineTable?: any; sim?: any; limit?: number;
}) {
  const prefs = usePrefs();
  const ctx = useMemo(() => ({
    favorites: prefs.favorites,
    followedTeams: [...new Set((prefs.players as { team: string }[]).map((p) => p.team).filter(Boolean))],
    saved: (prefs.games as { id: number }[]).map((g) => g.id),
    teams, analysis, allGames: games, sim,
    baselineFor: (g: Game) => (baseline && baseline.season < g.season ? baselineTable : undefined),
  }), [prefs.favorites, prefs.players, prefs.games, teams, analysis, games, sim, baseline, baselineTable]);
  const ranked = useMemo(() => (hasContext(ctx) ? rankGames(games, ctx, { horizonDays: 7, limit }).filter((r) => r.explanation) : []), [games, ctx, limit]);
  if (!ranked.length) return null;
  const teamOf = (id: string) => teams.find((t) => t.id === id);
  return (
    <section className="rec" aria-label="Recommended for you" data-testid="recommended">
      <h2>Recommended for you</h2>
      <ul>
        {ranked.map(({ game: g, explanation }) => {
          const away = teamOf(g.away), home = teamOf(g.home);
          if (!away || !home) return null;
          return (
            <li key={g.id} data-game-id={g.id}>
              <GameCardView
                variant="compact" game={g} away={away} home={home} ranks={analysis?.before?.[g.id] ? teamRanks(analysis.before[g.id], teams) : null}
                onOpen={() => openGame(g.id)}
                insight={<p className="rec-why" data-testid="rec-why">{explanation}</p>}
              />
            </li>
          );
        })}
      </ul>
      <p className="rec-note">Based on your teams and saved games, kept on this device. Everything else is still below.</p>
    </section>
  );
}
