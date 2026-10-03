import { lazy, memo, Suspense, useState } from "react";
import type { Game, Team } from "../types";
import {
  finished,
  recordBeforeGame,
  seasonSeriesBeforeGame,
} from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { GameData } from "./GameData";
import { NetworkLogos } from "./NetworkLogos";
// These two only render inside a collapsed <details> panel once a visitor
// opens it, so they're loaded on demand instead of shipping in every
// card's initial bundle (there can be dozens of cards on one page).
const PlayerImpact = lazy(() =>
  import("./PlayerImpact").then((m) => ({ default: m.PlayerImpact })),
);
const EdgeStats = lazy(() =>
  import("./EdgeStats").then((m) => ({ default: m.EdgeStats })),
);
const GameOverlay = lazy(() =>
  import("./GameOverlay").then((m) => ({ default: m.GameOverlay })),
);
export const GameCard = memo(function GameCard({
  game,
  teams,
  analysis,
  before,
  sourceSeason,
  baseline,
  allGames,
  playoff,
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
  const past = finished(game),
    live = isLive(game),
    [impactOpen, setImpactOpen] = useState(false),
    [edgeOpen, setEdgeOpen] = useState(false),
    [overlayOpen, setOverlayOpen] = useState(false),
    [detailLevel, setDetailLevel] = useState<0 | 1>(0);
  const home = teams.find((t) => t.id === game.home)!,
    away = teams.find((t) => t.id === game.away)!;
  const records = {
    [away.id]: recordBeforeGame(allGames, game, away.id),
    [home.id]: recordBeforeGame(allGames, game, home.id),
  };
  const series = seasonSeriesBeforeGame(allGames, game);
  const seriesText =
    series.played === 0
      ? "First meeting"
      : series.away === series.home
        ? `Tied ${series.away}–${series.home}`
        : series.away > series.home
          ? `${away.id} leads ${series.away}–${series.home}`
          : `${home.id} leads ${series.home}–${series.away}`;
  const rank =
    analysis.rank == null
      ? "Unranked"
      : `${analysis.tied ? "T" : ""}#${analysis.rank}`;
  const broadcasts = [...new Set(game.broadcasts)];
  const scoreClass =
    analysis.score >= 75 ? "high" : analysis.score >= 50 ? "medium" : "low";
  const day = new Date(game.start);
  return (
    <article style={{background: `linear-gradient(135deg, color-mix(in srgb, ${home.cardColor ?? home.color} 23%, #09141d), #0e1b25)`}} className={`game-card ${scoreClass} ${live ? "live-card" : ""} detail-level-${detailLevel}`}>
      <button
        type="button"
        className="game-card-summary"
        aria-expanded={detailLevel > 0}
        aria-label={`${away.name} at ${home.name}. ${detailLevel === 0 ? "Show expanded details" : "Matchup summary"}`}
        onClick={() => detailLevel === 0 && setDetailLevel(1)}
      >
      <div className="game-card-top">
        <span className="game-date">
          {day.toLocaleDateString("en-US", {
            weekday: "short",
            month: "short",
            day: "numeric",
          })}{" "}
          ·{" "}
          {past
            ? `FINAL${game.end !== "REG" ? " / " + game.end : ""}`
            : live
              ? `LIVE · ${game.periodType === "OT" ? "OT" : `P${game.period ?? "—"}`} · ${game.intermission ? "Intermission" : (game.clock ?? "Updating")}`
              : day.toLocaleTimeString("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZoneName: "short",
                })}
        </span>
        <span className="tv-network">
          <NetworkLogos broadcasts={broadcasts} />
        </span>
      </div>
      <div className="matchup">
        <div className="matchup-teams">
          {[away, home].map((t, i) => (
            <div className="matchup-team" key={t.id}>
              <img src={`/logos/${t.id}.svg`} alt="" loading="lazy"
                width={40}
                height={40} />
              <div>
                <span>{t.city}</span>
                <h3>{t.short}</h3>
                <small className="team-record">
                  {records[t.id].w}–{records[t.id].l}–{records[t.id].ot}
                  <em>{Math.round(playoff[t.id]?.chance ?? 50)}% playoffs</em>
                </small>
              </div>
              {past || live ? (
                <b>{(i === 0 ? game.awayScore : game.homeScore) ?? "—"}</b>
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
      <div className="season-series" aria-label={`Head-to-head this season: ${seriesText}`}>
        <span>H2H THIS SEASON</span>
        <strong>{seriesText}</strong>
      </div>
      {detailLevel === 0 && <span className="card-stage-hint">Expand <b>⌄</b></span>}
      </button>
      {detailLevel >= 1 && (
      <>
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
      <GameData
        game={game}
        home={home}
        away={away}
        before={before}
        baseline={baseline}
      />
      </>
      )}
      {detailLevel === 1 && (
      <>
      <button
        type="button"
        className="expand-game"
        onClick={() => setOverlayOpen(true)}
      >
        ⤢ Open full game view <span>Ice time · player tracker · momentum</span>
      </button>
      {overlayOpen && (
        <Suspense fallback={null}>
          <GameOverlay
            game={game}
            home={home}
            away={away}
            before={before}
            baseline={baseline}
            sourceSeason={sourceSeason}
            analysis={analysis}
            onClose={() => setOverlayOpen(false)}
          />
        </Suspense>
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
              : "Outlook uses current standings and calendar weight."}{" "}
            {analysis.rank == null
              ? "Preseason is unranked."
              : `${rank} of ${analysis.total} ${past ? "past" : "upcoming"} games. Equal ratings share ranks.`}
          </p>
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
        onToggle={(e) => setEdgeOpen(e.currentTarget.open)}
      >
        <summary>
          NHL EDGE · team comparison <span>+</span>
        </summary>
        {edgeOpen && (
          <Suspense fallback={<div className="detail-body loading">Loading NHL EDGE…</div>}>
            <div className="detail-body">
              <EdgeStats team={away} season={game.season} />
              <EdgeStats team={home} season={game.season} />
            </div>
          </Suspense>
        )}
      </details>
      <details
        className="card-details"
        onToggle={(e) => setImpactOpen(e.currentTarget.open)}
      >
        <summary>
          {live
            ? "Player impact · live"
            : past
              ? "Player impact · actual"
              : "Player impact · season context"}
          <span>+</span>
        </summary>
        {impactOpen && (
          <Suspense fallback={<div className="detail-body loading">Loading player contributions…</div>}>
            <div className="detail-body">
              <PlayerImpact game={game} sourceSeason={sourceSeason} />
            </div>
          </Suspense>
        )}
      </details>
      <button type="button" className="card-collapse" onClick={() => setDetailLevel(0)}>
        Collapse game card
      </button>
      </>
      )}
    </article>
  );
});
