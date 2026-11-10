import { Suspense, lazy } from "react";
import type { Team } from "../../types";
import { finished } from "../../lib/model.mjs";
import { useGameCenter } from "./GameCenterContext";
import { useGameCenterUi } from "./GameCenterUi";
import { goalsOf, periodLabel } from "./gcFormat";

const MomentumPane = lazy(() => import("./MomentumPane"));
const FollowedGames = lazy(() => import("./FollowedGames"));

/**
 * Overview: where the game stands, the latest goals and penalties (links into Play-by-Play), the scoring summary
 * by period, a few team stats and links to the other panes. Everything is read from useGameCenter(); nothing is
 * fetched or invented, and a block with no data is simply not shown.
 */
export default function OverviewPane({ home, away }: { home: Team; away: Team }) {
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
        {(src.awayShots != null && src.homeShots != null) && <p className="gc-muted">Shots on goal: {away.id} {src.awayShots}, {home.id} {src.homeShots}</p>}
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
          <dl className="gc-keystats">
            {keyStats.map((s) => (<div key={s.label}><dt>{s.label}</dt><dd>{away.id} {s.away} · {home.id} {s.home}</dd></div>))}
          </dl>
          <button type="button" className="gc-link" onClick={() => goTab("stats")}>All team stats</button>
        </section>
      )}
      <nav className="gc-links" aria-label="More on this game">
        <button type="button" className="gc-link" onClick={() => goTab("players")}>Notable performers</button>
        <button type="button" className="gc-link" onClick={() => goTab("pbp")}>Full play-by-play</button>
        <button type="button" className="gc-link" onClick={() => goTab("intel")}>Matchup intelligence</button>
      </nav>
      <Suspense fallback={null}><MomentumPane /></Suspense>
      <Suspense fallback={null}><FollowedGames /></Suspense>
    </div>
  );
}
