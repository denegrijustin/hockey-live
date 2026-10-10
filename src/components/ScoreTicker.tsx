import { lazy, Suspense, useMemo, useState } from "react";
import type { Game, Team } from "../types";
import { finished, seasonSeriesBeforeGame } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { teamRanks } from "../lib/ranks.mjs";
import { tickerSlate, tickerStatus } from "../lib/ticker.mjs";
const GameOverlay = lazy(() => import("./GameOverlay").then((m) => ({ default: m.GameOverlay })));

const localDay = (d = new Date()) => d.toLocaleDateString("en-CA");

const statusOf = (g: Game) => tickerStatus(g);

/** The day's games (see tickerSlate), recomputed when the schedule or the live scores change. */
function useSlate(games: Game[], day: string | null | undefined) {
  return useMemo(() => tickerSlate(games, day || localDay()) as { date: string; items: Game[] }, [games, day]);
}

type Props = {
  games: Game[];
  teams: Team[];
  /** The NHL's current scoreboard date, when the live feed has told us. */
  day?: string | null;
  analysis: { before: Record<number, any>; analysis: Record<number, any> } | null;
  baselineFor: (g: Game) => any;
  sourceSeason: number;
};

/**
 * A persistent strip across the top of the page that scrolls through the day's games, live, upcoming and final.
 * Each one opens its Game Center. It stops while pointed at or focused (and on request), and doesn't move for
 * visitors who ask for reduced motion, who can scroll it by hand instead.
 */
export function ScoreTicker({ games, teams, day, analysis, baselineFor, sourceSeason }: Props) {
  const { date, items } = useSlate(games, day);
  const [paused, setPaused] = useState(false);
  const [open, setOpen] = useState<Game | null>(null);
  const byId = useMemo(() => new Map(teams.map((t) => [t.id, t])), [teams]);
  const list = items.filter((g) => byId.has(g.home) && byId.has(g.away));
  if (!list.length) return null;

  const isToday = date === (day || localDay());
  const label = isToday ? "TODAY" : new Date(`${date}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }).toUpperCase();
  const home = open ? byId.get(open.home)! : null;
  const away = open ? byId.get(open.away)! : null;

  const item = (g: Game, hidden = false) => {
    const h = byId.get(g.home)!;
    const a = byId.get(g.away)!;
    const done = finished(g);
    const live = isLive(g);
    const showScore = done || live;
    const winner = done && g.homeScore != null && g.awayScore != null && g.homeScore !== g.awayScore ? (g.awayScore > g.homeScore ? "away" : "home") : null;
    const status = statusOf(g);
    return (
      <li key={`${hidden ? "dup-" : ""}${g.id}`} aria-hidden={hidden || undefined} className={hidden ? "ticker-dup" : undefined}>
        <button
          type="button"
          className={`ticker-item${live ? " is-live" : ""}`}
          tabIndex={hidden ? -1 : undefined}
          onClick={() => setOpen(g)}
          aria-label={`${a.name} ${showScore ? g.awayScore : ""} at ${h.name} ${showScore ? g.homeScore : ""}, ${status.toLowerCase()}. Open the Game Center.`.replace(/\s+/g, " ")}
        >
          <span className={`ticker-team${winner === "away" ? " won" : winner === "home" ? " lost" : ""}`}>
            <img src={`/logos/${a.id}.svg`} alt="" width="16" height="16" loading="lazy" decoding="async" />
            {a.id} {showScore && <b>{g.awayScore ?? 0}</b>}
          </span>
          <span className="ticker-at">{showScore ? "–" : "@"}</span>
          <span className={`ticker-team${winner === "home" ? " won" : winner === "away" ? " lost" : ""}`}>
            <img src={`/logos/${h.id}.svg`} alt="" width="16" height="16" loading="lazy" decoding="async" />
            {h.id} {showScore && <b>{g.homeScore ?? 0}</b>}
          </span>
          <span className="ticker-final">{status}</span>
        </button>
      </li>
    );
  };

  return (
    <>
      <section className={`ticker${paused ? " paused" : ""}`} aria-label="Today's games">
        <span className="ticker-title">{label}</span>
        <div className="ticker-viewport">
          <ul className="ticker-track" style={{ ["--ticker-dur" as string]: `${list.length * 5}s` }}>
            {list.map((g) => item(g))}
            {/* A second copy makes the loop seamless; it is hidden from assistive tech and the tab order. */}
            {list.map((g) => item(g, true))}
          </ul>
        </div>
        <button type="button" className="ticker-pause" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? "Play" : "Pause"}
        </button>
      </section>
      {open && analysis && home && away && (
        <Suspense fallback={null}>
          <GameOverlay
            game={open}
            home={home}
            away={away}
            before={analysis.before[open.id]}
            baseline={baselineFor(open)}
            ranks={teamRanks(analysis.before[open.id], teams)}
            sourceSeason={sourceSeason}
            analysis={analysis.analysis[open.id]}
            allGames={games}
            series={seasonSeriesBeforeGame(games, open)}
            onClose={() => setOpen(null)}
          />
        </Suspense>
      )}
    </>
  );
}
