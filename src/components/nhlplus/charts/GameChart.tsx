import { linearScale, niceTicks, paddedExtent } from "../../../lib/nhlplus-view.mjs";
import { useCursor, useWidth } from "./useWidth";

export type GameBar = { id: number; label: string; title: string; expected?: number | null; actual: number | null };

/**
 * One column per game. With `expected`: a bar for expected goals and a marker for the actual number, so the gap between
 * them is readable. Without it: a single bar from zero (for example goals saved above expected), up is above zero.
 */
export function GameChart({ games, mode, fmtValue, yLabel, color, ariaLabel, expectedLabel = "Expected", actualLabel = "Actual" }: {
  games: GameBar[]; mode: "expected-actual" | "single"; fmtValue: (v: number) => string; yLabel: string; color: string; ariaLabel: string; expectedLabel?: string; actualLabel?: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const n = games.length;
  const { active, setActive, keys } = useCursor(n);
  const small = width < 520;
  const height = 230;
  const m = { l: small ? 40 : 50, r: 10, t: 14, b: 40 };
  const vals = games.flatMap((g) => [g.actual, g.expected ?? null]);
  const ye = paddedExtent(vals, 0.12, { includeZero: true });
  if (!n || !ye || !vals.some((v) => v != null)) return <div className="np-empty" role="status">No games yet.</div>;
  const ys = linearScale(ye[0], ye[1], height - m.b, m.t);
  const slot = (width - m.l - m.r) / n, bw = Math.max(3, Math.min(34, slot * 0.6));
  const cx = (i: number) => m.l + slot * (i + 0.5);
  const yt = niceTicks(ye[0], ye[1], 5);
  const every = Math.max(1, Math.ceil(n / (width < 520 ? 8 : 20)));
  const cur = active != null ? games[active] : null;
  const tipLeft = active != null ? Math.min(Math.max(cx(active) + 14, 4), width - 200) : 0;
  const zero = ys(0);
  return (
    <div className="np-chart" ref={ref}>
      <ul className="np-legend" aria-label="Legend">
        {mode === "expected-actual"
          ? <><li><i className="np-sw" style={{ background: "#4d7f93" }} />{expectedLabel}</li><li><i className="np-sw np-diamond" style={{ background: color }} />{actualLabel}</li></>
          : <><li><i className="np-sw np-good" />Above zero</li><li><i className="np-sw np-bad" />Below zero</li></>}
      </ul>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="group" aria-label={`${ariaLabel}. Use left and right arrow keys to read each game.`} {...keys} onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => { const r = e.currentTarget.getBoundingClientRect(); setActive(Math.max(0, Math.min(n - 1, Math.floor((e.clientX - r.left - m.l) / slot)))); }}>
        {yt.map((v) => <g key={v}><line className="np-grid" x1={m.l} x2={width - m.r} y1={ys(v)} y2={ys(v)} /><text className="np-tick" x={m.l - 6} y={ys(v) + 3} textAnchor="end">{fmtValue(v)}</text></g>)}
        <line className="np-axis" x1={m.l} x2={width - m.r} y1={zero} y2={zero} />
        <text className="np-axis-title" transform={`translate(11 ${(m.t + height - m.b) / 2}) rotate(-90)`} textAnchor="middle">{yLabel}</text>
        {games.map((g, i) => {
          const hot = i === active;
          return (
            <g key={g.id} data-game={g.id}>
              {hot && <rect x={cx(i) - slot / 2} y={m.t} width={slot} height={height - m.t - m.b} className="np-cursor-band" />}
              {mode === "expected-actual" && g.expected != null && <rect x={cx(i) - bw / 2} y={Math.min(ys(g.expected), zero)} width={bw} height={Math.abs(zero - ys(g.expected))} fill="#4d7f93" opacity={hot ? 1 : 0.8} rx="2" />}
              {mode === "expected-actual" && g.actual != null && <path d={`M${cx(i)},${ys(g.actual) - 6}l6,6l-6,6l-6,-6z`} fill={color} stroke="#0a131b" strokeWidth="1" />}
              {mode === "single" && g.actual != null && <rect x={cx(i) - bw / 2} y={Math.min(ys(g.actual), zero)} width={bw} height={Math.max(1, Math.abs(zero - ys(g.actual)))} className={g.actual >= 0 ? "np-good" : "np-bad"} rx="2" />}
              {(i % every === 0 || i === n - 1) && <text className="np-tick" x={cx(i)} y={height - m.b + 14} textAnchor="middle">{g.label}</text>}
            </g>
          );
        })}
      </svg>
      <p className="sr-only" aria-live="polite">{cur ? `${cur.title}. ${mode === "expected-actual" ? `${expectedLabel} ${cur.expected == null ? "not available" : fmtValue(cur.expected)}, ${actualLabel} ${cur.actual == null ? "not available" : fmtValue(cur.actual)}` : cur.actual == null ? "not available" : fmtValue(cur.actual)}` : ""}</p>
      {cur && (
        <div className="np-tooltip" role="status" style={{ left: tipLeft, top: 30 }} data-testid="chart-tooltip">
          <b>{cur.title}</b>
          {mode === "expected-actual" ? <><span>{expectedLabel}: <strong>{cur.expected == null ? "–" : fmtValue(cur.expected)}</strong></span><span>{actualLabel}: <strong>{cur.actual == null ? "–" : fmtValue(cur.actual)}</strong></span></> : <span><strong>{cur.actual == null ? "–" : fmtValue(cur.actual)}</strong></span>}
        </div>
      )}
    </div>
  );
}
