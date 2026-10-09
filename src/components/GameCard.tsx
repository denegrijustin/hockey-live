import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Game, Team } from "../types";
import { finished, recordBeforeGame, seasonSeriesBeforeGame } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { CompactGameFlow, CompactGameProjection } from "./GameData";
import { NetworkLogos } from "./NetworkLogos";
import { GoalieComparison } from "./TeamComparison";
import { teamRanks, rankLine, rankTitle } from "../lib/ranks.mjs";
const GameOverlay = lazy(() => import("./GameOverlay").then((m) => ({ default: m.GameOverlay })));

export const GameCard = memo(function GameCard({
  game, teams, analysis, before, sourceSeason, baseline, allGames, playoff,
}: {
  game: Game;
  teams: Team[];
  analysis: any;
  before: any;
  selected: string[];
  sourceSeason: number;
  allGames: Game[];
  baseline: any;
  playoff: any;
}) {
  const past = finished(game), live = isLive(game);
  const [expanded, setExpanded] = useState(false), [gameCenterOpen, setGameCenterOpen] = useState(false);
  const cardRef = useRef<HTMLElement>(null);
  const home = teams.find((team) => team.id === game.home)!;
  const away = teams.find((team) => team.id === game.away)!;
  const ranks = useMemo(() => teamRanks(before, teams), [before, teams]);
  const records = {
    [away.id]: recordBeforeGame(allGames, game, away.id),
    [home.id]: recordBeforeGame(allGames, game, home.id),
  };
  const series = seasonSeriesBeforeGame(allGames, game);
  const broadcasts = [...new Set(game.broadcasts)];
  const scoreClass = analysis.score >= 75 ? "high" : analysis.score >= 50 ? "medium" : "low";
  const day = new Date(game.start);
  const watchSummary = analysis.reasons?.[0] ?? (analysis.score >= 50 ? "A matchup with meaningful standings weight." : "Lower stakes, but still part of the season story.");

  useEffect(() => {
    if (!expanded || gameCenterOpen) return;
    const outside = (event: PointerEvent) => {
      if (cardRef.current && !cardRef.current.contains(event.target as Node)) setExpanded(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [expanded, gameCenterOpen]);

  const openGameCenter = () => setGameCenterOpen(true);
  return (
    <article
      ref={cardRef}
      style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${home.cardColor ?? home.color} 23%, #09141d), #0e1b25)` }}
      className={`game-card ${scoreClass} ${live ? "live-card" : ""} ${expanded ? "is-expanded" : "is-compact"}`}
    >
      <div className="game-card-top">
        <span className="game-date">
          {day.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {past
            ? `FINAL${game.end !== "REG" ? ` / ${game.end}` : ""}`
            : live
              ? `LIVE · ${game.periodType === "OT" ? "OT" : `P${game.period ?? "—"}`} · ${game.intermission ? "Intermission" : (game.clock ?? "Updating")}`
              : day.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" })}
        </span>
        <div className="card-top-actions">
          <span className="tv-network"><NetworkLogos broadcasts={broadcasts} game={game} /></span>
          <button type="button" className="gc-icon" onClick={openGameCenter} aria-label={`Open Game Center for ${away.name} at ${home.name}`} title="Open Game Center">GC</button>
        </div>
      </div>
      <button
        type="button"
        className="game-card-summary"
        aria-expanded={expanded}
        aria-label={`${away.name} at ${home.name}. ${expanded ? "Expanded details" : "Show concise preview"}`}
        onClick={() => !expanded && setExpanded(true)}
      >
        <div className="matchup">
          <div className="matchup-teams">
            {[away, home].map((team, index) => (
              <div className="matchup-team" key={team.id}>
                <img src={`/logos/${team.id}.svg`} alt="" loading="lazy" width={40} height={40} />
                <div>
                  <span>{team.city}</span><h3>{team.short}</h3>
                  <small className="team-record">
                    {records[team.id].w}–{records[team.id].l}–{records[team.id].ot}
                    <em>{Math.round(playoff[team.id]?.chance ?? 50)}% playoffs</em>
                  </small>
                  {ranks?.[team.id] && <small className="team-rank" title={rankTitle(ranks[team.id])}>{rankLine(ranks[team.id])} <em>by points %</em></small>}
                </div>
                {past || live ? <b>{(index === 0 ? game.awayScore : game.homeScore) ?? "—"}</b> : <small>{index === 0 ? "AWAY" : "HOME"}</small>}
              </div>
            ))}
          </div>
          <div className="importance-score"><strong>{analysis.score}</strong><span>WATCHABILITY</span><small>/ 100</small></div>
        </div>
        <div className="compact-meta"><span>{game.venue || "Venue unavailable"}</span><span>{broadcasts.length ? broadcasts.join(" · ") : "Broadcast TBA"}</span></div>
        {!expanded && <span className="card-stage-hint">Expand <b>⌄</b></span>}
      </button>
      {live && <CompactGameFlow game={game} home={home} away={away} />}

      {expanded && <div className="card-expanded" aria-label="Concise game preview">
        <button type="button" className="expand-game primary-game-center" onClick={openGameCenter}>Open Game Center <span>Matchup engine · goalies · players · live pulse</span></button>
        <div className="why-watch"><span>WHY WATCH</span><p>{watchSummary}</p></div>
        <CompactGameProjection game={game} before={before} baseline={baseline} />
        <GoalieComparison game={game} away={away} home={home} compact />
        <button type="button" className="card-collapse" onClick={() => setExpanded(false)}>Collapse game card</button>
      </div>}

      {gameCenterOpen && <Suspense fallback={null}>
        <GameOverlay
          game={game}
          home={home}
          away={away}
          before={before}
          baseline={baseline}
          ranks={ranks}
          sourceSeason={sourceSeason}
          analysis={analysis}
          allGames={allGames}
          series={series}
          onClose={() => setGameCenterOpen(false)}
        />
      </Suspense>}
    </article>
  );
});
