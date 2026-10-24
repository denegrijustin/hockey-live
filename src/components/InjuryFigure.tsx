import { useRef } from "react";
import { useOnScreen } from "../motion";

type Shape = { t: "circle"; cx: number; cy: number; r: number } | { t: "rect"; x: number; y: number; w: number; h: number; rx?: number } | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number };

/** The spot(s) to light up for a zone. The athlete's left is on the viewer's right (he faces us); with no side, both. */
export function shapesFor(zone: string, side: "left" | "right" | null): Shape[] {
  const sides = side === "left" ? [1] : side === "right" ? [-1] : [1, -1];
  const x = (d: number, s: number) => 50 + d * s;
  const pair = (f: (s: number) => Shape) => sides.map(f);
  switch (zone) {
    case "head": return [{ t: "circle", cx: 50, cy: 20, r: 15 }];
    case "neck": return [{ t: "rect", x: 43, y: 30, w: 14, h: 12, rx: 4 }];
    case "shoulder": return pair((s) => ({ t: "circle", cx: x(18, s), cy: 47, r: 10 }));
    case "arm": return pair((s) => ({ t: "rect", x: s === 1 ? 62 : 14, y: 52, w: 14, h: 42, rx: 7 }));
    case "hand": return pair((s) => ({ t: "circle", cx: x(37, s), cy: 102, r: 8 }));
    case "chest": return [{ t: "rect", x: 33, y: 45, w: 34, h: 24, rx: 8 }];
    case "core": return [{ t: "rect", x: 34, y: 70, w: 32, h: 26, rx: 8 }];
    case "back": return [{ t: "rect", x: 32, y: 45, w: 36, h: 52, rx: 10 }];
    case "groin": return [{ t: "circle", cx: 50, cy: 106, r: 9 }];
    case "hip": return pair((s) => ({ t: "circle", cx: x(11, s), cy: 104, r: 9 }));
    case "thigh": return pair((s) => ({ t: "rect", x: s === 1 ? 51 : 33, y: 112, w: 16, h: 36, rx: 8 }));
    case "knee": return pair((s) => ({ t: "circle", cx: x(10, s), cy: 152, r: 9 }));
    case "calf": return pair((s) => ({ t: "rect", x: s === 1 ? 52 : 34, y: 162, w: 14, h: 24, rx: 7 }));
    case "ankle": return pair((s) => ({ t: "circle", cx: x(10, s), cy: 186, r: 6 }));
    case "foot": return pair((s) => ({ t: "ellipse", cx: x(11, s), cy: 196, rx: 10, ry: 5 }));
    case "upper": return [{ t: "rect", x: 8, y: 6, w: 84, h: 100, rx: 18 }];
    case "lower": return [{ t: "rect", x: 24, y: 98, w: 52, h: 100, rx: 16 }];
    case "illness": case "personal": return [{ t: "rect", x: 6, y: 4, w: 88, h: 194, rx: 30 }];
    default: return [];
  }
}

const draw = (s: Shape, k: number, cls?: string) =>
  s.t === "circle" ? <circle key={k} className={cls} cx={s.cx} cy={s.cy} r={s.r} />
  : s.t === "ellipse" ? <ellipse key={k} className={cls} cx={s.cx} cy={s.cy} rx={s.rx} ry={s.ry} />
  : <rect key={k} className={cls} x={s.x} y={s.y} width={s.w} height={s.h} rx={s.rx ?? 0} />;

/**
 * A small body that lights up where the injury is. When it scrolls into view the spot pulses three times, then stays lit; with motion off (or on a phone
 * set to save data or power) it is simply lit. Illness and personal reasons light the whole figure; an unspecified region shades the upper or lower half.
 */
export function InjuryFigure({ zone, side, label, size = 56 }: { zone: string; side: "left" | "right" | null; label: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const seen = useOnScreen(ref, true);
  const shapes = shapesFor(zone, side);
  return (
    <div ref={ref} className={`inj-figure${seen ? " play" : ""}`} data-zone={zone} data-side={side ?? ""} role="img" aria-label={`Injury location: ${label}`}>
      <svg viewBox="0 0 100 204" width={size} height={size * 2.04} aria-hidden="true">
        <g className="fig-body">
          <circle cx="50" cy="20" r="13" />
          <path d="M44 31h12v10H44z" />
          <path d="M30 44q20-8 40 0l3 52q-23 8-46 0z" />
          <path d="M30 46L16 98M70 46l14 52" className="fig-limb" />
          <path d="M41 106l-3 80M59 106l3 80" className="fig-limb leg" />
        </g>
        {zone === "unknown" ? <text x="50" y="112" textAnchor="middle" className="fig-q">?</text> : null}
        <g className="fig-zone">{shapes.map((s, k) => draw(s, k))}</g>
        <g className="fig-pulse">{shapes.map((s, k) => draw(s, k))}</g>
      </svg>
    </div>
  );
}
