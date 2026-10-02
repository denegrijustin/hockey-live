import { Suspense, lazy, useLayoutEffect, useRef } from "react";
import type { Game, Team } from "../types";
import { finished } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { GameData } from "./GameData";
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
  onClose,
}: {
  game: Game;
  home: Team;
  away: Team;
  before: any;
  baseline: any;
  sourceSeason: number;
  analysis: any;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pageScroll = useRef(0);
  const past = finished(game),
    live = isLive(game);
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
      <GameData game={game} home={home} away={away} before={before} baseline={baseline} />
      <Suspense fallback={<p className="loading" role="status">Loading player tracker…</p>}>
        <PlayerTracker game={game} home={home} away={away} sourceSeason={sourceSeason} />
      </Suspense>
    </dialog>
  );
}
