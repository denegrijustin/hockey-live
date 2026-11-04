import { useEffect, useState } from "react";

/**
 * A gas-gauge dial for a two-sided number: the away side fills from the left, the home side from the right, and the needle points
 * at the split. Used for "deserved to win" and for every head-to-head stat, so they all read the same way.
 */
export function Gauge({ away, home, awayId, homeId, label, format = (v: number) => String(v), percent = false, size = "sm", span, lowerBetter = false, awayText, homeText }: {
  away: number; home: number; awayId: string; homeId: string; label: string; format?: (v: number) => string; percent?: boolean; size?: "sm" | "lg";
  /** For numbers that are not shares of a total (a save percentage, goals against): the gap that swings the needle all the way. */
  span?: number; lowerBetter?: boolean; awayText?: string; homeText?: string;
}) {
  const total = away + home;
  // The away side's share, 0..1. Counts split by their total; rates by how far apart they are.
  const share = span ? Math.min(0.95, Math.max(0.05, 0.5 + ((away - home) / span / 2) * (lowerBetter ? -1 : 1))) : total > 0 ? away / total : 0.5;
  // The needle sweeps in from the middle once the dial is on screen (a transform transition, off for reduced motion in CSS).
  const [shown, setShown] = useState(0.5);
  useEffect(() => { const f = requestAnimationFrame(() => setShown(share)); return () => cancelAnimationFrame(f); }, [share]);
  const R = 74, C = 100, W = 14, arc = (from: number, to: number) => {
    const p = (s: number, r: number) => `${(C + r * Math.cos(Math.PI * (1 - s))).toFixed(2)} ${(C - r * Math.sin(Math.PI * (1 - s))).toFixed(2)}`;
    return `M${p(from, R)}A${R} ${R} 0 0 1 ${p(to, R)}`;
  };
  const gap = 0.012;
  const awayEnd = Math.max(0, share - gap), homeStart = Math.min(1, share + gap);
  const shownA = awayText ?? (percent ? `${away}%` : format(away)), shownH = homeText ?? (percent ? `${home}%` : format(home));
  const text = `${awayId} ${shownA}, ${homeId} ${shownH}`;
  const leader = share > 0.52 ? "away" : share < 0.48 ? "home" : "even";
  return (
    <figure className={`gauge ${size}`} data-leader={leader} role="img" aria-label={`${label}: ${text}`}>
      <svg viewBox="0 0 200 116" aria-hidden="true">
        <path d={arc(0, 1)} className="gauge-track" strokeWidth={W + 4} />
        {awayEnd > 0 && <path d={arc(0, awayEnd)} className="gauge-away" strokeWidth={W} />}
        {homeStart < 1 && <path d={arc(homeStart, 1)} className="gauge-home" strokeWidth={W} />}
        {Array.from({ length: 11 }, (_, i) => {
          const s = i / 10, major = i % 5 === 0, r1 = R - W / 2 - 3, r2 = r1 - (major ? 9 : 5);
          const at = (r: number) => `${(C + r * Math.cos(Math.PI * (1 - s))).toFixed(2)}`;
          const aty = (r: number) => `${(C - r * Math.sin(Math.PI * (1 - s))).toFixed(2)}`;
          return <line key={i} x1={at(r1)} y1={aty(r1)} x2={at(r2)} y2={aty(r2)} className={major ? "gauge-tick major" : "gauge-tick"} />;
        })}
        <g className="gauge-needle" style={{ transform: `rotate(${(0.5 - shown) * 180}deg)` }}>
          <path d={`M${C - 2.6} ${C}L${C} ${C - R + 6}L${C + 2.6} ${C}Z`} />
        </g>
        <circle cx={C} cy={C} r="6" className="gauge-hub" />
      </svg>
      <figcaption>
        <span className="gauge-side away"><b>{awayId}</b><i>{shownA}</i></span>
        <span className="gauge-label">{label}</span>
        <span className="gauge-side home"><i>{shownH}</i><b>{homeId}</b></span>
      </figcaption>
    </figure>
  );
}
