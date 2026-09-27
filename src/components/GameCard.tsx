import { memo, useState } from "react";
import type { Game, Team } from "../types";
import { scenario, finished, signed } from "../lib/model.mjs";
import { PlayerImpact } from "./PlayerImpact";
export const GameCard = memo(function GameCard({
  game,
  teams,
  analysis,
  before,
  selected,
  sourceSeason,
  allGames,
}: {
  game: Game;
  teams: Team[];
  analysis: any;
  before: any;
  selected: string[];
  sourceSeason: number;
  allGames: Game[];
}) {
  const past = finished(game);
  const [perspective, setPerspective] = useState(
    selected.includes(game.away) && !selected.includes(game.home)
      ? game.away
      : game.home,
  );
  const [impactOpen, setImpactOpen] = useState(false);
  const home = teams.find((t) => t.id === game.home)!,
    away = teams.find((t) => t.id === game.away)!;
  const rank =
    analysis.rank == null
      ? "Unranked"
      : `${analysis.tied ? "T" : ""}#${analysis.rank}`;
  const scoreClass =
    analysis.score >= 75 ? "high" : analysis.score >= 50 ? "medium" : "low";
  const day = new Date(game.start);
  const series = allGames.filter(
    (g) =>
      g.type === 3 &&
      finished(g) &&
      g.date < game.date &&
      ((g.home === game.home && g.away === game.away) ||
        (g.home === game.away && g.away === game.home)),
  );
  const wins = (id: string) =>
    series.filter((g) =>
      g.home === id ? g.homeScore! > g.awayScore! : g.awayScore! > g.homeScore!,
    ).length;
  const opponent = perspective === game.home ? game.away : game.home;
  return (
    <article className={`game-card ${scoreClass}`}>
      <div className="game-card-top">
        <span className="game-date">
          {day.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}{" "}
          <span>
            ·{" "}
            {past
              ? `FINAL${game.end !== "REG" ? " / " + game.end : ""}`
              : game.state === "LIVE" || game.state === "CRIT"
                ? "IN PROGRESS"
                : day.toLocaleTimeString("en-US", {
                    hour: "numeric",
                    minute: "2-digit",
                    timeZoneName: "short",
                  })}
          </span>
        </span>
        <span
          className="cohort-rank"
          title={`League-wide ${past ? "past" : "upcoming"} ranking`}
        >
          {rank} <span>{past ? "PAST" : "FUTURE"}</span>
        </span>
      </div>
      <div className="matchup">
        <div className="matchup-teams">
          {[away, home].map((t, i) => (
            <div className="matchup-team" key={t.id}>
              <img src={`/logos/${t.id}.svg`} alt="" width="40" height="40" loading="lazy" decoding="async" />
              <div>
                <span>{t.city}</span>
                <h3>{t.short}</h3>
              </div>
              {past ? (
                <b
                  className={
                    ((i === 0 ? game.awayScore : game.homeScore) ?? 0) >
                    ((i === 0 ? game.homeScore : game.awayScore) ?? 0)
                      ? "winning-score"
                      : ""
                  }
                >
                  {i === 0 ? game.awayScore : game.homeScore}
                </b>
              ) : (
                <small>{i === 0 ? "AWAY" : "HOME"}</small>
              )}
            </div>
          ))}
        </div>
        <div className="importance-score">
          <strong>{analysis.score}</strong>
          <span>IMPORTANCE</span>
          <small>/ 100</small>
        </div>
      </div>
      <div className="stakes-line">
        <i />
        {analysis.kind} ·{" "}
        {analysis.score >= 75
          ? "High stakes"
          : analysis.score >= 50
            ? "Worth circling"
            : game.type === 1
              ? "Roster evaluation"
              : "Building the season"}
      </div>
      <div className="perspective" role="group" aria-label="Scenario team">
        <span>IF…</span>
        {[away, home].map((t) => (
          <button
            aria-pressed={perspective === t.id}
            key={t.id}
            onClick={() => setPerspective(t.id)}
          >
            {t.id}
          </button>
        ))}
        <small>{past ? "prior-day points" : "current points"}</small>
      </div>
      {game.type === 2 ? (
        <div className="scenario-grid">
          {(["win", "loss", "otl"] as const).map((outcome) => {
            const s = scenario(before, game, perspective, outcome, teams);
            return (
              <div key={outcome} className={`scenario ${outcome}`}>
                <span>
                  {outcome === "win"
                    ? "REG WIN"
                    : outcome === "loss"
                      ? "REG LOSS"
                      : "OT LOSS"}
                </span>
                <strong>
                  {s.points}
                  <small> pts</small>
                </strong>
                <p>
                  {s.rank.tied ? "T" : ""}#{s.rank.rank} in conference
                </p>
                <small>{signed(s.gap)} vs entry line</small>
              </div>
            );
          })}
        </div>
      ) : game.type === 1 ? (
        <p className="no-stakes">
          Exhibition result: no standings points or playoff-position change.
          Evaluate line combinations and player contributions.
        </p>
      ) : (
        <div className="playoff-scenarios">
          <p>
            <b>If {perspective} wins:</b> series {wins(perspective) + 1}–
            {wins(opponent)}
            {wins(perspective) + 1 >= 4 ? " · advances" : ""}.
          </p>
          <p>
            <b>If {perspective} loses:</b> series {wins(perspective)}–
            {wins(opponent) + 1}
            {wins(opponent) + 1 >= 4 ? " · eliminated" : ""}.
          </p>
        </div>
      )}
      <details className="card-details">
        <summary>
          Why this game matters <span>+</span>
        </summary>
        <div className="detail-body">
          <ul>
            {analysis.reasons.map((r: string) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
          <p className="detail-note">
            {past
              ? "Ranked using standings before this game day."
              : "Outlook uses today’s standings. Later games receive more calendar weight, not predicted future standings."}{" "}
            {rank} of {analysis.total} {past ? "past" : "upcoming"} games. Equal
            ratings share ranks.
          </p>
          {game.type === 2 && (
            <p className="detail-note">
              A regulation win earns {perspective} 2 points and gives {opponent}{" "}
              0. A regulation loss reverses that. An OT loss still earns{" "}
              {perspective} 1. These are isolated scenarios, not playoff odds;
              points ties and other results can change official positions.
            </p>
          )}
          <p className="broadcast-info">
            ▣{" "}
            {game.broadcasts.length
              ? [...new Set(game.broadcasts)].join(" · ")
              : "TV assignments not published in the NHL feed."}
          </p>
          <p className="detail-note">
            {game.venue} · Regional restrictions may apply.
          </p>
          <a
            href={`https://www.nhl.com/gamecenter/${game.id}`}
            target="_blank"
            rel="noreferrer"
          >
            NHL game center ↗
          </a>
        </div>
      </details>
      <details
        className="card-details"
        onToggle={(e) => setImpactOpen(e.currentTarget.open)}
      >
        <summary>
          {past ? "Player impact · actual" : "Player impact · season context"}
          <span>+</span>
        </summary>
        {impactOpen && (
          <div className="detail-body">
            <PlayerImpact game={game} sourceSeason={sourceSeason} />
          </div>
        )}
      </details>
    </article>
  );
});
