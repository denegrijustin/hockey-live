import { useFeed } from "./lib/polling";
import { mergeScores, isLive } from "./lib/game-data.mjs";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import rawTeams from "./data/teams.json";
import type { Game, Snapshot, Team, Scoreboard } from "./types";
import { loadSeason } from "./lib/api";
import { analyzeSeason, finished } from "./lib/model.mjs";
import { TeamPicker } from "./components/TeamPicker";
import { TeamSummary } from "./components/TeamSummary";
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
export default function App() {
  const [selected, setSelected] = useState<string[]>(initialTeams),
    [manifest, setManifest] = useState<{
      current: number;
      seasons: number[];
    } | null>(null),
    [season, setSeason] = useState(0),
    [storedData, setData] = useState<Snapshot | null>(null),
    [baseline, setBaseline] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
  const [playerTeams, setPlayerTeams] = useState<string[]>(defaults);
  const [view, setView] = useState("games"),
    [period, setPeriod] = useState("future"),
    [type, setType] = useState(2),
    [sort, setSort] = useState("importance"),
    [range, setRange] = useState("30"),
    [query, setQuery] = useState(""),
    [limit, setLimit] = useState(18);
  useEffect(() => {
    fetch("/data/manifest.json")
      .then((r) => {
        if (!r.ok) throw Error();
        return r.json();
      })
      .then((m) => {
        setManifest(m);
        setSeason(m.current);
      })
      .catch(() => {
        setError("Could not load the season index. Reload to retry.");
        setLoading(false);
      });
  }, []);
  useEffect(() => {
    if (!season) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    loadSeason(season, controller.signal)
      .then(setData)
      .catch(() => {
        if (!controller.signal.aborted)
          setError("The NHL snapshot could not be loaded. Please retry.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [season, retry]);
  useEffect(() => {
    if (!manifest) return;
    const controller = new AbortController();
    loadSeason(manifest.seasons[1], controller.signal)
      .then(setBaseline)
      .catch(() => {});
    return () => controller.abort();
  }, [manifest]);
  const { data: scoreboard, error: liveError } = useFeed<Scoreboard>(
    season === manifest?.current ? "/api/live" : null,
  );
  const data = useMemo<Snapshot | null>(() => {
    if (!storedData) return null;
    const games = mergeScores(storedData.games, scoreboard);
    // Same array back means nothing actually changed for this tick — keep
    // the same Snapshot reference so analyzeSeason isn't redone for nothing.
    return games === storedData.games ? storedData : { ...storedData, games };
  }, [storedData, scoreboard]);
  useEffect(() => {
    if (!season || season !== manifest?.current) return;
    const controller = new AbortController();
    // The /api/live feed (below) already carries in-progress scores every
    // 30s, so this only needs to catch things that feed doesn't cover:
    // newly finished games rolling into the schedule, standings drift from
    // games elsewhere in the league. A 5-minute cadence keeps that current
    // without re-downloading the full season on top of the live poll.
    const timer = setInterval(() => {
      if (!document.hidden)
        loadSeason(season, controller.signal)
          .then(setData)
          .catch(() => {});
    }, 300000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [season, manifest]);
  const hasLive = scoreboard?.games.some(isLive) ?? false;
  const analysis = useMemo(
    () => (data ? analyzeSeason(data.games, teams) : null),
    [data],
  );
  const baselineAnalysis = useMemo(
    () => (baseline ? analyzeSeason(baseline.games, teams) : null),
    [baseline],
  );
  const selectedTeams = selected
    .map((id) => teams.find((t) => t.id === id)!)
    .filter(Boolean);
  const relevant =
    data?.games.filter(
      (g) => selected.includes(g.home) || selected.includes(g.away),
    ) ?? [];
  const games = useMemo(() => {
    if (!data || !analysis) return [];
    const today = new Date();
    const distance = Number(range) * 86400000;
    return data.games
      .filter(
        (g) =>
          (selected.includes(g.home) || selected.includes(g.away)) &&
          g.type === type &&
          finished(g) === (period === "past") &&
          `${g.home} ${g.away} ${teams.find((t) => t.id === g.home)?.name} ${teams.find((t) => t.id === g.away)?.name}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (range === "all" ||
            Math.abs(Date.parse(g.start) - today.getTime()) <= distance),
      )
      .sort((a, b) =>
        isLive(a) !== isLive(b)
          ? Number(isLive(b)) - Number(isLive(a))
          : sort === "importance"
            ? analysis.analysis[b.id].score - analysis.analysis[a.id].score ||
              (period === "past"
                ? b.start.localeCompare(a.start)
                : a.start.localeCompare(b.start))
            : period === "past"
              ? b.start.localeCompare(a.start)
              : a.start.localeCompare(b.start),
      );
  }, [data, analysis, selected, type, period, range, query, sort]);
  useEffect(
    () => setLimit(18),
    [season, selected, type, period, range, query, sort],
  );
  const changeTeams = (ids: string[]) => {
    setSelected(ids);
    try {
      localStorage.setItem("iceboard-teams", JSON.stringify(ids));
    } catch {}
  };
  const activeSelection = view === "players" ? playerTeams : selected;
  const activeTeams = activeSelection.map(id => teams.find(t => t.id === id)!).filter(Boolean);
  const sourceSeason = season;
  const staleness = data ? Date.now() - Date.parse(data.updatedAt) : 0;
  return (
    <>
      <a href="#main" className="skip-link">
        Skip to dashboard
      </a>
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
          <span className="feed-status">
            <i />
            NHL DATA
          </span>
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
        <section className="hero">
          <div className="hero-aside">
            <div>
              <b>{teams.length}</b> teams <i />{" "}
              <b>{data?.games.filter((g) => g.type === 2).length ?? "—"}</b>{" "}
              regular-season games
            </div>
          </div>
        </section>
        <div className="control-dock">
          <TeamPicker
            teams={teams}
            selected={activeSelection}
            onChange={view === "players" ? setPlayerTeams : changeTeams}
          />
          <nav className="view-tabs" aria-label="Dashboard views">
            {[
              ["games", "Game center"],
              ["trends", "Team trends"],
              ["edge", "NHL EDGE"],
              ["players", "Players"],
              ["standings", "Standings"],
            ].map(([id, label]) => (
              <button
                aria-pressed={view === id}
                key={id}
                onClick={() => setView(id)}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="freshness">
          <span>
            {data
              ? `Snapshot ${new Date(data.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" })}`
              : "Loading NHL snapshot…"}
            {hasLive
              ? " · Live game in progress — auto-updating every 30s"
              : staleness > 86400000
                ? " · Saved fallback; refresh may be pending"
                : ""}
          </span>
          <button onClick={() => setRetry((x) => x + 1)} disabled={loading}>
            ↻ Refresh
          </button>
        </div>
        {error ? (
          <div className="empty error">
            <h2>Unable to load data</h2>
            <p>{error}</p>
            <button
              onClick={() =>
                season ? setRetry((x) => x + 1) : location.reload()
              }
            >
              Retry
            </button>
          </div>
        ) : loading ? (
          <div className="empty loading" role="status">
            Loading the NHL board…
          </div>
        ) : data && analysis ? (
          <>
            <section className="team-summaries" aria-label="Selected teams">
              {activeTeams.slice(0, 6).map((t) => (
                <TeamSummary
                  key={t.id}
                  team={t}
                  standing={analysis.table[t.id]}
                  baseline={baselineAnalysis?.table[t.id]}
                  games={data.games}
                />
              ))}
            </section>
            {activeSelection.length > 6 && (
              <p className="detail-note">
                Showing six summary cards; all {activeSelection.length} selected teams
                are included below.
              </p>
            )}
            {scoreboard && view === "games" && (
              <section className="live-strip" aria-label="Live NHL scoreboard">
                <div>
                  <b>LIVE AROUND THE LEAGUE</b>
                  <small>
                    {liveError ||
                      `Checked ${new Date(scoreboard.updatedAt).toLocaleTimeString()} · every 30s`}
                  </small>
                </div>
                {scoreboard.games.filter(isLive).length ? (
                  scoreboard.games.filter(isLive).map((g) => (
                    <button
                      key={g.id}
                      onClick={() => {
                        changeTeams([g.away, g.home]);
                        setPeriod("future");
                        setType(g.type);
                        setRange("7");
                        setSort("date");
                        setQuery("");
                      }}
                    >
                      <i />
                      {g.away} {g.awayScore} — {g.homeScore} {g.home}
                      <small>
                        {g.intermission
                          ? "Intermission"
                          : `P${g.period} ${g.clock ?? ""}`}
                      </small>
                    </button>
                  ))
                ) : (
                  <span>No games live in the latest feed.</span>
                )}
              </section>
            )}
            {view === "edge" && (
              <Suspense fallback={<div className="empty" role="status">Loading NHL EDGE…</div>}>
                <EdgePanel teams={selectedTeams} season={season} />
              </Suspense>
            )}
            {view === "games" && (
              <>
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">CIRCLE THESE ON THE CALENDAR</p>
                    <h2>Game center</h2>
                  </div>
                  <div
                    className="segmented"
                    role="group"
                    aria-label="Game period"
                  >
                    <button
                      aria-pressed={period === "future"}
                      onClick={() => setPeriod("future")}
                    >
                      Upcoming{" "}
                      <span>
                        {
                          relevant.filter(
                            (g) => g.type === type && !finished(g),
                          ).length
                        }
                      </span>
                    </button>
                    <button
                      aria-pressed={period === "past"}
                      onClick={() => setPeriod("past")}
                    >
                      Past games{" "}
                      <span>
                        {
                          relevant.filter((g) => g.type === type && finished(g))
                            .length
                        }
                      </span>
                    </button>
                  </div>
                </div>
                <div className="game-filters">
                  <label>
                    Competition
                    <select
                      value={type}
                      onChange={(e) => setType(+e.target.value)}
                    >
                      <option value={2}>Regular season</option>
                      <option value={1}>Preseason</option>
                      <option value={3}>Playoffs</option>
                    </select>
                  </label>
                  <label>
                    Window
                    <select
                      value={range}
                      onChange={(e) => setRange(e.target.value)}
                    >
                      <option value="7">Within 7 days of today</option>
                      <option value="30">Within 30 days of today</option>
                      <option value="all">Entire season</option>
                    </select>
                  </label>
                  <label>
                    Sort by
                    <select
                      value={sort}
                      onChange={(e) => setSort(e.target.value)}
                    >
                      <option value="importance">Importance</option>
                      <option value="date">Game date</option>
                    </select>
                  </label>
                  <label className="game-search">
                    Find a matchup
                    <input
                      type="search"
                      placeholder="Team or opponent…"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                </div>
                <div className="results-line">
                  <span role="status">
                    {games.length} games · {selected.length} selected teams
                  </span>
                  <span>
                    Rank = league-wide {period === "past" ? "past" : "future"}{" "}
                    importance · ties share rank
                  </span>
                </div>
                {games.length ? (
                  <>
                    <div className="game-grid">
                      {games.slice(0, limit).map((g) => (
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
                        />
                      ))}
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
              </>
            )}
            {view === "trends" && (
              <Suspense fallback={<div className="empty" role="status">Loading team trends…</div>}>
                <Trends
                  teams={selectedTeams}
                  table={analysis.table}
                  season={season}
                />
              </Suspense>
            )}{" "}
            {view === "players" && (
              <Suspense fallback={<div className="empty" role="status">Loading player contributions…</div>}>
                <Players teams={activeTeams} season={sourceSeason} />
              </Suspense>
            )}{" "}
            {view === "standings" && (
              <Suspense fallback={<div className="empty" role="status">Loading standings…</div>}>
                <Standings
                  teams={teams}
                  table={analysis.table}
                  games={data.games}
                  baseline={baseline && baseline.season < season ? baselineAnalysis?.table : undefined}
                  selected={selected}
                />
              </Suspense>
            )}
          </>
        ) : null}
        <Methodology />
        <footer>
          <span>
            ICEBOARD <b> / </b> Built for the games that matter.
          </span>
          <span>
            Independent NHL dashboard · Data:{" "}
            <a href="https://www.nhl.com" target="_blank" rel="noreferrer">
              NHL
            </a>
          </span>
        </footer>
      </main>
    </>
  );
}
