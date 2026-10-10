import { useEffect, useMemo, useState } from "react";
import type { Game, LeagueMatchupSnapshot, MatchupGoalie, RankedMatchupMetric, Team } from "../types";
import { crossoverRows, rankBadge } from "../lib/matchup-data.mjs";
import { finished } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { loadBox } from "../lib/api";
import { useLeagueMatchups } from "./useLeagueMatchups";
import "./team-comparison.css";

const seasonLabel = (season: number) => `${String(season).slice(0, 4)}–${String(season).slice(6)}`;
const displayValue = (metric: RankedMatchupMetric | null) => {
  if (!metric || metric.value == null) return "Unavailable";
  if (metric.unit === "%") return `${(metric.value * 100).toFixed(1)}%`;
  return metric.value.toFixed(2);
};
const displayRank = (metric: RankedMatchupMetric | null) =>
  !metric || metric.rank == null ? "Rank unavailable" : `${metric.tied ? "T" : ""}#${metric.rank} of ${metric.pool}`;

function Badge({ metric }: { metric: RankedMatchupMetric | null }) {
  const badge = rankBadge(metric);
  return badge ? <span className={`rank-badge ${badge.tone}`}>{badge.label}</span> : null;
}

function RankGap({ offense, defense }: { offense: RankedMatchupMetric | null; defense: RankedMatchupMetric | null }) {
  if (offense?.rank == null || defense?.rank == null)
    return <span className="rank-gap neutral">Rank comparison unavailable</span>;
  const gap = Math.abs(offense.rank - defense.rank);
  if (gap <= 5) return <span className="rank-gap neutral">◆ within 5 rank places</span>;
  return offense.rank < defense.rank
    ? <span className="rank-gap stronger-left">← {gap} rank places</span>
    : <span className="rank-gap stronger-right">{gap} rank places →</span>;
}

function Crossover({ offenseTeam, defenseTeam, snapshot }: {
  offenseTeam: Team;
  defenseTeam: Team;
  snapshot: LeagueMatchupSnapshot;
}) {
  const offense = snapshot.teams[offenseTeam.id];
  const defense = snapshot.teams[defenseTeam.id];
  const rows = crossoverRows(offense, defense);
  return (
    <section className="crossover" aria-label={`${offenseTeam.name} offense versus ${defenseTeam.name} defense`}>
      <header className="crossover-head">
        <div><img src={`/logos/${offenseTeam.id}.svg`} alt="" /><strong>{offenseTeam.short} offense</strong></div>
        <span>rank comparison</span>
        <div><strong>{defenseTeam.short} defense</strong><img src={`/logos/${defenseTeam.id}.svg`} alt="" /></div>
      </header>
      {rows.map(({ key, offense: offenseMetric, defense: defenseMetric }) => (
        <div className="crossover-row" key={key} data-metric={key}>
          <div className="metric-side metric-offense">
            <b>{displayValue(offenseMetric)}</b>
            <small>{offenseMetric?.label ?? "Unavailable"} · {offenseMetric?.unit ?? ""}</small>
            <span>{displayRank(offenseMetric)}</span>
            <Badge metric={offenseMetric} />
          </div>
          <div className="metric-gap">
            <strong>{offenseMetric?.label?.replace(" scored", "") ?? "Metric"}</strong>
            <RankGap offense={offenseMetric} defense={defenseMetric} />
          </div>
          <div className="metric-side metric-defense">
            <b>{displayValue(defenseMetric)}</b>
            <small>{defenseMetric?.label ?? "Unavailable"} · {defenseMetric?.unit ?? ""}</small>
            <span>{displayRank(defenseMetric)}</span>
            <Badge metric={defenseMetric} />
          </div>
        </div>
      ))}
    </section>
  );
}

