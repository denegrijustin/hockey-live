import { isLive } from "./lib/game-data.mjs";
import { relativeDay } from "./lib/dates.mjs";
import { searchFor } from "./lib/date-nav.mjs";
import { GameDayStrip, hasDateParam, clearDateParam } from "./components/GameDayStrip";
import { useEtToday } from "./hooks/useEtToday";
import { useSeason } from "./hooks/useSeason";
import { useGameAlerts } from "./hooks/useGameAlerts";
import { useGameLists } from "./hooks/useGameLists";
import { useStackedTables } from "./hooks/useStackedTables";
import { TeamProfileProvider } from "./components/TeamProfile";
import { PlayerProfileProvider } from "./components/player/PlayerContext";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScoreTicker } from "./components/ScoreTicker";
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NHLPLUS_EVENT } from "./lib/nhlplus-nav";
import rawTeams from "./data/teams.json";
import type { Game, Snapshot, Team, Scoreboard } from "./types";
import { analyzeSeason, finished, playoffChances } from "./lib/model.mjs";
import { chancesForCards, simulatePlayoffs } from "./lib/playoff-sim.mjs";
import { TeamPicker } from "./components/TeamPicker";
import { MainNav, VIEW_IDS, VIEW_TITLES } from "./components/MainNav";
import { Teams } from "./components/Teams";
const TeamPage = lazy(() => import("./components/team/TeamPage"));
import { PageHeader } from "./components/PageHeader";
import { Scoreboard as ScoreboardView } from "./components/Scoreboard";
import { Sheet } from "./components/Sheet";
import { GameFilterFields, PeriodSwitch } from "./components/GameFilters";
import { TeamsSheet } from "./components/TeamsSheet";
import { StatusPill } from "./components/StatusPill";
import { Icon } from "./components/icons";
import { NotificationBell } from "./components/alerts/NotificationBell";
import { SearchPalette } from "./components/SearchPalette";
import { OPEN_GAME_EVENT } from "./lib/open-game";
import { useMedia } from "./hooks/useMedia";
import { usePullToRefresh } from "./hooks/usePullToRefresh";
import { Skeleton } from "./components/Skeleton";
import { GameCard } from "./components/GameCard";
import { Methodology } from "./components/Methodology";
// Only the "games" tab is needed for first paint; the rest of the tabs
// (and their per-team API calls) load on demand when a visitor switches
// to them, keeping the initial bundle smaller.
const EdgePanel = lazy(() =>
  import("./components/EdgeStats").then((m) => ({ default: m.EdgePanel })),
);
const Trends = lazy(() =>
  import("./components/Trends").then((m) => ({ default: m.Trends })),
);
const Players = lazy(() =>
  import("./components/Players").then((m) => ({ default: m.Players })),
);
const Standings = lazy(() =>
  import("./components/Standings").then((m) => ({ default: m.Standings })),
);
const PlayoffOdds = lazy(() =>
  import("./components/PlayoffOdds").then((m) => ({ default: m.PlayoffOdds })),
);
const ImperialismMap = lazy(() =>
  import("./components/ImperialismMap").then((m) => ({ default: m.ImperialismMap })),
);
const TeamSchedule = lazy(() => import("./components/TeamSchedule").then((m) => ({ default: m.TeamSchedule })));
const Settings = lazy(() => import("./components/settings/Settings").then((m) => ({ default: m.Settings })));
const Following = lazy(() => import("./components/following/Following").then((m) => ({ default: m.Following })));
const Injuries = lazy(() => import("./components/Injuries").then((m) => ({ default: m.Injuries })));
const LastNight = lazy(() => import("./components/LastNight").then((m) => ({ default: m.LastNight })));
const Picks = lazy(() => import("./components/Picks").then((m) => ({ default: m.Picks })));
const NhlPlus = lazy(() =>
  import("./components/nhlplus/NhlPlus").then((m) => ({ default: m.NhlPlus })),
);
const teams: Team[] = rawTeams;
const defaults = ["EDM", "CHI", "MIN"];
function initialTeams() {
  try {
    const saved = JSON.parse(localStorage.getItem("iceboard-teams") ?? "null");
    return Array.isArray(saved) &&
      saved.length &&
      saved.every((x) => teams.some((t) => t.id === x))
      ? saved
      : defaults;
  } catch {
    return defaults;
  }
}
const seasonLabel = (s: number) =>
  `${String(s).slice(0, 4)}–${String(s).slice(6)}`;
