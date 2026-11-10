import { useMemo } from "react";
import type { Game, Team } from "../../types";
import { teamSummary } from "../../lib/team-summary.mjs";
import { PageHeader } from "../PageHeader";
import { useLeagueMatchups } from "../useLeagueMatchups";
import { TeamIntel } from "../trends/TeamIntel";
import { TeamOverview } from "./TeamOverview";
import { TeamPerformance } from "./TeamPerformance";
import { TeamRoster } from "./TeamRoster";
import { TeamScheduleList } from "./TeamScheduleList";
import "./team-page.css";

/** A team's full page (?view=teams&team=EDM): overview and performance up front; roster, schedule and intelligence a tap away. */
export default function TeamPage({ teamId, teams, table, games, season, today, onBack, onNavigate }: {
  teamId: string; teams: Team[]; table: Record<string, any> | null; games: Game[]; season: number; today: string; onBack: () => void; onNavigate: (view: string) => void;
}) {
  const team = teams.find((t) => t.id === teamId);
  const { data: matchups } = useLeagueMatchups(season);
  const summary = useMemo(() => teamSummary(teamId, { teams, table, games, matchups, today }), [teamId, teams, table, games, matchups, today]);
  if (!team) return null;
  return (
    <section className="team-page" aria-label={`${team.name} team page`} data-team-page={team.id}>
      <PageHeader title={team.name} eyebrow={`${team.division.toUpperCase()} DIVISION`} back={{ label: "Teams", onClick: onBack }} />
      <div className="tpg-top">
        <TeamOverview team={team} summary={summary} />
        <TeamPerformance summary={summary} />
      </div>
      <TeamRoster teamId={team.id} season={season} />
      <TeamScheduleList teamId={team.id} games={games} onNavigate={onNavigate} />
      <details className="tpg-details tpg-intel">
        <summary><h2>Team intelligence</h2><span>Trends and context</span></summary>
        <div className="tpg-body"><TeamIntel teamId={team.id} teams={teams} table={table} games={games} matchups={matchups ?? undefined} onNavigate={onNavigate} /></div>
      </details>
      <nav className="tpg-links" aria-label={`More about ${team.name}`}>
        <h2>Explore</h2>
        <ul>
          <li><button type="button" onClick={() => onNavigate("standings")}>Standings</button></li>
          <li><button type="button" onClick={() => onNavigate("odds")}>Playoff odds</button></li>
          <li><button type="button" onClick={() => onNavigate("injuries")}>Injury report</button></li>
          <li><button type="button" onClick={() => onNavigate("teamschedule")}>Team schedule</button></li>
        </ul>
      </nav>
    </section>
  );
}