export function TeamComparison({ away, home, season }: {
  away: Team;
  home: Team;
  season: number;
  table?: any;
  ranks?: any;
  title?: string;
}) {
  const { data, error } = useLeagueMatchups(season);
  const [swapped, setSwapped] = useState(false);
  const [teamA, teamB] = swapped ? [home, away] : [away, home];
  if (!data) return <div className="cmp matchup-comparison"><p className="cmp-note">{error || "Loading full-league matchup data…"}</p></div>;
  return (
    <div className="cmp matchup-comparison" aria-label={`${away.name} versus ${home.name} matchup comparison`}>
      <div className="comparison-title">
        <div><p className="eyebrow">CROSSOVER ENGINE</p><h3>{teamA.short} vs. {teamB.short}</h3></div>
        <button type="button" className="swap-teams" onClick={() => setSwapped((value) => !value)}>⇄ Swap sides</button>
      </div>
      <Crossover offenseTeam={teamA} defenseTeam={teamB} snapshot={data} />
      <Crossover offenseTeam={teamB} defenseTeam={teamA} snapshot={data} />
      <p className="cmp-note comparison-source">
        Rank comparisons, not predictions. Shared ranks use unrounded values across {data.poolSize} eligible teams. Higher is better except goals and shots allowed.
        <br />Source: {data.source} · {seasonLabel(data.season)} · updated {new Date(data.updatedAt).toLocaleString()}{data.stale ? " · saved snapshot (live refresh unavailable)" : ""}
      </p>
    </div>
  );
}

function goalieForTeam(goalies: MatchupGoalie[], actualId?: number) {
  return goalies.find((goalie) => goalie.id === actualId) ?? goalies[0] ?? null;
}

function GoalieCard({ team, goalie, status }: { team: Team; goalie: MatchupGoalie | null; status: string }) {
  return (
    <article className="goalie-card">
      <div className="goalie-heading"><img src={`/logos/${team.id}.svg`} alt="" /><span>{team.short}</span><em>{status}</em></div>
      {goalie ? <>
        <div className="goalie-person"><img src={goalie.headshot} alt="" loading="lazy" decoding="async" /><div><strong>{goalie.name}</strong><small>{goalie.gamesStarted} starts · {goalie.wins}–{goalie.losses}</small></div></div>
        <div className="goalie-numbers"><span><b>{goalie.savePct == null ? "—" : goalie.savePct.toFixed(3).replace(/^0/, "")}</b>SV%</span><span><b>{goalie.gaa == null ? "—" : goalie.gaa.toFixed(2)}</b>GAA</span></div>
      </> : <p className="cmp-note">Starter and goalie statistics unavailable.</p>}
    </article>
  );
}

export function GoalieComparison({ game, away, home, compact = false }: { game: Game; away: Team; home: Team; compact?: boolean }) {
  const { data, error } = useLeagueMatchups(game.season);
  const [actual, setActual] = useState<Record<string, number>>({});
  const played = finished(game) || isLive(game);
  useEffect(() => {
    if (!played) return;
    let active = true;
    loadBox(game.id).then((box) => {
      if (!active) return;
      setActual(Object.fromEntries(box.players.filter((player) => player.position === "G" && player.shotsAgainst != null).map((player) => [player.team, player.id])));
    }).catch(() => {});
    return () => { active = false; };
  }, [game.id, played]);
  const cards = useMemo(() => [away, home].map((team) => ({
    team,
    goalie: goalieForTeam(data?.teams[team.id]?.goalies ?? [], actual[team.id]),
    status: actual[team.id] ? "Confirmed starter" : data?.teams[team.id]?.goalies?.length ? "Projected from season starts" : "Starter unknown",
  })), [away, home, data, actual]);
  if (compact) return (
    <div className="lineup-brief" aria-label="Goalie and lineup news">
      <strong>Goalie watch</strong>
      <span>{cards.map(({ team, goalie, status }) => `${team.id}: ${goalie?.name ?? "unknown"} (${status.toLowerCase()})`).join(" · ")}</span>
      <small>NHL’s public feed does not confirm pregame injuries or line combinations.</small>
    </div>
  );
  return (
    <section className="goalie-comparison" aria-label="Starting goalie comparison">
      <div className="mini-heading">STARTING GOALIES <span>Official when available</span></div>
      <div className="goalie-grid">{cards.map((card) => <GoalieCard key={card.team.id} {...card} />)}</div>
      <p className="cmp-note">{error || "Pregame status is projected from season starts until the NHL box score identifies the starter. Recent-form and individual-rest data are not available reliably in the official summary report."}</p>
    </section>
  );
}