// Groups the game-center list under a day heading: the game's Eastern day against today's Eastern day, so "Today" is right in every time zone.
function dayHeading(dateStr: string, today: string) {
  const rel = relativeDay(dateStr, today);
  return /^(Today|Tomorrow|Yesterday)$/.test(rel)
    ? rel
    : new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" });
}
/** The view the address names: ?view=standings, with the bare address as Home. Unknown names open Home. */
const viewFromAddress = () => {
  try {
    const v = new URLSearchParams(location.search).get("view");
    return v && VIEW_IDS.includes(v) ? v : "scoreboard";
  } catch {
    return "scoreboard";
  }
};
const initialView = viewFromAddress;
/** The team page the address names (?view=teams&team=EDM); a missing or unknown team id is the Teams directory. */
const teamFromAddress = () => {
  try {
    const p = new URLSearchParams(location.search), id = p.get("team");
    return p.get("view") === "teams" && id && teams.some((t) => t.id === id) ? id : null;
  } catch {
    return null;
  }
};
/** The address of a view: `?view=…` (Home is the plain address). A picked day (`&date=`) goes along only to Home and Games; `team` only to Teams. */
const addressFor = (view: string, team: string | null = null) => {
  let date: string | null = null;
  try { date = new URLSearchParams(location.search).get("date"); } catch {}
  let player: string | undefined;
  try { player = new URLSearchParams(location.search).get("player") ?? undefined; } catch {}
  return `${location.pathname}${searchFor(view, date, { team, player })}`;
};
export default function App() {
  const [selected, setSelected] = useState<string[]>(initialTeams);
  const { manifest, season, setSeason, data, baseline, scoreboard, liveError, hasLive, error, loading, retry, reloadLive, source } = useSeason();
  useGameAlerts(scoreboard?.games);
  const [playerTeams, setPlayerTeams] = useState<string[]>(defaults);
  const [view, setViewState] = useState(initialView),
    [period, setPeriod] = useState("future"),
    [type, setType] = useState(2),
    [sort, setSort] = useState("date"),
    [range, setRange] = useState("30"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(18),
    [filtersOpen, setFiltersOpen] = useState(false),
    [byDay, setByDayState] = useState(() => viewFromAddress() === "games" && hasDateParam()),
    [gameDate, setGameDate] = useState<string | null>(null),
    [teamsOpen, setTeamsOpen] = useState(false),
    [teamId, setTeamId] = useState<string | null>(teamFromAddress);
  const todayEt = useEtToday();
  const setByDay = useCallback((on: boolean) => {
    setByDayState(on);
    if (!on) { clearDateParam(); setGameDate(null); }
  }, []);
  const phone = useMedia("(max-width: 720px)");
  const home = view === "scoreboard";
  // Every screen has its own address (?view=…; Home is the plain address) and its own history entry, so Back and Forward move between screens,
  // a link opens the same screen, and a refresh stays put. Each entry remembers how far down it was scrolled.
  const viewRef = useRef(view);
  viewRef.current = view;
  const teamRef = useRef(teamId);
  teamRef.current = teamId;
  const pushedTeam = useRef(false);
  const setView = useCallback((next: string) => {
    if (next === viewRef.current && !teamRef.current) return;
    try {
      history.replaceState({ ...history.state, view: viewRef.current, team: teamRef.current, scroll: window.scrollY }, "");
      history.pushState({ view: next, team: null, scroll: 0 }, "", addressFor(next));
    } catch {}
    setViewState(next);
    setTeamId(null);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  /** Open a team's full page (?view=teams&team=EDM) as its own history entry, so Back returns to where it was opened from. */
  const openTeam = useCallback((id: string) => {
    if (!teams.some((t) => t.id === id)) return;
    try {
      history.replaceState({ ...history.state, view: viewRef.current, team: teamRef.current, scroll: window.scrollY }, "");
      history.pushState({ view: "teams", team: id, scroll: 0 }, "", addressFor("teams", id));
      pushedTeam.current = true;
    } catch {}
    setViewState("teams");
    setTeamId(id);
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, []);
  useEffect(() => {
    try {
      history.scrollRestoration = "manual";
      history.replaceState({ ...history.state, view: viewRef.current, team: teamRef.current, scroll: history.state?.scroll ?? 0 }, "", addressFor(viewRef.current, teamRef.current));
    } catch {}
    const pop = (e: PopStateEvent) => {
      const next = e.state?.view && VIEW_IDS.includes(e.state.view) ? e.state.view : viewFromAddress();
      setViewState(next);
      setTeamId(next === "teams" ? (e.state?.view ? (e.state.team ?? null) : teamFromAddress()) : null);
      const y = Number(e.state?.scroll) || 0;
      requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, left: 0, behavior: "instant" })));
    };
    window.addEventListener("popstate", pop);
    return () => window.removeEventListener("popstate", pop);
  }, []);
  useEffect(() => {
    document.documentElement.toggleAttribute("data-home", home);
    const teamName = view === "teams" && teamId ? teams.find((t) => t.id === teamId)?.name : null;
    document.title = home ? "Iceboard · NHL game intelligence" : `${teamName ?? VIEW_TITLES[view] ?? "Iceboard"} · Iceboard`;
  }, [view, home, teamId]);
  // After a screen change, move focus to the page so keyboard and screen-reader users start at the top of the new screen.
  const firstView = useRef(true);
  useEffect(() => {
    if (firstView.current) { firstView.current = false; return; }
    document.getElementById("main")?.focus({ preventScroll: true });
  }, [view]);
  useStackedTables(view);
  const analysis = useMemo(
    () => (data ? analyzeSeason(data.games, teams) : null),
    [data],
  );
  const baselineAnalysis = useMemo(
    () => (baseline ? analyzeSeason(baseline.games, teams) : null),
    [baseline],
  );
  // Playoff chances on the cards come from the same simulation as the Playoff odds tab, so the two never disagree.
  // It reruns when a game finishes, not on every 30-second live-score tick.
  const finishedCount = data ? data.games.filter(finished).length : 0;
  const playoff = useMemo(() => {
    if (!data || !analysis) return {};
    try {
      const sim = simulatePlayoffs({ games: data.games, teams, table: analysis.table, baseline: baselineAnalysis?.table, sims: 5000 });
      return chancesForCards(sim, teams);
    } catch {
      return playoffChances(analysis.table, data.games, teams, baselineAnalysis?.table);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finishedCount, season, baselineAnalysis]);
  const selectedTeams = selected
    .map((id) => teams.find((t) => t.id === id)!)
    .filter(Boolean);
  const relevant =
    data?.games.filter(
      (g) => selected.includes(g.home) || selected.includes(g.away),
    ) ?? [];
  const { games, finishedToday } = useGameLists({ data, analysis, teams, selected, type, period, range, query, sort, date: byDay && view === "games" ? gameDate : null });
  const gameDays = useMemo(() => [...new Set(relevant.filter((g) => g.type === type).map((g) => g.date))].sort(), [data, selected, type]); // eslint-disable-line react-hooks/exhaustive-deps
  const gameDayCounts = useMemo(() => { const c: Record<string, number> = {}; for (const g of relevant) if (g.type === type) c[g.date] = (c[g.date] ?? 0) + 1; return c; }, [data, selected, type]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(
    () => setLimit(18),
    [season, selected, type, period, range, query, sort],
  );
  useEffect(() => {
    const open = () => setView("nhlplus");
    window.addEventListener(NHLPLUS_EVENT, open);
    return () => window.removeEventListener(NHLPLUS_EVENT, open);
  }, []);
  // Search: a team opens its page (openTeam), a game opens its Game Center on Home.
  useEffect(() => {
    const onOpenGame = () => setView("scoreboard");
    window.addEventListener(OPEN_GAME_EVENT, onOpenGame);
    return () => window.removeEventListener(OPEN_GAME_EVENT, onOpenGame);
  }, [setView]);
  const changeTeams = (ids: string[]) => {
    setSelected(ids);
    try {
      localStorage.setItem("iceboard-teams", JSON.stringify(ids));
    } catch {}
  };
  // Game Center lists games in chronological order by default (live games first, then by start time under day
  // headings); "Importance to teams + league" is one choice away in Sort by, and every card still shows its
  // importance. Completed games move to the finished section. A 30-day window suits a handful of followed teams, but
  // across all 32 it's a wall of games, so narrow the window there.
  const isAllTeams = selected.length === teams.length;
  useEffect(() => {
    setRange(isAllTeams ? "7" : "30");
  }, [isAllTeams]);
  const activeSelection = view === "players" ? playerTeams : selected;
  const activeTeams = activeSelection.map(id => teams.find(t => t.id === id)!).filter(Boolean);
  const sourceSeason = season;
  const staleness = data ? Date.now() - Date.parse(data.updatedAt) : 0;
  const [manualRefresh, setManualRefresh] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const refresh = useCallback(() => {
    retry();
    reloadLive();
    window.dispatchEvent(new Event("iceboard:refresh"));
    setManualRefresh(true);
  }, [retry, reloadLive]);
  // "Updated just now" once a refresh the viewer asked for (pull, Retry, Refresh data) has finished.
  useEffect(() => {
    if (!manualRefresh || loading) return;
    const show = setTimeout(() => { setManualRefresh(false); setToast("Updated just now"); }, 700);
    return () => clearTimeout(show);
  }, [manualRefresh, loading]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(t);
  }, [toast]);
  const { pull, busy: refreshing } = usePullToRefresh(refresh, phone);
  const liveCount = scoreboard ? scoreboard.games.filter(isLive).length : 0;
  const defaultRange = isAllTeams ? "7" : "30";
  // How many filters differ from the defaults: shown on the phone Filters button.
  const activeFilters = [period !== "future", type !== 2, range !== defaultRange, sort !== "date", byDay].filter(Boolean).length;
  const resetFilters = () => {
    setPeriod("future");
    setType(2);
    setRange(defaultRange);
    setSort("date");
    setByDay(false);
  };
  return (
    <TeamProfileProvider teams={teams} table={analysis?.table ?? null} games={data?.games ?? []} season={season} onOpenPage={openTeam}>
    <PlayerProfileProvider>
      <a href="#main" className="skip-link">
        Skip to dashboard
      </a>
      {data && analysis && !home && view !== "picks" && view !== "teamschedule" && view !== "injuries" && view !== "yesterday" && view !== "settings" && view !== "following" && (
        <ScoreTicker
          games={data.games}
          teams={teams}
          day={scoreboard?.date}
          analysis={analysis}
          baselineFor={(g) => (baseline && baseline.season < g.season ? baselineAnalysis?.table : undefined)}
          sourceSeason={sourceSeason}
        />
      )}
      <header className="site-header">
        <a className="brand" href="/" aria-label="Iceboard home" onClick={(e) => { if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return; e.preventDefault(); setView("scoreboard"); }}>
          <span className="brand-symbol">
            Ⅱ<span>↗</span>
          </span>
          <span>
            ICEBOARD<small>NHL GAME INTELLIGENCE</small>
          </span>
        </a>
        <div className="header-right">
          <NotificationBell onNavigate={setView} />
          <SearchPalette teams={teams} games={data?.games ?? []} onTeam={openTeam} onView={setView} />
          <StatusPill live={hasLive} offline={!!liveError || source === "saved"} updatedAt={scoreboard?.updatedAt ?? data?.updatedAt} />
          <label className="season-label">
            Season
            <select
              aria-label="Season"
              value={season}
              onChange={(e) => {
                setSeason(+e.target.value);
                setRange("all");
                setPeriod(
                  +e.target.value === manifest?.current ? "future" : "past",
                );
              }}
            >
              {manifest?.seasons.map((s) => (
                <option key={s} value={s}>
                  {seasonLabel(s)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>
      <main id="main" className="page" tabIndex={-1}>
        <MainNav view={view} setView={setView} liveCount={liveCount} onRefresh={refresh} onChooseTeams={phone ? () => setTeamsOpen(true) : undefined} />
        {(pull > 0 || refreshing) && (
          <div className="ptr" role="status" style={{ opacity: refreshing ? 1 : Math.min(1, pull) }} data-ready={pull >= 1}>
            <Icon name="refresh" size={20} />
            <span>{refreshing ? "Refreshing…" : pull >= 1 ? "Release to refresh" : "Pull to refresh"}</span>
          </div>
        )}
        {!home && view !== "picks" && view !== "teamschedule" && view !== "injuries" && view !== "yesterday" && view !== "settings" && view !== "following" && view !== "teams" && !(phone && view === "nhlplus") && (
          <div className="control-dock">
            {phone ? (
              <div className="phone-controls">
                <button className="pc-button" aria-label="Choose teams" aria-haspopup="dialog" onClick={() => setTeamsOpen(true)}>
                  Teams <b>{activeSelection.length}</b>
                </button>
                {view === "games" && (
                  <>
                    <button className="pc-button" aria-haspopup="dialog" onClick={() => setFiltersOpen(true)}>
                      Filters {activeFilters > 0 && <b>{activeFilters}</b>}
                    </button>
                    <label className="phone-search">
                      <Icon name="search" size={18} />
                      <input type="search" aria-label="Find a matchup" placeholder="Search" value={query} onChange={(e) => setQuery(e.target.value)} />
                    </label>
                  </>
                )}
              </div>
            ) : (
              <TeamPicker
                teams={teams}
                selected={activeSelection}
                onChange={view === "players" ? setPlayerTeams : changeTeams}
              />
            )}
          </div>
        )}
        {phone || home ? (
          (liveError || staleness > 86400000) && (
            <div className="status-banner" role="status">
              <span>{liveError ? "Live scores unavailable. Showing saved data." : "Showing a saved copy. Refresh pending."}</span>
              <button onClick={refresh} disabled={loading}>Retry</button>
            </div>
          )
        ) : (
        <div className={`freshness${liveError || hasLive || staleness > 86400000 ? " note" : ""}`}>
          <span>
            <span className="fresh-counts"><b>{teams.length}</b> teams · <b>{data?.games.filter((g) => g.type === 2).length ?? "—"}</b> regular-season games · </span>
            {data
              ? `Snapshot ${new Date(data.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
              : "Loading NHL snapshot…"}
            {liveError ? ` · ${liveError}` : ""}
            {hasLive
              ? " · Live game in progress — auto-updating every 30s"
              : staleness > 86400000
                ? " · Saved copy; refresh pending"
                : ""}
          </span>
          <button onClick={refresh} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
        )}
        {error && home ? (
          <ScoreboardView games={[]} teams={teams} analysis={null} baseline={null} sourceSeason={sourceSeason} error={error} onRetry={() => (season ? refresh() : location.reload())} />
        ) : error ? (
          <div className="empty error">
            <h2>Unable to load data</h2>
            <p>{error}</p>
            <button
              onClick={() =>
                season ? retry() : location.reload()
              }
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="empty loading" role="status">
            <span className="sr-only">Loading the NHL board…</span>
            <div className="skeleton-list" aria-hidden="true">
              {[0, 1, 2, 3].map((i) => (
                <div className="skeleton-card" key={i} />
              ))}
            </div>
          </div>
        ) : data && analysis ? (
          <div key={view} className="view-in">
            {scoreboard && (
              <p className="sr-only" role="status" aria-live="polite">
                {scoreboard.games.filter(isLive).length} games in progress around the league
              </p>
            )}
            {view === "scoreboard" && (
              <ScoreboardView games={data.games} teams={teams} analysis={analysis} baseline={baseline} baselineTable={baselineAnalysis?.table} sourceSeason={sourceSeason} loading={loading} sim={playoff} onNavigate={setView} onBrowse={() => setView("games")} />
            )}
            {view === "yesterday" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading last night" />}>
                <LastNight games={data.games} teams={teams} season={season} current={season === (manifest?.current ?? season)} />
              </Suspense></ErrorBoundary>
            )}
            {view === "teamschedule" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading the team schedule" />}>
                <TeamSchedule games={data.games} teams={teams} defaultTeam={selected[0]} analysis={analysis} baseline={baseline} baselineTable={baselineAnalysis?.table} sourceSeason={sourceSeason} />
              </Suspense></ErrorBoundary>
            )}
            {view === "settings" && (
              <ErrorBoundary resetKey="settings"><Suspense fallback={<Skeleton rows={3} label="Loading settings" />}><Settings /></Suspense></ErrorBoundary>
            )}
            {view === "following" && (
              <ErrorBoundary resetKey="following"><Suspense fallback={<Skeleton rows={3} label="Loading what you follow" />}><Following /></Suspense></ErrorBoundary>
            )}
            {view === "injuries" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading the injury report" />}>
                <Injuries season={season} teams={teams} />
              </Suspense></ErrorBoundary>
            )}
            {view === "picks" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<div className="skel card" role="status" aria-label="Loading picks"><div className="skel-item"><span className="skel-line w60" /><span className="skel-line w90" /></div></div>}>
                <Picks season={season} games={data.games} teams={teams} />
              </Suspense></ErrorBoundary>
            )}
            {view === "nhlplus" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading NHL+" />}>
                <NhlPlus games={data.games} season={season} teams={teams} />
              </Suspense></ErrorBoundary>
            )}
            {view === "edge" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading NHL EDGE" />}>
                <EdgePanel teams={selectedTeams} season={season} />
              </Suspense></ErrorBoundary>
            )}
            {view === "games" && (
              <>
                <PageHeader
                  title="Games"
                  eyebrow="CIRCLE THESE ON THE CALENDAR"
                  actions={!phone && (
                    <>
                      <PeriodSwitch period={period} setPeriod={setPeriod} relevant={relevant} type={type} />
                      <button
                        type="button"
                        className="refresh-mini"
                        aria-label="Refresh the NHL data"
                        title="Refresh"
                        disabled={loading}
                        onClick={refresh}
                      >
                        ↻
                      </button>
                      <button
                        type="button"
                        className="filters-toggle"
                        aria-expanded={filtersOpen}
                        aria-controls="game-filters"
                        onClick={() => setFiltersOpen((v) => !v)}
                      >
                        Filters <b>{games.length}</b> <span aria-hidden="true">{filtersOpen ? "▴" : "▾"}</span>
                      </button>
                    </>
                  )}
                />
                {!phone && (
                  <>
                    <div id="game-filters" className={`game-filters${filtersOpen ? " open" : ""}`}>
                      <GameFilterFields type={type} setType={setType} range={range} setRange={setRange} sort={sort} setSort={setSort} query={query} setQuery={setQuery} byDay={byDay} setByDay={setByDay} />
                    </div>
                  </>
                )}
                {byDay && <GameDayStrip days={gameDays} counts={gameDayCounts} onDate={setGameDate} />}
                <div className="results-line">
                  <span role="status">
                    {games.length} games · {selected.length} selected teams
                  </span>
                  <span>
                    {sort === "date"
                      ? "Today's games first, then the rest of the week in order"
                      : `Rank = combined team + league importance among ${period === "past" ? "past" : "future"} games · ties share rank`}
                  </span>
                </div>
                {games.length ? (
                  <>
                    <div className="game-grid">
                      {games.slice(0, limit).flatMap((g, i, arr) => {
                        const elements = [];
                        if (sort === "date" && (i === 0 || arr[i - 1].date !== g.date))
                          elements.push(
                            <div className="game-day-heading" key={`day-${g.date}`}>
                              {dayHeading(g.date, todayEt)}
                            </div>,
                          );
                        elements.push(
                          <GameCard
                            baseline={baseline && baseline.season < g.season ? baselineAnalysis?.table : undefined}
                            key={`${g.id}-${selected.join("-")}`}
                            game={g}
                            teams={teams}
                            before={analysis.before[g.id]}
                            analysis={analysis.analysis[g.id]}
                            selected={selected}
                            sourceSeason={sourceSeason}
                            allGames={data.games}
                            playoff={playoff}
                          />,
                        );
                        return elements;
                      })}
                    </div>
                    {games.length > limit && (
                      <button
                        className="load-more"
                        onClick={() => setLimit((x) => x + 18)}
                      >
                        Show 18 more games{" "}
                        <span>
                          {Math.min(limit, games.length)} / {games.length}
                        </span>
                      </button>
                    )}
                  </>
                ) : (
                  <div className="empty">
                    <h3>No games in this view.</h3>
                    <p>
                      {selected.length === 0
                        ? "Choose one or more teams to begin."
                        : period === "past" && season === manifest?.current
                          ? "The regular season has not produced results in this snapshot. Explore preseason results or last season."
                          : "Try the entire season, another competition, or a different team."}
                    </p>
                    <div>
                      <button
                        onClick={() => {
                          setRange("all");
                          setQuery("");
                        }}
                      >
                        Entire season
                      </button>
                      {period === "past" && (
                        <button
                          onClick={() => {
                            setType(1);
                            setRange("all");
                          }}
                        >
                          Preseason results
                        </button>
                      )}
                      {manifest && season === manifest.current && (
                        <button
                          onClick={() => {
                            setSeason(manifest.seasons[1]);
                            setPeriod("past");
                            setRange("all");
                            setType(2);
                          }}
                        >
                          Last season
                        </button>
                      )}
                    </div>
                  </div>
                )}
                {period === "future" && finishedToday.length > 0 && (
                  <details className="finished-today finished-today-bottom">
                    <summary>
                      <span className="finished-today-label">
                        <i />
                        Finished today <b>{finishedToday.length}</b>
                      </span>
                      <span className="finished-today-scores">
                        {finishedToday.map((g) => (
                          <span key={g.id}>
                            {g.away} {g.awayScore}–{g.homeScore} {g.home}
                          </span>
                        ))}
                      </span>
                      <span className="expand-icon">+</span>
                    </summary>
                    <div className="game-grid">
                      {finishedToday.map((g) => (
                        <GameCard
                          baseline={baseline && baseline.season < g.season ? baselineAnalysis?.table : undefined}
                          key={`finished-${g.id}`}
                          game={g}
                          teams={teams}
                          before={analysis.before[g.id]}
                          analysis={analysis.analysis[g.id]}
                          selected={selected}
                          sourceSeason={sourceSeason}
                          allGames={data.games}
                          playoff={playoff}
                        />
                      ))}
                    </div>
                  </details>
                )}
              </>
            )}
            {view === "teams" && !teamId && <Teams teams={teams} table={analysis.table} selected={selected} onSchedule={() => setView("teamschedule")} onOpenTeam={openTeam} />}
            {view === "teams" && teamId && (
              <ErrorBoundary resetKey={teamId}><Suspense fallback={<Skeleton rows={3} label="Loading team page" />}>
                <TeamPage teamId={teamId} teams={teams} table={analysis.table} games={data.games} season={season} today={todayEt} onBack={() => (pushedTeam.current ? history.back() : setView("teams"))} onNavigate={setView} />
              </Suspense></ErrorBoundary>
            )}
            {view === "trends" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading team trends" />}>
                <Trends
                  teams={selectedTeams}
                  table={analysis.table}
                  season={season}
                  games={data.games}
                  leagueTeams={teams}
                  baseline={baseline && baseline.season < season ? baselineAnalysis?.table : undefined}
                  currentSeason={manifest?.current ?? season}
                />
              </Suspense></ErrorBoundary>
            )}{" "}
            {view === "players" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading player contributions" />}>
                <Players teams={activeTeams} season={sourceSeason} />
              </Suspense></ErrorBoundary>
            )}{" "}
            {view === "standings" && (
              <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading standings" />}>
                <Standings
                  teams={teams}
                  table={analysis.table}
                  games={data.games}
                  baseline={baseline && baseline.season < season ? baselineAnalysis?.table : undefined}
                  selected={selected}
                  onNavigate={setView}
                />
              </Suspense></ErrorBoundary>
            )}
          </div>
        ) : null}
        {view === "odds" && data && analysis && (
          <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading playoff odds" />}>
            <PlayoffOdds
              teams={teams}
              games={data.games}
              table={analysis.table}
              baseline={baseline && baseline.season < season ? baselineAnalysis?.table : undefined}
              season={season}
            />
          </Suspense></ErrorBoundary>
        )}
        {view === "map" && data && (
          <ErrorBoundary resetKey={String(season)}><Suspense fallback={<Skeleton rows={3} label="Loading the map" />}>
            <ImperialismMap teams={teams} games={data.games} season={season} />
          </Suspense></ErrorBoundary>
        )}
        {!home && <Methodology />}
        <footer>
          <span>
            ICEBOARD <b aria-hidden="true"> / </b> Built for the games that matter.
          </span>
          <span>
            Independent NHL dashboard · Data:{" "}
            <a href="https://www.nhl.com" target="_blank" rel="noreferrer">
              NHL
            </a>
          </span>
        </footer>
      </main>
      <div className="toast-host" aria-live="polite">{toast && <div className="toast" role="status">{toast}</div>}</div>
      {phone && filtersOpen && (
        <Sheet title="Filters" onClose={() => setFiltersOpen(false)} left={<button className="sheet-reset" onClick={resetFilters}>Reset</button>}>
          <div className="sheet-status">
            <span>Status</span>
            <PeriodSwitch period={period} setPeriod={setPeriod} relevant={relevant} type={type} />
          </div>
          <GameFilterFields type={type} setType={setType} range={range} setRange={setRange} sort={sort} setSort={setSort} query={query} setQuery={setQuery} showSearch={false} byDay={byDay} setByDay={setByDay} />
        </Sheet>
      )}
      {phone && teamsOpen && (
        <TeamsSheet
          teams={teams}
          selected={activeSelection}
          onChange={view === "players" ? setPlayerTeams : changeTeams}
          onClose={() => setTeamsOpen(false)}
        />
      )}
    </PlayerProfileProvider>
    </TeamProfileProvider>
  );
}
