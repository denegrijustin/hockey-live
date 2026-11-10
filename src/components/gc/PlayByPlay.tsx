import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowLeftRight, Circle, CircleDot, Crosshair, Flag, Goal, Pause, Shield, Zap, type LucideIcon } from "lucide-react";
import { useGameCenter } from "./GameCenterContext";
import { usePlayerProfile } from "../player/PlayerContext";
import { TeamLink } from "../TeamProfile";
import { gaugeColors } from "../../lib/kits";
import { FILTER_GROUPS, applyFilters, defaultNewestFirst, eventFlags, eventLabel, goalList, groupByPeriod, groupOf, importance, jumpToGoals, mergeVoided, penaltyMinutes, periodList, playsSignature, sideOf, sortPlays, strengthLabel } from "../../lib/pbp.mjs";
import "./pbp.css";

/**
 * Play-by-play pane. Everything is read from useGameCenter() (plays, game, feed.roster); nothing is fetched here.
 * Default order: chronological for finished/upcoming games, NEWEST FIRST while the game is live (the toggle overrides it).
 * Events are rendered append-only, keyed by `${gameId}:${eventId}`; rows are memoised so a poll that adds one play re-renders one row.
 * `focusEvent` (event id) scrolls to and highlights an event; it falls back to the `event=` URL parameter. The Game Center UI
 * context (Agent 1) can pass it as a prop. Strength labels, goal numbering and score after: see src/lib/pbp.mjs (Official / Derived flags).
 */
type Play = NonNullable<ReturnType<typeof useGameCenter>["plays"]>[number];
type Person = { id: number; name: string } | null | undefined;
const ICONS: Record<string, LucideIcon> = { goals: Goal, shots: Crosshair, penalties: Flag, hits: Zap, blocks: Shield, faceoffs: CircleDot, turnovers: ArrowLeftRight, stoppages: Pause, other: Circle };
const reduced = () => { try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; } catch { return false; } };
const urlEvent = () => { try { const v = Number(new URLSearchParams(window.location.search).get("event")); return Number.isFinite(v) && v > 0 ? v : undefined; } catch { return undefined; } };

type RosterEntry = { id: number; name: string; team: string | null; number: number | null; headshot: string | null };

