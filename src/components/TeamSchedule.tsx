import { lazy, Suspense, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Game, Team } from "../types";
import { seasonSeriesBeforeGame } from "../lib/model.mjs";
import { teamRanks } from "../lib/ranks.mjs";
import { defaultMonth, monthGrid, monthKey, monthLabel, nextIndex, recordOf, seasonMonths, sideOf, teamGames } from "../lib/team-schedule.mjs";
import { useEtToday } from "../hooks/useEtToday";
import { Icon } from "./icons";
import { TeamLogo } from "./TeamLogo";

const GameOverlay = lazy(() => import("./GameOverlay").then((m) => ({ default: m.GameOverlay })));
type Item = ReturnType<typeof sideOf>;
type Filter = "all" | "final" | "upcoming";

const time = (iso: string) => new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const dayParts = (date: string) => {
  const d = new Date(`${date}T12:00:00Z`);
  return { wd: d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }), md: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }) };
};
const resultText = (i: Item) => (i.status === "upcoming" ? time(i.start) : `${i.us ?? 0}–${i.them ?? 0}${i.ot ? ` ${i.ot}` : ""}`);

interface Props { games: Game[]; teams: Team[]; defaultTeam?: string; analysis: any; baseline: any; baselineTable?: any; sourceSeason: number }

