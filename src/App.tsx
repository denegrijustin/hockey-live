import { isLive } from "./lib/game-data.mjs";
import { useSeason } from "./hooks/useSeason";
import { useGameLists } from "./hooks/useGameLists";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ScoreTicker } from "./components/ScoreTicker";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { NHLPLUS_EVENT } from "./lib/nhlplus-nav";
import rawTeams from "./data/teams.json";
import type { Game, Snapshot, Team, Scoreboard } from "./types";
import { analyzeSeason, finished, playoffChances } from "./lib/model.mjs";
import { chancesForCards, simulatePlayoffs } from "./lib/playoff-sim.mjs";
import { TeamPicker } from "./components/TeamPicker";
import { MainNav, VIEW_IDS } from "./components/MainNav";
import { Scoreboard as ScoreboardView } from "./components/Scoreboard";
import { Sheet } from "./components/Sheet";
import { GameFilterFields, PeriodSwitch } from "./components/GameFilters";
import { TeamsSheet } from "./components/TeamsSheet";
import { StatusPill } from "./components/StatusPill";
import { Icon } from "./components/icons";
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
// Groups the game-center list under a day heading when sorted chronologically.
function dayHeading(dateStr: string) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diff = Math.round(
    (start(new Date(`${dateStr}T00:00:00`)) - start(new Date())) / 86400000,
  );
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });
}
const initialView = () => {
  try {
    const v = new URLSearchParams(location.search).get("view");
    return v && VIEW_IDS.includes(v) ? v : "scoreboard";
  } catch {
    return "scoreboard";
  }
};
export default function App() {
  const [selected, setSelected] = useState<string[]>(initialTeams);
  const { manifest, season, setSeason, data, baseline, scoreboard, liveError, hasLive, error, loading, retry } = useSeason();
  const [playerTeams, setPlayerTeams] = useState<string[]>(defaults);
  const [view, setView] = useState(initialView),
    [period, setPeriod] = useState("future"),
    [type, setType] = useState(2),
    [sort, setSort] = useState("date"),
    [range, setRange] = useState("30"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(18),
    [filtersOpen, setFiltersOpen] = useState(false),
    [teamsOpen, setTeamsOpen] = useState(false);
  const phone = useMedia("(max-width: 720px)");
  const home = view === "scoreboard";
  // The view is kept in the address (?view=…) so a link opens the same screen; the scoreboard is the plain address.
  useEffect(() => {
    try {
      history.replaceState(null, "", home ? location.pathname : `?view=${view}`);
    } catch {}
    document.documentElement.toggleAttribute("data-home", home);
  }, [view, home]);
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
  const { games, finishedToday } = useGameLists({ data, analysis, teams, selected, type, period, range, query, sort });
  useEffect(
    () => setLimit(18),
    [season, selected, type, period, range, query, sort],
  );
  useEffect(() => {
    const open = () => setView("nhlplus");
    window.addEventListener(NHLPLUS_EVENT, open);
    return () => window.removeEventListener(NHLPLUS_EVENT, open);
  }, []);
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
    window.dispatchEvent(new Event("iceboard:refresh"));
    setManualRefresh(true);
  }, [retry]);
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
  const activeFilters = [period !== "future", type !== 2, range !== defaultRange, sort !== "date"].filter(Boolean).length;
  const resetFilters = () => {
    setPeriod("future");
    setType(2);
    setRange(defaultRange);
    setSort("date");
  };
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to dashboard
      </a>
      {data && analysis && !home && (
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
        <a className="brand" href="/" aria-label="Iceboard home">
          <span className="brand-symbol">
            Ⅱ<span>↗</span>
          </span>
          <span>
            ICEBOARD<small>NHL GAME INTELLIGENCE</small>
          </span>
        </a>
        <div className="header-right">
          <StatusPill live={hasLive} offline={!!liveError} updatedAt={scoreboard?.updatedAt ?? data?.updatedAt} />
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
      <main id="main" className="page">
        <MainNav view={view} setView={setView} liveCount={liveCount} onRefresh={refresh} />
        {(pull > 0 || refreshing) && (
          <div className="ptr" role="status" style={{ opacity: refreshing ? 1 : Math.min(1, pull) }} data-ready={pull >= 1}>
            <Icon name="refresh" size={20} />
            <span>{refreshing ? "Refreshing…" : pull >= 1 ? "Release to refresh" : "Pull to refresh"}</span>
          </div>
        )}
        {!home && (
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
        {error ? (
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
              <ScoreboardView games={data.games} teams={teams} analysis={analysis} baseline={baseline} baselineTable={baselineAnalysis?.table} sourceSeason={sourceSeason} loading={loading} />
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
                {!phone && (
                  <>
                    <div className="section-heading">
                      <div>
                        <p className="eyebrow">CIRCLE THESE ON THE CALENDAR</p>
                        <h2>Game center</h2>
                      </div>
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
                    </div>
                    <div id="game-filters" className={`game-filters${filtersOpen ? " open" : ""}`}>
                      <GameFilterFields type={type} setType={setType} range={range} setRange={setRange} sort={sort} setSort={setSort} query={query} setQuery={setQuery} />
                    </div>
                  </>
                )}
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
                              {dayHeading(g.date)}
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
          <GameFilterFields type={type} setType={setType} range={range} setRange={setRange} sort={sort} setSort={setSort} query={query} setQuery={setQuery} showSearch={false} />
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
    </>
  );
}
