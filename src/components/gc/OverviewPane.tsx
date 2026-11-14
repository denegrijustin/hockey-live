import { Suspense, lazy } from "react";
import type { Team } from "../../types";
import { finished } from "../../lib/model.mjs";
import { useGameCenter } from "./GameCenterContext";
import { useGameCenterUi } from "./GameCenterUi";
import { goalsOf, periodLabel } from "./gcFormat";
import FollowedGames from "./FollowedGames";
import { TeamLogo } from "../TeamLogo";
import { Icon, type IconName } from "../icons";
import type { Game } from "../../types";

const MomentumPane = lazy(() => import("./MomentumPane"));

/** A feed stat id as a label and an icon for the key-stats table. */
const statKind = (label: string): { label: string; icon: IconName } => {
  if (/hit/i.test(label)) return { label: "Hits", icon: "hand" };
  if (/block/i.test(label)) return { label: "Blocked Shots", icon: "shield" };
  if (/give/i.test(label)) return { label: "Giveaways", icon: "gift" };
  if (/take/i.test(label)) return { label: "Takeaways", icon: "swap" };
  return { label: label.replace(/[-_]/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()), icon: "bars" };
};

/**
 * Overview: where the game stands, the latest goals and penalties (links into Play-by-Play), the scoring summary
 * by period, a few team stats and links to the other panes. Everything is read from useGameCenter(); nothing is
 * fetched or invented, and a block with no data is simply not shown.
 */
export default function OverviewPane({ home, away, dayGames }: { home: Team; away: Team; /** The scoreboard rows of this game's day, for the followed-games switcher. */ dayGames?: Game[] }) {
  const { game, feed, plays, live } = useGameCenter();
  const { goTab } = useGameCenterUi();
  const src = feed ?? game;
  const past = finished(src);
  const goals = goalsOf(feed, plays).filter((g) => g.periodType !== "SO");
  const recent = plays.filter((p) => p.type === "goal" || p.type === "penalty").slice(-5).reverse();
  const sit = feed?.situation;
  const pp = sit && (sit.homePowerPlay || sit.awayPowerPlay) ? `${sit.homePowerPlay ? home.id : away.id} power play${sit.seconds ? `, ${Math.floor(sit.seconds / 60)}:${String(sit.seconds % 60).padStart(2, "0")} left` : ""}` : null;
  const keyStats = (feed?.stats ?? []).filter((s) => /shot|hit|face|power|takeaway|giveaway|block/i.test(s.label)).slice(0, 4);
  const periods = [...new Set(goals.map((g) => g.period))];
  const teamName = (id: string | null) => (id === home.id ? home.id : id === away.id ? away.id : (id ?? ""));
  return (
    <div className="gc-overview" data-testid="gc-overview">
      <section className="gc-card" aria-label="Current situation" data-testid="gc-situation">
        <h4>{past ? "Result" : live ? "Right now" : "Game status"}</h4>
        <p>
          {past
            ? `Final${src.end !== "REG" ? "/" + src.end : ""}: ${away.id} ${src.awayScore ?? "—"}, ${home.id} ${src.homeScore ?? "—"}`
            : live
              ? `${away.id} ${src.awayScore ?? 0}, ${home.id} ${src.homeScore ?? 0} · ${src.intermission ? `Intermission after ${periodLabel(src.period, src.periodType)}` : `${periodLabel(src.period, src.periodType)} period${src.clock ? `, ${src.clock} left` : ""}`}`
              : "Not started. Pre-game information is in the Team Stats, Players and Matchup Intelligence tabs."}
          {pp ? ` · ${pp}` : ""}
        </p>
        {(src.awayShots != null && src.homeShots != null) && (
          <div className="gx-sog" role="group" aria-label={`Shots on goal: ${away.id} ${src.awayShots}, ${home.id} ${src.homeShots}`}>
            <small>Shots on goal</small>
            <div><TeamLogo id={away.id} size={40} /><b>{src.awayShots}</b><i aria-hidden="true" /><b>{src.homeShots}</b><TeamLogo id={home.id} size={40} /></div>
          </div>
        )}
      </section>
      {recent.length > 0 && (
        <section className="gc-card" aria-label="Recent goals and penalties" data-testid="gc-recent">
          <h4>Recent goals and penalties</h4>
          <ul className="gc-events">
            {recent.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => goTab("pbp", p.id)} aria-label={`${p.type === "goal" ? "Goal" : "Penalty"} ${teamName(p.team)} ${periodLabel(p.period, p.periodType)} ${p.time}, open in Play-by-Play`}>
                  <b>{p.type === "goal" ? "Goal" : "Penalty"}</b> {teamName(p.team)}{p.player ? ` · ${p.player}` : ""}{p.type === "penalty" && p.penalty ? ` · ${p.penalty}${p.duration ? ` (${p.duration} min)` : ""}` : ""}
                  <span>{periodLabel(p.period, p.periodType)} {p.time}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {goals.length > 0 && (
        <section className="gc-card" aria-label="Scoring summary" data-testid="gc-scoring">
          <h4>Scoring summary</h4>
          {periods.map((period) => (
            <div key={period} className="gc-scoring-period">
              <h5>{periodLabel(period, goals.find((g) => g.period === period)?.periodType)} period</h5>
              <ul>
                {goals.filter((g) => g.period === period).map((g) => (
                  <li key={g.id}>
                    <b>{teamName(g.team)}</b> {g.player ?? "Goal"}{g.assists.length ? ` (${g.assists.map((a) => a.name).join(", ")})` : ""}
                    <span>{g.time}{g.score ? ` · ${away.id} ${g.score.away}, ${home.id} ${g.score.home}` : ""}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}
      {keyStats.length > 0 && (
        <section className="gc-card" aria-label="Key team stats" data-testid="gc-keystats">
          <h4>Key team stats</h4>
          <table className="gx-stats">
            <thead><tr><th scope="col"><span className="sr-only">Stat</span></th><th scope="col"><span className="sr-only">Stat name</span></th><th scope="col" className="gx-chip a"><TeamLogo id={away.id} size={20} />{away.id}</th><th scope="col" className="gx-chip h"><TeamLogo id={home.id} size={20} />{home.id}</th></tr></thead>
            <tbody>
              {keyStats.map((s) => { const k = statKind(s.label); return (<tr key={s.label}><td className="gx-ico"><Icon name={k.icon} size={22} /></td><th scope="row">{k.label}</th><td>{s.away}</td><td>{s.home}</td></tr>); })}
            </tbody>
          </table>
          <button type="button" className="gc-link gx-all" onClick={() => goTab("stats")}>All team stats</button>
        </section>
      )}
      <nav className="gc-links" aria-label="More on this game">
        <button type="button" className="gc-link" onClick={() => goTab("players")}><Icon name="star" size={20} />Notable performers</button>
        <button type="button" className="gc-link" onClick={() => goTab("pbp")}><Icon name="play" size={20} />Full play-by-play</button>
        <button type="button" className="gc-link" onClick={() => goTab("intel")}><Icon name="bars" size={20} />Matchup intelligence</button>
      </nav>
      <Suspense fallback={null}><MomentumPane /></Suspense>
      <FollowedGames games={dayGames} currentId={game.id} />
    </div>
  );
}
