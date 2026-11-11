/** Cumulative goal difference as bars from a zero line (inline SVG). The text alternative states the latest, lowest and highest values. */
export function GdSpark({ series, label }: { series: number[]; label: string }) {
  if (!series.length) return null;
  const W = 240, H = 44, mid = H / 2, max = Math.max(1, ...series.map(Math.abs)), bw = W / series.length;
  const last = series[series.length - 1];
  const text = `${label}: after ${series.length} games the goal difference is ${last > 0 ? "+" : ""}${last}, low ${Math.min(...series)}, high ${Math.max(...series)}.`;
  return (
    <svg className="tr-spark" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label={text}>
      <line x1="0" x2={W} y1={mid} y2={mid} className="tr-spark-zero" />
      {series.map((v, i) => {
        const h = Math.max(1, (Math.abs(v) / max) * (mid - 2));
        return <rect key={i} x={i * bw + 0.5} width={Math.max(1, bw - 1)} y={v >= 0 ? mid - h : mid} height={h} className={v >= 0 ? "tr-pos" : "tr-neg"} />;
      })}
    </svg>
  );
}
