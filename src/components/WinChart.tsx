import type { Team } from "../types";
import { TeamLogo } from "./TeamLogo";
import "./win-chart.css";

export type WinPoint = { t: number; home: number };

const W = 640, H = 250, X0 = 62, X1 = 500, Y0 = 18, Y1 = 196;
const x = (t: number) => X0 + (Math.min(60, Math.max(0, t)) / 60) * (X1 - X0);
const y = (p: number) => Y1 - Math.min(1, Math.max(0, p)) * (Y1 - Y0);

/**
 * The model's win chance for the favoured team across the game, drawn on the home team's colour: the line so far, the 50% line, period breaks, where it stands now,
 * and each side's chance in a chip underneath. Used in the expanded game card in place of the dial.
 */
export function WinChart({ home, away, pHome, live, history, now, score, label }: {
  home: Team; away: Team; pHome: number; live: boolean; history: WinPoint[]; now: number; score?: { home: number; away: number } | null; label: string;
}) {
  const homePct = Math.round(pHome * 100), awayPct = 100 - homePct;
  const homeFav = pHome >= 0.5, fav = homeFav ? home : away, favPct = homeFav ? homePct : awayPct;
  const verdict = homePct === awayPct ? "Too close to call" : `${fav.id} favored`;
  const side = (p: number) => (homeFav ? p : 1 - p);
  // the line so far, ending at the current estimate
  const pts = [...history.filter((h) => h.t < now), { t: now, home: pHome }].map((h) => [x(h.t), y(side(h.home))] as const);
  const line = pts.map(([a, b], i) => `${i ? "L" : "M"}${a.toFixed(1)} ${b.toFixed(1)}`).join("");
  const [ex, ey] = pts[pts.length - 1];
  const area = pts.length > 1 ? `${line}L${ex.toFixed(1)} ${Y1}L${pts[0][0].toFixed(1)} ${Y1}Z` : "";
  const bw = 112, bx = Math.min(ex + 12, W - bw - 2), by = Math.min(Math.max(ey - 22, 2), Y1 - 44);
  const c = (t: Team) => t.cardColor ?? t.color;
  return (
    <section className="projection win" aria-label={live ? "Live winner projection" : "Pregame projection"} style={{ ["--win-bg" as any]: c(home) }}>
      <div className="win-top"><span>{live ? "LIVE PROJECTION" : "PREGAME PROJECTION"}</span><span>MODEL ESTIMATE</span></div>
      <div className="win-head">
        <strong><em>{homePct === awayPct ? "Even" : fav.id}</em>{homePct === awayPct ? "" : " favored"}</strong>
        {score && <b aria-label="Projected final score">{away.id} {score.away} – {score.home} {home.id}</b>}
      </div>
      <svg className="win-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${fav.name} win probability through the game, ${verdict}, now ${favPct}%`}>
        <defs>
          <linearGradient id="win-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="var(--win-accent)" stopOpacity=".55" /><stop offset="1" stopColor="var(--win-accent)" stopOpacity="0" /></linearGradient>
        </defs>
        <g className="win-axis">
          <line x1={X0} y1={Y0} x2={X0} y2={Y1} /><line x1={X0} y1={Y1} x2={X1} y2={Y1} />
          {[20, 40].map((t) => <line key={t} className="win-brk" x1={x(t)} y1={Y0} x2={x(t)} y2={Y1} />)}
          <line className="win-mid" x1={X0} y1={y(0.5)} x2={X1} y2={y(0.5)} />
          <text x={X0 - 8} y={Y0 + 7} textAnchor="end">100%</text><text x={X0 - 8} y={y(0.5) + 7} textAnchor="end">50%</text><text x={X0 - 8} y={Y1 + 7} textAnchor="end">0%</text>
          {["1st", "2nd", "3rd"].map((n, i) => <text key={n} x={x(i * 20 + 10)} y={Y1 + 28} textAnchor="middle">{n}</text>)}
        </g>
        {area && <path className="win-area" d={area} fill="url(#win-fill)" />}
        {pts.length > 1 && <path className="win-line" d={line} />}
        <circle className="win-dot" cx={ex} cy={ey} r="6" />
        <g transform={`translate(${bx} ${by})`}>
          <rect className="win-badge" width={bw} height="44" rx="10" />
          <foreignObject x="6" y="4" width={bw - 10} height="36"><div className="win-badge-in"><TeamLogo id={fav.id} size={26} /><b>{favPct}%</b></div></foreignObject>
        </g>
      </svg>
      <p className="win-cap">{label}</p>
      <div className="win-chips">
        {[{ t: away, p: awayPct }, { t: home, p: homePct }].map(({ t, p }) => (
          <div key={t.id} className={`win-chip${t.id === fav.id && homePct !== awayPct ? " lead" : ""}`}><TeamLogo id={t.id} size={34} /><b>{p}%</b></div>
        ))}
      </div>
    </section>
  );
}
