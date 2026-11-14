import { lazy, Suspense, useRef, type ReactNode } from "react";
import { useTimeKey } from "../lib/display";
import { FavoriteMark } from "./FavoriteStar";
import type { Game, Team } from "../types";
import { gameStatus } from "../lib/game-status.mjs";
import { rankTitle } from "../lib/ranks.mjs";
import { usePauseOffscreen } from "../motion";
import { TeamLogo } from "./TeamLogo";
import { Icon } from "./icons";
import { faceColors } from "../lib/face";
import "../game-card-view.css";
import "../card-face.css";

const SaveGameButton = lazy(() => import("./SaveGameButton").then((m) => ({ default: m.SaveGameButton })));

export type GameCardVariant = "row" | "compact" | "tile";

/** Logo size per variant: every card of a kind uses the same one. */
export const LOGO_SIZE: Record<GameCardVariant, number> = { row: 32, compact: 20, tile: 20 };

export interface GameCardViewProps {
  game: Game;
  away: Team;
  home: Team;
  variant: GameCardVariant;
  /** Under the main row: chips such as "Close & late". */
  context?: ReactNode;
  /** Under the main row: the one-line matchup insight (`<InsightLine>`). */
  insight?: ReactNode;
  /** Secondary controls (network logos, extra buttons). Rendered beside the main button, never inside it. */
  actions?: ReactNode;
  /** Below everything else: the momentum chart, recap, key stats. */
  below?: ReactNode;
  /** League ranks by team id, as `teamRanks()` returns them. */
  ranks?: Record<string, any> | null;
  /** Records by side, e.g. `{ away: "12-3-1", home: "9-6-2" }`. Row variant, shown small under the name. */
  record?: { away?: string; home?: string } | null;
  /** Watchability rating; `upsetWon` (a number) puts the UPSET tag on a finished game. */
  rating?: { score?: number; upsetWon?: number | null } | null;
  onOpen: (game: Game) => void;
  className?: string;
  /** Home win probability in percent (0 to 100); draws the probability bar (row) when given. */
  homePct?: number | null;
  /** The watchability ring (row): a sibling of the main button. */
  ring?: ReactNode;
  /** "Close & late" flag (row): its label; also the `hot` state class. */
  hot?: { label: string } | null;
  /** Row: the banner across the top ("One-goal game · 3rd period"). */
  banner?: ReactNode;
  /** Row: the upset line under the banner. */
  alertLine?: ReactNode;
  /** Row: the live metrics (win probability, momentum, deserve), under the teams. */
  metrics?: ReactNode;
  /** Row: the injuries and the model pills, under the venue. */
  extras?: ReactNode;
  /** Row: the pregame win-probability bar, above the Details button. */
  probRow?: ReactNode;
  /** The watchability tier word under the ring ("Must watch"). */
  tierLabel?: string;
  /** Row: show the venue line (default true). */
  venue?: boolean;
  /** Row: show the built-in "GC" Game Center button beside `actions` (default true). */
  gcIcon?: boolean;
  /** Row: the card is expanded (adds the `open` class). */
  open?: boolean;
  /** Which side just scored: the score flashes and a ring pulses. */
  scored?: { away?: boolean; home?: boolean } | null;
  /** Tile: replaces the status label ("In 12 min", "Puck drop now"). */
  whenLabel?: string;
  /** Extra phrase for the main button's accessible name (probability, "close and late"...). */
  ariaExtra?: string;
  /** Extra state classes on the root (e.g. a section tint). */
  state?: string;
  /** Receives the root element (e.g. for the feed's on-screen watcher). */
  rootRef?: (el: HTMLElement | null) => void;
}

const stateOf = (kind: string) => (kind === "live" || kind === "intermission" ? "live" : kind === "final" ? "final" : "soon");

