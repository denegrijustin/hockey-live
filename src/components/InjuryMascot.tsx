import { useId, useRef, useState } from "react";
import { useOnScreen } from "../motion";
import { kitFor } from "../lib/kits";
import { logoUrl } from "../lib/logos";

type Spot = { cx: number; cy: number; r: number };

// The cartoon sits on the ice, legs out in front. Points are in its own 240 x 200 space. The athlete's left is on the viewer's right.
const HIP = { r: [118, 150], l: [86, 150] } as const;
const FOOT = { r: [196, 176], l: [30, 176] } as const;
const along = (s: "r" | "l", t: number): [number, number] => [HIP[s][0] + (FOOT[s][0] - HIP[s][0]) * t, HIP[s][1] + (FOOT[s][1] - HIP[s][1]) * t];

/** Where the injury glows on the cartoon. A named side lights one side; with no side, both. */
export function spotsFor(zone: string, side: "left" | "right" | null): Spot[] {
  const sides: ("r" | "l")[] = side === "left" ? ["r"] : side === "right" ? ["l"] : ["r", "l"]; // "r" = viewer's right = athlete's left
  const both = (f: (s: "r" | "l") => Spot) => sides.map(f);
  const leg = (t: number, r: number) => both((s) => { const [cx, cy] = along(s, t); return { cx, cy, r }; });
  switch (zone) {
    case "head": return [{ cx: 100, cy: 56, r: 36 }];
    case "neck": return [{ cx: 100, cy: 90, r: 11 }];
    case "shoulder": return both((s) => ({ cx: s === "r" ? 138 : 62, cy: 100, r: 14 }));
    case "arm": return both((s) => (s === "r" ? { cx: 148, cy: 80, r: 14 } : { cx: 52, cy: 126, r: 14 }));
    case "hand": return both((s) => (s === "r" ? { cx: 154, cy: 52, r: 11 } : { cx: 46, cy: 154, r: 11 }));
    case "chest": return [{ cx: 100, cy: 108, r: 20 }];
    case "core": return [{ cx: 100, cy: 136, r: 17 }];
    case "back": return [{ cx: 100, cy: 120, r: 30 }];
    case "groin": return [{ cx: 102, cy: 152, r: 11 }];
    case "hip": return both((s) => ({ cx: s === "r" ? 124 : 80, cy: 150, r: 13 }));
    case "thigh": return leg(0.3, 14);
    case "knee": return leg(0.55, 13);
    case "calf": return leg(0.75, 12);
    case "ankle": return leg(0.9, 9);
    case "foot": return leg(1, 11);
    case "upper": return [{ cx: 100, cy: 108, r: 26 }, { cx: 138, cy: 100, r: 14 }, { cx: 62, cy: 100, r: 14 }, { cx: 100, cy: 56, r: 30 }];
    case "lower": return [...leg(0.3, 14), ...leg(0.6, 13), ...leg(0.9, 10)];
    case "illness": case "personal": return [{ cx: 100, cy: 104, r: 62 }];
    default: return [];
  }
}

/** Finished artwork, for the players it has been drawn for: team and position. Everyone else gets the drawn cartoon below. */
const ART: Record<string, string> = { "EDM:G": "/injury/oilers-goalie.png" };

const shade = (hex: string, pct: number) => `color-mix(in srgb, ${hex} ${pct}%, #000)`;
const SKIN = "#e8b894";

/**
 * The injury card's cartoon: the player, in his team's jersey (goalies in pads, a blocker and a catcher, mask pushed up), sat on the ice with an ice pack
 * and a wince, his own picture for a face. The injured spot glows red and pulses three times when the card scrolls into view.
 */
