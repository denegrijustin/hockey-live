import { useEffect, useMemo, useRef, useState } from "react";
import type { Game, Team } from "../../types";
import { TeamLogo } from "../TeamLogo";
import { formStrip, goalTimeline, headToHead, lineGaps, pairColors, rankTracks } from "../../lib/intel-visuals.mjs";
import "./intel-visuals.css";

const ord = (n: number) => { const t = n % 100; return t >= 11 && t <= 13 ? `${n}th` : `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`; };
const OUT: Record<string, string> = { W: "W", OT: "OTL", L: "L" };
const SPOT: Record<string, string> = { in: "In a playoff spot", wc1: "First wild card", wc2: "Second wild card", out: "Outside the line" };

/** The drawn width of an element, so SVG text stays the same size on a phone as on a desktop (the drawing is laid out in real pixels). */
function useWidth(ref: React.RefObject<Element | null>, fallback = 600) {
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(Math.max(260, Math.round(el.getBoundingClientRect().width)));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return w;
}

/**
 * The pictures for the Matchup Intelligence tab: head-to-head bars, last-five form, special-teams rank tracks, distance to the playoff line
 * and a goal timeline. Each block appears only when its data exists. The words live in the fact list below.
 */
export function IntelVisuals({ game, before, snapshot, teams, plays, phase }: { game: Game; before: any; snapshot: any; teams: Team[]; plays: any[]; phase: "pre" | "live" | "post" | null }) {
  const away = teams.find((t) => t.id === game.away), home = teams.find((t) => t.id === game.home);
  const [ca, ch] = pairColors(away?.cardColor ?? away?.color ?? "", home?.cardColor ?? home?.color ?? "");
  const rows = useMemo(() => headToHead(before, game, snapshot), [before, game, snapshot]);
  const form = useMemo(() => formStrip(before, game), [before, game]);
  const tracks = useMemo(() => rankTracks(snapshot, game), [snapshot, game]);
  const gaps = useMemo(() => (phase === "post" ? null : lineGaps(before, game, teams)), [before, game, teams, phase]);
  const goalsRef = useRef<HTMLDivElement>(null);
  const gw = useWidth(goalsRef);
  const timeline = useMemo(() => (phase === "live" || phase === "post" ? goalTimeline(plays, game) : null), [plays, game, phase]);
  if (!rows.length && !form && !tracks.length && !gaps && !timeline) return null;
  const style = { ["--ca" as any]: ca, ["--ch" as any]: ch };
  const sides = (
    <div className="iv-sides" aria-hidden="true">
      <span><TeamLogo id={game.away} size={26} /><b>{game.away}</b></span>
      <span><b>{game.home}</b><TeamLogo id={game.home} size={26} /></span>
    </div>
  );
  return (
    <div className="iv" style={style} data-testid="gc-intel-visuals">
      {rows.length > 0 && (
        <section className="iv-card iv-h2h" aria-label="Head to head this season">
          <h3>Head to head <small>this season</small></h3>
          {sides}
          <ul>
            {rows.map((r: any) => (
              <li key={r.key} data-row={r.key} data-better={r.better} aria-label={`${r.label}: ${game.away} ${r.away.text}, ${game.home} ${r.home.text}`}>
                <b className={r.better === "away" ? "lead" : ""}>{r.away.text}</b>
                <span className="iv-mid"><i>{r.label}</i><span className="iv-bar"><em style={{ width: `${(r.share * 100).toFixed(1)}%` }} /><em /></span></span>
                <b className={r.better === "home" ? "lead" : ""}>{r.home.text}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="iv-minis">
      {form && (
        <section className="iv-card iv-form" aria-label="Last five games">
          <h3>Last five <small>oldest to newest</small></h3>
          {(["away", "home"] as const).map((side) => (
            <div key={side} className="iv-form-row" data-side={side} aria-label={`${game[side]}: ${form[side].map((o: string) => OUT[o]).join(", ")}`}>
              <TeamLogo id={game[side]} size={22} /><b>{game[side]}</b>
              <span className="iv-dots">{form[side].map((o: string, i: number) => <i key={i} className={`iv-dot o-${o.toLowerCase()}`}>{o === "OT" ? "OT" : o}</i>)}</span>
            </div>
          ))}
        </section>
      )}
      {tracks.length > 0 && (
        <section className="iv-card iv-tracks" aria-label="Special teams ranks">
          <h3>Special teams <small>league rank, best on the left</small></h3>
          {tracks.map((t: any) => (
            <div key={t.key} className="iv-track" data-track={t.key} aria-label={`${t.label}: ${game.away} ${ord(t.away.rank)}, ${game.home} ${ord(t.home.rank)} of ${t.pool}`}>
              <span className="iv-track-label">{t.label}</span>
              <span className="iv-rail">
                {(["away", "home"] as const).map((side) => (
                  <span key={side} className={`iv-pin ${side}`} style={{ left: `${((t[side].rank - 1) / (t.pool - 1)) * 100}%` }}>
                    <TeamLogo id={game[side]} size={24} /><small>{ord(t[side].rank)}</small>
                  </span>
                ))}
              </span>
            </div>
          ))}
        </section>
      )}
      {gaps && (
        <section className="iv-card iv-line" aria-label="Distance from the playoff line">
          <h3>Playoff line <small>points above or below</small></h3>
          {gaps.map((g: any, i: number) => {
            const w = Math.min(50, Math.abs(g.pts) * 6.25);
            return (
              <div key={g.id} className="iv-gap" data-team={g.id} data-side={i ? "home" : "away"} aria-label={`${g.id}: ${g.pts === 0 ? "level with" : `${Math.abs(g.pts)} ${g.pts > 0 ? "above" : "below"}`} the line. ${SPOT[g.status]}`}>
                <TeamLogo id={g.id} size={22} />
                <span className="iv-gapbar"><i className="iv-zero" /><em className={g.pts >= 0 ? "up" : "down"} style={g.pts >= 0 ? { left: "50%", width: `${w}%` } : { left: `${50 - w}%`, width: `${w}%` }} /></span>
                <b>{g.pts > 0 ? `+${g.pts}` : g.pts}</b>
                <small>{SPOT[g.status]}</small>
              </div>
            );
          })}
        </section>
      )}
      </div>
      {timeline && (
        <section className="iv-card iv-goals" aria-label="Goals through the game">
          <h3>Goals <small>{timeline.marks.length} in {timeline.overtime ? "regulation and overtime" : "regulation"}</small></h3>
          <div ref={goalsRef}>
          {(() => {
            const L = 44, R = gw - 14, span = R - L, X = (sec: number) => L + (sec / timeline.end) * span;
            const bounds = timeline.overtime ? [0, 1200, 2400, 3600, timeline.end] : [0, 1200, 2400, 3600];
            const labels = ["P1", "P2", "P3", "OT"];
            return (
              <svg width={gw} height={128} viewBox={`0 0 ${gw} 128`} role="img" aria-label={`Goal timeline: ${timeline.marks.map((m: any) => `${m.team} ${m.label}`).join(", ")}`}>
                {bounds.map((s, i) => <g key={s}><line x1={X(s)} x2={X(s)} y1="12" y2="100" className="iv-tick" />{i < bounds.length - 1 && <text x={(X(s) + X(bounds[i + 1])) / 2} y="120" className="iv-plabel" textAnchor="middle">{labels[i]}</text>}</g>)}
                <line x1={L} x2={R} y1="56" y2="56" className="iv-axis" />
                <text x="2" y="34" className="iv-tl">{game.away}</text><text x="2" y="86" className="iv-tl">{game.home}</text>
                {timeline.marks.map((m: any, i: number) => {
                  const x = X(m.elapsed), y = m.side === "away" ? 32 : 80;
                  return (
                    <g key={i} className={`iv-goal ${m.side}`}>
                      <title>{`${m.team} · ${m.label}${m.scorer ? ` · ${m.scorer}` : ""} · ${m.away}–${m.home}`}</title>
                      <line x1={x} x2={x} y1="56" y2={y} className="iv-stem" />
                      <circle cx={x} cy={y} r="11" />
                      <text x={x} y={y + 4} textAnchor="middle">{m.side === "away" ? m.away : m.home}</text>
                    </g>
                  );
                })}
              </svg>
            );
          })()}
          </div>
        </section>
      )}
    </div>
  );
}
