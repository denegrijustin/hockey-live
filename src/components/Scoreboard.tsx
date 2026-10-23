import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type { Game, Team } from "../types";
import { finished, recordBeforeGame, seasonSeriesBeforeGame } from "../lib/model.mjs";
import { isLive } from "../lib/game-data.mjs";
import { projectGame } from "../lib/projection.mjs";
import { teamRanks } from "../lib/ranks.mjs";
import { liveHeat, pregameHomeWin, slotOf, upsetBrewing, watchability } from "../lib/watchability.mjs";
import { Icon } from "./icons";
import { TeamLogo } from "./TeamLogo";

const GameOverlay = lazy(() => import("./GameOverlay").then((m) => ({ default: m.GameOverlay })));

const dayLabel = (day: string, today: string) => {
  const diff = Math.round((Date.parse(`${day}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Tomorrow";
  if (diff === -1) return "Yesterday";
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
};
const fullDate = (day: string) => new Date(`${day}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

function statusOf(g: Game) {
  if (finished(g)) return { text: `Final${g.end && g.end !== "REG" ? ` / ${g.end}` : ""}`, kind: "final" };
  if (isLive(g)) {
    const period = g.periodType === "SO" ? "SO" : g.periodType === "OT" ? "OT" : `P${g.period ?? "–"}`;
    return { text: g.intermission ? `${period} · Intermission` : `${period} · ${g.clock ?? "Updating"}`, kind: "live" };
  }
  return { text: new Date(g.start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }), kind: "soon" };
}

type Status = "all" | "live" | "final" | "soon";
type Section = { key: "upset" | "live" | "soon" | "final"; title: string; note?: string; games: Game[]; slots: boolean; live?: boolean };

const slotLabel = (iso: string) => {
  const from = new Date(iso), to = new Date(from.getTime() + 3600000);
  const t = (d: Date) => d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${t(from)}–${t(to)}`;
};
/** Puck-drop slots in time order, the most watchable game first within each slot. */
function slotsOf(games: Game[], rated: Map<number, { score: number; heat: number }>) {
  const by = new Map<string, Game[]>();
  for (const g of [...games].sort((a, b) => a.start.localeCompare(b.start))) {
    const k = slotOf(g.start);
    by.set(k, [...(by.get(k) ?? []), g]);
  }
  return [...by].map(([key, list]) => ({ key, label: slotLabel(key), games: list.sort((a, b) => (rated.get(b.id)?.heat ?? 0) - (rated.get(a.id)?.heat ?? 0) || a.start.localeCompare(b.start)) }));
}

interface Props {
  games: Game[];
  teams: Team[];
  analysis: any;
  baseline: any;
  baselineTable?: any;
  sourceSeason: number;
  loading?: boolean;
}

/**
 * The home screen: the league's games for a day with win probability and nothing else. Tap a game for a few key stats;
 * from there, "Full game center" opens everything.
 */
/** The NHL's calendar day (Eastern time), re-read every minute so a page left open rolls over at midnight. */
function useEtToday() {
  const read = () => new Date().toLocaleDateString("en-CA", { timeZone: "America/New_York" });
  const [today, setToday] = useState(read);
  useEffect(() => {
    const id = setInterval(() => setToday(read()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function Scoreboard({ games, teams, analysis, baseline, baselineTable, sourceSeason, loading }: Props) {
  const today = useEtToday();
  const days = useMemo(() => [...new Set(games.filter((g) => g.type !== 0).map((g) => g.date))].sort(), [games]);
  // Open on today; on an off day, the next day with games (or the last one, at the end of the season).
  const auto = days.includes(today) ? today : (days.find((d) => d > today) ?? days.at(-1) ?? today);
  const [picked, setPicked] = useState<string | null>(null);
  const day = picked ?? auto;
  const index = days.indexOf(day);
  const dayGames = useMemo(() => games.filter((g) => g.date === day), [games, day]);
  const [status, setStatus] = useState<Status>("all");
  // Watchability, heat and upset flags for the day's games, from the same model the win-probability bars use.
  const rated = useMemo(() => new Map(dayGames.map((g) => {
    const before = analysis?.before[g.id];
    const base = baseline && baseline.season < g.season ? baselineTable : undefined;
    const pre = before ? pregameHomeWin(g, before, base) : null;
    const score = watchability(analysis?.analysis[g.id]?.score, pre);
    return [g.id, { score, heat: liveHeat(score, g), upset: !!upsetBrewing(g, pre) }] as const;
  })), [dayGames, analysis, baseline, baselineTable]);
  const counts = useMemo(() => ({
    live: dayGames.filter(isLive).length,
    final: dayGames.filter(finished).length,
    soon: dayGames.filter((g) => !isLive(g) && !finished(g)).length,
  }), [dayGames]);
  const sections = useMemo(() => {
    const hot = (a: Game, b: Game) => (rated.get(b.id)?.heat ?? 0) - (rated.get(a.id)?.heat ?? 0) || a.start.localeCompare(b.start);
    const live = dayGames.filter(isLive);
    const all: Section[] = [
      { key: "upset", title: "Upset brewing", note: "The underdog is ahead late.", games: live.filter((g) => rated.get(g.id)?.upset).sort(hot), slots: false, live: true },
      { key: "live", title: "In progress", games: live.filter((g) => !rated.get(g.id)?.upset).sort(hot), slots: true, live: true },
      { key: "soon", title: "Upcoming", games: dayGames.filter((g) => !isLive(g) && !finished(g)), slots: true },
      { key: "final", title: "Completed", games: dayGames.filter(finished), slots: true },
    ];
    const show = (x: Section) => status === "all" || (status === "live" ? x.key === "upset" || x.key === "live" : x.key === status);
    return all.filter((x) => x.games.length && show(x));
  }, [dayGames, rated, status]);
  const [openId, setOpenId] = useState<number | null>(null);
  const [centerId, setCenterId] = useState<number | null>(null);
  const scrollAtOpen = useRef(0);
  const ranksFor = useMemo(() => (analysis ? (id: number) => teamRanks(analysis.before[id], teams) : null), [analysis, teams]);
  const teamOf = (id: string) => teams.find((t) => t.id === id)!;
  const centerGame = centerId != null ? games.find((g) => g.id === centerId) : undefined;

  return (
    <section className="scoreboard" aria-label="Scoreboard">
      <div className="sb-days">
        <button className="sb-step" aria-label="Previous day" disabled={index <= 0 && days.length > 0 && day <= days[0]} onClick={() => { setPicked(days[Math.max(0, index - 1)] ?? day); setOpenId(null); }}>
          <span className="sb-flip"><Icon name="chevron" size={20} /></span>
        </button>
        <div className="sb-day">
          <h1>{dayLabel(day, today)}</h1>
          <span>{fullDate(day)}</span>
        </div>
        <button className="sb-step" aria-label="Next day" disabled={index >= days.length - 1} onClick={() => { setPicked(days[Math.min(days.length - 1, index + 1)] ?? day); setOpenId(null); }}>
          <Icon name="chevron" size={20} />
        </button>
      </div>
      <div className="sb-filters" role="group" aria-label="Show games by status">
        {([["live", counts.live, "in progress"], ["final", counts.final, "completed"], ["soon", counts.soon, "upcoming"]] as const).map(([key, n, label]) => (
          <button key={key} type="button" className={`sb-chip ${key}`} aria-pressed={status === key} disabled={!n && status !== key} onClick={() => { setStatus(status === key ? "all" : key); setOpenId(null); }}>
            {key === "live" && n > 0 && <i aria-hidden="true" />}<b>{n}</b> {label}
          </button>
        ))}
      </div>
      {loading && !games.length && <p className="sb-empty" role="status">Loading the scoreboard…</p>}
      {!loading && !sections.length && <p className="sb-empty">{status === "all" ? "No games on this day." : "Nothing here on this day."}</p>}
      {sections.map((section) => (
        <div className={`sb-group ${section.key}`} key={section.key} aria-label={section.title} role="region">
          <h2 className="sb-title">{section.live && <i className="sb-livedot" aria-hidden="true" />}{section.title} <span className="sb-count">{section.games.length}</span>{section.note && <small>{section.note}</small>}</h2>
          {(section.slots ? slotsOf(section.games, rated) : [{ key: "all", label: "", games: section.games }]).map((slot) => (
            <div className="sb-slot" key={slot.key} data-slot={slot.key}>
              {slot.label && <h3 className="sb-slot-h">{slot.label}</h3>}
              <ul className="sb-list">
                {slot.games.map((g) => (
                  <li key={g.id}>
                    <ScoreRow
                      game={g}
                      away={teamOf(g.away)}
                      home={teamOf(g.home)}
                      before={analysis?.before[g.id]}
                      baseline={baseline && baseline.season < g.season ? baselineTable : undefined}
                      allGames={games}
                      watch={rated.get(g.id)?.score}
                      open={openId === g.id || (status === "final" && section.key === "final")}
                      onToggle={() => setOpenId(openId === g.id ? null : g.id)}
                      onFull={() => { scrollAtOpen.current = window.scrollY; setCenterId(g.id); }}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      {centerGame && analysis && (
        <Suspense fallback={null}>
          <GameOverlay
            game={centerGame}
            home={teamOf(centerGame.home)}
            away={teamOf(centerGame.away)}
            before={analysis.before[centerGame.id]}
            baseline={baseline && baseline.season < centerGame.season ? baselineTable : undefined}
            ranks={ranksFor?.(centerGame.id)}
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

function ScoreRow({ game, away, home, before, baseline, allGames, watch, open, onToggle, onFull }: {
  game: Game; away: Team; home: Team; before: any; baseline: any; allGames: Game[]; watch?: number; open: boolean; onToggle: () => void; onFull: () => void;
}) {
  const status = statusOf(game);
  const showScore = status.kind !== "soon" && game.awayScore != null && game.homeScore != null;
  const projection = useMemo(() => (before ? projectGame(game, before, baseline) : null), [game, before, baseline]);
  const homePct = projection ? Math.round(projection.homeWin * 100) : null;
  const awayPct = homePct != null ? 100 - homePct : null;
  const winner = status.kind === "final" && showScore ? (game.homeScore! > game.awayScore! ? "home" : "away") : null;
  const label = `${away.name} at ${home.name}, ${status.text}${showScore ? `, ${game.awayScore} to ${game.homeScore}` : ""}${homePct != null ? `, win probability ${away.id} ${awayPct} percent, ${home.id} ${homePct} percent` : ""}`;
  return (
    <article className={`sb-row ${status.kind}${open ? " open" : ""}`} data-game={game.id}>
      <button className="sb-main" aria-expanded={open} aria-label={label} onClick={onToggle}>
        <span className="sb-status">{status.kind === "live" && <i aria-hidden="true" />}{status.text}{watch != null && status.kind !== "final" && <span className="sb-watch" title="Watchability: how worth watching this game is">Watch <b>{watch}</b></span>}</span>
        {([[away, game.awayScore, "away"], [home, game.homeScore, "home"]] as const).map(([team, score, side]) => (
          <span className={`sb-team${winner && winner !== side ? " lost" : ""}`} key={team.id}>
            <TeamLogo id={team.id} size={32} />
            <span className="sb-name">{team.name.endsWith(team.short) ? <>{team.name.slice(0, -team.short.length)}<b>{team.short}</b></> : <b>{team.name}</b>}</span>
            <span className="sb-score">{showScore ? score : ""}</span>
          </span>
        ))}
        {homePct != null && awayPct != null && (
          <span className="sb-prob" role="img" aria-label={`Win probability: ${away.id} ${awayPct} percent, ${home.id} ${homePct} percent`}>
            <span className="sb-pct">{away.id} {awayPct}%</span>
            <span className="sb-bar"><i style={{ width: `${awayPct}%` }} /><i /></span>
            <span className="sb-pct">{homePct}% {home.id}</span>
          </span>
        )}
      </button>
      {open && <KeyStats game={game} away={away} home={home} before={before} allGames={allGames} projection={projection} onFull={onFull} />}
    </article>
  );
}

function KeyStats({ game, away, home, before, allGames, projection, onFull }: { game: Game; away: Team; home: Team; before: any; allGames: Game[]; projection: any; onFull: () => void }) {
  const rec = (t: Team) => { const r = recordBeforeGame(allGames, game, t.id); return `${r.w}-${r.l}-${r.ot}`; };
  const per = (t: Team, k: "gf" | "ga") => { const row = before?.[t.id]; return row?.gp ? (row[k] / row.gp).toFixed(1) : "–"; };
  const form = (t: Team) => (before?.[t.id]?.results ?? []).slice(-5);
  const shots = game.homeShots != null && game.awayShots != null;
  return (
    <div className="sb-stats" data-testid="key-stats">
      <div className="sb-heads" aria-hidden="true"><span /><span>{away.id}</span><span>{home.id}</span></div>
      <dl>
        <div><dt>Record</dt><dd>{rec(away)}</dd><dd>{rec(home)}</dd></div>
        <div><dt>Goals for / against per game</dt><dd>{per(away, "gf")} / {per(away, "ga")}</dd><dd>{per(home, "gf")} / {per(home, "ga")}</dd></div>
        <div>
          <dt>Last 5</dt>
          {[away, home].map((t) => (
            <dd key={t.id} className="sb-form" aria-label={`${t.id} last five: ${form(t).map((r: any) => r.outcome).join(" ") || "none yet"}`}>
              {form(t).length ? form(t).map((r: any, i: number) => <em key={i} data-o={r.outcome} aria-hidden="true">{r.outcome}</em>) : "–"}
            </dd>
          ))}
        </div>
        {shots && <div><dt>Shots on goal</dt><dd>{game.awayShots}</dd><dd>{game.homeShots}</dd></div>}
        {projection?.score && <div><dt>Projected final</dt><dd>{projection.score.away}</dd><dd>{projection.score.home}</dd></div>}
      </dl>
      <button className="sb-full" onClick={onFull}>
        Full game center <Icon name="chevron" size={18} />
      </button>
    </div>
  );
}
