import { useMemo, useState } from "react";
import { sortRows } from "../../../lib/nhlplus-view.mjs";
import { TeamLogo } from "../../TeamLogo";

export type RankItem = { key: string; label: string; team?: string; value: number | null; text: string; lines?: string[]; toiText?: string };

/**
 * Ranked bars that start at the league average: a bar to the right is above it, to the left below it. Colour says whether
 * that is better or worse for the metric (higherIsBetter). Rows are buttons: click/tap/Enter highlights the team everywhere.
 */
export function RankBars({ items, avg, avgText, higherIsBetter, highlight, onToggle, ariaLabel, metricLabel }: {
  items: RankItem[]; avg: number | null; avgText: string; higherIsBetter: boolean; highlight: string[]; onToggle: (key: string) => void; ariaLabel: string; metricLabel: string;
}) {
  const [active, setActive] = useState<string | null>(null);
  const rows = useMemo(() => sortRows(items, "value", higherIsBetter ? "desc" : "asc"), [items, higherIsBetter]);
  const center = avg ?? 0;
  const spread = Math.max(1e-9, ...rows.map((r) => (r.value == null ? 0 : Math.abs(r.value - center))));
  const dim = highlight.length > 0;
  const cur = rows.find((r) => r.key === active);
  return (
    <div className="np-rank" role="group" aria-label={ariaLabel}>
      <div className="np-rank-legend"><span><i className="np-sw np-good" />Better than league average</span><span><i className="np-sw np-bad" />Worse</span><span>Center line = league average {avgText}</span></div>
      <ol className="np-rank-list">
        {rows.map((r, i) => {
          const dev = r.value == null ? 0 : r.value - center;
          const good = higherIsBetter ? dev >= 0 : dev <= 0;
          const w = (Math.abs(dev) / spread) * 50;
          const on = highlight.includes(r.key);
          return (
            <li key={r.key}>
              <button type="button" className="np-rank-row" aria-pressed={on} data-dim={dim && !on} data-team={r.key}
                aria-label={`${r.label}: ${metricLabel} ${r.text}, rank ${r.value == null ? "not available" : i + 1}`}
                onPointerEnter={() => setActive(r.key)} onPointerLeave={() => setActive(null)} onFocus={() => setActive(r.key)} onBlur={() => setActive(null)} onClick={() => onToggle(r.key)}>
                <span className="np-rank-n">{r.value == null ? "–" : i + 1}</span>
                {r.team && <TeamLogo id={r.team} size={20} />}
                <b>{r.key}</b>
                <span className="np-rank-track" aria-hidden="true">
                  <i className="np-rank-mid" />
                  {r.value != null && <i className={`np-rank-bar ${good ? "np-good" : "np-bad"}`} style={dev >= 0 ? { left: "50%", width: `${w}%` } : { right: "50%", width: `${w}%` }} />}
                </span>
                <span className="np-rank-val">{r.text}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="np-readout" role="status" aria-live="polite">{cur ? [cur.label, ...(cur.lines ?? [])].join(" · ") : " "}</p>
    </div>
  );
}
