import { lazy, Suspense, useRef, type ReactNode } from "react";
import { useTimeKey } from "../lib/display";
import { FavoriteMark } from "./FavoriteStar";
import type { Game, Team } from "../types";
import { gameStatus } from "../lib/game-status.mjs";
import { rankTitle } from "../lib/ranks.mjs";
import { usePauseOffscreen } from "../motion";
import { TeamLogo } from "./TeamLogo";
import "../game-card-view.css";

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
  return (
    <article ref={set as never} className={`gcv gcv-row sb-row ${state}${pill ? ` ${st.kind}` : ""}${upset ? " upset-won" : ""}${p.open ? " open" : ""}${p.hot ? " hot" : ""}${p.state ? ` ${p.state}` : ""}${p.className ? ` ${p.className}` : ""}`} data-game={game.id}>
      {scoredNow && <span className="pulse-ring" aria-hidden="true" />}
      <div className="sb-top">
        <span className="sb-status">
          {st.live && !st.stale && <i aria-hidden="true" />}
          {pill ? <span className={`gcv-pill ${st.kind}`}>{st.label}</span> : label}
          {upset && <strong className="sb-upset-tag">UPSET</strong>}
          {p.hot && <span className="late-flag" title={p.hot.label}><i aria-hidden="true" />Close &amp; late</span>}
        </span>
        <span className="sb-actions">
          {p.actions}
          <span className="gcv-acts">
            <Suspense fallback={null}><SaveGameButton game={game} awayName={away.name} homeName={home.name} /></Suspense>
            {p.gcIcon !== false && <button type="button" className="gc-icon" onClick={() => onOpen(game)} aria-label={`Open Game Center for ${away.name} at ${home.name}`} title="Open Game Center">GC</button>}
          </span>
        </span>
      </div>
      <div className="sb-body">
        <button type="button" className="sb-main" aria-haspopup="dialog" aria-label={name} onClick={() => onOpen(game)}>
          {teams}
          {homePct != null && awayPct != null && (
            <span className="sb-prob" role="img" aria-label={`Win probability: ${away.id} ${awayPct} percent, ${home.id} ${homePct} percent`}>
              <span className="sb-pct">{away.id} {awayPct}%</span>
              <span className="sb-bar"><i style={{ width: `${awayPct}%` }} /><i /></span>
              <span className="sb-pct">{homePct}% {home.id}</span>
            </span>
          )}
        </button>
        {p.ring}
      </div>
      {p.venue !== false && <p className="sb-venue"><span aria-hidden="true">📍 </span>{game.venue || "Venue unavailable"}</p>}
      {p.context && <div className="gcv-context">{p.context}</div>}
      {p.insight && <div className="gcv-insight">{p.insight}</div>}
      {p.below}
    </article>
  );
}
