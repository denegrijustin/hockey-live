import { useMemo } from "react";
import type { Team } from "../../types";
import { TeamLogo } from "../TeamLogo";
import { Icon } from "../icons";
import { fmtDay, fmtTime } from "../../lib/dates.mjs";
import { finished } from "../../lib/model.mjs";
import { useGameCenter } from "./GameCenterContext";
import { goalsOf, periodLabel } from "./gcFormat";

const STATE_TEXT: Record<string, string> = {
  upcoming: "Scheduled", live: "Live", intermission: "Intermission", final: "Final",
  postponed: "Postponed", cancelled: "Canceled", suspended: "Suspended",
};

/**
 * The Game Center header: logos, the score as the largest thing on screen, period and clock, a status pill
 * (data-testid gc-status; data-state = live | stale | intermission | final | upcoming ...), venue, scheduled start
 * for a game that has not begun, and the line score by period when the feed has goals.
 * Line score: goals per period from the play-by-play goals (never invented); the total is the official score.
 * For a shootout the SO column is the official final minus period goals (0 or 1), shown only when it adds up.
 */
export function GameHeader({ home, away }: { home: Team; away: Team }) {
  const { game, feed, plays, status, live, stale } = useGameCenter();
  const src = feed ?? game;
  const past = finished(src), shown = past || live;
  const kind = stale && live ? "stale" : status.kind;
  const so = src.periodType === "SO";
  const endTag = past ? (src.end === "OT" ? "OT" : src.end === "SO" ? "SO" : "") : "";
  const pill = kind === "stale" ? "Stale" : kind === "final" ? `Final${endTag ? "/" + endTag : ""}` : (STATE_TEXT[kind] ?? status.label);
  const clock = live
    ? src.intermission ? `End of ${periodLabel(src.period, src.periodType)}` : so ? "Shootout" : `${periodLabel(src.period, src.periodType)}${src.clock ? ` · ${src.clock}` : ""}`
    : "";
  const line = useMemo(() => {
    if (!shown) return null;
    const goals = goalsOf(feed, plays).filter((g) => g.periodType !== "SO" && g.team);
    if (!goals.length && !(src.awayScore || src.homeScore)) return null;
    if (!feed) return null;
    let maxP = Math.max(3, ...goals.map((g) => g.period), live && !so ? (src.period ?? 0) : 0);
    if (past && src.end === "REG") maxP = 3;
    const cols = Array.from({ length: maxP }, (_, i) => ({ key: String(i + 1), label: i < 3 ? String(i + 1) : maxP > 4 ? `${i - 2}OT` : "OT", period: i + 1 }));
    const per = (team: string, period: number) => goals.filter((g) => g.team === team && g.period === period).length;
    const rows = [away, home].map((t) => ({ team: t, cells: cols.map((c) => per(t.id, c.period)), total: t.id === away.id ? src.awayScore : src.homeScore }));
    let soCol: number[] | null = null;
    if (src.end === "SO" && past) {
      const d = rows.map((r) => (r.total ?? 0) - r.cells.reduce((a, b) => a + b, 0));
      if (d.every((x) => x === 0 || x === 1) && d[0] + d[1] === 1) soCol = d;
    }
    return { cols, rows, soCol };
  }, [shown, feed, plays, src, live, so, past, away, home]);
  const sub = [src.venue || null, !shown && src.start ? `Puck drop ${fmtTime(src.start, { withZone: true })} · ${fmtDay(src.start, { long: true })}` : null].filter(Boolean).join(" · ");
  return (
    <header className="gc-header gx" data-testid="gc-header" data-state={kind}>
      <p className="gx-title">NHL Gamecenter<i aria-hidden="true" /></p>
      <div className="dialog-matchup gx-banner">
        {[away, home].map((t, i) => (
          <div className={`dialog-team gx-team ${i === 0 ? "gx-away" : "gx-home"}`} key={t.id} style={{ ["--tc" as any]: t.cardColor ?? t.color }}>
            <TeamLogo id={t.id} size={84} eager />
            <div>
              <span>{t.city}</span>
              <h3>{t.short}</h3>
            </div>
            {shown ? (
              <b data-testid="gc-score" aria-label={`${t.name} ${(i === 0 ? src.awayScore : src.homeScore) ?? "no score"}`}>{(i === 0 ? src.awayScore : src.homeScore) ?? "—"}</b>
            ) : (
              <small>{i === 0 ? "AWAY" : "HOME"}</small>
            )}
          </div>
        ))}
        <div className="gc-header-meta gx-mid">
          <span className="gc-pill" data-testid="gc-status" data-state={kind}>
            <i aria-hidden="true" />{pill}
          </span>
          {clock && <span className="gc-clock" data-testid="gc-clock">{clock}</span>}
          {stale && live && <span className="gc-stale-note">Updating… the last data is older than expected.</span>}
        </div>
      </div>
      {sub && <p className="gc-sub" data-testid="gc-sub"><Icon name="pin" size={16} />{sub}</p>}
      {line && (
        <table className="gc-linescore" data-testid="gc-linescore" aria-label="Goals by period">
          <thead>
            <tr><th scope="col"><span className="sr-only">Team</span></th>{line.cols.map((c) => <th scope="col" key={c.key}>{c.label}</th>)}{line.soCol && <th scope="col">SO</th>}<th scope="col">T</th></tr>
          </thead>
          <tbody>
            {line.rows.map((r, i) => (
              <tr key={r.team.id}>
                <th scope="row">{r.team.id}</th>
                {r.cells.map((n, k) => <td key={k}>{n}</td>)}
                {line.soCol && <td>{line.soCol[i]}</td>}
                <td className="gc-ls-total">{r.total ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </header>
  );
}