export function GameCardView(p: GameCardViewProps) {
  const { game, away, home, variant, ranks, record, rating, onOpen } = p;
  useTimeKey();
  const st = gameStatus(game);
  const ref = useRef<HTMLElement>(null);
  usePauseOffscreen(ref);
  const hasScore = !st.upcoming && st.kind !== "postponed" && st.kind !== "cancelled" && game.awayScore != null && game.homeScore != null;
  const winner = st.final && hasScore && game.homeScore !== game.awayScore ? (game.homeScore! > game.awayScore! ? "home" : "away") : null;
  const state = stateOf(st.kind);
  const pill = st.kind === "postponed" || st.kind === "cancelled" || st.kind === "suspended";
  const label = p.whenLabel ?? st.label;
  const homePct = p.homePct != null ? Math.round(p.homePct) : null;
  const awayPct = homePct != null ? 100 - homePct : null;
  const rankBit = [away, home].map((t) => ranks?.[t.id] ? `${t.id} ranked ${ranks[t.id].league}` : "").filter(Boolean).join(", ");
  const extra = [rankBit, homePct != null ? `win probability ${away.id} ${awayPct} percent, ${home.id} ${homePct} percent` : "", p.ariaExtra].filter(Boolean).join(", ");
  const name = `${away.name} at ${home.name}. ${st.aria}${extra ? `, ${extra}` : ""}. Open the full game view.`;
  const upset = rating?.upsetWon != null && st.final;
  const set = (el: HTMLElement | null) => { (ref as { current: HTMLElement | null }).current = el; p.rootRef?.(el); };

  const teams = ([[away, game.awayScore, "away"], [home, game.homeScore, "home"]] as const).map(([team, score, side]) => {
    const nick = team.name.endsWith(team.short) && team.name !== team.short;
    const rank = ranks?.[team.id];
    const flash = p.scored?.[side];
    const full = variant === "row";
    return (
      <span className={`sb-team gcv-team${winner ? (winner === side ? " won" : " lost") : ""}`} key={team.id}>
        <TeamLogo id={team.id} size={LOGO_SIZE[variant]} /><FavoriteMark id={team.id} />
        {full ? (
          <span className="sb-name gcv-name" title={team.name}>
            {nick ? <>{team.name.slice(0, -team.short.length)}<b>{team.short}</b></> : <b>{team.name}</b>}
            {rank && <small className="sb-rank" title={rankTitle(rank)}>#{rank.league}</small>}
            {side === "home" && <em className="gcv-home">Home</em>}
            {record?.[side] && <small className="gcv-record">{record[side]}</small>}
          </span>
        ) : (
          <span className="sb-name gcv-abbr" title={team.name}>
            <b>{team.id}</b>
            {variant === "compact" && <span className="gcv-full">{team.short}</span>}
            {rank && variant === "compact" && <small className="sb-rank" title={rankTitle(rank)}>#{rank.league}</small>}
          </span>
        )}
        <span className={`sb-score${flash ? " scored" : ""}`}><span className="ts-num">{hasScore ? score : ""}</span></span>
      </span>
    );
  });

  if (variant === "compact") {
    const tag = pill ? st.short : st.final ? st.short : st.label;
    return (
      <div ref={set as never} className={`gcv gcv-compact ${state}${winner ? " decided" : ""}${upset ? " upset" : ""}${p.state ? ` ${p.state}` : ""}${p.className ? ` ${p.className}` : ""}`} data-game={game.id}>
        <button type="button" className="sb-main" aria-label={name} onClick={() => onOpen(game)}>
          <span className="gcv-lines">{teams}</span>
          <span className="gcv-end">
            <em className={`gcv-tag${st.live ? " is-live" : ""}`}>{st.live && <i aria-hidden="true" />}{tag}</em>
            {upset && <strong className="sb-upset-tag">UPSET</strong>}
          </span>
        </button>
        {p.actions && <span className="sb-actions">{p.actions}</span>}
        {p.context}{p.insight}{p.below}
      </div>
    );
  }

  if (variant === "tile") {
    return (
      <div ref={set as never} className={`gcv gcv-tile ${state}${p.hot ? " hot" : ""}${p.state ? ` ${p.state}` : ""}${p.className ? ` ${p.className}` : ""}`} data-game={game.id}>
        <button type="button" className="sb-main" aria-label={name} onClick={() => onOpen(game)}>
          <span className="sb-status gcv-when">{st.live && !st.stale && <i aria-hidden="true" />}{label}</span>
          <span className="gcv-lines">{teams}</span>
        </button>
        {p.actions && <span className="sb-actions">{p.actions}</span>}
        {p.context}{p.insight}{p.below}
      </div>
    );
  }

  const scoredNow = !!(p.scored?.away || p.scored?.home);
  // The card sits on the home team's own colour, framed in a bright accent (its second colour when that is bright, else a tint of the first).
  const { bg: base, accent } = faceColors(away, home);
  const liveNow = st.live && !st.stale;
  return (
    <article ref={set as never} data-face="1" style={{ ["--face-bg" as never]: base, ["--face-accent" as never]: accent } as never} className={`gcv gcv-row sb-row ${state}${pill ? ` ${st.kind}` : ""}${upset ? " upset-won" : ""}${p.open ? " open" : ""}${p.hot ? " hot" : ""}${p.state ? ` ${p.state}` : ""}${p.className ? ` ${p.className}` : ""}`} data-game={game.id}>
      {scoredNow && <span className="pulse-ring" aria-hidden="true" />}
      {p.banner && <div className="gcv-banner late-flag">{p.banner}</div>}
      {p.alertLine && <div className="gcv-alert">{p.alertLine}</div>}
      <div className="sb-top">
        <span className="sb-status">
          {pill ? <span className={`gcv-pill ${st.kind}`}>{st.label}</span> : liveNow ? <><span className="gcv-livepill"><i aria-hidden="true" />Live</span><span className="gcv-clock">{label}</span></> : <><Icon name="calendar" size={26} /><span className="gcv-when">{label}</span></>}
          {upset && <strong className="sb-upset-tag">UPSET</strong>}
        </span>
        <span className="sb-actions">
          {p.actions}
          <span className="gcv-acts">
            <Suspense fallback={null}><SaveGameButton game={game} awayName={away.name} homeName={home.name} /></Suspense>
            {p.gcIcon !== false && <button type="button" className="gc-icon" onClick={() => onOpen(game)} aria-label={`Open Game Center for ${away.name} at ${home.name}`} title="Open Game Center"><Icon name="pulse" size={22} /><span>GC</span></button>}
          </span>
        </span>
      </div>
      <div className="sb-body">
        <button type="button" className="sb-main" aria-haspopup="dialog" aria-label={name} onClick={() => onOpen(game)}>
          {teams}
        </button>
        {p.ring && <div className="gcv-ringwrap">{p.ring}{p.tierLabel && <span className="gcv-tier">{p.tierLabel}</span>}</div>}
      </div>
      {p.metrics}
      {p.venue !== false && <p className="sb-venue"><Icon name="pin" size={20} />{game.venue || "Venue unavailable"}</p>}
      {p.extras}
      {p.probRow}
      {p.context && <div className="gcv-context">{p.context}</div>}
      {p.insight && <div className="gcv-insight">{p.insight}</div>}
      <button type="button" className="gcv-details" aria-expanded={!!p.open} aria-label={`${p.open ? "Hide" : "Show"} details for ${away.name} at ${home.name}`} onClick={() => onOpen(game)}>Details <Icon name="chevron" size={22} /></button>
      {p.below}
    </article>
  );
}