function PlayerLink({ person, roster, open }: { person: Person; roster: Map<number, RosterEntry>; open: (p: any) => void }) {
  if (!person) return null;
  const r = roster.get(person.id);
  const label = person.name || r?.name || "Player";
  return (
    <button type="button" className="pbp-player" onClick={() => open({ id: person.id, name: label, team: r?.team ?? undefined, headshot: r?.headshot ?? null, number: r?.number ?? null })} aria-label={`Open ${label} profile`}>
      {r?.number != null && <span className="pbp-num">#{r.number}</span>}{label}
    </button>
  );
}

type RowProps = { gameId: number | string; play: Play; side: "home" | "away" | null; goal?: ReturnType<typeof goalList>[number]; voided: boolean; changed: boolean; focused: boolean; home: string; away: string; roster: Map<number, RosterEntry>; open: (p: any) => void };

const Row = memo(function Row({ gameId, play: p, side, goal, voided, changed, focused, home, away, roster, open }: RowProps) {
  const group = groupOf(p), tier = importance(p), Icon = ICONS[group];
  const actor: Person = p.pid ? { id: p.pid, name: p.player ?? "" } : p.other;
  const strength = strengthLabel(p.sit, side);
  const showStrength = strength && (p.type === "goal" || (p.type === "penalty" && strength.kind !== "even"));
  const mins = penaltyMinutes(p);
  const target = p.type === "penalty" ? "drawn/served by" : p.type === "hit" ? "on" : p.type === "blocked-shot" ? "blocked by" : p.type === "faceoff" ? "vs" : null;
  const scoreText = goal?.score ? `${away} ${goal.score.away}, ${home} ${goal.score.home}` : null;
  const time = p.time ? `${p.time}` : "—";
  const isGoal = p.type === "goal";
  return (
    <li id={`ev-${p.id}`} className="pbp-event" data-testid="pbp-event" data-event-id={p.id} data-key={`${gameId}:${p.id}`} data-type={p.type} data-group={group} data-tier={tier} data-side={side ?? "neutral"} data-voided={voided || undefined} data-focus={focused || undefined} tabIndex={-1}>
      <span className="pbp-time" title={p.left ? `${p.left} left in the period` : undefined}>{time}</span>
      <span className="pbp-icon" aria-hidden="true"><Icon size={tier === "high" ? 20 : 16} strokeWidth={tier === "high" ? 2.4 : 1.8} /></span>
      <div className="pbp-body">
        <p className="pbp-main">
          {isGoal && <span className="pbp-goal-tag">{goal?.n ? `Goal ${goal.n}` : "Goal"}</span>}
          <span className={voided ? "pbp-struck" : undefined}>{eventLabel(p)}</span>
          {p.team && <TeamLink id={p.team} className="pbp-team">{p.team}</TeamLink>}
          {voided && <span className="pbp-badge pbp-badge-void">Disallowed</span>}
          {changed && !voided && <span className="pbp-badge pbp-badge-upd">Updated</span>}
          {mins && <span className="pbp-badge">{mins}</span>}
          {showStrength && <span className="pbp-badge" data-kind={strength.kind}>{strength.label}</span>}
        </p>
        {(actor || p.secondary) && (
          <p className="pbp-people">
            <PlayerLink person={actor} roster={roster} open={open} />
            {target && p.secondary && <span className="pbp-rel">{p.type === "faceoff" ? "vs" : target}</span>}
            {p.secondary && <PlayerLink person={p.secondary} roster={roster} open={open} />}
          </p>
        )}
        {isGoal && (p.assists?.length ?? 0) > 0 && <p className="pbp-people"><span className="pbp-rel">Assists</span>{p.assists!.map((a) => <PlayerLink key={a.id} person={a} roster={roster} open={open} />)}</p>}
        {isGoal && p.assists && p.assists.length === 0 && <p className="pbp-people"><span className="pbp-rel">Unassisted</span></p>}
        {isGoal && p.goalie && <p className="pbp-people"><span className="pbp-rel">Goalie</span><PlayerLink person={p.goalie} roster={roster} open={open} /></p>}
        {isGoal && scoreText && <p className="pbp-score">{scoreText}{goal?.derived && <span className="pbp-derived" title="The feed gave no score for this goal; counted from the goals listed here"> Derived</span>}</p>}
      </div>
    </li>
  );
});

export default function PlayByPlay({ focusEvent }: { focusEvent?: number }) {
  const gc = useGameCenter() as ReturnType<typeof useGameCenter> & { voided?: unknown[]; changed?: unknown[] };
  const { game, feed, plays: rawPlays, live, error } = gc;
  const open = usePlayerProfile();
  const [groups, setGroups] = useState<string[]>([]);
  const [team, setTeam] = useState<string>("all");
  const [manualOrder, setManualOrder] = useState<boolean | null>(null);
  const [urlFocus, setUrlFocus] = useState<number | undefined>(urlEvent);
  const [jump, setJump] = useState<{ id: number; n: number } | null>(null);
  const root = useRef<HTMLElement>(null);
  const newest = manualOrder ?? defaultNewestFirst(live);

  useEffect(() => { const f = () => setUrlFocus(urlEvent()); window.addEventListener("popstate", f); return () => window.removeEventListener("popstate", f); }, []);

  const roster = useMemo(() => new Map<number, RosterEntry>((feed?.roster ?? []).map((r) => [r.id, r])), [feed?.roster]);
  const flags = useMemo(() => eventFlags(gc.voided, gc.changed), [gc.voided, gc.changed]);
  // Memoised by the last order / goal detail, so an identical poll does no work.
  const sig = playsSignature(rawPlays);
  const all = useMemo(() => sortPlays(mergeVoided(rawPlays, gc.voided)), [sig, gc.voided]); // eslint-disable-line react-hooks/exhaustive-deps
  const goals = useMemo(() => goalList(all, game, { voided: flags.voided }), [all, game, flags.voided]);
  const goalById = useMemo(() => new Map(goals.map((g) => [g.id, g])), [goals]);
  const shown = useMemo(() => applyFilters(all, { groups, team }), [all, groups, team]);
  const periods = useMemo(() => groupByPeriod(shown), [shown]);
  const nav = useMemo(() => periodList(shown), [shown]);
  const counts = useMemo(() => { const c: Record<string, number> = {}; for (const p of all) c[groupOf(p)] = (c[groupOf(p)] ?? 0) + 1; return c; }, [all]);
  const teamCounts = useMemo(() => ({ neutral: all.filter((p) => !p.team).length }), [all]);
  const colors = useMemo(() => gaugeColors(game.away, game.home), [game.away, game.home]);
  const target = jump?.id ?? focusEvent ?? urlFocus;
  const targetKey = `${jump?.n ?? 0}:${target ?? ""}`;

  // Scroll to and highlight the target event. If a filter hides it, the filters are cleared first.
  const cleared = useRef<string>("");
  useEffect(() => {
    if (target == null || !all.some((p) => p.id === target)) return;
    if (!shown.some((p) => p.id === target)) { if (cleared.current !== targetKey) { cleared.current = targetKey; setGroups([]); setTeam("all"); } return; }
    let frames = 0, raf = 0;
    const go = () => {
      const el = document.getElementById(`ev-${target}`);
      if (el && el.offsetParent !== null) { el.scrollIntoView({ block: "center", behavior: reduced() ? "auto" : "smooth" }); el.focus({ preventScroll: true }); return; }
      if (frames++ < 30) raf = requestAnimationFrame(go); // the pane may be hidden (inactive tab) or not laid out yet
    };
    raf = requestAnimationFrame(go);
    return () => cancelAnimationFrame(raf);
  }, [targetKey, target, all.length, shown.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback((k: string) => setGroups((g) => (g.includes(k) ? g.filter((x) => x !== k) : [...g, k])), []);
  const goTo = (id: number | null) => { if (id != null) setJump((j) => ({ id, n: (j?.n ?? 0) + 1 })); };
  const nextGoal = (dir: 1 | -1) => goTo(jumpToGoals(all, jump?.id ?? focusEvent ?? urlFocus ?? null, dir));
  const scrollPeriod = (key: string) => { const el = document.getElementById(`pbp-period-${key.replace(/\W/g, "_")}`); el?.scrollIntoView({ block: "start", behavior: reduced() ? "auto" : "smooth" }); };
  const teams = [game.away, game.home];

  if (!feed && !error) return <section className="pbp" data-testid="pbp" aria-busy="true"><p className="pbp-state">Loading play-by-play…</p></section>;
  if (!feed && error) return <section className="pbp" data-testid="pbp"><p className="pbp-state pbp-state-err">Play-by-play is not available right now ({error}). It will appear here when the feed responds.</p></section>;
  if (!all.length) return <section className="pbp" data-testid="pbp"><p className="pbp-state">{live ? "No plays recorded yet." : "No play-by-play yet. Events appear here once the game starts."}</p></section>;

  const ordered = newest ? [...periods].reverse() : periods;
  const goalCount = goals.filter((g) => !g.voided).length;
  const chip = (key: string, label: ReactNode, on: boolean, onClick: () => void, extra?: string) => (
    <button key={key} type="button" className="pbp-chip" data-testid={`pbp-filter-${key}`} aria-pressed={on} onClick={onClick} data-extra={extra}>{label}</button>
  );
  return (
    <section className="pbp" data-testid="pbp" ref={root} aria-label="Play-by-play" style={{ "--pbp-away": colors.away, "--pbp-home": colors.home } as React.CSSProperties}>
      <div className="pbp-controls">
        <div className="pbp-row" role="group" aria-label="Event types">
          {chip("all", "All", groups.length === 0, () => setGroups([]))}
          {FILTER_GROUPS.filter((g) => counts[g.key]).map((g) => chip(g.key, <>{g.label} <span className="pbp-count">{counts[g.key]}</span></>, groups.includes(g.key), () => toggle(g.key)))}
        </div>
        <div className="pbp-row" role="group" aria-label="Team">
          {chip("team-all", "Both teams", team === "all", () => setTeam("all"))}
          {teams.map((t) => chip(`team-${t}`, t, team === t, () => setTeam(t)))}
          {teamCounts.neutral > 0 && chip("team-neutral", <>Neutral <span className="pbp-count">{teamCounts.neutral}</span></>, team === "neutral", () => setTeam("neutral"))}
          <button type="button" className="pbp-chip pbp-order" data-testid="pbp-order" aria-pressed={newest} onClick={() => setManualOrder(!newest)}>Newest first</button>
        </div>
        <div className="pbp-row" role="group" aria-label="Jump to">
          {goalCount > 0 && <>
            <button type="button" className="pbp-chip pbp-jump" data-testid="pbp-next-goal" onClick={() => nextGoal(1)}>Jump to next goal</button>
            <button type="button" className="pbp-chip pbp-jump" data-testid="pbp-prev-goal" onClick={() => nextGoal(-1)}>Previous goal</button>
          </>}
          {nav.map((n) => <button key={n.key} type="button" className="pbp-chip" data-testid={`pbp-period-${n.short}`} aria-label={`Jump to ${n.label}, ${n.count} events`} onClick={() => scrollPeriod(n.key)}>{n.short}</button>)}
        </div>
        {goals.length > 0 && (
          <ul className="pbp-goals" aria-label="Goals" data-testid="pbp-goal-list">
            {goals.map((g) => (
              <li key={g.id}><button type="button" className="pbp-chip pbp-goalchip" data-voided={g.voided || undefined} data-side={g.side ?? "neutral"} onClick={() => goTo(g.id)} aria-label={`Go to goal${g.n ? ` ${g.n}` : ""} by ${g.team ?? "unknown team"}${g.play.time ? ` at ${g.play.time}` : ""}${g.voided ? " (disallowed)" : ""}`}>
                <b>{g.team ?? "?"}</b> {g.play.player ?? "Goal"} <span className="pbp-count">{g.play.periodType === "SO" ? "SO" : `P${g.play.period} ${g.play.time ?? ""}`}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      <p className="pbp-meta" data-testid="pbp-meta">{shown.length} of {all.length} events · {newest ? "newest first" : "chronological"}{live ? " · live" : ""}</p>
      {shown.length === 0 ? (
        <p className="pbp-state">No events match these filters. <button type="button" className="pbp-link" onClick={() => { setGroups([]); setTeam("all"); }}>Show all events</button></p>
      ) : ordered.map((g) => (
        <section key={g.key} className="pbp-period" id={`pbp-period-${g.key.replace(/\W/g, "_")}`} aria-labelledby={`pbp-h-${g.key.replace(/\W/g, "_")}`}>
          <h3 id={`pbp-h-${g.key.replace(/\W/g, "_")}`} className="pbp-period-h">{g.label} <span className="pbp-count">{g.plays.length}</span></h3>
          <ol className="pbp-list" reversed={newest}>
            {(newest ? [...g.plays].reverse() : g.plays).map((p) => (
              <Row key={`${game.id}:${p.id}`} gameId={game.id} play={p} side={sideOf(p, game)} goal={goalById.get(p.id)} voided={flags.voided.has(p.id)} changed={flags.changed.has(p.id)} focused={target === p.id} home={game.home} away={game.away} roster={roster} open={open} />
            ))}
          </ol>
        </section>
      ))}
    </section>
  );
}
