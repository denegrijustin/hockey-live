import { useEffect, useRef, useState } from "react";
import { LogoImage, TeamLogo } from "./TeamLogo";
import { gaugeColors } from "../lib/kits";

/** compact 120px, standard 190px, expanded 280px (tokens in styles.css); "sm" = compact and "lg" = standard are legacy aliases. */
export type GaugeSize = "compact" | "standard" | "expanded" | "sm" | "lg";

/**
 * The stretched gauge: a wide, flat dial that fills the width it is given. The needle leans toward the team with the higher number and is
 * longer the further it leans (short at 50/50, reaching the arc when one side has it all). The arc is coloured from the centre ("Even")
 * out to the needle in the leader's colour. Drawn in real pixels (measured width) so text and strokes keep their size.
 */
function StretchDial({ away, home, share, shown, label, text, shownA, shownH, awaySub, homeSub, colors, leader, variant }: {
  away: string; home: string; share: number; shown: number; label: string; text: string; shownA: string; shownH: string; awaySub?: string; homeSub?: string;
  colors: { away: string; home: string }; leader: string; variant: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(320);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setW(Math.max(200, Math.round(el.getBoundingClientRect().width)));
    read();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const lopTarget = Math.min(1, Math.abs(share - 0.5) * 2);
  const lean = (shown - 0.5) * 2;                       // +1 (away has it all, leans left) .. -1 (home has it all, leans right): toward the higher value
  const lop = Math.min(1, Math.abs(lean));
  const pad = 16, rx = (w - pad * 2) / 2, ry = Math.max(26, Math.min(rx * 0.24, 72)), cx = w / 2, cy = ry + 14, hgt = cy + 34;
  const MAX = (74 * Math.PI) / 180;
  const phi = Math.PI / 2 + lean * MAX;                  // direction of the needle: pi/2 = straight up, toward pi = the away end
  const pt = (f: number, ph: number) => ({ x: cx + f * rx * Math.cos(ph), y: cy - f * ry * Math.sin(ph) });
  const f = 0.4 + 0.6 * lop;                             // longer needle the more it leans
  const tip = pt(f, phi), top = pt(1, Math.PI / 2), tipEdge = pt(1, phi);
  const arc = (from: number, to: number) => { const a = pt(1, from), b = pt(1, to); return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A${rx.toFixed(1)} ${ry.toFixed(1)} 0 0 ${to < from ? 1 : 0} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`; };
  const color = lean >= 0 ? colors.away : colors.home;
  return (
    <figure className={`gauge stretch ${variant}`} data-leader={leader} data-lopsided={lopTarget.toFixed(2)} style={{ "--g-away": colors.away, "--g-home": colors.home } as React.CSSProperties} role="img" aria-label={`${label}: ${text}`}>
      <figcaption className="sg-label">{label}</figcaption>
      <div ref={ref} className="sg-chart">
        <svg width={w} height={hgt} viewBox={`0 0 ${w} ${hgt}`} aria-hidden="true">
          <path d={arc(Math.PI, 0)} className="sg-arc-track" />
          {lop > 0.01 && <path d={arc(Math.PI / 2, phi)} className="sg-arc" style={{ stroke: color }} />}
          <line x1={cx} y1={cy} x2={top.x} y2={top.y} className="sg-guide" />
          <line x1={cx} y1={cy} x2={tip.x} y2={tip.y} className="sg-needle-line" style={{ stroke: color }} />
          <circle cx={tip.x} cy={tip.y} r="5" className="sg-needle-dot" />
          <circle cx={cx} cy={cy} r="5" className="sg-hub" />
          <text x={cx} y={cy + 20} textAnchor="middle" className="sg-even">Even</text>
          <circle cx={tipEdge.x} cy={tipEdge.y} r="0" />
        </svg>
        <span className="sg-end away"><TeamLogo id={away} size={28} className="sg-logo" /><b>{away}</b></span>
        <span className="sg-end home"><b>{home}</b><TeamLogo id={home} size={28} className="sg-logo" /></span>
      </div>
      <div className="sg-values">
        <span className="gauge-side away"><i>{shownA}</i>{awaySub && <em>{awaySub}</em>}</span>
        <span className="sg-higher">{leader === "even" ? "Even" : `${leader === "away" ? away : home} higher`}</span>
        <span className="gauge-side home"><i>{shownH}</i>{homeSub && <em>{homeSub}</em>}</span>
      </div>
    </figure>
  );
}

/** Black or white, whichever reads on the team colour behind the number. */
function inkOn(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#fff";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? "#10151c" : "#fff";
}

/**
 * Projected final score: a half-circle dial that splits at the win chance (away colour from the left, home from the right), a needle that leans toward the
 * higher side and grows as it leans, and each team's logo tile with its big number and win probability beside it.
 */
function ProjDial({ away, home, share, shown, label, text, shownA, shownH, awaySub, homeSub, colors, leader }: {
  away: string; home: string; share: number; shown: number; label: string; text: string; shownA: string; shownH: string; awaySub?: string; homeSub?: string;
  colors: { away: string; home: string }; leader: string;
}) {
  const C = 120, R = 100, W = 15;
  const pt = (f: number, ph: number) => ({ x: C + f * R * Math.cos(ph), y: C - f * R * Math.sin(ph) });
  const arc = (from: number, to: number, r = R) => { const a = pt(r / R, from), b = pt(r / R, to); return `M${a.x.toFixed(1)} ${a.y.toFixed(1)}A${r} ${r} 0 0 ${to < from ? 1 : 0} ${b.x.toFixed(1)} ${b.y.toFixed(1)}`; };
  const split = Math.PI * (1 - shown);                       // the away colour runs from the left end (pi) down to here
  const lean = (shown - 0.5) * 2, lop = Math.min(1, Math.abs(lean));
  const phi = Math.PI / 2 + lean * ((72 * Math.PI) / 180);   // toward the higher side
  const tip = pt(0.4 + 0.52 * lop, phi);
  const gap = 0.018;
  const ticks = Array.from({ length: 9 }, (_, i) => Math.PI * (1 - i / 8));
  return (
    <figure className="gauge proj" data-leader={leader} style={{ "--g-away": colors.away, "--g-home": colors.home } as React.CSSProperties} role="img" aria-label={`${label}: ${text}`}>
      <div className="pj-row">
        <div className="pj-side away">
          <span className="pj-tile"><TeamLogo id={away} size={44} /></span>
          <span className="pj-val"><b>{shownA}</b>{awaySub && <i>{awaySub}</i>}{awaySub && <small>Win Probability</small>}</span>
        </div>
        <svg className="pj-dial" viewBox="0 0 240 132" aria-hidden="true">
          <path d={arc(Math.PI, 0)} className="pj-track" strokeWidth={W + 2} />
          {split < Math.PI - 0.01 && <path d={arc(Math.PI, Math.min(Math.PI, split + gap))} className="pj-away" strokeWidth={W} style={{ stroke: colors.away }} />}
          {split > 0.01 && <path d={arc(Math.max(0, split - gap), 0)} className="pj-home" strokeWidth={W} style={{ stroke: colors.home }} />}
          {ticks.map((a, i) => { const p1 = pt(0.78, a), p2 = pt(i % 4 === 0 ? 0.64 : 0.7, a); return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} className="pj-tick" />; })}
          <line x1={C} y1={C} x2={tip.x} y2={tip.y} className="pj-needle" />
          <circle cx={C} cy={C} r="7" className="pj-hub" />
        </svg>
        <div className="pj-side home">
          <span className="pj-val"><b>{shownH}</b>{homeSub && <i>{homeSub}</i>}{homeSub && <small>Win Probability</small>}</span>
          <span className="pj-tile"><TeamLogo id={home} size={44} /></span>
        </div>
      </div>
    </figure>
  );
}

/** Deserved to win: one split bar, each team's share in its own colour with the number inside, an Even mark in the middle. */
function SplitBar({ away, home, share, label, text, shownA, shownH, colors, leader }: {
  away: string; home: string; share: number; label: string; text: string; shownA: string; shownH: string; colors: { away: string; home: string }; leader: string;
}) {
  const a = Math.max(0.04, Math.min(0.96, share));
  return (
    <figure className="gauge sbar" data-leader={leader} style={{ "--g-away": colors.away, "--g-home": colors.home, "--ink-away": inkOn(colors.away), "--ink-home": inkOn(colors.home) } as React.CSSProperties} role="img" aria-label={`${label}: ${text}`}>
      <div className="sb-row">
        <span className="sb-team"><TeamLogo id={away} size={32} /><b>{away}</b></span>
        <div className="sb-track">
          <span className="sb-a" style={{ flexGrow: a * 1000 }}><i>{shownA}</i></span>
          <span className="sb-h" style={{ flexGrow: (1 - a) * 1000 }}><i>{shownH}</i></span>
          <u className="sb-mid" aria-hidden="true" />
        </div>
        <span className="sb-team home"><b>{home}</b><TeamLogo id={home} size={32} /></span>
      </div>
      <span className="sb-even">Even</span>
    </figure>
  );
}

/**
 * A gas-gauge dial for a two-sided number: the away side fills from the left, the home side from the right, and the needle points
 * at the split. Used for "deserved to win" and for every head-to-head stat, so they all read the same way.
 */
export function Gauge({ away, home, awayId, homeId, label, format = (v: number) => String(v), percent = false, size = "compact", span, lowerBetter = false, awayText, homeText, awaySub, homeSub, needle, stretch = false, look }: {
  away: number; home: number; awayId: string; homeId: string; label: string; format?: (v: number) => string; percent?: boolean; size?: GaugeSize;
  /** For numbers that are not shares of a total (a save percentage, goals against): the gap that swings the needle all the way. */
  span?: number; lowerBetter?: boolean; awayText?: string; homeText?: string;
  /** A smaller second line under each side's number (the win chance under a projected score). */
  awaySub?: string; homeSub?: string;
  /** Where the needle points (the away side's share, 0..1) when it is not simply the split of the two numbers shown. */
  needle?: number;
  /** A horizontal gauge instead of the dial: its length grows with how lopsided the two numbers are (shortest at 50/50, full width when one side has it all). */
  stretch?: boolean;
  /** "proj": the projected-final-score dial with logo tiles and big numbers; "bar": the deserved-to-win split bar. */
  look?: "proj" | "bar";
}) {
  const total = away + home;
  // The away side's share, 0..1. Counts split by their total; rates by how far apart they are.
  const share = needle != null ? needle : span ? Math.min(0.95, Math.max(0.05, 0.5 + ((away - home) / span / 2) * (lowerBetter ? -1 : 1))) : total > 0 ? away / total : 0.5;
  // The needle sweeps in from the middle once the dial is on screen (a transform transition, off for reduced motion in CSS).
  const [shown, setShown] = useState(0.5);
  useEffect(() => { const f = requestAnimationFrame(() => setShown(share)); return () => cancelAnimationFrame(f); }, [share]);
  const R = 74, C = 100, W = 14, arc = (from: number, to: number) => {
    const p = (s: number, r: number) => `${(C + r * Math.cos(Math.PI * (1 - s))).toFixed(2)} ${(C - r * Math.sin(Math.PI * (1 - s))).toFixed(2)}`;
    return `M${p(from, R)}A${R} ${R} 0 0 1 ${p(to, R)}`;
  };
  const variant = size === "sm" ? "compact" : size === "lg" ? "standard" : size;
  const big = variant !== "compact"; // caption type and logo scale: .sm for compact, .lg for standard and expanded
  const L = big ? 30 : 38; // the headline dials are drawn much larger, so their logos are smaller in dial units
  const gap = 0.012;
  const awayEnd = Math.max(0, share - gap), homeStart = Math.min(1, share + gap);
  const shownA = awayText ?? (percent ? `${away}%` : format(away)), shownH = homeText ?? (percent ? `${home}%` : format(home));
  const text = `${awayId} ${shownA}${awaySub ? ` (${awaySub})` : ""}, ${homeId} ${shownH}${homeSub ? ` (${homeSub})` : ""}`;
  const colors = gaugeColors(awayId, homeId);
  const leader = share > 0.52 ? "away" : share < 0.48 ? "home" : "even";
  if (look === "proj") return <ProjDial away={awayId} home={homeId} share={share} shown={shown} label={label} text={text} shownA={shownA} shownH={shownH} awaySub={awaySub} homeSub={homeSub} colors={colors} leader={leader} />;
  if (look === "bar") return <SplitBar away={awayId} home={homeId} share={share} label={label} text={text} shownA={shownA} shownH={shownH} colors={colors} leader={leader} />;
  if (stretch) return <StretchDial away={awayId} home={homeId} share={share} shown={shown} label={label} text={text} shownA={shownA} shownH={shownH} awaySub={awaySub} homeSub={homeSub} colors={colors} leader={leader} variant={variant} />;
  return (
    <figure className={`gauge ${big ? "lg" : "sm"} ${variant}`} data-leader={leader} style={{ "--g-away": colors.away, "--g-home": colors.home } as React.CSSProperties} role="img" aria-label={`${label}: ${text}`}>
      <svg viewBox="0 0 200 146" aria-hidden="true">
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
        {/* each team's logo sits at its own end of the dial */}
        <LogoImage id={awayId} x={C - R - 2 - L / 2} y={C + 6} size={L} />
        <LogoImage id={homeId} x={C + R + 2 - L / 2} y={C + 6} size={L} />
      </svg>
      <figcaption>
        <span className="gauge-side away"><b>{awayId}</b><i>{shownA}</i>{awaySub && <em>{awaySub}</em>}</span>
        <span className="gauge-label">{label}</span>
        <span className="gauge-side home"><i>{shownH}</i>{homeSub && <em>{homeSub}</em>}<b>{homeId}</b></span>
      </figcaption>
    </figure>
  );
}
