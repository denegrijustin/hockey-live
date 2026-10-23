import { useMemo } from "react";
import type { Game, Team } from "../types";
import { closeAndLate, pickWatchNow } from "../lib/watchability.mjs";
import { projectGame } from "../lib/projection.mjs";
import { TeamLogo } from "./TeamLogo";

type Rate = (g: Game) => { score: number; heat: number; before: any; base: any };
const when = (g: Game, kind: "live" | "soon", minutes: number) =>
  kind === "soon" ? (minutes < 2 ? "Puck drop now" : `In ${minutes} min`) : g.intermission ? `P${g.period ?? ""} · Intermission` : `${g.periodType === "OT" ? "OT" : `P${g.period ?? "–"}`} ${g.clock ?? ""}`.trim();

/** The games to put on right now: the hottest live ones, then the best that start within the hour. A tap opens the Game Center. */
export function WatchNow({ games, teams, rate, now, max, onOpen }: { games: Game[]; teams: Team[]; rate: Rate; now: number; max: number; onOpen: (g: Game) => void }) {
  const tiles = useMemo(() => {
    const candidates = games.filter((g) => g.state === "LIVE" || g.state === "CRIT" || ((g.state === "FUT" || g.state === "PRE") && Date.parse(g.start) - now <= 3_600_000));
    return pickWatchNow(candidates.map((game) => ({ game, ...rate(game) })), now, { max });
  }, [games, rate, now, max]);
  if (!tiles.length) return null;
  const team = (id: string) => teams.find((t) => t.id === id)!;
  return (
    <section className="watch-now" aria-label="Watch now" data-testid="watch-now">
      <h2>Watch now</h2>
      <ul>
        {tiles.map((t) => {
          const g = t.game as Game, cl = closeAndLate(g), a = team(g.away), h = team(g.home);
          const live = t.kind === "live" && g.homeScore != null;
          const p = projectGame(g, (t as any).before, (t as any).base);
          const fav = p ? (p.homeWin >= 0.5 ? { id: h.id, pct: p.homeWin } : { id: a.id, pct: 1 - p.homeWin }) : null;
          const rise = live ? Math.round(t.heat - t.score) : 0;
          const label = when(g, t.kind as "live" | "soon", t.minutes);
          return (
            <li key={g.id}>
              <button type="button" className={`wn-tile ${t.kind}${cl.both ? " hot" : ""}`} data-game={g.id} onClick={() => onOpen(g)}
                aria-label={`Watch now: ${a.name} at ${h.name}, ${label}${live ? `, ${g.awayScore} to ${g.homeScore}` : ""}${fav ? `, ${fav.id} ${Math.round(fav.pct * 100)} percent to win` : ""}${cl.both ? ", close and late" : ""}. Open Game Center`}>
                <span className="wn-when">{t.kind === "live" && <i aria-hidden="true" />}{label}</span>
                <span className="wn-teams">
                  <span><TeamLogo id={a.id} size={20} /><b>{a.id}</b></span><em>{live ? g.awayScore : ""}</em>
                  <span><TeamLogo id={h.id} size={20} /><b>{h.id}</b></span><em>{live ? g.homeScore : ""}</em>
                </span>
                <span className="wn-foot">
                  {fav ? <span title="Win probability">{fav.id} {Math.round(fav.pct * 100)}%</span> : <span>Watch {t.score}</span>}
                  {cl.both ? <strong><span className="wn-long">{cl.label}</span><span className="wn-short">Close &amp; late</span></strong> : rise >= 5 ? <em className="rise-tag">▲ up {rise}</em> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
