import type { CSSProperties } from "react";
import type { Game, Team } from "../types";
import { arenaOf, boardFor } from "../lib/arena-boards.mjs";
import { rankTitle } from "../lib/ranks.mjs";
import { TeamLogo } from "./TeamLogo";
import { FavoriteMark } from "./FavoriteStar";
import "../arena-board.css";

type Box = { left: number; top: number; width: number; height: number };
type Stats = { rows: { label: string; away: number | string; home: number | string }[]; goals: { side: string; team: string; who: string; when: string }[]; pp: string | null } | null;
type Status = { kind: string; label: string; short?: string; live: boolean; final: boolean; upcoming: boolean };

const at = (b: Box): CSSProperties => ({ left: `${b.left}%`, top: `${b.top}%`, width: `${b.width}%`, height: `${b.height}%`, ["--rh" as never]: `${(b.height * 384) / 704}cqw`, ["--bt" as never]: `${100 - b.top - b.height}%` });

/** The clock box: big line (clock, start time, FINAL) and the small line under it (period, "TODAY"). */
function clockOf(game: Game, st: Status): [string, string] {
  if (st.kind === "intermission") return ["INT", game.period ? `after P${game.period}` : ""];
  if (st.live) { const per = game.period ? (game.period <= 3 ? ["1st", "2nd", "3rd"][game.period - 1] : game.period === 4 ? "OT" : `${game.period - 3}OT`) : ""; return [game.clock || st.short || "LIVE", per]; }
  if (st.final) return [st.short === "F" ? "FINAL" : st.short ?? "FINAL", "FINAL"];
  if (st.upcoming) return [st.label, "PUCK DROP"];
  return [st.label, ""];
}

/**
 * The home team's arena scoreboard: the arena's own artwork (or one drawn in the team's colours), with the real score, clock and numbers laid over
 * the strip and side tables the artwork draws. The score strip is the button that opens the Game Center; the numbers under the picture are the board's stat lines.
 */
export function ArenaBoard({ game, away, home, st, name, onOpen, scored, ranks, winner, hasScore, stats }: {
  game: Game; away: Team; home: Team; st: Status; name: string; onOpen: (g: Game) => void; scored?: { away?: boolean; home?: boolean } | null;
  ranks?: Record<string, any> | null; winner: "home" | "away" | null; hasScore: boolean; stats: Stats;
}) {
  const art = boardFor(home.id);
  const [big, small] = clockOf(game, st);
  const team = (t: Team, side: "away" | "home", score: number | null | undefined) => {
    const rank = ranks?.[t.id];
    return (
      <span className={`sb-team jb-team jb-${side}${winner ? (winner === side ? " won" : " lost") : ""}`}>
        <TeamLogo id={t.id} size={28} /><FavoriteMark id={t.id} /><span className="sr-only">{t.name} </span>
        <span className="sb-name jb-name" title={t.name}>
          <b>{t.id}</b>
          <small>{stats?.pp === side ? <i className="jb-pp">POWER PLAY</i> : side === "home" ? "HOME" : "AWAY"}{rank && <span className="sb-rank" title={rankTitle(rank)}>#{rank.league}</span>}</small>
        </span>
        <span className={`sb-score jb-score${scored?.[side] ? " scored" : ""}`}><span className="ts-num">{hasScore ? score : ""}</span></span>
      </span>
    );
  };
  const ribbon = (
    <button type="button" className="sb-main jb-ribbon" aria-haspopup="dialog" aria-label={name} title="Open the Game Center" onClick={() => onOpen(game)} style={art ? at(art.ribbon) : undefined}>
      {team(away, "away", game.awayScore)}
      <span className={`jb-clock${st.live ? " is-live" : ""}`}><b>{big}</b><small>{small}</small></span>
      {team(home, "home", game.homeScore)}
    </button>
  );
  // the artwork's side tables: real numbers instead of its made-up ones (the home side's line first, then the visitors')
  const panel = (i: number, n: number) => {
    const side: "home" | "away" = n === 2 ? (i === 0 ? "home" : "away") : "home";
    const t = side === "home" ? home : away;
    const lines = stats?.rows.slice(0, 4) ?? [];
    const goals = stats?.goals.filter((g) => n === 1 || g.side === side).slice(0, 3) ?? [];
    return (
      <>
        <b className="jb-ph">{n === 1 ? "SCORING" : t.id}</b>
        {n === 1 ? (goals.length ? goals.map((g, k) => <span key={k}><em>{g.team}</em> {g.who}</span>) : <span>{st.upcoming ? "No goals yet" : "Scoreless"}</span>)
          : lines.length ? lines.map((r) => <span key={r.label}><em>{r.label}</em> {side === "home" ? r.home : r.away}</span>) : <span>{ranks?.[t.id] ? `#${ranks[t.id].league} in the NHL` : t.name}</span>}
      </>
    );
  };
  const style = { ["--jb-c1" as never]: home.cardColor ?? home.color, ["--jb-c2" as never]: home.cardColor ?? home.color } as CSSProperties; // the card colour (the chart colour is often a light blue that is not the team's)
  return (
    <div className="jb" data-board={art ? "art" : "drawn"} data-testid="arena-board" style={style}>
      {art ? (
        <div className="jb-art">
          <img src={art.src} alt={`${arenaOf(home.id) || home.name} scoreboard`} width={704} height={384} loading="lazy" decoding="async" />
          {ribbon}
          {art.panels.map((p: Box, i: number) => <div key={i} className="jb-panel" style={at(p)}>{panel(i, art.panels.length)}</div>)}
        </div>
      ) : (
        <div className="jb-drawn">
          {arenaOf(home.id) && <div className="jb-marquee">{arenaOf(home.id)}</div>}
          <div className="jb-banner">{home.name}</div>
          <div className="jb-screen"><TeamLogo id={home.id} size={96} /></div>
          {ribbon}
        </div>
      )}
      {stats && (
        <div className="jb-data" data-testid="board-stats">
          <table>
            <caption className="sr-only">Game stats, {away.name} and {home.name}</caption>
            <thead><tr><th scope="col">{away.id}</th><th scope="col"><span className="sr-only">Stat</span></th><th scope="col">{home.id}</th></tr></thead>
            <tbody>{stats.rows.map((r) => <tr key={r.label}><td>{r.away}</td><th scope="row">{r.label}</th><td>{r.home}</td></tr>)}</tbody>
          </table>
          {stats.goals.length > 0 && (
            <ol className="jb-goals" aria-label="Goals, newest first">
              {stats.goals.slice(0, 6).map((g, k) => <li key={k} className={`jb-g-${g.side}`}><TeamLogo id={g.team} size={16} /><b>{g.who}</b><small>{g.when}</small></li>)}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
