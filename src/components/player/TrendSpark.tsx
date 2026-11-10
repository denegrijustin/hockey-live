/** A small chart of one number per game: bars for points, a line for save percentage. The text alternative lists every value with its timeframe. */
export function TrendSpark({ values, labels, kind, timeframe }: { values: (number | null)[]; labels: string[]; kind: "points" | "sv"; timeframe: string }) {
  const W = 160, H = 44, pad = 4;
  const real = values.filter((v): v is number => v !== null);
  if (real.length < 2) return null;
  const name = kind === "points" ? "Points per game" : "Save percentage per game";
  const text = values.map((v, i) => `${labels[i]}: ${v === null ? "no value" : kind === "sv" ? v.toFixed(3).replace(/^0/, "") : v}`).join("; ");
  const step = (W - pad * 2) / values.length;
  const max = Math.max(1, ...real);
  const lo = 0.8, hi = 1;
  const y = (v: number) => pad + (H - pad * 2) * (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo));
  const pts = values.map((v, i) => (v === null ? null : [pad + step * (i + 0.5), y(v)] as const));
  return (
    <figure className="pp-spark">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name}. ${timeframe}. ${text}`} preserveAspectRatio="none">
        <line x1={pad} x2={W - pad} y1={H - pad} y2={H - pad} className="pp-axis" />
        {kind === "points"
          ? values.map((v, i) => v === null ? null : <rect key={i} className="pp-bar" x={pad + step * i + step * 0.15} width={step * 0.7} y={H - pad - ((H - pad * 2) * v) / max} height={Math.max(v > 0 ? 1.5 : 0.8, ((H - pad * 2) * v) / max)} rx="1.5" />)
          : <>
              <polyline className="pp-line" fill="none" points={pts.filter(Boolean).map((p) => p!.join(",")).join(" ")} />
              {pts.map((p, i) => p && <circle key={i} className="pp-dot" cx={p[0]} cy={p[1]} r="2.6" />)}
            </>}
      </svg>
      <figcaption>{name} · {timeframe}{kind === "sv" ? " · scale .800 to 1.000" : ""}</figcaption>
    </figure>
  );
}
