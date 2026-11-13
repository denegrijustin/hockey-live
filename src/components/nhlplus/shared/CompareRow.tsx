import { MetricTip } from "./MetricTip";
import { Versus, type VsSide } from "../../Versus";
import { rankBadge } from "../../../lib/matchup-data.mjs";

export type CompareSide = { team: string; value: number | null; text: string; sub?: string; /** League rank of this team on the number (1 = best), when known. */ rank?: { rank: number; pool: number } | null };

const tierOf = (r?: { rank: number; pool: number } | null) => (r ? rankBadge({ rank: r.rank, pool: r.pool, best: r.rank === 1, worst: r.rank === r.pool }) : null);

/**
 * One aligned comparison in the head-to-head look (see Versus): both values and a bar split at who is ahead, with a marker on the split. When both teams' league
 * ranks are known the bar is split by the rank gap and each side shows its rank and tier. `higherIsBetter` decides who is ahead; missing values give an even bar.
 */
export function CompareRow({ label, tip, left, right, higherIsBetter = true, unit = "", diffDigits = 2, diffPct = false, compact = false }: {
  label: string; tip?: string; left: CompareSide; right: CompareSide; higherIsBetter?: boolean; unit?: string; diffDigits?: number; diffPct?: boolean; scaleMax?: number; compact?: boolean;
}) {
  const both = left.value != null && right.value != null;
  const ranked = !!(left.rank && right.rank);
  const ahead: "left" | "right" | null = ranked
    ? (left.rank!.rank === right.rank!.rank ? null : left.rank!.rank < right.rank!.rank ? "left" : "right")
    : both && left.value !== right.value ? ((left.value! > right.value!) === higherIsBetter ? "left" : "right") : null;
  let share = 0.5;
  if (ahead) {
    const dir = ahead === "left" ? 1 : -1;
    let mag: number;
    if (ranked) { const pool = Math.max(2, left.rank!.pool); mag = Math.abs(left.rank!.rank - right.rank!.rank) / (pool - 1); }
    else {
      const d = left.value! - right.value!, rel = Math.abs(d) / Math.max(Math.abs(left.value!), Math.abs(right.value!), 1e-9);
      mag = Math.min(1, rel * 1.5);
    }
    share = 0.5 + dir * 0.47 * Math.min(1, mag);
  }
  const side = (x: CompareSide): VsSide => ({ id: x.team, big: x.rank ? `#${x.rank.rank}` : x.text, sub: x.rank ? x.text : compact ? undefined : x.sub, tier: tierOf(x.rank) as VsSide["tier"] });
  return (
    <div className={`mp-cmp${compact ? " mp-cmp-compact" : ""}`} role="group" aria-label={`${label}: ${left.team} ${left.text}, ${right.team} ${right.text}`} title={unit || undefined}>
      <Versus away={side(left)} home={side(right)} share={share} label={tip ? <MetricTip id={tip}>{label}</MetricTip> : label} />
    </div>
  );
}
