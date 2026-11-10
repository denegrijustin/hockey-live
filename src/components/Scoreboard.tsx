import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTimeKey } from "../lib/display";
import type { Game, Team } from "../types";
import { finished, seasonSeriesBeforeGame } from "../lib/model.mjs";
import { byStartThenId, isCalledOff, isLive, isUpcoming } from "../lib/game-data.mjs";
import { shiftDay } from "../lib/dates.mjs";
import { projectGame } from "../lib/projection.mjs";
import { teamRanks } from "../lib/ranks.mjs";
import { matchupInsights } from "../lib/insights.mjs";
import { closeAndLate, liveHeat, pregameHomeWin, recap, slotLabel, slotOf, tierOf, upsetBrewing, upsetWon, watchBreakdown, watchability } from "../lib/watchability.mjs";
import { gameStatus } from "../lib/game-status.mjs";
import { Icon } from "./icons";
import { IntermissionRink } from "./IntermissionRink";
import { NetworkLogos } from "./NetworkLogos";
import { ScoreRing } from "./ScoreRing";
import { CompactGameFlow, useCardFeed } from "./GameData";
import { GameCardView } from "./GameCardView";
import { DateStrip, DayHeading, fullDate } from "./DateStrip";
import { InsightLine } from "./InsightLine";
import { CompletedStrip } from "./home/CompletedStrip";
import { FeaturedStrip } from "./home/FeaturedStrip";
import { HomeSection } from "./home/HomeSection";
import { LeagueIntel, type IntelLink } from "./home/LeagueIntel";
import { useMedia } from "../hooks/useMedia";
import { useEtToday } from "../hooks/useEtToday";
import { useSelectedDate } from "../hooks/useSelectedDate";
import { haptic, useChanged, useFlip } from "../motion";
import { Skeleton } from "./Skeleton";

import { OPEN_GAME_EVENT } from "../lib/open-game";

// Remembers an openGame request made while another screen was showing, so Home can open the overlay when it mounts a moment later.
let pendingOpen: { id: number; at: number } | null = null;
if (typeof window !== "undefined") window.addEventListener(OPEN_GAME_EVENT, (e) => { const id = (e as CustomEvent).detail?.id; if (Number.isFinite(id)) pendingOpen = { id, at: Date.now() }; });

const RowDetails = lazy(() => import("./home/RowDetails"));
const GameOverlay = lazy(() => import("./GameOverlay").then((m) => ({ default: m.GameOverlay })));

type Status = "all" | "live" | "final" | "soon";
type Rated = { score: number; heat: number; upset: boolean; upsetWon: number | null; pre: number | null; importance?: number; before: any; base: any };

/** Puck-drop slots in time order (half-hour slots in the viewer's clock), the most watchable game first within each slot. */
function slotsOf(games: Game[], rated: Map<number, Rated>) {
  const by = new Map<string, Game[]>();
  for (const g of [...games].sort(byStartThenId)) {
    const k = slotOf(g.start);
    by.set(k, [...(by.get(k) ?? []), g]);
  }
  return [...by].map(([key, list]) => ({ key, label: slotLabel(key), games: list.sort((a, b) => (rated.get(b.id)?.heat ?? 0) - (rated.get(a.id)?.heat ?? 0) || byStartThenId(a, b)) }));
}

interface Props {
  games: Game[];
  teams: Team[];
  analysis: any;
  baseline: any;
  baselineTable?: any;
  sourceSeason: number;
  loading?: boolean;
  /** The season could not be loaded: Home keeps its date controls and says so, with Retry. */
  error?: string;
  onRetry?: () => void;
  /** Opens the league-wide list of all games with its filters and search. */
  onBrowse?: () => void;
  /** Opens another app view (a VIEW_IDS id). */
  onNavigate?: (view: string) => void;
  /** Playoff chances by team id, `{ [id]: { chance } }`, as `chancesForCards` returns them: the same numbers as the Playoff odds tab. */
  sim?: any;
}

