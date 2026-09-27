import { useEffect, useMemo, useState } from "react";
import rawTeams from "./data/teams.json";
import type { Game, Snapshot, Team } from "./types";
import { loadSeason } from "./lib/api";
import { analyzeSeason, finished } from "./lib/model.mjs";
import { TeamPicker } from "./components/TeamPicker";
import { TeamSummary } from "./components/TeamSummary";
import { GameCard } from "./components/GameCard";
import { Methodology } from "./components/Methodology";
import { Trends } from "./components/Trends";
import { Players } from "./components/Players";
import { Standings } from "./components/Standings";
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
    [data, setData] = useState<Snapshot | null>(null),
    [baseline, setBaseline] = useState<Snapshot | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [retry, setRetry] = useState(0);
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
  const hasLive =
    data?.games.some((g) => g.state === "LIVE" || g.state === "CRIT") ??
    false;
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => setRetry((x) => x + 1), 30000);
    return () => clearInterval(id);
  }, [hasLive]);
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
        sort === "importance"
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
  const sourceSeason =
    analysis && Object.values(analysis.table).some((t: any) => t.gp > 0)
      ? season
      : (manifest?.seasons[1] ?? season);
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
            selected={selected}
            onChange={changeTeams}
          />
          <nav className="view-tabs" aria-label="Dashboard views">
            {[
              ["games", "Game center"],
              ["trends", "Team trends"],
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
              {selectedTeams.slice(0, 6).map((t) => (
                <TeamSummary
                  key={t.id}
                  team={t}
                  standing={analysis.table[t.id]}
                  baseline={baselineAnalysis?.table[t.id]}
                  games={data.games}
                />
              ))}
            </section>
            {selected.length > 6 && (
              <p className="detail-note">
                Showing six summary cards; all {selected.length} selected teams
                are included below.
              </p>
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
              <Trends
                teams={selectedTeams}
                table={analysis.table}
                season={season}
              />
            )}{" "}
            {view === "players" && (
              <Players teams={selectedTeams} season={sourceSeason} />
            )}{" "}
            {view === "standings" && (
              <Standings
                teams={teams}
                table={analysis.table}
                selected={selected}
              />
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
