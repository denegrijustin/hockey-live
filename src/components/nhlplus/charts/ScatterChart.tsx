import { useMemo, useState } from "react";
import { linearScale, niceTicks, paddedExtent } from "../../../lib/nhlplus-view.mjs";
import { useWidth } from "./useWidth";

export type ScatterPoint = { key: string; x: number | null; y: number | null; img?: string; label: string; lines: string[] };

/**
 * Logo scatterplot. `invertY` flips the vertical axis so "up" is always better when lower values are better.
 * Hover, tap, or keyboard (focus the plot, arrow keys step through points, Enter toggles the highlight) opens a panel
 * with the exact values. Highlighted points stay full colour and the rest dim.
 */
export function ScatterChart({ points, xLabel, yLabel, xFmt, yFmt, invertY = false, avgX, avgY, avgXText, avgYText, highlight, onToggle, ariaLabel, xBetterNote, yBetterNote, dimOthers = true }: { dimOthers?: boolean;
  points: ScatterPoint[]; xLabel: string; yLabel: string; xFmt: (v: number) => string; yFmt: (v: number) => string; invertY?: boolean;
  avgX?: number | null; avgY?: number | null; avgXText?: string; avgYText?: string; highlight: string[]; onToggle: (key: string) => void; ariaLabel: string; xBetterNote?: string; yBetterNote?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<string | null>(null);
  const shown = useMemo(() => points.filter((p) => p.x != null && p.y != null), [points]);
  const order = useMemo(() => [...shown].sort((a, b) => a.x! - b.x! || a.y! - b.y!), [shown]);
  const small = width < 520;
  const m = { l: small ? 44 : 56, r: 12, t: 12, b: 46 };
  const height = Math.round(Math.max(300, Math.min(640, width * (small ? 1.05 : 0.95))));
  const xe = paddedExtent([...shown.map((p) => p.x), avgX ?? null], 0.1), ye = paddedExtent([...shown.map((p) => p.y), avgY ?? null], 0.1);
  if (!xe || !ye) return <div className="np-empty" role="status">No teams meet the current filters.</div>;
  const xs = linearScale(xe[0], xe[1], m.l, width - m.r);
  const ys = invertY ? linearScale(ye[0], ye[1], m.t, height - m.b) : linearScale(ye[0], ye[1], height - m.b, m.t);
  const xt = niceTicks(xe[0], xe[1], small ? 4 : 6), yt = niceTicks(ye[0], ye[1], small ? 5 : 7);
  const size = small ? 20 : 26;
  const dim = dimOthers && highlight.length > 0;
  const cur = shown.find((p) => p.key === active) ?? null;
  const step = (d: number) => {
    if (!order.length) return;
    const i = order.findIndex((p) => p.key === active);
    setActive(order[Math.max(0, Math.min(order.length - 1, (i < 0 ? (d > 0 ? -1 : order.length) : i) + d))].key);
  };
  const draw = [...shown].sort((a, b) => Number(highlight.includes(a.key)) - Number(highlight.includes(b.key)) || Number(a.key === active) - Number(b.key === active));
  const tipX = cur ? Math.min(Math.max(xs(cur.x!) + 16, 4), width - 196) : 0;
  const tipY = cur ? Math.min(Math.max(ys(cur.y!) - 24, 4), height - 120) : 0;
  return (
    <div className="np-chart" ref={ref}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={ariaLabel} tabIndex={0}
        onFocus={() => setActive((a) => a ?? highlight.find((k) => shown.some((p) => p.key === k)) ?? order[Math.floor(order.length / 2)]?.key ?? null)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight" || e.key === "ArrowUp") { e.preventDefault(); step(1); }
          else if (e.key === "ArrowLeft" || e.key === "ArrowDown") { e.preventDefault(); step(-1); }
          else if ((e.key === "Enter" || e.key === " ") && active) { e.preventDefault(); onToggle(active); }
          else if (e.key === "Escape") setActive(null);
        }}
        onPointerLeave={() => setActive(null)}>
        {xt.map((v) => <g key={`x${v}`}><line className="np-grid" x1={xs(v)} x2={xs(v)} y1={m.t} y2={height - m.b} /><text className="np-tick" x={xs(v)} y={height - m.b + 15} textAnchor="middle">{xFmt(v)}</text></g>)}
        {yt.map((v) => <g key={`y${v}`}><line className="np-grid" x1={m.l} x2={width - m.r} y1={ys(v)} y2={ys(v)} /><text className="np-tick" x={m.l - 6} y={ys(v) + 3} textAnchor="end">{yFmt(v)}</text></g>)}
        <line className="np-axis" x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} />
        <line className="np-axis" x1={m.l} x2={m.l} y1={m.t} y2={height - m.b} />
        {avgX != null && <g><line className="np-avg" x1={xs(avgX)} x2={xs(avgX)} y1={m.t} y2={height - m.b} /><text className="np-avg-text" x={xs(avgX) + 4} y={m.t + 10}>{avgXText ?? `League avg ${xFmt(avgX)}`}</text></g>}
        {avgY != null && <g><line className="np-avg" x1={m.l} x2={width - m.r} y1={ys(avgY)} y2={ys(avgY)} /><text className="np-avg-text" x={width - m.r - 4} y={ys(avgY) - 4} textAnchor="end">{avgYText ?? `League avg ${yFmt(avgY)}`}</text></g>}
        <text className="np-axis-title" x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle">{xLabel}{xBetterNote ? ` · ${xBetterNote}` : ""}</text>
        <text className="np-axis-title" transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}{yBetterNote ? ` · ${yBetterNote}` : ""}</text>
        {draw.map((p) => {
          const on = highlight.includes(p.key), hot = p.key === active;
          return (
            <g key={p.key} className="np-pt" data-point={p.key} data-on={on} opacity={dim && !on && !hot ? 0.38 : 1} transform={`translate(${xs(p.x!)} ${ys(p.y!)})`}
              onPointerEnter={() => setActive(p.key)} onPointerDown={() => setActive(p.key)} onClick={() => onToggle(p.key)}>
              {(on || hot) && <circle r={size / 2 + 3} className={on ? "np-ring-on" : "np-ring-hot"} />}
              <circle r={size / 2 + 4} fill="transparent" />
              {p.img ? <image href={p.img} x={-size / 2} y={-size / 2} width={size} height={size} /> : <circle r={5} className="np-dot" />}
            </g>
          );
        })}
      </svg>
      <p className="sr-only" aria-live="polite">{cur ? `${cur.label}. ${cur.lines.join(". ")}` : ""}</p>
      {cur && (
        <div className="np-tooltip" role="status" style={{ left: tipX, top: tipY }} data-testid="chart-tooltip">
          <b>{cur.label}</b>{cur.lines.map((l) => <span key={l}>{l}</span>)}
        </div>
      )}
    </div>
  );
}