export function InjuryMascot({ team, goalie, zone, side, label, face, size = 190 }: { team: string; goalie: boolean; zone: string; side: "left" | "right" | null; label: string; face: string | null; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useOnScreen(ref, true);
  const id = useId();
  const [bad, setBad] = useState(false);
  const { jersey, trim } = kitFor(team);
  const pants = shade(jersey, 45);
  const spots = spotsFor(zone, side);
  const art = ART[`${team}:${goalie ? "G" : "S"}`];
  const photo = !!face && !bad;
  const pad = (s: "r" | "l") => {
    const [x1, y1] = along(s, 0.1), [x2, y2] = along(s, 1);
    const ang = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
    const len = Math.hypot(x2 - x1, y2 - y1);
    return <g key={s} transform={`translate(${x1} ${y1}) rotate(${ang})`}><rect x="0" y="-14" width={len} height="28" rx="13" fill="#f6f7f9" stroke="#1b2430" strokeWidth="2" /><rect x={len * 0.22} y="-14" width="5" height="28" fill={trim} /><rect x={len * 0.5} y="-14" width="5" height="28" fill={trim} /><rect x={len * 0.78} y="-14" width="5" height="28" fill={trim} /></g>;
  };
  const leg = (s: "r" | "l") => {
    const [x, y] = along(s, 1), [hx, hy] = HIP[s];
    return (
      <g key={s}>
        <line x1={hx} y1={hy} x2={x} y2={y} stroke={pants} strokeWidth="26" strokeLinecap="round" />
        {goalie ? pad(s) : null}
        <path d={`M${x - 4} ${y + 10}h${s === "r" ? 26 : -26}`} stroke="#1b2430" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx={x + (s === "r" ? 6 : -6)} cy={y + 2} rx="13" ry="9" fill="#e9edf2" stroke="#1b2430" strokeWidth="2" />
      </g>
    );
  };
  if (art) return (
    <div ref={ref} className="inj-figure inj-mascot inj-art" data-zone={zone} data-side={side ?? ""} data-goalie="1" role="img" aria-label={`Injury location: ${label}`}>
      <img src={art} alt="" width={size} height={Math.round(size * 0.905)} decoding="async" data-testid="inj-art" />
    </div>
  );
  return (
    <div ref={ref} className={`inj-figure inj-mascot${seen ? " play" : ""}`} data-zone={zone} data-side={side ?? ""} data-goalie={goalie ? "1" : "0"} role="img" aria-label={`Injury location: ${label}`}>
      <svg viewBox="0 0 240 200" width={size} height={size * (200 / 240)} aria-hidden="true">
        <defs>
          <clipPath id={`${id}h`}><circle cx="100" cy="56" r="30" /></clipPath>
        </defs>
        <ellipse className="m-stage" cx="112" cy="110" rx="112" ry="92" />
        <ellipse className="m-ice" cx="112" cy="186" rx="104" ry="11" />
        {leg("l")}{leg("r")}
        {/* body */}
        <rect x={goalie ? 54 : 62} y="82" width={goalie ? 92 : 76} height="72" rx="20" fill={jersey} stroke="#1b2430" strokeWidth="2.5" />
        <rect x={goalie ? 54 : 62} y="126" width={goalie ? 92 : 76} height="9" fill={trim} />
        <rect x={goalie ? 54 : 62} y="140" width={goalie ? 92 : 76} height="5" fill={trim} />
        <circle cx="100" cy="108" r="14" fill="#fff" stroke="#1b2430" strokeWidth="1.5" /><image href={logoUrl(team)} x="88" y="96" width="24" height="24" preserveAspectRatio="xMidYMid meet" />
        {/* arm down, on the ice */}
        <line x1="66" y1="100" x2="48" y2="148" stroke={jersey} strokeWidth="19" strokeLinecap="round" />
        {goalie ? <rect x="31" y="142" width="26" height="22" rx="7" fill="#f6f7f9" stroke="#1b2430" strokeWidth="2" transform="rotate(-12 44 153)" /> : <circle cx="46" cy="152" r="9" fill={SKIN} stroke="#1b2430" strokeWidth="2" />}
        {/* arm up, holding the ice pack */}
        <line x1="134" y1="98" x2="152" y2="58" stroke={jersey} strokeWidth="19" strokeLinecap="round" />
        {goalie ? <rect x="141" y="38" width="26" height="24" rx="8" fill="#f6f7f9" stroke="#1b2430" strokeWidth="2" /> : <circle cx="154" cy="52" r="9" fill={SKIN} stroke="#1b2430" strokeWidth="2" />}
        {/* injured spot */}
        <g className="fig-zone">{spots.map((s, k) => <circle key={k} cx={s.cx} cy={s.cy} r={s.r} />)}</g>
        <g className="fig-pulse">{spots.map((s, k) => <circle key={k} cx={s.cx} cy={s.cy} r={s.r} />)}</g>
        {/* head, tipped to one side */}
        <g transform="rotate(-10 100 56)">
          <circle cx="100" cy="56" r="31" fill={SKIN} stroke="#1b2430" strokeWidth="2.5" />
          {photo ? <image href={face!} x="62" y="22" width="76" height="76" preserveAspectRatio="xMidYMin slice" clipPath={`url(#${id}h)`} onError={() => setBad(true)} data-testid="fig-face" /> : (
            <g data-testid="fig-face-fallback"><path d="M76 40q24-18 48 0q-6-14-24-14t-24 14z" fill="#3b2a20" /><path d="M82 52l9 6m0-6l-9 6M110 52l9 6m0-6l-9 6" stroke="#1b2430" strokeWidth="3" strokeLinecap="round" /></g>
          )}
          <ellipse cx="86" cy="54" rx="9" ry="7" fill="#7a3fa0" opacity=".38" />
          <g transform="rotate(-24 112 68)"><rect x="98" y="62" width="28" height="11" rx="4" fill="#f1d3a8" stroke="#a9825a" strokeWidth="1.5" /><circle cx="108" cy="67.5" r="1.2" fill="#a9825a" /><circle cx="116" cy="67.5" r="1.2" fill="#a9825a" /></g>
          <rect x="88" y="74" width="24" height="10" rx="4" fill="#fff" stroke="#1b2430" strokeWidth="2" /><path d="M94 74v10M100 74v10M106 74v10M88 79h24" stroke="#1b2430" strokeWidth="1.2" />
          <circle cx="100" cy="56" r="31" fill="none" stroke="#1b2430" strokeWidth="2.5" />
          {goalie ? (
            <g className="m-mask"><path d="M66 46q0-26 34-26t34 26" fill="none" stroke="#1b2430" strokeWidth="7" strokeLinecap="round" /><path d="M66 46q0-26 34-26t34 26" fill="none" stroke="#f6f7f9" strokeWidth="4" strokeLinecap="round" /><path d="M72 36h56M70 44h60M100 21v24" stroke="#1b2430" strokeWidth="2" /></g>
          ) : (
            <g className="m-pack"><path d="M72 24q2-18 28-18t28 18q-28 10-56 0z" fill="#5d9bd8" stroke="#1b2430" strokeWidth="2.5" strokeLinejoin="round" /><rect x="90" y="-4" width="20" height="10" rx="3" fill="#e9edf2" stroke="#1b2430" strokeWidth="2.2" /></g>
          )}
        </g>
        {/* ouch */}
        <g className="m-bolts"><path d="M52 24l8 8-6 2 8 8" fill="none" stroke="#1b2430" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /><path d="M64 14l6 6-4 1 6 6" fill="none" stroke="#1b2430" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></g>
        <text className="m-q" x="190" y="46" fontSize="38" fontWeight="800">?</text>
        <path className="m-sweat" d="M138 40q6 9 0 13q-6-4 0-13z" fill="#7fc4ee" stroke="#1b2430" strokeWidth="1.5" />
      </svg>
    </div>
  );
}