/**
 * A list of games whose members slide to their new places when the order changes (a game getting hotter, a filter applied).
 */
function FlipList({ games, children }: { games: Game[]; children: React.ReactNode }) {
  const ref = useRef<HTMLUListElement>(null);
  useFlip(ref, games.map((g) => g.id).join("|"));
  return <ul ref={ref} className="sb-list">{children}</ul>;
}

/** The current time, refreshed every `ms`, so "In 20 min" and the Worth-watching strip stay current. */
function useTick(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => !document.hidden && setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

/**
 * The home screen. Top to bottom: the day (heading and schedule strip), the status filter, then only the sections that have games for that day:
 * Live, Upcoming (by puck-drop slot), Worth watching, Completed, Postponed, League intelligence. A game is in exactly one of Live / Upcoming / Completed.
 */
export function Scoreboard({ games, teams, analysis, baseline, baselineTable, sourceSeason, loading, error, onRetry, onBrowse, onNavigate, sim }: Props) {
  const today = useEtToday();
  const days = useMemo(() => [...new Set(games.filter((g) => g.type !== 0).map((g) => g.date))].sort(), [games]);
  const counts = useMemo(() => {
    const by: Record<string, number> = {};
    for (const g of games) if (g.type !== 0) by[g.date] = (by[g.date] ?? 0) + 1;
    return by;
  }, [games]);
  const { date: day, setDate, min, max } = useSelectedDate({ days, today, push: true });
  const dayGames = useMemo(() => games.filter((g) => g.date === day && g.type !== 0), [games, day]);
  const [status, setStatus] = useState<Status>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  // Watchability, heat and upset flags, from the same model the win-probability bars use.
  const rate = useCallback((g: Game): Rated => {
    const before = analysis?.before[g.id];
    const base = baseline && baseline.season < g.season ? baselineTable : undefined;
    const pre = before ? pregameHomeWin(g, before, base) : null;
    const importance = analysis?.analysis[g.id]?.score;
    const score = watchability(importance, pre);
    return { score, heat: liveHeat(score, g), upset: !!upsetBrewing(g, pre), upsetWon: upsetWon(g, pre), pre, importance, before, base };
  }, [analysis, baseline, baselineTable]);
  const rated = useMemo(() => new Map(dayGames.map((g) => [g.id, rate(g)] as const)), [dayGames, rate]);
  const phone = useMedia("(max-width: 720px)");
  // A short buzz when a game that had not started goes live (never on first load, and only for movement the page has seen).
  const liveSeen = useRef<Map<number, boolean> | null>(null);
  useEffect(() => {
    const now = new Map(games.map((g) => [g.id, isLive(g)] as const));
    const before = liveSeen.current;
    liveSeen.current = now;
    if (before && [...now].some(([id, live]) => live && before.get(id) === false)) haptic();
  }, [games]);
  const now = useTick(30_000);
  const ranksFor = useMemo(() => (analysis ? (id: number) => teamRanks(analysis.before[id], teams) : null), [analysis, teams]);
  const teamOf = useCallback((id: string) => teams.find((t) => t.id === id)!, [teams]);

  // Each game lands in exactly one list. The order of the tests is the rule: live, then finished, then called off, else upcoming.
  const lists = useMemo(() => {
    const hot = (a: Game, b: Game) => (rated.get(b.id)?.heat ?? 0) - (rated.get(a.id)?.heat ?? 0) || byStartThenId(a, b);
    const live = dayGames.filter(isLive).sort(hot);
    const done = dayGames.filter((g) => !isLive(g) && finished(g));
    const rest = dayGames.filter((g) => !isLive(g) && !finished(g));
    const off = rest.filter(isCalledOff);
    const soon = rest.filter((g) => !isCalledOff(g) && isUpcoming(g)).sort(byStartThenId);
    return { live, soon, done: done.sort((a, b) => byStartThenId(b, a)), off: off.sort(byStartThenId) };
  }, [dayGames, rated]);

  // One true reason per game, from the same standings snapshot and playoff simulation the rest of the app uses.
  const insights = useMemo(() => {
    const out = new Map<number, ReturnType<typeof matchupInsights>[number]>();
    if (!analysis) return out;
    for (const g of dayGames) {
      const r = rated.get(g.id);
      const list = matchupInsights(g, analysis.before[g.id], null, { teams, allGames: games, ranks: ranksFor?.(g.id), sim, pregameHome: r?.pre ?? null });
      if (list[0]) out.set(g.id, list[0]);
    }
    return out;
  }, [dayGames, rated, analysis, teams, games, ranksFor, sim]);
  const insightFor = (g: Game): ReactNode => { const i = insights.get(g.id); return i ? <InsightLine insight={i} variant="card" /> : undefined; };

  const featured = useMemo(() => {
    if (lists.soon.length < 2) return [];
    return [...lists.soon].sort((a, b) => (rated.get(b.id)?.score ?? 0) - (rated.get(a.id)?.score ?? 0) || byStartThenId(a, b)).slice(0, phone ? 3 : 5);
  }, [lists.soon, rated, phone]);

  const intel = useMemo<IntelLink[]>(() => {
    const out: IntelLink[] = [];
    const lastNight = shiftDay(today, -1);
    if (games.some((g) => g.date === lastNight && g.type !== 0 && finished(g))) out.push({ view: "yesterday", label: "Last night", hint: "Final scores and the best and worst nights" });
    if (sim && Object.keys(sim).length) out.push({ view: "odds", label: "Playoff odds", hint: "Simulated chances and the playoff tracker" });
    if (lists.soon.length || lists.live.length) out.push({ view: "picks", label: "Picks", hint: "Win picks and how they have done" });
    if (lists.soon.length || lists.live.length) out.push({ view: "injuries", label: "Injury report", hint: "Who is out, how long and how much it matters" });
    if (analysis && Object.values(analysis.table ?? {}).some((r: any) => r?.gp >= 10)) out.push({ view: "trends", label: "Team trends", hint: "Momentum, playoff outlook and goals saved above expected" });
    return out;
  }, [games, today, sim, lists.soon.length, lists.live.length, analysis]);

  const chip = useMemo(() => ({ live: lists.live.length, final: lists.done.length, soon: lists.soon.length }), [lists]);
  const [centerId, setCenterId] = useState<number | null>(null);
  const scrollAtOpen = useRef(0);
  const openCenter = (g: Game) => { scrollAtOpen.current = window.scrollY; setCenterId(g.id); };
  // Search, team and player pages ask Home to open a game (openGame). A request made while another screen was showing is picked up on mount.
  useEffect(() => {
    const open = (id: number) => { scrollAtOpen.current = window.scrollY; setCenterId(id); };
    if (pendingOpen && Date.now() - pendingOpen.at < 5000) open(pendingOpen.id);
    pendingOpen = null;
    const on = (e: Event) => { const id = (e as CustomEvent).detail?.id; if (Number.isFinite(id)) { pendingOpen = null; open(id); } };
    window.addEventListener(OPEN_GAME_EVENT, on);
    return () => window.removeEventListener(OPEN_GAME_EVENT, on);
  }, []);
  const centerGame = centerId != null ? games.find((g) => g.id === centerId) : undefined;
  const goDay = (d: string) => { setDate(d); setOpenId(null); };
  const prevDay = days.filter((d) => d < day).at(-1), nextDay = days.find((d) => d > day);

  const row = (g: Game, expanded: boolean) => (
    <li key={g.id} data-game-id={g.id}>
      <ScoreRow
        game={g}
        away={teamOf(g.away)}
        home={teamOf(g.home)}
        before={analysis?.before[g.id]}
        baseline={baseline && baseline.season < g.season ? baselineTable : undefined}
        allGames={games}
        rating={rated.get(g.id)}
        ranks={ranksFor?.(g.id)}
        analysisRow={analysis?.analysis[g.id]}
        insight={insightFor(g)}
        open={openId === g.id || expanded}
        onFull={() => openCenter(g)}
      />
    </li>
  );
  const list = (gs: Game[], expanded = false) => <FlipList games={gs}>{gs.map((g) => row(g, expanded))}</FlipList>;
  const show = (k: Status) => status === "all" || status === k;
  const nothing = !dayGames.length;
  const emptyFilter = !nothing && ((status === "live" && !lists.live.length) || (status === "soon" && !lists.soon.length) || (status === "final" && !lists.done.length));

  return (
    <section className="scoreboard" aria-label="Scoreboard">
      <div className="sb-toolbar">
        <div className="sb-days" data-testid="home-date">
          <DayHeading day={day} today={today} />
          <DateStrip value={day} onChange={goDay} today={today} days={days} min={min} max={max} counts={counts} />
        </div>
        {!error && (
          <div className="sb-filters" role="group" aria-label="Show games by status">
            {([["live", chip.live, "in progress"], ["final", chip.final, "completed"], ["soon", chip.soon, "upcoming"]] as const).map(([key, n, label]) => (
              <button key={key} type="button" className={`sb-chip ${key}`} aria-pressed={status === key} disabled={!n && status !== key} onClick={() => { setStatus(status === key ? "all" : key); setOpenId(null); }}>
                {key === "live" && n > 0 && <i aria-hidden="true" />}<b>{n}</b> {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && (
        <div className="empty error home-error" data-testid="home-error" role="alert">
          <h2>Unable to load data</h2>
          <p>{error}</p>
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
        </div>
      )}
      {!error && loading && !games.length && <Skeleton rows={4} label="Loading the scoreboard" />}
      {!error && !loading && nothing && (
        <div className="sb-empty home-empty" data-testid="home-empty">
          <p>No games on {fullDate(day)}.</p>
          <div className="home-empty-go">
            {prevDay && <button type="button" onClick={() => goDay(prevDay)}>Previous game day</button>}
            {nextDay && <button type="button" onClick={() => goDay(nextDay)}>Next game day</button>}
          </div>
        </div>
      )}
      {!error && emptyFilter && <p className="sb-empty">Nothing here on this day.</p>}
      {!error && show("live") && lists.live.length > 0 && (
        <HomeSection id="live" label="Live" count={lists.live.length} live className="live">
          {list(lists.live)}
        </HomeSection>
      )}
      {!error && show("soon") && lists.soon.length > 0 && (
        <HomeSection id="upcoming" label="Upcoming" count={lists.soon.length} className="soon">
          {(() => {
            const slots = slotsOf(lists.soon, rated);
            return slots.map((slot) => (
              <div className="sb-slot" key={slot.key} data-slot={slot.key}>
                {slots.length > 1 && <h3 className="sb-slot-h">{slot.label}</h3>}
                {list(slot.games)}
              </div>
            ));
          })()}
        </HomeSection>
      )}
      {!error && status === "all" && (
        <FeaturedStrip games={featured} teamOf={teamOf} now={now} ranksFor={ranksFor} insightFor={insightFor} onOpen={openCenter} />
      )}
      {!error && show("final") && lists.done.length > 0 && (status === "all" ? (
        <CompletedStrip games={lists.done} teamOf={teamOf} ranksFor={ranksFor} upsetOf={(g) => rated.get(g.id)?.upsetWon} onOpen={openCenter} />
      ) : (
        <HomeSection id="completed" label="Completed" count={lists.done.length} className="completed">
          {list(lists.done, true)}
        </HomeSection>
      ))}
      {!error && status === "all" && lists.off.length > 0 && (
        <HomeSection id="postponed" label="Postponed / canceled" count={lists.off.length} className="postponed">
          {list(lists.off)}
        </HomeSection>
      )}
      {!error && status === "all" && !nothing && onNavigate && (
        <LeagueIntel links={intel} onNavigate={onNavigate} onBrowse={onBrowse} />
      )}
      {!error && (status !== "all" || nothing || !onNavigate) && onBrowse && (
        <button type="button" className="sb-browse" onClick={onBrowse}>All games, filters &amp; search <Icon name="chevron" size={16} /></button>
      )}
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
            teams={teams}
            sim={sim}
            onNavigate={onNavigate}
            returnTo={scrollAtOpen.current}
            onClose={() => setCenterId(null)}
          />
        </Suspense>
      )}
    </section>
  );
}

function ScoreRow({ game, away, home, before, baseline, allGames, rating, ranks, analysisRow, insight, open, onFull }: {
  game: Game; away: Team; home: Team; before: any; baseline: any; allGames: Game[]; rating?: Rated; ranks?: Record<string, any> | null; analysisRow?: any; insight?: ReactNode; open: boolean; onFull: () => void;
}) {
  useTimeKey();
  const gs = gameStatus(game);
  const kind = gs.final ? "final" : gs.live ? "live" : "soon";
  const showScore = kind !== "soon" && game.awayScore != null && game.homeScore != null;
  const projection = useMemo(() => (before ? projectGame(game, before, baseline) : null), [game, before, baseline]);
  const homePct = projection ? Math.round(projection.homeWin * 100) : null;
  const cl = closeAndLate(game);
  const awayScored = useChanged(game.awayScore ?? undefined), homeScored = useChanged(game.homeScore ?? undefined);
  // The feed (for the momentum chart) is fetched while a live game is on screen, and for a finished one only once it is opened.
  const { ref: feedRef, data: feed } = useCardFeed(game, kind === "live" || open);
  const score = rating?.score ?? 50, tier = tierOf(score);
  const why = rating ? watchBreakdown(rating.importance, rating.pre, game) : null;
  const names = { away: away.short, home: home.short };
  const recapText = kind === "final" ? recap(game, rating?.pre ?? null, names) : "";
  const flowShown = (kind === "live" && !game.intermission) || (open && kind !== "soon");
  return (
    <GameCardView
      variant="row" game={game} away={away} home={home} ranks={ranks} rating={rating} homePct={homePct} open={open} state={`tier-${tier.key}`}
      hot={cl.both ? { label: cl.label } : null} scored={{ away: awayScored, home: homeScored }} onOpen={() => onFull()}
      ariaExtra={cl.both ? "close and late" : undefined}
      actions={<span className="tv-network"><NetworkLogos broadcasts={[...new Set(game.broadcasts)]} game={game} /></span>}
      context={kind === "live" && rating?.upset ? <span className="sb-brew">Upset brewing: the underdog is ahead late</span> : undefined}
      insight={insight}
      ring={before && (kind !== "final" || open) ? (
        <div className="sb-rate">
          <ScoreRing score={score} label={`Watchability ${score} out of 100, ${tier.label}`}>
            {why && <WhyScore why={why} tier={tier.label} reason={analysisRow?.reasons?.[0]} />}
          </ScoreRing>
        </div>
      ) : null}
      below={<>
        {kind === "live" && game.intermission && <IntermissionRink game={game} home={home} away={away} compact />}
        <div ref={feedRef} className="sb-flow">{flowShown && <CompactGameFlow data={feed} home={home} away={away} />}</div>
        {open && <Suspense fallback={null}><RowDetails game={game} away={away} home={home} before={before} allGames={allGames} projection={projection} feed={feed} recapText={recapText} showFlow={kind !== "soon"} onFull={onFull} /></Suspense>}
      </>}
    />
  );
}

function WhyScore({ why, tier, reason }: { why: ReturnType<typeof watchBreakdown>; tier: string; reason?: string }) {
  return (
    <div className="sb-why" data-testid="score-why">
      <h3>{why.score} · {tier}</h3>
      <ul>{why.parts.map((p) => <li key={p.key}><b>{p.label}</b> <span>+{p.points}</span><small>{p.note}</small></li>)}</ul>
      {why.bonus > 0 && <p className="sb-why-heat"><b>Hotter right now: +{why.bonus} → {why.total}.</b> A close score late in the game is worth watching more than its forecast.</p>}
      {reason && <p className="sb-why-reason">{reason}</p>}
    </div>
  );
}