/** A team's whole season: a calendar that opens on this month (the default), or a list of cards that opens on the game closest to being played. */
export function TeamSchedule({ games, teams, defaultTeam, analysis, baseline, baselineTable, sourceSeason }: Props) {
  const [teamId, setTeamId] = useState(defaultTeam && teams.some((t) => t.id === defaultTeam) ? defaultTeam : teams[0]?.id);
  const [mode, setMode] = useState<"list" | "calendar">("calendar");
  const [filter, setFilter] = useState<Filter>("all");
  const today = useEtToday();
  const team = teams.find((t) => t.id === teamId)!;
  const items: Item[] = useMemo(() => teamGames(games, teamId).map((g: Game) => sideOf(g, teamId)), [games, teamId]);
  const record = useMemo(() => recordOf(items), [items]);
  const counts = useMemo(() => ({ final: items.filter((i) => i.status === "final").length, upcoming: items.filter((i) => i.status !== "final").length }), [items]);
  const nextId = items[nextIndex(items)]?.id;
  const shown = useMemo(() => items.filter((i) => (filter === "all" ? true : filter === "final" ? i.status === "final" : i.status !== "final")), [items, filter]);
  const [month, setMonth] = useState(() => defaultMonth(items, today));
  const months = useMemo(() => seasonMonths(items), [items]);
  const [centerId, setCenterId] = useState<number | null>(null);
  const scrollAtOpen = useRef(0);
  const root = useRef<HTMLElement>(null);

  // The list opens on the game closest to being played, with the rest of the season above and below it.
  useLayoutEffect(() => {
    if (mode !== "list") return;
    const next = root.current?.querySelector<HTMLElement>("[data-next]");
    const last = root.current?.querySelector<HTMLElement>("[data-last]");
    (filter === "final" ? last : next ?? last)?.scrollIntoView({ block: filter === "all" ? "center" : "nearest" });
  }, [mode, teamId, filter]); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => { setMonth(defaultMonth(items, today)); }, [teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const jump = () => root.current?.querySelector<HTMLElement>("[data-next]")?.scrollIntoView({ block: "center", behavior: document.documentElement.dataset.motion === "off" ? "auto" : "smooth" });
  const open = (g: Game) => { scrollAtOpen.current = window.scrollY; setCenterId(g.id); };
  const teamOf = (id: string) => teams.find((t) => t.id === id)!;
  const centerGame = centerId != null ? games.find((g) => g.id === centerId) : undefined;
  const ranks = useMemo(() => (analysis && centerGame ? teamRanks(analysis.before[centerGame.id], teams) : undefined), [analysis, centerGame, teams]);

  const card = (i: Item, k: number) => {
    const { wd, md } = dayParts(i.date), opp = teamOf(i.opp);
    const newMonth = k === 0 || monthKey(shown[k - 1].date) !== monthKey(i.date);
    const first = i.id === nextId;
    return (
      <li key={i.id} data-game-id={i.id} data-status={i.status} {...(first ? { "data-next": "" } : {})} {...(k === shown.length - 1 ? { "data-last": "" } : {})}>
        {newMonth && <h3 className="ts-month">{monthLabel(monthKey(i.date))}</h3>}
        {first && <p className="ts-now">{i.status === "live" ? "Playing now" : i.status === "upcoming" ? "Next game" : "Last game of the season"}</p>}
        <button type="button" className={`ts-card ${i.status}${i.result ? ` r-${i.result}` : ""}${first ? " is-next" : ""}`} onClick={() => open(i.game)}
          aria-label={`${wd} ${md}: ${i.home ? "home against" : "at"} ${opp.name}, ${i.status === "upcoming" ? `${time(i.start)}` : i.status === "live" ? `live, ${i.us} to ${i.them}` : `${i.result === "W" ? "won" : i.result === "OTL" ? "lost in overtime" : "lost"} ${i.us} to ${i.them}${i.ot ? ` in ${i.ot === "SO" ? "a shootout" : "overtime"}` : ""}`}. Open Game Center`}>
          <span className="ts-date"><b>{wd}</b><span>{md}</span></span>
          <span className="ts-opp"><TeamLogo id={opp.id} size={36} /><span><em>{i.home ? "vs" : "@"}</em> <b>{opp.name}</b><small>{i.game.venue || (i.home ? team.city : opp.city)}</small></span></span>
          <span className="ts-res">
            {i.status === "final" ? <><b className={`ts-badge ${i.result ?? ""}`}>{i.result ?? "–"}</b><span>{resultText(i)}</span></> : i.status === "live" ? <><b className="ts-badge live">LIVE</b><span>{i.us}–{i.them}</span></> : <span className="ts-time">{resultText(i)}</span>}
          </span>
        </button>
      </li>
    );
  };

  const weeks = useMemo(() => monthGrid(month, items), [month, items]);
  const mi = months.indexOf(month);
  const step = (n: number) => months[mi + n] && setMonth(months[mi + n]);

  return (
    <section ref={root} className="team-schedule" aria-label="Team schedule">
      <header className="ts-head">
        <div className="ts-team">
          <TeamLogo id={team.id} size={44} />
          <div>
            <h1>{team.name}</h1>
            <p data-testid="ts-record">{record.w}–{record.l}–{record.otl} · {record.pts} pts · {counts.final} completed · {counts.upcoming} upcoming</p>
          </div>
        </div>
        <div className="ts-tools">
          <label className="ts-pick"><span className="sr-only">Team</span>
            <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setFilter("all"); }} aria-label="Team">
              {[...teams].sort((a, b) => a.name.localeCompare(b.name)).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          </label>
          <div className="ts-seg" role="group" aria-label="View">
            <button type="button" aria-pressed={mode === "list"} onClick={() => setMode("list")}>List</button>
            <button type="button" aria-pressed={mode === "calendar"} onClick={() => setMode("calendar")}>Calendar</button>
          </div>
        </div>
      </header>

      {mode === "list" ? (
        <>
          <div className="ts-filters" role="group" aria-label="Show games">
            <button type="button" className="ts-chip" aria-pressed={filter === "all"} onClick={() => setFilter("all")}><b>{items.length}</b> season</button>
            <button type="button" className="ts-chip" aria-pressed={filter === "final"} onClick={() => setFilter("final")}><b>{counts.final}</b> completed</button>
            <button type="button" className="ts-chip" aria-pressed={filter === "upcoming"} onClick={() => setFilter("upcoming")}><b>{counts.upcoming}</b> upcoming</button>
            <button type="button" className="ts-jump" onClick={jump}><span className="ts-rot"><Icon name="chevron" size={16} /></span> Next game</button>
          </div>
          {shown.length ? <ol className="ts-list" data-testid="ts-list">{shown.map(card)}</ol> : <p className="ts-empty">No games here yet.</p>}
        </>
      ) : (
        <div className="ts-cal" data-testid="ts-calendar">
          <div className="ts-cal-bar">
            <button type="button" className="ts-step" aria-label="Previous month" disabled={mi <= 0} onClick={() => step(-1)}><span className="sb-flip"><Icon name="chevron" size={18} /></span></button>
            <h2 data-testid="ts-month">{monthLabel(month)}</h2>
            <button type="button" className="ts-step" aria-label="Next month" disabled={mi < 0 || mi >= months.length - 1} onClick={() => step(1)}><Icon name="chevron" size={18} /></button>
            <button type="button" className="ts-today" onClick={() => setMonth(defaultMonth(items, today))}>Today</button>
          </div>
          <div className="ts-grid" role="grid" aria-label={monthLabel(month)}>
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => <div key={d} className="ts-wd" role="columnheader">{d}</div>)}
            {weeks.flat().map((d) => (
              <div key={d.date} role="gridcell" className={`ts-day${d.inMonth ? "" : " out"}${d.date === today ? " today" : ""}`} data-date={d.date}>
                <span className="ts-n">{d.day}</span>
                {d.games.map((i: Item) => (
                  <button key={i.id} type="button" className={`ts-gchip ${i.status}${i.result ? ` r-${i.result}` : ""}`} onClick={() => open(i.game)}
                    aria-label={`${i.home ? "Home against" : "At"} ${teamOf(i.opp).name}, ${i.status === "upcoming" ? time(i.start) : i.status === "live" ? "live" : `${i.result ?? ""} ${i.us} to ${i.them}`}. Open Game Center`}>
                    <TeamLogo id={i.opp} size={20} />
                    <span className="ts-gtext"><em>{i.home ? "vs" : "@"}</em> <b className="ts-abbr">{i.opp}</b> {i.status === "upcoming" ? time(i.start).replace(" ", "").toLowerCase() : `${i.result ?? ""} ${i.us}–${i.them}`}</span>
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="ts-legend" aria-hidden="true"><i className="W" /> Win <i className="OTL" /> Overtime loss <i className="L" /> Loss <i className="up" /> Upcoming</p>
        </div>
      )}

      {centerGame && analysis && (
        <Suspense fallback={null}>
          <GameOverlay
            game={centerGame}
            home={teamOf(centerGame.home)}
            away={teamOf(centerGame.away)}
            before={analysis.before[centerGame.id]}
            baseline={baseline && baseline.season < centerGame.season ? baselineTable : undefined}
            ranks={ranks}
            sourceSeason={sourceSeason}
            analysis={analysis.analysis[centerGame.id]}
            allGames={games}
            series={seasonSeriesBeforeGame(games, centerGame)}
            returnTo={scrollAtOpen.current}
            onClose={() => setCenterId(null)}
          />
        </Suspense>
      )}
    </section>
  );
}
