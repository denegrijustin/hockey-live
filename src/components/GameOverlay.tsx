import { Suspense, lazy, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { fmtDay, fmtTime } from "../lib/dates.mjs";
import { useTimeKey } from "../lib/display";
import type { Game, Team } from "../types";
import { finished } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { GameData } from "./GameDataPanel";
import { GameRecap, DeservedHero } from "./GameRecap";
import { Gauge } from "./Gauge";
import { modelGaugeProps } from "./Projection";
import { projectGame } from "../lib/projection.mjs";
import { TeamComparison } from "./TeamComparison";
import { GoalieComparison } from "./TeamComparison";
import { MatchupLens } from "./trends/MatchupLens";
import { GameInjuries } from "./GameInjuries";
import { GameCenterAnalytics } from "./nhlplus/cards/GameCenterAnalytics";
import { IntermissionRink } from "./IntermissionRink";
import { matchupInsights, restDays } from "../lib/insights.mjs";
import { pregameHomeWin } from "../lib/watchability.mjs";
import { InsightLine } from "./InsightLine";
import { useSheetDrag } from "../hooks/useSheetDrag";
import { TeamLogo } from "./TeamLogo";
import { SaveGameButton } from "./SaveGameButton";
import { GameCenterProvider, useGameCenter } from "./gc/GameCenterContext";
import { GameCenterUiProvider, type GcTab } from "./gc/GameCenterUi";
import { GameHeader } from "./gc/GameHeader";
import { GameTabs } from "./gc/GameTabs";
import { GameAnnouncer } from "./gc/GameAnnouncer";
import OverviewPane from "./gc/OverviewPane";
import { GameFollowBadge } from "./gc/FollowedGames";
import "./gc/game-center.css";

const PlayByPlay = lazy(() => import("./gc/PlayByPlay"));
const TeamStatsPane = lazy(() => import("./gc/TeamStatsPane"));
const PlayersPane = lazy(() => import("./gc/PlayersPane"));
const IntelPane = lazy(() => import("./gc/IntelPane"));

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
  returnTo,
  teams,
  sim,
  onNavigate,
  onClose,
  tab: routeTab,
  event: routeEvent,
  onTab,
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
  /** All teams (for the playoff line and divisions). Optional; without it the standings-line insights are skipped. */
  teams?: Team[];
  /** Playoff simulation, either chancesForCards(result, teams) or the raw result. Optional; without it no playoff-odds insight shows. */
  sim?: any;
  /** Opens an app view (a VIEW_IDS id); the overlay closes first. Without it insights show no view link. */
  onNavigate?: (view: string) => void;
  /** Where the page was scrolled when the Game Center was opened; the page returns there on close. */
  returnTo?: number;
  /** `replace` closes without going Back (another navigation follows straight away). */
  onClose: (opts?: { replace?: boolean }) => void;
  /** The tab and play-by-play event the address names (?tab=&event=), and the callback that writes a tab change back to it. */
  tab?: GcTab | null;
  event?: number | null;
  onTab?: (tab: GcTab, event?: number | null) => void;
}) {
  useTimeKey();
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const pageScroll = useRef(0);
  const [tab, setTab] = useState<GcTab>(routeTab ?? "overview");
  const [focusEvent, setFocusEvent] = useState<number | null>(routeEvent ?? null);
  useEffect(() => {
    if (routeTab) setTab(routeTab);
    setFocusEvent(routeEvent ?? null);
  }, [routeTab, routeEvent]);
  const goTab = (next: GcTab, event: number | null = null) => {
    setTab(next);
    setFocusEvent(event);
    onTab?.(next, event);
  };
  // Switching tab from far down the page brings the new pane's top into view under the sticky bars.
  const firstTab = useRef(true);
  useEffect(() => {
    if (firstTab.current) { firstTab.current = false; return; }
    const element = dialog.current, bar = element?.querySelector<HTMLElement>(".gc-tabs");
    if (!element || !bar) return;
    const top = bar.offsetTop - (element.querySelector<HTMLElement>(".dialog-toolbar")?.offsetHeight ?? 44);
    if (element.scrollTop > top) element.scrollTop = Math.max(0, top);
  }, [tab]);
  const past = finished(game),
    live = isLive(game);
  const previousMeetings = allGames.filter((candidate) =>
    finished(candidate) && candidate.start < game.start &&
    ((candidate.home === game.home && candidate.away === game.away) ||
      (candidate.home === game.away && candidate.away === game.home)),
  ).slice(-5).reverse();
  const dayGames = useMemo(() => allGames.filter((g) => g.date === game.date && g.type !== 0), [allGames, game.date]);
  const restLabel = (team: string) => {
    const days = restDays(allGames, game, team);
    if (days == null) return "Rest unavailable";
    return days === 0 ? "Back-to-back" : `${days} day${days === 1 ? "" : "s"} rest`;
  };
  const insights = useMemo(
    () => matchupInsights(game, before, before, {
      teams: teams ?? [away, home],
      allGames,
      ranks,
      sim: sim ?? null,
      pregameHome: before ? pregameHomeWin(game, before, baseline) : null,
    }),
    [game, before, baseline, teams, away, home, allGames, ranks, sim],
  );
  // The control that opened the Game Center gets focus back when it closes.
  const opener = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement && document.activeElement !== document.body ? document.activeElement : null);
  useLayoutEffect(() => {
    const element = dialog.current;
    if (!element) return;
    // The position recorded at the tap wins: the page can move between the tap and this mount.
    pageScroll.current = returnTo ?? window.scrollY;
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const drag = useSheetDrag(dialog, () => closeOverlay());
  const closeOverlay = () => {
    const returnTo = pageScroll.current;
    onClose();
    requestAnimationFrame(() => {
      window.scrollTo({ top: returnTo, left: 0, behavior: "instant" });
      // The same control if it is still on the page, else the opening game's main button.
      const back = opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>(`[data-game="${game.id}"] .sb-main`);
      back?.focus({ preventScroll: true });
    });
  };
  const node = (
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
      <div className="dialog-toolbar" {...drag}>
        <span className="sheet-grabber" aria-hidden="true" />
        <button ref={closeButton} className="dialog-close" onClick={closeOverlay} aria-label="Close full game view">
          <span className="close-full"><span>Close</span> ×</span>
          <span className="close-done">Done</span>
        </button>
      </div>
      <GameCenterProvider game={game}>
        <GameCenterUiProvider value={{ tab, focusEvent, goTab }}>
          <GameAnnouncer home={home} away={away} />
          <GameHeader home={home} away={away} />
          <p className="detail-note dialog-status">
            {fmtDay(game.start, { long: true })}{" "}
            ·{" "}
            {past
              ? `FINAL${game.end !== "REG" ? " / " + game.end : ""}`
              : live
                ? `LIVE · ${game.periodType === "OT" ? "OT" : `P${game.period ?? "—"}`} · ${game.intermission ? "Intermission" : (game.clock ?? "Updating")}`
                : fmtTime(game.start, { withZone: true })}
            {" · "}
            {analysis.kind} · {analysis.score}/100 overall importance · Teams {analysis.teamImportance ?? analysis.score} · League {analysis.leagueImportance ?? analysis.score}
          </p>
          <div className="game-center-actions">
            <a href={`https://www.nhl.com/gamecenter/${game.id}`} target="_blank" rel="noreferrer">Official NHL Gamecenter ↗</a>
            <SaveGameButton game={game} awayName={away.name} homeName={home.name} labeled />
            <GameFollowBadge game={game} awayName={away.name} homeName={home.name} />
            <span>{game.venue || "Venue unavailable"}</span>
          </div>
          <GameTabs
            tab={tab}
            onTab={(next) => goTab(next)}
            panes={{
              overview: (
                <>
                  {live && game.intermission && <IntermissionRink game={game} home={home} away={away} />}
                  <div className="gc-cols">
                    <div className="gc-col"><OverviewPane home={home} away={away} dayGames={dayGames} /></div>
                    <div className="gc-col">
                      {(past || live) && <DeservedTop game={game} home={home} away={away} live={live} before={before} baseline={baseline} />}
                      <details className="game-center-section" open>
                        <summary>Projection and game pulse <span>+</span></summary>
                        <GameData eager game={game} home={home} away={away} before={before} baseline={baseline} />
                      </details>
                    </div>
                  </div>
                  {(past || live) && <RecapSection game={game} home={home} away={away} live={live} />}
                </>
              ),
              pbp: <Suspense fallback={null}><PlayByPlay /></Suspense>,
              stats: (
                <>
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
                  <Suspense fallback={null}><TeamStatsPane /></Suspense>
                </>
              ),
              players: (
                <>
                  <GameInjuries away={away} home={home} season={game.season} />
                  <GameCenterAnalytics game={game} away={away} home={home} onClose={() => onClose({ replace: true })} />
                  <details className="game-center-section">
                    <summary>Player leaders and trends <span>+</span></summary>
                    <Suspense fallback={<p className="loading" role="status">Loading player tracker…</p>}>
                      <PlayerTracker game={game} home={home} away={away} sourceSeason={sourceSeason} />
                    </Suspense>
                  </details>
                  <Suspense fallback={null}><PlayersPane /></Suspense>
                </>
              ),
              intel: (
                <>
                  <details className="game-center-section">
                    <summary>Form and matchup lens <span>+</span></summary>
                    <div className="dialog-comparison"><MatchupLens away={away} home={home} table={before} games={allGames} season={game.season} /></div>
                  </details>
                  <details className="game-center-section">
                    <summary>Recent meetings, rest and availability <span>+</span></summary>
                    <div className="matchup-context">
                      <div className="rest-grid"><span><b>{away.id}</b>{restLabel(away.id)}</span><span><b>{home.id}</b>{restLabel(home.id)}</span></div>
                      <p className="detail-note">Season series entering this game: {series.played ? `${away.id} ${series.away}–${series.home} ${home.id}` : "first meeting"}.</p>
                      {previousMeetings.length ? <ul>{previousMeetings.map((meeting) => <li key={meeting.id}>{meeting.date} · {meeting.away} {meeting.awayScore}–{meeting.homeScore} {meeting.home} {meeting.end !== "REG" ? `(${meeting.end})` : ""}</li>)}</ul> : <p className="detail-note">No prior meetings this season.</p>}
                      <p className="availability-note">Injuries are in the Injuries section of the Players tab, from ESPN's injury report. The NHL public feed has no line-combination or confirmed-lineup data, so no lineup claims are shown.</p>
                    </div>
                  </details>
                  <details className="game-center-section">
                    <summary>Why this game matters <span>+</span></summary>
                    {insights.length > 0 && (
                      <div className="game-insights" data-testid="game-insights">
                        {insights.map((insight) => (
                          <InsightLine key={insight.id} insight={insight} variant="list" onNavigate={onNavigate ? (view) => { onClose({ replace: true }); onNavigate(view); } : undefined} />
                        ))}
                      </div>
                    )}
                    <h4 className="detail-note">Model inputs</h4>
                    <ul className="model-reasons">{analysis.reasons.map((reason: string) => <li key={reason}>{reason}</li>)}</ul>
                    <p className="detail-note">These are model inputs and rank comparisons, not guarantees or isolated causal claims.</p>
                  </details>
                  <Suspense fallback={null}><IntelPane /></Suspense>
                </>
              ),
            }}
          />
        </GameCenterUiProvider>
      </GameCenterProvider>
    </dialog>
  );
  return node;
}

/** The deserved-to-win gauge first thing in the Game Center: stats and game flow, not the pregame odds. */
function DeservedTop({ game, home, away, live, before, baseline }: { game: Game; home: Team; away: Team; live: boolean; before: any; baseline: any }) {
  const { feed: data } = useGameCenter();
  const model = projectGame(game, before, baseline, data);
  // Side by side with the model's own win chance: one row, no empty space around a lone dial.
  const beside = model ? <section className="gr-model" aria-label="Model win chance"><h4>{model.score ? "Projected final score" : "Model win chance"} <small>{model.score ? "most likely result, win chance beneath" : "score, time and shots"}</small></h4><Gauge size="lg" {...modelGaugeProps(game, model)} /></section> : null;
  return <DeservedHero data={data} home={home} away={away} beside={beside} />;
}

/** The game recap with the shot charts, in its own section: it reads the live feed, so it is here while a game is on as well as after it. */
function RecapSection({ game, home, away, live }: { game: Game; home: Team; away: Team; live: boolean }) {
  const data = useGameCenter().feed ?? undefined;
  return (
    <details className="game-center-section game-center-recap" open data-testid="gc-recap-section">
      <summary>Game recap and shot chart <span>+</span></summary>
      {data ? <GameRecap data={data} home={home} away={away} /> : <p className="loading" role="status">Loading the shot chart…</p>}
    </details>
  );
}
