import { MetricTip } from "./MetricTip";
import { Versus, type VsSide } from "../../Versus";
import { rankBadge } from "../../../lib/matchup-data.mjs";

export type CompareSide = { team: string; value: number | null; text: string; sub?: string; /** League rank of this team on the number (1 = best), when known. */ rank?: { rank: number; pool: number } | null };

const tierOf = (r?: { rank: number; pool: number } | null) => (r ? rankBadge({ rank: r.rank, pool: r.pool, best: r.rank === 1, worst: r.rank === r.pool }) : null);

/**
 * One aligned comparison in the head-to-head look (see Versus): both values, a bar split at who is ahead, and a badge with the margin ("+4 RANKS" when both
 * teams' league ranks are known, else the difference). `higherIsBetter` decides who is ahead; missing values show a dash and an even bar (never a zero).
 */
export function CompareRow({ label, tip, left, right, higherIsBetter = true, unit = "", diffDigits = 2, diffPct = false, compact = false }: {
  label: string; tip?: string; left: CompareSide; right: CompareSide; higherIsBetter?: boolean; unit?: string; diffDigits?: number; diffPct?: boolean; scaleMax?: number; compact?: boolean;
}) {
  const both = left.value != null && right.value != null;
  const ranked = !!(left.rank && right.rank);
  const ahead: "left" | "right" | null = ranked
    ? (left.rank!.rank === right.rank!.rank ? null : left.rank!.rank < right.rank!.rank ? "left" : "right")
    : both && left.value !== right.value ? ((left.value! > right.value!) === higherIsBetter ? "left" : "right") : null;
  let share = 0.5, badge: React.ReactNode = <b>EVEN</b>;
  if (ahead) {
    const dir = ahead === "left" ? 1 : -1, id = ahead === "left" ? left.team : right.team;
    let mag: number, head: string;
    if (ranked) { const n = Math.abs(left.rank!.rank - right.rank!.rank), pool = Math.max(2, left.rank!.pool); mag = n / (pool - 1); head = `+${n} RANK${n === 1 ? "" : "S"}`; }
    else {
      const d = left.value! - right.value!, rel = Math.abs(d) / Math.max(Math.abs(left.value!), Math.abs(right.value!), 1e-9);
      mag = Math.min(1, rel * 1.5);
      head = diffPct ? `+${Math.abs(d * 100).toFixed(1)} pts` : `+${Math.abs(d).toFixed(diffDigits)}`;
    }
    share = 0.5 + dir * 0.47 * Math.min(1, mag);
    badge = <><b>{head}</b><small>{id} advantage</small></>;
  }
  const side = (x: CompareSide): VsSide => ({ id: x.team, big: x.rank ? `#${x.rank.rank}` : x.text, sub: x.rank ? x.text : compact ? undefined : x.sub, tier: tierOf(x.rank) as VsSide["tier"] });
  return (
    <div className={`mp-cmp${compact ? " mp-cmp-compact" : ""}`} role="group" aria-label={`${label}: ${left.team} ${left.text}, ${right.team} ${right.text}`} title={unit || undefined}>
      <Versus away={side(left)} home={side(right)} share={share} badge={badge} label={tip ? <MetricTip id={tip}>{label}</MetricTip> : label} />
    </div>
  );
}
