import { useMemo, useState } from "react";
import { useMoneyPuck } from "../lib/moneypuck-client";
import { goalieBoard } from "../lib/gsax.mjs";
import { TeamLogo } from "./TeamLogo";
import "./gsax.css";

type Key = "GA" | "xGA" | "gsax" | "per60";
const COLS: [Key, string, string, string][] = [["GA", "Goals against", "GA", "Goals allowed"], ["xGA", "Expected goals against", "xGA", "Goals the shots faced should have produced"], ["gsax", "Goals saved above expected", "GSAx", "Expected goals against minus goals allowed"], ["per60", "Goals saved above expected per 60", "per 60", "GSAx divided by minutes played, times 60: comparable across workloads"]];
const FIRST = 16;

/** The goalies ranked by goals saved above expected. Click a column to sort by it. */
export function GoalieGsax({ season, current = true }: { season: number; current?: boolean }) {
  const { data } = useMoneyPuck(season, "summary", { watchAge: current });
  const rows = useMemo(() => goalieBoard(data), [data]);
  const [sort, setSort] = useState<{ key: Key; dir: 1 | -1 }>({ key: "gsax", dir: -1 });
  const [all, setAll] = useState(false);
  const sorted = useMemo(() => [...rows].sort((a: any, b: any) => (sort.dir * ((a[sort.key] ?? 0) - (b[sort.key] ?? 0))) || a.name.localeCompare(b.name)), [rows, sort]);
  if (!rows.length) return null;
  const shown = all ? sorted : sorted.slice(0, FIRST);
  const [lo, hi] = [Math.min(...rows.map((r) => r.gsax)), Math.max(...rows.map((r) => r.gsax))];
  const heat = (v: number) => {
    const t = hi > lo ? (v - lo) / (hi - lo) : 0.5;
    return { background: `color-mix(in srgb, #4aa3ff ${Math.round(12 + t * 62)}%, var(--surface-3))` };
  };
  return (
    <section className="panel gx gx-goalies" aria-labelledby="gg-title" data-testid="goalie-gsax">
      <div className="gx-head">
        <h2 id="gg-title">Goalies: goals saved above expected</h2>
        <p>All situations · goalies with at least 60 minutes played · {rows.length} goalies · MoneyPuck. Tap a column to sort.</p>
      </div>
      <table className="gg-table">
        <thead>
          <tr>
            <th className="gg-name" scope="col">Name</th>
            {COLS.map(([k, label, short, tip]) => (
              <th key={k} scope="col" aria-sort={sort.key === k ? (sort.dir === -1 ? "descending" : "ascending") : "none"} className={k === "gsax" ? "gg-key" : ""}>
                <button type="button" title={tip} onClick={() => setSort((s) => (s.key === k ? { key: k, dir: (-s.dir) as 1 | -1 } : { key: k, dir: k === "GA" || k === "xGA" ? 1 : -1 }))}>
                  <span className="gg-long">{label}</span><span className="gg-short">{short}</span><i aria-hidden="true">{sort.key === k ? (sort.dir === -1 ? "▼" : "▲") : "⇅"}</i>
                </button>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r, i) => (
            <tr key={r.id} data-goalie={r.id}>
              <td className="gg-name"><div className="gg-who"><span className="gg-rank">{i + 1}</span><TeamLogo id={r.team} size={28} /><b>{r.name}</b></div></td>
              <td>{r.GA}</td>
              <td>{r.xGA.toFixed(2)}</td>
              <td className="gg-key" style={heat(r.gsax)}>{r.gsax.toFixed(1)}</td>
              <td>{r.per60 != null ? r.per60.toFixed(3) : "–"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > FIRST && <button type="button" className="gg-more" onClick={() => setAll(!all)}>{all ? `Show the top ${FIRST}` : `Show all ${rows.length} goalies`}</button>}
    </section>
  );
}
