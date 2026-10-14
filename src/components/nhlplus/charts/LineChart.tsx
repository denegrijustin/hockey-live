import { linearScale, niceTicks, paddedExtent } from "../../../lib/nhlplus-view.mjs";
import { useCursor, useWidth } from "./useWidth";

export type LineSeries = { key: string; label: string; color: string; dash?: string; values: (number | null)[]; hollow?: boolean[] };

/**
 * Line chart over a shared list of x positions (games or snapshot dates). Hover, tap or keyboard (focus the chart, then
 * left/right arrows) shows a panel with every series' exact value at that position.
 */
export function LineChart({ xLabels, tipTitles, series, yFmt, yLabel, xTitle, refs = [], ariaLabel, height = 260, includeY = [] }: {
  xLabels: string[]; tipTitles: string[]; series: LineSeries[]; yFmt: (v: number) => string; yLabel: string; xTitle: string;
  refs?: { y: number; label: string }[]; ariaLabel: string; height?: number; includeY?: number[];
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = xLabels.length;
  const { active, setActive, keys } = useCursor(n);
  const small = width < 520;
  const m = { l: small ? 44 : 54, r: 14, t: 12, b: 44 };
  const all = series.flatMap((s) => s.values);
  const ye = paddedExtent([...all, ...refs.map((r) => r.y), ...includeY], 0.12);
  const hasData = all.some((v) => v != null);
  if (!n || !ye || !hasData) return <div className="np-empty" role="status">Not enough games yet.</div>;
  const xs = (i: number) => (n === 1 ? (m.l + width - m.r) / 2 : m.l + (i * (width - m.l - m.r)) / (n - 1));
  const ys = linearScale(ye[0], ye[1], height - m.b, m.t);
  const yt = niceTicks(ye[0], ye[1], 5);
  const every = Math.max(1, Math.ceil(n / (small ? 6 : 12)));
  const path = (vals: (number | null)[]) => vals.map((v, i) => (v == null ? null : `${xs(i)},${ys(v)}`)).reduce<string[]>((segs, p, i) => { if (p == null) segs.push(""); else if (!segs.length || i === 0 || segs[segs.length - 1] === "") segs.push(`M${p}`); else segs[segs.length - 1] += `L${p}`; return segs; }, []).join(" ");
  const tipLeft = active != null ? Math.min(Math.max(xs(active) + 12, 4), width - 214) : 0;
  return (
    <div className="np-chart" ref={ref}>
      <ul className="np-legend" aria-label="Legend">
        {series.map((s) => <li key={s.key}><svg width="26" height="10" aria-hidden="true"><line x1="1" x2="25" y1="5" y2="5" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} /></svg>{s.label}</li>)}
      </ul>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${ariaLabel}. Use left and right arrow keys to read each point.`} {...keys} onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); const x = e.clientX - r.left; setActive(n === 1 ? 0 : Math.max(0, Math.min(n - 1, Math.round(((x - m.l) / (width - m.l - m.r)) * (n - 1))))); }}>
        {yt.map((v) => <g key={v}><line className="np-grid" x1={m.l} x2={width - m.r} y1={ys(v)} y2={ys(v)} /><text className="np-tick" x={m.l - 6} y={ys(v) + 3} textAnchor="end">{yFmt(v)}</text></g>)}
        {refs.map((r) => <g key={r.label}><line className="np-avg" x1={m.l} x2={width - m.r} y1={ys(r.y)} y2={ys(r.y)} /><text className="np-avg-text" x={width - m.r - 4} y={ys(r.y) - 4} textAnchor="end">{r.label}</text></g>)}
        <line className="np-axis" x1={m.l} x2={width - m.r} y1={height - m.b} y2={height - m.b} />
        {xLabels.map((l, i) => (i % every === 0 || i === n - 1) && <text key={i} className="np-tick" x={xs(i)} y={height - m.b + 15} textAnchor="middle">{l}</text>)}
        <text className="np-axis-title" x={(m.l + width - m.r) / 2} y={height - 6} textAnchor="middle">{xTitle}</text>
        <text className="np-axis-title" transform={`translate(12 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        {active != null && <line className="np-cursor" x1={xs(active)} x2={xs(active)} y1={m.t} y2={height - m.b} />}
        {series.map((s) => (
          <g key={s.key}>
            <path d={path(s.values)} fill="none" stroke={s.color} strokeWidth="2.2" strokeDasharray={s.dash} strokeLinejoin="round" />
            {s.values.map((v, i) => v != null && <circle key={i} cx={xs(i)} cy={ys(v)} r={active === i ? 5 : 3.2} fill={s.hollow?.[i] ? "var(--panel)" : s.color} stroke={s.color} strokeWidth="1.8" />)}
          </g>
        ))}
      </svg>
      <p className="sr-only" aria-live="polite">{active != null ? `${tipTitles[active]}. ${series.map((s) => `${s.label} ${s.values[active] == null ? "not available" : yFmt(s.values[active]!)}`).join(". ")}` : ""}</p>
      {active != null && (
        <div className="np-tooltip" role="status" style={{ left: tipLeft, top: 34 }} data-testid="chart-tooltip">
          <b>{tipTitles[active]}</b>
          {series.map((s) => <span key={s.key}><i className="np-sw" style={{ background: s.color }} />{s.label}: <strong>{s.values[active] == null ? "–" : yFmt(s.values[active]!)}</strong>{s.hollow?.[active] ? " (window not full)" : ""}</span>)}
        </div>
      )}
    </div>
  );
}
