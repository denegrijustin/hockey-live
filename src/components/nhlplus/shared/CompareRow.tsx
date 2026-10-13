import { MetricTip } from "./MetricTip";

export type CompareSide = { team: string; value: number | null; text: string; sub?: string };

/**
 * One aligned comparison: two bars grow from the middle toward each team, with exact values and the labelled difference.
 * `higherIsBetter` only decides which side is marked as ahead; the bars always show the real values on a shared scale.
 * Missing values show a dash and no bar (never a zero).
 */
export function CompareRow({ label, tip, left, right, higherIsBetter = true, unit = "", diffDigits = 2, diffPct = false, scaleMax, compact = false }: {
  label: string; tip?: string; left: CompareSide; right: CompareSide; higherIsBetter?: boolean; unit?: string; diffDigits?: number; diffPct?: boolean; scaleMax?: number; compact?: boolean;
}) {
  const both = left.value != null && right.value != null;
  const max = scaleMax ?? Math.max(left.value ?? 0, right.value ?? 0, 1e-9);
  const w = (v: number | null) => (v == null ? 0 : Math.max(2, Math.min(100, (v / max) * 100)));
  const diff = both ? (diffPct ? ((left.value! - right.value!) * 100) : left.value! - right.value!) : null;
  const ahead = both && left.value !== right.value ? ((left.value! > right.value!) === higherIsBetter ? "left" : "right") : null;
  const diffText = diff == null ? "—" : `${diff > 0 ? "+" : diff < 0 ? "−" : ""}${Math.abs(diff).toFixed(diffPct ? 1 : diffDigits)}${diffPct ? " pts" : ""}`;
  return (
    <div className={`mp-cmp${compact ? " mp-cmp-compact" : ""}`} role="group" aria-label={`${label}: ${left.team} ${left.text}, ${right.team} ${right.text}`}>
      <div className="mp-cmp-label">{tip ? <MetricTip id={tip}>{label}</MetricTip> : label}{unit && <small>{unit}</small>}</div>
      <div className="mp-cmp-side mp-left" data-ahead={ahead === "left"}>
        <b>{left.text}</b>
        <span className="mp-bar" aria-hidden="true"><i style={{ width: `${w(left.value)}%` }} /></span>
      </div>
      <div className="mp-cmp-diff" title={both ? `${left.team} minus ${right.team}` : "Not available for both teams"}>{diffText}</div>
      <div className="mp-cmp-side mp-right" data-ahead={ahead === "right"}>
        <b>{right.text}</b>
        <span className="mp-bar" aria-hidden="true"><i style={{ width: `${w(right.value)}%` }} /></span>
      </div>
      {!compact && left.sub && <small className="mp-sub mp-left">{left.sub}</small>}
      {!compact && right.sub && <small className="mp-sub mp-right">{right.sub}</small>}
    </div>
  );
}
