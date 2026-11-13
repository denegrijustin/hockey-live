import { useEffect, useMemo, useState } from "react";
import type { Game, LeagueMatchupSnapshot, MatchupGoalie, RankedMatchupMetric, Team } from "../types";
import { crossoverRows, rankBadge } from "../lib/matchup-data.mjs";
import { finished } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { loadBox } from "../lib/api";
import { useLeagueMatchups } from "./useLeagueMatchups";
import "./team-comparison.css";
import { TeamLogo } from "./TeamLogo";
import { Versus } from "./Versus";
import { gaugeColors } from "../lib/kits";
import "./gauge.css";

const seasonLabel = (season: number) => `${String(season).slice(0, 4)}–${String(season).slice(6)}`;
const displayValue = (metric: RankedMatchupMetric | null) => {
  if (!metric || metric.value == null) return "Unavailable";
  if (metric.unit === "%") return `${(metric.value * 100).toFixed(1)}%`;
  return metric.value.toFixed(2);
};
/** A two-sided number in the head-to-head look; `span` is the gap that swings the bar all the way for rates. */
function SplitRow({ label, away, home, awayId, homeId, span, lowerBetter, format }: { label: string; away: number; home: number; awayId: string; homeId: string; span: number; lowerBetter?: boolean; format: (v: number) => string }) {
  const share = Math.min(0.95, Math.max(0.05, 0.5 + ((away - home) / span / 2) * (lowerBetter ? -1 : 1)));
  const lead = Math.abs(share - 0.5) < 0.02 ? "even" : share > 0.5 ? "away" : "home";
  return (
    <div className="split-row" data-leader={lead} role="img" aria-label={`${label}: ${awayId} ${format(away)}, ${homeId} ${format(home)}`}>
      <Versus away={{ id: awayId, big: format(away) }} home={{ id: homeId, big: format(home) }} share={share} label={label} />
    </div>
  );
}

/** One row of the rank comparison: the offense's league rank against the defense's, big at the sides, a bar split by the rank gap, "+N RANKS" on the split. */
function CrossRow({ offense, defense, offenseTeam, defenseTeam }: { offense: RankedMatchupMetric | null; defense: RankedMatchupMetric | null; offenseTeam: Team; defenseTeam: Team }) {
  const gap = offense?.rank != null && defense?.rank != null ? defense.rank - offense.rank : null; // positive: the offense is ranked better
  const pool = Math.max(2, offense?.pool ?? defense?.pool ?? 32);
  const share = gap == null || Math.abs(gap) <= 0 ? 0.5 : 0.5 + (Math.sign(gap) * 0.47 * Math.min(1, Math.abs(gap) / (pool - 1)));
  const side = (m: RankedMatchupMetric | null, team: Team, role: string) => {
    const tier = rankBadge(m);
    return { id: team.id, big: m?.rank == null ? "—" : `${m.tied ? "T" : ""}#${m.rank}`, sub: <>{m?.label ?? "Unavailable"} ({role})<br />{displayValue(m)}</>, tier: tier as { tone: "good" | "bad"; label: string } | null };
  };
  return <Versus away={side(offense, offenseTeam, "Offense")} home={side(defense, defenseTeam, "Defense")} share={share} label={offense?.label?.replace(" scored", "").replace(" / Game", "") ?? "Metric"} />;
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
        <div><TeamLogo id={offenseTeam.id} /><strong>{offenseTeam.short} offense</strong></div>
        <span>rank comparison</span>
        <div><strong>{defenseTeam.short} defense</strong><TeamLogo id={defenseTeam.id} /></div>
      </header>
      {rows.map(({ key, offense: offenseMetric, defense: defenseMetric }) => (
        <div className="crossover-row" key={key} data-metric={key}>
          <CrossRow offense={offenseMetric} defense={defenseMetric} offenseTeam={offenseTeam} defenseTeam={defenseTeam} />
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
        <div><p className="eyebrow">CROSSOVER ENGINE</p><h3>{teamA.short} offense vs. {teamB.short} defense</h3></div>
        <button type="button" className="swap-teams" aria-label={`Swap sides: show ${teamB.short} offense vs. ${teamA.short} defense`} title={`Show ${teamB.short} offense vs. ${teamA.short} defense`} onClick={() => setSwapped((value) => !value)}>⇄ Swap sides</button>
      </div>
      <Crossover offenseTeam={teamA} defenseTeam={teamB} snapshot={data} />
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
      <div className="goalie-heading"><TeamLogo id={team.id} /><span>{team.short}</span><em>{status}</em></div>
      {goalie ? <>
        <div className="goalie-person"><img src={goalie.headshot} alt="" loading="lazy" decoding="async" /><div><strong>{goalie.name}</strong><small>{goalie.gamesStarted} starts · {goalie.wins}–{goalie.losses}</small></div></div>
        <div className="goalie-numbers"><span><b>{goalie.savePct == null ? "—" : goalie.savePct.toFixed(3).replace(/^0/, "")}</b>SV%</span><span><b>{goalie.gaa == null ? "—" : goalie.gaa.toFixed(2)}</b>GAA</span></div>
      </> : <p className="cmp-note">Starter and goalie statistics unavailable.</p>}
    </article>
  );
}


export function GoalieComparison({ game, away, home, compact = false, lean = false }: { game: Game; away: Team; home: Team; compact?: boolean; /** Cards and gauges only, no explanatory note. */ lean?: boolean }) {
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
      {cards[0].goalie && cards[1].goalie && (
        <div className="goalie-gauges">
          {cards[0].goalie.savePct != null && cards[1].goalie.savePct != null && <SplitRow label="Save percentage" away={cards[0].goalie.savePct} home={cards[1].goalie.savePct} awayId={away.id} homeId={home.id} span={0.04} format={(v) => v.toFixed(3).replace(/^0/, "")} />}
          {cards[0].goalie.gaa != null && cards[1].goalie.gaa != null && <SplitRow label="Goals against average" away={cards[0].goalie.gaa} home={cards[1].goalie.gaa} awayId={away.id} homeId={home.id} span={1.5} lowerBetter format={(v) => v.toFixed(2)} />}
        </div>
      )}
      {!lean && <p className="cmp-note">{error || "Pregame status is projected from season starts until the NHL box score identifies the starter. Recent-form and individual-rest data are not available reliably in the official summary report."}</p>}
    </section>
  );
}
