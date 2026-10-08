import { Suspense, lazy, useLayoutEffect, useRef } from "react";
import type { Game, Team } from "../types";
import { finished } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { GameData } from "./GameData";
import { TeamComparison } from "./TeamComparison";
import { GoalieComparison } from "./TeamComparison";
const PlayerTracker = lazy(() =>
  import("./PlayerTracker").then((m) => ({ default: m.PlayerTracker })),
);
export function GameOverlay({
  game,
  home,
  away,
  before,
  baseline,
  sourceSeason,
  analysis,
  ranks,
  allGames,
  series,
  onClose,
}: {
  game: Game;
  home: Team;
  away: Team;
  before: any;
  baseline: any;
  sourceSeason: number;
  analysis: any;
  ranks?: any;
  allGames: Game[];
  series: { away: number; home: number; played: number };
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pageScroll = useRef(0);
  const past = finished(game),
    live = isLive(game);
  const previousMeetings = allGames.filter((candidate) =>
    finished(candidate) && candidate.start < game.start &&
    ((candidate.home === game.home && candidate.away === game.away) ||
      (candidate.home === game.away && candidate.away === game.home)),
  ).slice(-5).reverse();
  const restLabel = (team: string) => {
    const previous = allGames.filter((candidate) => finished(candidate) && candidate.start < game.start && (candidate.home === team || candidate.away === team)).at(-1);
    if (!previous) return "Rest unavailable";
    const days = Math.max(0, Math.round((Date.parse(game.start) - Date.parse(previous.start)) / 86400000) - 1);
    return days === 0 ? "Back-to-back" : `${days} day${days === 1 ? "" : "s"} rest`;
  };
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    pageScroll.current = window.scrollY;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    element.showModal();
    element.scrollTop = 0;
    const frame = requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "instant" });
      element.scrollTop = 0;
      closeButton.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, []);
  const closeOverlay = () => {
    const returnTo = pageScroll.current;
    onClose();
    requestAnimationFrame(() =>
      window.scrollTo({ top: returnTo, left: 0, behavior: "instant" }),
    );
  };
  return (
    <dialog
      ref={dialog}
      className="game-dialog"
      onClose={closeOverlay}
      onCancel={(event) => {
        event.preventDefault();
        closeOverlay();
      }}
      aria-label={`${away.name} at ${home.name} full game view`}
    >
      <div className="dialog-toolbar">
        <button ref={closeButton} className="dialog-close" onClick={closeOverlay} aria-label="Close full game view">
          <span>Close</span> ×
        </button>
      </div>
      <div className="dialog-matchup">
        {[away, home].map((t, i) => (
          <div className="dialog-team" key={t.id}>
            <img src={`/logos/${t.id}.svg`} alt="" width={54} height={54} />
            <div>
              <span>{t.city}</span>
              <h3>{t.short}</h3>
            </div>
            {past || live ? (
              <b>{(i === 0 ? game.awayScore : game.homeScore) ?? "—"}</b>
            ) : (
              <small>{i === 0 ? "AWAY" : "HOME"}</small>
            )}
          </div>
        ))}
      </div>
      <p className="detail-note dialog-status">
        {new Date(game.start).toLocaleDateString("en-US", {
          weekday: "long",
          month: "short",
          day: "numeric",
        })}{" "}
        ·{" "}
        {past
          ? `FINAL${game.end !== "REG" ? " / " + game.end : ""}`
          : live
            ? `LIVE · ${game.periodType === "OT" ? "OT" : `P${game.period ?? "—"}`} · ${game.intermission ? "Intermission" : (game.clock ?? "Updating")}`
            : new Date(game.start).toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                timeZoneName: "short",
              })}
        {" · "}
        {analysis.kind} · {analysis.score}/100 importance
      </p>
      <div className="game-center-actions">
        <a href={`https://www.nhl.com/gamecenter/${game.id}`} target="_blank" rel="noreferrer">Official NHL Gamecenter ↗</a>
        <span>{game.venue || "Venue unavailable"}</span>
      </div>
      <details className="game-center-section" open>
        <summary>Projection and game pulse <span>+</span></summary>
        <GameData game={game} home={home} away={away} before={before} baseline={baseline} />
      </details>
      <details className="game-center-section" open>
        <summary>Offense vs. defense <span>+</span></summary>
        <section className="dialog-comparison" aria-label="Season team comparison">
          <TeamComparison away={away} home={home} season={game.season} table={before} ranks={ranks} />
        </section>
      </details>
      <details className="game-center-section" open>
        <summary>Starting goalies <span>+</span></summary>
        <GoalieComparison game={game} away={away} home={home} />
      </details>
      <details className="game-center-section">
        <summary>Player leaders and trends <span>+</span></summary>
        <Suspense fallback={<p className="loading" role="status">Loading player tracker…</p>}>
          <PlayerTracker game={game} home={home} away={away} sourceSeason={sourceSeason} />
        </Suspense>
      </details>
      <details className="game-center-section">
        <summary>Recent meetings, rest and availability <span>+</span></summary>
        <div className="matchup-context">
          <div className="rest-grid"><span><b>{away.id}</b>{restLabel(away.id)}</span><span><b>{home.id}</b>{restLabel(home.id)}</span></div>
          <p className="detail-note">Season series entering this game: {series.played ? `${away.id} ${series.away}–${series.home} ${home.id}` : "first meeting"}.</p>
          {previousMeetings.length ? <ul>{previousMeetings.map((meeting) => <li key={meeting.id}>{meeting.date} · {meeting.away} {meeting.awayScore}–{meeting.homeScore} {meeting.home} {meeting.end !== "REG" ? `(${meeting.end})` : ""}</li>)}</ul> : <p className="detail-note">No prior meetings this season.</p>}
          <p className="availability-note">Verified injury and line-combination data are unavailable in the NHL public feed. No unverified lineup claims are shown.</p>
        </div>
      </details>
      <details className="game-center-section">
        <summary>Why this game matters <span>+</span></summary>
        <ul className="model-reasons">{analysis.reasons.map((reason: string) => <li key={reason}>{reason}</li>)}</ul>
        <p className="detail-note">These are model inputs and rank comparisons, not guarantees or isolated causal claims.</p>
      </details>
    </dialog>
  );
}
